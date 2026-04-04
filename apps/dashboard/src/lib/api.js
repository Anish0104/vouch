import { getRuntimeConfig } from './runtimeConfig';

const API_URL = getRuntimeConfig('VITE_API_URL').replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_URL}${path}`;
}
