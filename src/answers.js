import { ref, set, onValue } from 'firebase/database'
import { db } from './firebase.js'

function requireDb() {
  if (!db) {
    throw new Error(
      'Firebase Realtime Database URL missing. Add VITE_FIREBASE_DATABASE_URL to your .env file.',
    )
  }
}

/** Listen to `answers/{questionIndex}/{userId}`. Callback gets `null` if missing. */
export function subscribeUserAnswer(questionIndex, userId, onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  const r = ref(db, `answers/${questionIndex}/${userId}`)
  return onValue(r, (snap) => {
    onData(snap.exists() ? snap.val() : null)
  })
}

/** All answers for one question: `{ [userId]: { … } }`. */
export function subscribeAnswersForQuestion(questionIndex, onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  const r = ref(db, `answers/${questionIndex}`)
  return onValue(r, (snap) => {
    onData(snap.val() || {})
  })
}

/**
 * Writes `answers/{questionIndex}/{userId}` in one request (no prior read).
 * Duplicate submits are avoided on the guest via local state + listener.
 * @param {Record<string, unknown>} payload — e.g. `{ userId, displayName, answer, submittedAt }`
 */
export async function saveNewAnswer(questionIndex, userId, payload) {
  requireDb()
  await set(ref(db, `answers/${questionIndex}/${userId}`), payload)
}
