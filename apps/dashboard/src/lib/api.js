import { getRuntimeConfig } from './runtimeConfig';

const API_URL = getRuntimeConfig('VITE_API_URL').replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_URL}${path}`;
}

export async function getApiAccessToken(getAccessTokenSilently) {
  if (typeof getAccessTokenSilently !== 'function') {
    return null;
  }

  // The Auth0 provider already uses the My Account audience for the signed-in user.
  // Reuse that token for dashboard-backed API calls.
  return getAccessTokenSilently();
}

export async function apiFetch(path, options = {}) {
  const {
    getAccessTokenSilently,
    headers,
    body,
    ...rest
  } = options;

  const nextHeaders = new Headers(headers || {});

  if (getAccessTokenSilently) {
    const accessToken = await getApiAccessToken(getAccessTokenSilently);
    if (accessToken) {
      nextHeaders.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const resolvedBody = body && !isFormData && typeof body !== 'string'
    ? JSON.stringify(body)
    : body;

  if (resolvedBody && !isFormData && !nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json');
  }

  return fetch(apiUrl(path), {
    ...rest,
    headers: nextHeaders,
    body: resolvedBody,
  });
}
