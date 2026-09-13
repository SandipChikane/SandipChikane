import crypto from 'node:crypto';

export function verifyCheckoutSignature({ orderId, paymentId, signature, secret }) {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyWebhookSignature({ rawBody, signature, secret }) {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createRazorpayClient({ keyId, keySecret, fetchImpl = fetch }) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  async function request(path, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.description || data?.error?.reason || 'Razorpay request failed';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  return {
    createOrder({ amountPaise, receipt, notes }) {
      return request('/orders', {
        method: 'POST',
        body: {
          amount: amountPaise,
          currency: 'INR',
          receipt,
          notes,
        },
      });
    },
    getOrder(orderId) {
      return request(`/orders/${encodeURIComponent(orderId)}`);
    },
    getPayment(paymentId) {
      return request(`/payments/${encodeURIComponent(paymentId)}`);
    },
  };
}
