function readWindowConfig() {
  if (typeof window === 'undefined') {
    return {};
  }

  return window.__VOUCH_CONFIG__ || {};
}

export function getRuntimeConfig(key) {
  const windowValue = readWindowConfig()[key];
  if (typeof windowValue === 'string' && windowValue.length > 0) {
    return windowValue;
  }

  const envValue = import.meta.env[key];
  return typeof envValue === 'string' ? envValue : '';
}
