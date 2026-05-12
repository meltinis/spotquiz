const KEY_USER_ID = 'spotquiz:userId'
const KEY_DISPLAY_NAME = 'spotquiz:displayName'
const LEGACY_KEY_NAME = 'spotquiz:guestName'

export function generateUserId() {
  return crypto.randomUUID()
}

function readStoredDisplayName() {
  let v = localStorage.getItem(KEY_DISPLAY_NAME)
  if (v != null) return v
  const legacy = localStorage.getItem(LEGACY_KEY_NAME)
  if (legacy != null) {
    localStorage.setItem(KEY_DISPLAY_NAME, legacy)
    localStorage.removeItem(LEGACY_KEY_NAME)
    return legacy
  }
  return null
}

/** Returns `{ userId, displayName }` when both exist in localStorage. */
export function getGuestSession() {
  const userId = localStorage.getItem(KEY_USER_ID)
  const displayName = readStoredDisplayName()
  if (!userId || displayName === null) return null
  return { userId, displayName }
}

/** `displayName` is stored exactly as synced from Firebase when possible (may be ""). */
export function saveGuestSession(userId, displayName) {
  localStorage.setItem(KEY_USER_ID, userId)
  localStorage.setItem(KEY_DISPLAY_NAME, String(displayName).trim())
}
