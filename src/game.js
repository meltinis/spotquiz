import { ref, set, update, get, onValue } from 'firebase/database'
import { db } from './firebase.js'
import { QUESTIONS } from './questions.js'

const MAX_QUESTION_INDEX = QUESTIONS.length - 1

/** Time window for answering once a question is opened (ms). */
const QUESTION_OPEN_DURATION_MS = 30_000

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
    closesAt: now + QUESTION_OPEN_DURATION_MS,
  })
}

/** Stops accepting answers for the current question (admin). */
export async function closeQuestion() {
  requireDb()
  await update(ref(db, 'game'), { phase: 'question_closed' })
}

/** Advances to the next question and opens the window (admin). */
export async function nextQuestion() {
  requireDb()
  const snap = await get(ref(db, 'game'))
  if (!snap.exists()) {
    throw new Error('No game in progress.')
  }
  const current = snap.val()
  const idx =
    typeof current.questionIndex === 'number' ? current.questionIndex : 0
  if (idx >= MAX_QUESTION_INDEX) {
    throw new Error('Already on the last question.')
  }
  const now = Date.now()
  await update(ref(db, 'game'), {
    questionIndex: idx + 1,
    phase: 'question_open',
    startedAt: now,
    closesAt: now + QUESTION_OPEN_DURATION_MS,
  })
}

/** Clears answers & scores and returns the game to an idle state (participants unchanged). */
export async function resetGame() {
  requireDb()
  await Promise.all([
    set(ref(db, 'game'), {
      questionIndex: 0,
      phase: 'waiting',
      startedAt: null,
      closesAt: null,
    }),
    set(ref(db, 'answers'), null),
    set(ref(db, 'scores'), null),
  ])
}
