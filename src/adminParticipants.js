import { ref, onValue, update } from 'firebase/database'
import { db } from './firebase.js'
import { t } from './i18n.js'

/** Raw trimmed `displayName` from Firebase, or "" if absent. */
export function rawParticipantDisplay(participantLike) {
  const dn = participantLike?.displayName
  if (typeof dn !== 'string') return ''
  return dn.trim()
}

/** Primary label everywhere in the UI (participant object or `{ displayName }`). */
export function formatParticipantDisplay(participantLike) {
  const raw = rawParticipantDisplay(participantLike)
  return raw || t('common.missingName')
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
    throw new Error(t('errors.firebaseUrlMissing'))
  }
  const trimmed = displayName.trim()
  if (!trimmed) {
    throw new Error(t('errors.displayNameEmpty'))
  }

  await update(ref(db, `participants/${userId}`), {
    displayName: trimmed,
  })
}
