import { ref, onValue } from 'firebase/database'
import { db } from './firebase.js'

/** Full `results/` tree for per-player stats (small quiz). */
export function subscribeAllResults(onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  return onValue(ref(db, 'results'), (snap) => {
    onData(snap.exists() ? snap.val() || {} : {})
  })
}

/** Listen to `scores/`; callback receives `{ [userId]: number }` (non-numeric values ignored by callers). */
export function subscribeScores(onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  return onValue(ref(db, 'scores'), (snap) => {
    onData(snap.exists() ? snap.val() || {} : {})
  })
}

/** Listen to `results/{questionIndex}`; callback receives `null` if missing. */
export function subscribeQuestionResult(questionIndex, onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  if (typeof questionIndex !== 'number') {
    onData(null)
    return () => {}
  }
  const r = ref(db, `results/${questionIndex}`)
  return onValue(r, (snap) => {
    onData(snap.exists() ? snap.val() : null)
  })
}
