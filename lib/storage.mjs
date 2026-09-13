const BUCKET = 'gradflow-media';

export function createStorage({ url, serviceRoleKey, fetchImpl = fetch }) {
  const root = String(url).replace(/\/+$/, '');
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  async function request(path, { method = 'GET', body, extraHeaders = {} } = {}) {
    const response = await fetchImpl(`${root}/storage/v1${path}`, {
      method,
      headers: { ...headers, ...extraHeaders },
      body,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || 'Storage request failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  return {
    bucket: BUCKET,

    async ensureBucket() {
      try {
        await request('/bucket', {
          method: 'POST',
          extraHeaders: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: BUCKET,
            name: BUCKET,
            public: true,
            fileSizeLimit: 524288000,
          }),
        });
      } catch (error) {
        if (!String(error.message || '').toLowerCase().includes('already')) {
          const existing = await request(`/bucket/${BUCKET}`);
          if (!existing) throw error;
        }
      }
    },

    publicUrl(objectPath) {
      return `${root}/storage/v1/object/public/${BUCKET}/${objectPath}`;
    },

    async createSignedUpload(objectPath) {
      const data = await request(`/object/upload/sign/${BUCKET}/${objectPath}`, {
        method: 'POST',
        extraHeaders: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const signedPath = data.signedURL || data.signedUrl || data.url;
      return {
        path: objectPath,
        token: data.token,
        signedUrl: signedPath.startsWith('http') ? signedPath : `${root}/storage/v1${signedPath}`,
        publicUrl: this.publicUrl(objectPath),
      };
    },

    async remove(objectPath) {
      await request(`/object/${BUCKET}`, {
        method: 'DELETE',
        extraHeaders: { 'Content-Type': 'application/json' },
        body: JSON.stringify([objectPath]),
      });
    },
  };
}

export function safeObjectName(filename, folder = 'uploads') {
  const base = String(filename || 'file').split(/[/\\]/).pop() || 'file';
  const cleaned = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-');
  const stamp = Date.now().toString(36);
  return `${folder}/${stamp}-${cleaned}`.replace(/\/+/g, '/');
}

export function kindFromMime(mime, filename = '') {
  const type = String(mime || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(name)) return 'video';
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image';
  return 'file';
}
