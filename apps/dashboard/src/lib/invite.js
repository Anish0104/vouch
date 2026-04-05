const STORAGE_KEY = 'vouch:latestInvite';
export const LATEST_INVITE_EVENT = 'vouch:latestInviteUpdated';

export function loadLatestInvite() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLatestInvite(invite) {
  if (typeof window === 'undefined' || !invite) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invite));
    window.dispatchEvent(new CustomEvent(LATEST_INVITE_EVENT, {
      detail: invite,
    }));
  } catch {
    // Ignore storage errors in demo mode.
  }
}
