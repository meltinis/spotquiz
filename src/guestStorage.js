const KEY_USER_ID = 'spotquiz:userId'
const KEY_NAME = 'spotquiz:guestName'

export function generateUserId() {
  return crypto.randomUUID()
}

/** Returns { userId, name } when both exist; otherwise null. */
export function getGuestSession() {
  const userId = localStorage.getItem(KEY_USER_ID)
  const name = localStorage.getItem(KEY_NAME)
  if (!userId || !name) return null
  return { userId, name }
}

export function saveGuestSession(userId, name) {
  localStorage.setItem(KEY_USER_ID, userId)
  localStorage.setItem(KEY_NAME, name.trim())
}
