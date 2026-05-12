import { ref, set, onValue } from 'firebase/database'
import { db } from './firebase.js'

function requireDb() {
  if (!db) {
    throw new Error(
      'Firebase Realtime Database URL missing. Add VITE_FIREBASE_DATABASE_URL to your .env file.',
    )
  }
}

/** Listen to `game/`; callback receives `null` if missing. */
export function subscribeGame(onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  const r = ref(db, 'game')
  return onValue(r, (snap) => {
    onData(snap.exists() ? snap.val() : null)
  })
}

/** Starts the first question window (admin). */
export async function startQuestion() {
  requireDb()
  const now = Date.now()
  await set(ref(db, 'game'), {
    questionIndex: 0,
    phase: 'question_open',
    startedAt: now,
    closesAt: now + 30000,
  })
}
