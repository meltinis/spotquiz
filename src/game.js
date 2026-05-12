import { ref, set, update, get, onValue, runTransaction } from 'firebase/database'
import { db } from './firebase.js'
import { t } from './i18n.js'
import { QUESTIONS } from './questions.js'
import { PARTICIPANT_ROLE_CONFIRMAND } from './routeRole.js'

const MAX_QUESTION_INDEX = QUESTIONS.length - 1

/** Time window for answering once a question is opened (ms). */
const QUESTION_OPEN_DURATION_MS = 30_000 

/** How long the question text is shown alone before answers start revealing (ms). */
const QUESTION_INTRO_DURATION_MS = 5000

/** Time between revealing each answer option (ms). */
export const REVEAL_ANSWER_INTERVAL_MS = 2000

/** Pause after the last answer is revealed before the timer starts (ms). */
const REVEAL_TO_OPEN_PAUSE_MS = 2000

const BASE_CORRECT_POINTS = 1000
const MAX_SPEED_BONUS_POINTS = 500

function requireDb() {
  if (!db) {
    throw new Error(t('errors.firebaseUrlMissing'))
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

/**
 * Runs the intro → progressive reveal → open sequence for `questionIndex` (admin-driven).
 *
 * Writes the Firebase `game` state for each step so guests and the screen mirror it.
 * Uses `setTimeout`-based pacing in the admin's tab — keep the tab open until the
 * timer starts. If `shouldCancel()` returns true between steps, the sequence aborts
 * without writing further updates (the current Firebase state is left as-is).
 */
export async function runQuestionIntroSequence(
  questionIndex,
  shouldCancel = () => false,
) {
  requireDb()
  if (
    typeof questionIndex !== 'number' ||
    questionIndex < 0 ||
    questionIndex > MAX_QUESTION_INDEX
  ) {
    return
  }
  const q = QUESTIONS[questionIndex]
  if (!q) return
  const optionsLen = q.options.length

  if (shouldCancel()) return
  await set(ref(db, 'game'), {
    questionIndex,
    phase: 'question_intro',
    startedAt: null,
    closesAt: null,
    revealedCount: 0,
  })

  await sleep(QUESTION_INTRO_DURATION_MS)
  if (shouldCancel()) return

  for (let i = 1; i <= optionsLen; i++) {
    if (shouldCancel()) return
    await update(ref(db, 'game'), {
      phase: 'question_reveal_answers',
      revealedCount: i,
    })
    if (i < optionsLen) {
      await sleep(REVEAL_ANSWER_INTERVAL_MS)
    }
  }

  await sleep(REVEAL_TO_OPEN_PAUSE_MS)
  if (shouldCancel()) return

  const now = Date.now()
  await update(ref(db, 'game'), {
    phase: 'question_open',
    startedAt: now,
    closesAt: now + QUESTION_OPEN_DURATION_MS,
    revealedCount: optionsLen,
  })
}

/** Starts the first question via the intro/reveal sequence (admin). */
export async function startQuestion(shouldCancel) {
  requireDb()
  await runQuestionIntroSequence(0, shouldCancel)
}

function scoreForUserId(scoresRoot, userId) {
  const v = scoresRoot?.[userId]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Rounded speed bonus in [0, 500] from game window and answer time. */
function speedBonusPoints(submittedAt, startedAt, closesAt) {
  if (typeof submittedAt !== 'number' || !Number.isFinite(submittedAt)) return 0
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return 0
  if (typeof closesAt !== 'number' || !Number.isFinite(closesAt)) return 0
  const duration = closesAt - startedAt
  if (!(duration > 0)) return 0
  const raw = MAX_SPEED_BONUS_POINTS * ((closesAt - submittedAt) / duration)
  const rounded = Math.round(raw)
  return Math.max(0, Math.min(MAX_SPEED_BONUS_POINTS, rounded))
}

/**
 * Writes `results/{questionIndex}` (including `scores/{userId}` breakdown) and adds
 * round points to `scores/{userId}`. Skips if already scored. Does nothing if the
 * confirmand did not submit an answer for this question.
 */
async function scoreQuestionAtIndex(questionIndex) {
  requireDb()
  if (
    typeof questionIndex !== 'number' ||
    questionIndex < 0 ||
    questionIndex > MAX_QUESTION_INDEX
  ) {
    return
  }

  const gameSnap = await get(ref(db, 'game'))
  const gameVal = gameSnap.exists() ? gameSnap.val() : {}
  const startedAt =
    typeof gameVal.startedAt === 'number' ? gameVal.startedAt : null
  const closesAt =
    typeof gameVal.closesAt === 'number' ? gameVal.closesAt : null

  const answersSnap = await get(ref(db, `answers/${questionIndex}`))
  const answersMap = answersSnap.exists() ? answersSnap.val() || {} : {}
  let correctAnswer = null
  for (const ans of Object.values(answersMap)) {
    if (ans && ans.role === PARTICIPANT_ROLE_CONFIRMAND && typeof ans.answer === 'string') {
      correctAnswer = ans.answer
      break
    }
  }
  if (correctAnswer == null) return

  const guestScores = {}
  const cumulativeDeltas = {}
  for (const [userId, ans] of Object.entries(answersMap)) {
    if (!ans || ans.role === PARTICIPANT_ROLE_CONFIRMAND) continue
    const answer = typeof ans.answer === 'string' ? ans.answer : ''
    const submittedAt =
      typeof ans.submittedAt === 'number' ? ans.submittedAt : null
    const displayName =
      typeof ans.displayName === 'string' ? ans.displayName.trim() : ''
    const correct = answer === correctAnswer
    let basePoints = 0
    let speedBonus = 0
    let totalPoints = 0
    if (correct) {
      basePoints = BASE_CORRECT_POINTS
      speedBonus = speedBonusPoints(submittedAt, startedAt, closesAt)
      totalPoints = basePoints + speedBonus
      cumulativeDeltas[userId] = totalPoints
    }
    guestScores[userId] = {
      displayName,
      correct,
      basePoints,
      speedBonus,
      totalPoints,
      submittedAt,
    }
  }

  const payload = {
    scored: true,
    scoredAt: Date.now(),
    correctAnswer,
    startedAt,
    closesAt,
    scores: guestScores,
  }

  const txResult = await runTransaction(
    ref(db, `results/${questionIndex}`),
    (current) => {
      if (current && current.scored === true) return undefined
      return payload
    },
  )
  if (!txResult.committed) return

  if (Object.keys(cumulativeDeltas).length === 0) return

  const scoresSnap = await get(ref(db, 'scores'))
  const scoresRoot = scoresSnap.exists() ? scoresSnap.val() || {} : {}
  const scoreUpdates = {}
  for (const [userId, add] of Object.entries(cumulativeDeltas)) {
    const next = scoreForUserId(scoresRoot, userId) + add
    scoreUpdates[`scores/${userId}`] = next
  }
  await update(ref(db), scoreUpdates)
}

/** Sets phase to `question_closed` when open, then applies scoring rules once. */
export async function closeQuestion() {
  requireDb()
  const snap = await get(ref(db, 'game'))
  if (!snap.exists()) return
  const g = snap.val()
  if (g.phase === 'waiting') return
  const qIdx = g.questionIndex
  if (typeof qIdx !== 'number') return
  if (g.phase === 'question_open') {
    await update(ref(db, 'game'), { phase: 'question_closed' })
  }
  await scoreQuestionAtIndex(qIdx)
}

/** When the open window has passed its `closesAt` time, close and score (idempotent). */
export async function maybeAutoCloseExpiredQuestion() {
  if (!db) return
  const snap = await get(ref(db, 'game'))
  if (!snap.exists()) return
  const g = snap.val()
  if (g.phase !== 'question_open') return
  if (typeof g.closesAt !== 'number') return
  if (Date.now() < g.closesAt) return
  await closeQuestion()
}

/** Advances to the next question via the intro/reveal sequence (admin). */
export async function nextQuestion(shouldCancel) {
  requireDb()
  const snap = await get(ref(db, 'game'))
  if (!snap.exists()) {
    throw new Error(t('errors.noGameInProgress'))
  }
  const current = snap.val()
  const idx =
    typeof current.questionIndex === 'number' ? current.questionIndex : 0
  if (idx >= MAX_QUESTION_INDEX) {
    throw new Error(t('errors.alreadyLastQuestion'))
  }
  await runQuestionIntroSequence(idx + 1, shouldCancel)
}

/** Clears answers, results & scores and returns the game to an idle state (participants unchanged). */
export async function resetGame() {
  requireDb()
  await Promise.all([
    set(ref(db, 'game'), {
      questionIndex: 0,
      phase: 'waiting',
      startedAt: null,
      closesAt: null,
      revealedCount: 0,
    }),
    set(ref(db, 'answers'), null),
    set(ref(db, 'results'), null),
    set(ref(db, 'scores'), null),
  ])
}
