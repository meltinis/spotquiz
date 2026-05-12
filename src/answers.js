import { ref, get, set, onValue } from 'firebase/database'
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
 * Writes `answers/{questionIndex}/{userId}`. Fails if a record already exists.
 * @param {Record<string, unknown>} payload — e.g. `{ userId, displayName, answer, submittedAt }`
 */
export async function saveNewAnswer(questionIndex, userId, payload) {
  requireDb()
  const r = ref(db, `answers/${questionIndex}/${userId}`)
  const snap = await get(r)
  if (snap.exists()) {
    throw new Error('Already answered')
  }
  await set(r, payload)
}
