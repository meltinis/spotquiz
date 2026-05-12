import { ref, set, update, onValue } from 'firebase/database'
import { db } from './firebase.js'

function requireDb() {
  if (!db) {
    throw new Error(
      'Firebase Realtime Database URL missing. Add VITE_FIREBASE_DATABASE_URL to your .env file.',
    )
  }
}

/** Full write for a new guest (join form). */
export async function registerGuestParticipant(userId, displayName) {
  requireDb()
  const now = Date.now()
  const trimmed = displayName.trim()
  await set(ref(db, `participants/${userId}`), {
    displayName: trimmed,
    role: 'guest',
    joinedAt: now,
    lastSeenAt: now,
  })
}

/** Merge `lastSeenAt` when the guest already has a local session. */
export async function updateGuestLastSeen(userId) {
  requireDb()
  await update(ref(db, `participants/${userId}`), {
    lastSeenAt: Date.now(),
  })
}

/**
 * Listen to one participant node. Callback receives `null` if the node is missing.
 * Use for the guest view to stay in sync with `displayName`.
 */
export function subscribeParticipant(userId, onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  const r = ref(db, `participants/${userId}`)
  return onValue(r, (snap) => {
    onData(snap.exists() ? snap.val() : null)
  })
}
