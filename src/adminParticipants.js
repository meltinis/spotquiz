import { ref, onValue, get, update } from 'firebase/database'
import { db } from './firebase.js'

export const MISSING_DISPLAY_NAME = '(missing name)'

/** Raw trimmed `displayName` from Firebase, or "" if absent. */
export function rawParticipantDisplay(participantLike) {
  const dn = participantLike?.displayName
  if (typeof dn !== 'string') return ''
  return dn.trim()
}

/** Primary label everywhere in the UI (participant object or `{ displayName }`). */
export function formatParticipantDisplay(participantLike) {
  const raw = rawParticipantDisplay(participantLike)
  return raw || MISSING_DISPLAY_NAME
}

/** `[userId, data][]` alphabetically by visible display name, then `userId`. */
export function sortParticipantsByDisplayName(map) {
  return Object.entries(map || {}).sort(([idA, a], [idB, b]) => {
    const cmp = formatParticipantDisplay(a).localeCompare(
      formatParticipantDisplay(b),
      undefined,
      { sensitivity: 'base' },
    )
    if (cmp !== 0) return cmp
    return idA.localeCompare(idB)
  })
}

/** Subscribe to all participants; callback receives `{ [userId]: data }`. */
export function subscribeParticipants(onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  const r = ref(db, 'participants')
  return onValue(r, (snap) => {
    onData(snap.val() || {})
  })
}

export async function updateParticipantDisplayName(userId, displayName) {
  if (!db) {
    throw new Error(
      'Firebase Realtime Database URL missing. Add VITE_FIREBASE_DATABASE_URL to your .env file.',
    )
  }
  const trimmed = displayName.trim()
  if (!trimmed) {
    throw new Error('Display name cannot be empty.')
  }

  await update(ref(db, `participants/${userId}`), {
    displayName: trimmed,
  })

  const scoreRef = ref(db, `scores/${userId}`)
  const scoreSnap = await get(scoreRef)
  if (scoreSnap.exists()) {
    await update(scoreRef, { displayName: trimmed })
  }
}
