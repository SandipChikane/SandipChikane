export function csrfOk(req) {
  const host = String(req?.headers?.host || '').trim().toLowerCase();
  if (!host) return true;
  const origin = String(req?.headers?.origin || '').trim();
  if (origin) return hostsMatch(origin, host);
  const referer = String(req?.headers?.referer || '').trim();
  if (referer) return hostsMatch(referer, host);
  return true;
}

function hostsMatch(urlValue, host) {
  try {
    return new URL(urlValue).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
