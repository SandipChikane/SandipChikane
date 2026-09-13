export function readEnv(source = process.env) {
  return {
    supabaseUrl: trim(source.SUPABASE_URL),
    supabaseServiceRoleKey: trim(source.SUPABASE_SERVICE_ROLE_KEY),
    razorpayKeyId: trim(source.RAZORPAY_KEY_ID),
    razorpayKeySecret: trim(source.RAZORPAY_KEY_SECRET),
    razorpayWebhookSecret: trim(source.RAZORPAY_WEBHOOK_SECRET),
    checkoutName: trim(source.GRADFLOW_CHECKOUT_NAME) || 'Gradflow',
  };
}

export function paymentsReady(env) {
  return Boolean(
    env.supabaseUrl
    && env.supabaseServiceRoleKey
    && env.razorpayKeyId
    && env.razorpayKeySecret
  );
}

export function supabaseReady(env) {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function razorpayMode(keyId) {
  if (!keyId) return null;
  if (keyId.startsWith('rzp_live_')) return 'live';
  if (keyId.startsWith('rzp_test_')) return 'test';
  return 'unknown';
}

function trim(value) {
  return String(value || '').trim();
}
