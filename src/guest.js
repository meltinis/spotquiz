import {

  rawParticipantDisplay,

  formatParticipantDisplay,

  subscribeParticipants,

} from './adminParticipants.js'

import { db } from './firebase.js'

import {

  registerParticipantForRoute,

  subscribeParticipant,

  syncParticipantRoleAndPresence,

} from './participants.js'

import {

  getCurrentRoleFromRoute,

  getCurrentRoute,

  PARTICIPANT_ROLE_CONFIRMAND,

  SPOTQUIZ_DEBUG_ROLE,

} from './routeRole.js'

import {

  generateUserId,

  getParticipantSession,

  saveParticipantSession,

  cacheParticipantRoleFromRoute,

} from './guestStorage.js'

import { subscribeGame, maybeAutoCloseExpiredQuestion } from './game.js'

import { QUESTIONS } from './questions.js'

import { formatAnswerDisplayText } from './questionDisplay.js'

import {

  subscribeUserAnswer,

  subscribeAllAnswers,

  saveNewAnswer,

} from './answers.js'

import { subscribeScores, subscribeAllResults } from './results.js'

import { t } from './i18n.js'



const GUEST_VIEW_CONFIG = {

  getSession: getParticipantSession,

  saveSession: saveParticipantSession,

  registerParticipant: registerParticipantForRoute,

  joinTitle: () => t('guest.joinTitle'),

  joinLede: () => t('guest.joinLede'),

  namePlaceholder: () => t('guest.joinPlaceholder'),

  showMyStatus: true,

}



const CONFIRMAND_VIEW_CONFIG = {

  getSession: getParticipantSession,

  saveSession: saveParticipantSession,

  registerParticipant: registerParticipantForRoute,

  joinTitle: () => t('guest.confirmandJoinTitle'),

  joinLede: () => t('guest.confirmandJoinLede'),

  namePlaceholder: () => t('guest.confirmandPlaceholder'),

  showMyStatus: false,

}



let guestRealtimeUnsubscribe = null

let guestGameUnsubscribe = null

let guestAnswerUnsubscribe = null

let guestCountdownIntervalId = null

let guestStatsScoresUnsubscribe = null

let guestStatsResultsUnsubscribe = null

let guestStatsParticipantsUnsubscribe = null

let guestStatsAnswersUnsubscribe = null

function disposeGuestStatsSubscriptions() {

  if (guestStatsScoresUnsubscribe) {

    guestStatsScoresUnsubscribe()

    guestStatsScoresUnsubscribe = null

  }

  if (guestStatsResultsUnsubscribe) {

    guestStatsResultsUnsubscribe()

    guestStatsResultsUnsubscribe = null

  }

  if (guestStatsParticipantsUnsubscribe) {

    guestStatsParticipantsUnsubscribe()

    guestStatsParticipantsUnsubscribe = null

  }

  if (guestStatsAnswersUnsubscribe) {

    guestStatsAnswersUnsubscribe()

    guestStatsAnswersUnsubscribe = null

  }

}

export function disposeGuestSubscriptions() {

  clearGuestCountdown()

  disposeGuestStatsSubscriptions()

  if (guestRealtimeUnsubscribe) {

    guestRealtimeUnsubscribe()

    guestRealtimeUnsubscribe = null

  }

  if (guestGameUnsubscribe) {

    guestGameUnsubscribe()

    guestGameUnsubscribe = null

  }

  if (guestAnswerUnsubscribe) {

    guestAnswerUnsubscribe()

    guestAnswerUnsubscribe = null

  }

  clearGuestOptionDelegation()

}



function clearGuestCountdown() {

  if (guestCountdownIntervalId != null) {

    clearInterval(guestCountdownIntervalId)

    guestCountdownIntervalId = null

  }

}



let guestOptionDelegationTarget = null

let guestOptionDelegationHandler = null



function clearGuestOptionDelegation() {

  if (guestOptionDelegationTarget && guestOptionDelegationHandler) {

    guestOptionDelegationTarget.removeEventListener(

      'click',

      guestOptionDelegationHandler,

    )

  }

  guestOptionDelegationTarget = null

  guestOptionDelegationHandler = null

}



function escapeHtml(text) {

  const div = document.createElement('div')

  div.textContent = text

  return div.innerHTML

}



function routeRoleLabelHtml() {

  const label =

    getCurrentRoleFromRoute() === PARTICIPANT_ROLE_CONFIRMAND

      ? t('roles.confirmand')

      : t('roles.guest')

  return `<p class="guest-route-role-hint">${escapeHtml(t('guest.playingAs'))} <strong>${escapeHtml(label)}</strong></p>`

}

function cumulativePointsFromScores(scoresRoot, userId) {

  const v = scoresRoot?.[userId]

  if (typeof v === 'number' && Number.isFinite(v)) return v

  if (v && typeof v.totalPoints === 'number' && Number.isFinite(v.totalPoints))

    return v.totalPoints

  return 0

}

function resultNodeForQuestion(resultsMap, q) {

  if (!resultsMap || typeof resultsMap !== 'object') return null

  return resultsMap[q] ?? resultsMap[String(q)] ?? null

}

function answersNodeForQuestion(answersMap, q) {

  if (!answersMap || typeof answersMap !== 'object') return null

  return answersMap[q] ?? answersMap[String(q)] ?? null

}

function countCorrectFromResults(resultsMap, userId) {

  if (!resultsMap || typeof resultsMap !== 'object') return 0

  let n = 0

  for (const res of Object.values(resultsMap)) {

    if (res?.scores?.[userId]?.correct === true) n++

  }

  return n

}

const FEEDBACK_CORRECT_VARIANTS = 4
const FEEDBACK_WRONG_VARIANTS = 4

/**
 * Per-question feedback for this user. Returns `null` until the current question
 * is scored (results node exists with `scored === true`); otherwise picks a
 * playful Danish line from `guest.feedbackCorrect` / `guest.feedbackWrong` /
 * `guest.feedbackNoAnswer` based on `correct` flag — variant chosen by `qIdx`
 * so it stays stable for one question but varies between questions.
 */
function feedbackForCurrentQuestion(userId, qIdx, resultsMap) {
  if (typeof qIdx !== 'number') return null
  const res = resultNodeForQuestion(resultsMap, qIdx)
  if (!res || res.scored !== true) return null
  const scoreRow = res.scores?.[userId]
  if (!scoreRow) {
    return { kind: 'no-answer', text: t('guest.feedbackNoAnswer') }
  }
  if (scoreRow.correct === true) {
    const i = Math.abs(qIdx) % FEEDBACK_CORRECT_VARIANTS
    return { kind: 'correct', text: t(`guest.feedbackCorrect.${i}`) }
  }
  const i = Math.abs(qIdx) % FEEDBACK_WRONG_VARIANTS
  return { kind: 'wrong', text: t(`guest.feedbackWrong.${i}`) }
}

function roundFeedbackHtml(feedback) {
  if (!feedback) return ''
  const modifier =
    feedback.kind === 'correct'
      ? ' guest-round-feedback--correct'
      : feedback.kind === 'wrong'
        ? ' guest-round-feedback--wrong'
        : ' guest-round-feedback--no-answer'
  return `<p class="guest-round-feedback${modifier}" role="status">${escapeHtml(feedback.text)}</p>`
}

function collectGuestUserIdsForRanking(scoresRoot, participantsMap, answersMap) {

  const ids = new Set()

  if (participantsMap && typeof participantsMap === 'object') {

    for (const [uid, p] of Object.entries(participantsMap)) {

      if (p?.role === PARTICIPANT_ROLE_CONFIRMAND) continue

      ids.add(uid)

    }

  }

  if (scoresRoot && typeof scoresRoot === 'object') {

    for (const uid of Object.keys(scoresRoot)) {

      if (participantsMap?.[uid]?.role === PARTICIPANT_ROLE_CONFIRMAND) continue

      ids.add(uid)

    }

  }

  if (answersMap && typeof answersMap === 'object') {

    for (let q = 0; q < QUESTIONS.length; q++) {

      const block = answersNodeForQuestion(answersMap, q)

      if (!block) continue

      for (const [uid, ans] of Object.entries(block)) {

        if (ans?.role === PARTICIPANT_ROLE_CONFIRMAND) continue

        ids.add(uid)

      }

    }

  }

  return ids

}

/**

 * Rank 1-based among guests (participants, scores, and guest answers). Tie-break equal

 * points with `averageAnswerSecondsForUser` (lower seconds first); unchanged formula.

 */

function rankAmongGuests(

  scoresRoot,

  participantsMap,

  userId,

  resultsMap,

  answersMap,

  gameState,

) {

  const ids = collectGuestUserIdsForRanking(

    scoresRoot,

    participantsMap,

    answersMap,

  )

  if (ids.size === 0) return null

  if (!ids.has(userId)) return null

  const ranked = [...ids].map((uid) => ({

    uid,

    pts: cumulativePointsFromScores(scoresRoot, uid),

    avg: averageAnswerSecondsForUser(

      resultsMap,

      answersMap,

      uid,

      gameState,

    ),

  }))

  ranked.sort((a, b) => {

    if (b.pts !== a.pts) return b.pts - a.pts

    const aAvg =

      typeof a.avg === 'number' && Number.isFinite(a.avg) ? a.avg : Infinity

    const bAvg =

      typeof b.avg === 'number' && Number.isFinite(b.avg) ? b.avg : Infinity

    if (aAvg !== bAvg) return aAvg - bAvg

    return a.uid.localeCompare(b.uid)

  })

  const idx = ranked.findIndex((r) => r.uid === userId)

  return idx === -1 ? null : idx + 1

}

/** Average answer time in seconds, or `null` if no usable answers. */

function averageAnswerSecondsForUser(

  resultsMap,

  answersMap,

  userId,

  gameState,

) {

  const deltasMs = []

  for (let q = 0; q < QUESTIONS.length; q++) {

    const res = resultNodeForQuestion(resultsMap, q)

    const ansBlock = answersNodeForQuestion(answersMap, q)

    const ans = ansBlock?.[userId]

    const scoreRow = res?.scores?.[userId]

    if (!ans && !scoreRow) continue

    const submittedAt =

      typeof scoreRow?.submittedAt === 'number'

        ? scoreRow.submittedAt

        : typeof ans?.submittedAt === 'number'

          ? ans.submittedAt

          : null

    if (submittedAt == null || !Number.isFinite(submittedAt)) continue

    let startedAt = null

    if (typeof res?.startedAt === 'number' && Number.isFinite(res.startedAt)) {

      startedAt = res.startedAt

    } else if (

      gameState?.phase === 'question_open' &&

      gameState.questionIndex === q &&

      typeof gameState.startedAt === 'number'

    ) {

      startedAt = gameState.startedAt

    }

    if (startedAt == null || !Number.isFinite(startedAt)) continue

    deltasMs.push(submittedAt - startedAt)

  }

  if (deltasMs.length === 0) return null

  const sum = deltasMs.reduce((s, x) => s + x, 0)

  return sum / deltasMs.length / 1000

}

function computeMyStats(

  userId,

  scoresMap,

  resultsMap,

  participantsMap,

  answersMap,

  gameState,

) {

  return {

    totalPoints: cumulativePointsFromScores(scoresMap, userId),

    correctCount: countCorrectFromResults(resultsMap, userId),

    rank: rankAmongGuests(

      scoresMap,

      participantsMap,

      userId,

      resultsMap,

      answersMap,

      gameState,

    ),

    avgSeconds: averageAnswerSecondsForUser(

      resultsMap,

      answersMap,

      userId,

      gameState,

    ),

  }

}

function avgTimeDisplay(stats) {

  if (

    typeof stats.avgSeconds === 'number' &&

    Number.isFinite(stats.avgSeconds)

  ) {

    return `${stats.avgSeconds.toFixed(1)}${t('common.secondsUnit')}`

  }

  return t('common.emDash')

}

function myStatusSectionHtml(stats, prevStats) {

  const rankStr = stats.rank != null ? String(stats.rank) : t('common.emDash')

  const pointsStr = String(stats.totalPoints)

  const correctStr = String(stats.correctCount)

  const avgStr = avgTimeDisplay(stats)

  const prevAvgStr = prevStats ? avgTimeDisplay(prevStats) : null

  const bumpPoints =

    prevStats != null && prevStats.totalPoints !== stats.totalPoints

      ? ' guest-stat-tile--updated'

      : ''

  const bumpCorrect =

    prevStats != null && prevStats.correctCount !== stats.correctCount

      ? ' guest-stat-tile--updated'

      : ''

  const bumpRank =

    prevStats != null && prevStats.rank !== stats.rank

      ? ' guest-stat-tile--updated'

      : ''

  const bumpAvg =

    prevStats != null && prevAvgStr !== avgStr

      ? ' guest-stat-tile--updated'

      : ''

  let rankHighlight = ''

  if (typeof stats.rank === 'number' && stats.rank === 1)

    rankHighlight = ' guest-stat-tile--rank-1'

  else if (

    typeof stats.rank === 'number' &&

    (stats.rank === 2 || stats.rank === 3)

  )

    rankHighlight = ' guest-stat-tile--rank-top'

  return `

    <section class="guest-player-stats-card" aria-label="${escapeHtml(t('guest.myStatusTitle'))}">

      <header class="guest-player-stats-header">

        <h2 class="guest-player-stats-title">${escapeHtml(t('guest.myStatusTitle'))}</h2>

        <p class="guest-player-stats-sub">${escapeHtml(t('guest.myStatusSub'))}</p>

      </header>

      <div class="guest-player-stats-grid">

        <div class="guest-stat-tile guest-stat-tile--points${bumpPoints}">

          <span class="guest-stat-tile-icon" aria-hidden="true">⭐</span>

          <span class="guest-stat-tile-value">${escapeHtml(pointsStr)}</span>

          <span class="guest-stat-tile-label">${escapeHtml(t('guest.statTotalPoints'))}</span>

        </div>

        <div class="guest-stat-tile guest-stat-tile--correct${bumpCorrect}">

          <span class="guest-stat-tile-icon" aria-hidden="true">🎯</span>

          <span class="guest-stat-tile-value">${escapeHtml(correctStr)}</span>

          <span class="guest-stat-tile-label">${escapeHtml(t('guest.statCorrect'))}</span>

        </div>

        <div class="guest-stat-tile guest-stat-tile--rank${rankHighlight}${bumpRank}">

          <span class="guest-stat-tile-icon" aria-hidden="true">🏆</span>

          <span class="guest-stat-tile-value">${escapeHtml(rankStr)}</span>

          <span class="guest-stat-tile-label">${escapeHtml(t('guest.statRank'))}</span>

        </div>

        <div class="guest-stat-tile guest-stat-tile--speed${bumpAvg}">

          <span class="guest-stat-tile-icon" aria-hidden="true">⚡</span>

          <span class="guest-stat-tile-value">${escapeHtml(avgStr)}</span>

          <span class="guest-stat-tile-label">${escapeHtml(t('guest.statAvgTime'))}</span>

        </div>

      </div>

    </section>`

}



function remainingMsFromClosesAt(closesAt) {

  if (typeof closesAt !== 'number') return 0

  return Math.max(0, closesAt - Date.now())

}



function formatCountdown(remainingMs) {

  const s = Math.max(0, Math.ceil(remainingMs / 1000))

  const m = Math.floor(s / 60)

  const sec = s % 60

  return `${m}:${String(sec).padStart(2, '0')}`

}

/** Shape icon class per option index (0–3). */
const GUEST_OPTION_SHAPE_CLASSES = [
  'guest-option-shape-triangle',
  'guest-option-shape-diamond',
  'guest-option-shape-circle',
  'guest-option-shape-square',
]

function optionIndexFromSavedAnswer(question, existingAnswer) {

  if (!existingAnswer || typeof existingAnswer.answer !== 'string') return null

  const idx = question.options.indexOf(existingAnswer.answer)

  return idx >= 0 ? idx : null

}



function renderParticipantView(container, cfg) {

  disposeGuestSubscriptions()



  const session = cfg.getSession()

  if (!session) {

    renderJoinForm(container, cfg)

    return

  }



  mountParticipantWaiting(container, session.userId, cfg)

}



export function renderGuest(container) {

  renderParticipantView(container, GUEST_VIEW_CONFIG)

}



export function renderConfirmand(container) {

  renderParticipantView(container, CONFIRMAND_VIEW_CONFIG)

}



function renderJoinForm(container, cfg) {

  container.innerHTML = `

    <h1>${escapeHtml(cfg.joinTitle())}</h1>

    <p class="guest-lede">${escapeHtml(cfg.joinLede())}</p>

    <form class="guest-form" id="guest-join-form">

      <label class="guest-label" for="guest-display-name">${escapeHtml(t('guest.displayNameLabel'))}</label>

      <input

        class="guest-input"

        id="guest-display-name"

        name="displayName"

        type="text"

        autocomplete="nickname"

        maxlength="80"

        required

        placeholder="${escapeHtml(cfg.namePlaceholder())}"

      />

      <p class="guest-error" id="guest-error" hidden></p>

      <button class="guest-button" type="submit" id="guest-submit">${escapeHtml(t('guest.joinSubmit'))}</button>

    </form>

  `



  const form = container.querySelector('#guest-join-form')

  const input = container.querySelector('#guest-display-name')

  const errorEl = container.querySelector('#guest-error')

  const submitBtn = container.querySelector('#guest-submit')



  form.addEventListener('submit', async (e) => {

    e.preventDefault()

    const displayName = input.value.trim()

    if (!displayName) return



    const userId = generateUserId()

    errorEl.hidden = true

    submitBtn.disabled = true



    try {

      await cfg.registerParticipant(userId, displayName)

      cfg.saveSession(userId, displayName.trim())

      renderParticipantView(container, cfg)

    } catch (err) {

      console.error(err)

      errorEl.textContent = t('guest.joinError')

      errorEl.hidden = false

      submitBtn.disabled = false

    }

  })

}



function guestPageHeadingHtml(displayName) {

  return `<h1 class="guest-page-title">${escapeHtml(t('guest.pageTitlePrefix'))} <span class="guest-title-name">${escapeHtml(displayName)}</span></h1>`

}



function drawIntroSoon(container, participantLike, myStatusHtml = '') {
  const shown = formatParticipantDisplay(participantLike)

  container.innerHTML = `

    ${guestPageHeadingHtml(shown)}

    <p class="guest-waiting-primary">${escapeHtml(t('guest.quizStartingSoon'))}</p>

    ${myStatusHtml}

    ${routeRoleLabelHtml()}

  `

}



function drawWaiting(container, participantLike, myStatusHtml = '') {

  const shown = formatParticipantDisplay(participantLike)

  container.innerHTML = `

    ${guestPageHeadingHtml(shown)}

    <p class="guest-waiting-primary">${escapeHtml(t('guest.waitingPrimary'))}</p>

    ${myStatusHtml}

    ${routeRoleLabelHtml()}

  `

}



function drawQuestionClosed(container, participantLike, question, myStatusHtml = '') {

  const shown = formatParticipantDisplay(participantLike)

  container.innerHTML = `

    ${guestPageHeadingHtml(shown)}

    <p class="guest-question-text">${escapeHtml(question.text)}</p>

    <p class="guest-phase-closed">${escapeHtml(t('guest.questionClosed'))}</p>

    ${myStatusHtml}

    ${routeRoleLabelHtml()}

  `

}

/**
 * Renders the question text plus the first `revealedCount` options as disabled cards.
 * `revealedCount = 0` ⇒ no options yet (pure intro). Used for `question_intro` and
 * `question_reveal_answers` phases. No timer, no answering.
 */
function drawQuestionIntroOrReveal(
  container,
  participantLike,
  question,
  { revealedCount, myStatusHtml = '' },
) {
  const shown = formatParticipantDisplay(participantLike)

  const totalOptions = question.options.length
  const visibleCount = Math.max(
    0,
    Math.min(totalOptions, Math.floor(revealedCount ?? 0)),
  )

  const cards = question.options
    .map((label, i) => {
      const displayLabel = formatAnswerDisplayText(label)
      const shapeClass =
        GUEST_OPTION_SHAPE_CLASSES[i] ?? GUEST_OPTION_SHAPE_CLASSES[0]
      const visible = i < visibleCount
      const hiddenClass = visible ? '' : ' guest-option-card-hidden'
      const revealedClass = visible ? ' guest-option-card-revealed' : ''
      return `
      <button
        type="button"
        class="guest-option-card option-${i}${hiddenClass}${revealedClass}"
        data-option-index="${i}"
        disabled
        aria-hidden="${visible ? 'false' : 'true'}"
        aria-label="${escapeHtml(`${t('guest.answerAriaPrefix')} ${i + 1}: ${displayLabel}`)}"
      >
        <span class="guest-option-shape ${shapeClass}" aria-hidden="true"></span>
        <span class="guest-option-label">${escapeHtml(displayLabel)}</span>
      </button>
    `
    })
    .join('')

  container.innerHTML = `
    ${guestPageHeadingHtml(shown)}
    <p class="guest-question-text">${escapeHtml(question.text)}</p>
    <p class="guest-reveal-hint">${escapeHtml(t('guest.getReady'))}</p>
    <div class="guest-options guest-options-grid">${cards}</div>
    ${myStatusHtml}
    ${routeRoleLabelHtml()}
  `
}



function drawQuestionOpen(

  container,

  participantLike,

  question,

  {

    existingAnswer,

    submitting,

    remainingMs,

    myStatusHtml = '',

    optimisticOptionIndex,

  },

) {

  const shown = formatParticipantDisplay(participantLike)

  const bypassTimerForConfirmand =

    getCurrentRoleFromRoute() === PARTICIPANT_ROLE_CONFIRMAND

  const timeUp = !existingAnswer && remainingMs <= 0

  const locked =

    !!existingAnswer ||

    submitting ||

    (!bypassTimerForConfirmand && remainingMs <= 0)

  const countdownLine =

    !existingAnswer && remainingMs > 0

      ? `<p class="guest-countdown">${escapeHtml(t('guest.timeLeftPrefix'))} ${escapeHtml(formatCountdown(remainingMs))}</p>`

      : !existingAnswer && bypassTimerForConfirmand && remainingMs <= 0

        ? `<p class="guest-countdown">${escapeHtml(t('guest.timeLeftPrefix'))} ${escapeHtml(formatCountdown(remainingMs))}</p>`

        : ''

  const timeUpLine =

    timeUp ? `<p class="guest-time-up">${escapeHtml(t('guest.timeUp'))}</p>` : ''

  let selectedIndex = optionIndexFromSavedAnswer(question, existingAnswer)

  if (

    selectedIndex == null &&

    submitting &&

    typeof optimisticOptionIndex === 'number' &&

    !Number.isNaN(optimisticOptionIndex)

  ) {

    selectedIndex = optimisticOptionIndex

  }

  const cards = question.options

    .map((label, i) => {

      const displayLabel = formatAnswerDisplayText(label)

      const shapeClass =

        GUEST_OPTION_SHAPE_CLASSES[i] ?? GUEST_OPTION_SHAPE_CLASSES[0]

      const selected = selectedIndex === i

      const selectedClass = selected ? ' guest-option-selected' : ''

      return `

      <button

        type="button"

        class="guest-option-card option-${i}${selectedClass}"

        data-option-index="${i}"

        ${locked ? 'disabled' : ''}

        aria-label="${escapeHtml(`${t('guest.answerAriaPrefix')} ${i + 1}: ${displayLabel}`)}"

      >

        <span class="guest-option-shape ${shapeClass}" aria-hidden="true"></span>

        <span class="guest-option-label">${escapeHtml(displayLabel)}</span>

      </button>

    `

    })

    .join('')

  const registeredBlock =

    existingAnswer

      ? `<p class="guest-answer-registered">${escapeHtml(t('guest.answerRegistered'))}</p>`

      : ''

  container.innerHTML = `

    ${guestPageHeadingHtml(shown)}

    <p class="guest-question-text">${escapeHtml(question.text)}</p>

    ${registeredBlock}

    ${countdownLine}

    ${timeUpLine}

    <div class="guest-options guest-options-grid">${cards}</div>

    ${myStatusHtml}

    ${routeRoleLabelHtml()}

  `

}



function mountParticipantWaiting(container, userId, cfg) {

  syncParticipantRoleAndPresence(userId).catch(console.error)

  cacheParticipantRoleFromRoute()



  if (SPOTQUIZ_DEBUG_ROLE && typeof window !== 'undefined') {

    console.log('[SpotQuiz role] mountParticipantWaiting', {

      hash: window.location.hash,

      route: getCurrentRoute(),

      resolvedRole: getCurrentRoleFromRoute(),

    })

  }



  if (!db) {

    const s = cfg.getSession()

    drawWaiting(container, { displayName: s?.displayName ?? '' }, '')

    return

  }



  clearGuestOptionDelegation()



  const sess = cfg.getSession()

  let lastParticipant = sess ? { displayName: sess.displayName } : null

  let lastGame = null

  let scoresMap = {}

  let resultsMap = {}

  let participantsMap = {}

  let answersMap = {}



  if (cfg.showMyStatus) {

    guestStatsScoresUnsubscribe = subscribeScores((m) => {

      scoresMap = m ?? {}

      applyParticipantView()

    })

    guestStatsResultsUnsubscribe = subscribeAllResults((m) => {

      resultsMap = m ?? {}

      applyParticipantView()

    })

    guestStatsParticipantsUnsubscribe = subscribeParticipants((m) => {

      participantsMap = m ?? {}

      applyParticipantView()

    })

    guestStatsAnswersUnsubscribe = subscribeAllAnswers((m) => {

      answersMap = m ?? {}

      applyParticipantView()

    })

  }

  /** Clears local answer UI when `questionIndex` advances to a new question. */
  let prevOpenQuestionIndex = null

  let lastMyAnswer = null

  let answerSubmitting = false

  let guestOptimisticOptionIndex = null

  let lastGuestMyStatusStats = null



  function resubscribeMyAnswer() {

    if (guestAnswerUnsubscribe) {

      guestAnswerUnsubscribe()

      guestAnswerUnsubscribe = null

    }

    const phase = lastGame?.phase

    const idx = lastGame?.questionIndex

    const confirmandCanAnswerWhileClosed =

      getCurrentRoleFromRoute() === PARTICIPANT_ROLE_CONFIRMAND &&

      phase === 'question_closed' &&

      typeof idx === 'number'



    if (typeof idx === 'number' && phase === 'question_open') {

      if (prevOpenQuestionIndex !== idx) {

        prevOpenQuestionIndex = idx

        lastMyAnswer = null

        answerSubmitting = false

        guestOptimisticOptionIndex = null

      }

    } else {

      prevOpenQuestionIndex = null

      guestOptimisticOptionIndex = null

    }



    const canSubscribeMyAnswer =

      typeof idx === 'number' &&

      (phase === 'question_open' || confirmandCanAnswerWhileClosed)



    if (!canSubscribeMyAnswer) {

      applyParticipantView()

      return

    }



    guestAnswerUnsubscribe = subscribeUserAnswer(idx, userId, (data) => {

      lastMyAnswer = data

      if (data) {

        answerSubmitting = false

        guestOptimisticOptionIndex = null

      }

      applyParticipantView()

    })



    applyParticipantView()

  }



  function syncCountdownTimer() {

    const phase = lastGame?.phase

    const idx = lastGame?.questionIndex

    const openOk =

      phase === 'question_open' &&

      typeof idx === 'number' &&

      QUESTIONS[idx]



    if (!openOk) {

      clearGuestCountdown()

      return

    }



    if (guestCountdownIntervalId == null) {

      guestCountdownIntervalId = window.setInterval(() => {

        if (

          lastGame?.phase === 'question_open' &&

          typeof lastGame.closesAt === 'number' &&

          Date.now() >= lastGame.closesAt

        ) {

          maybeAutoCloseExpiredQuestion().catch(console.error)

        }

        applyParticipantView()

      }, 1000)

    }

  }



  function applyParticipantView() {

    const participantLike = lastParticipant ?? {}

    const phase = lastGame?.phase

    const idx = lastGame?.questionIndex

    let myStatusHtml = ''

    if (cfg.showMyStatus && phase === 'question_closed') {

      const stats = computeMyStats(

        userId,

        scoresMap,

        resultsMap,

        participantsMap,

        answersMap,

        lastGame,

      )

      const feedback = feedbackForCurrentQuestion(userId, idx, resultsMap)

      myStatusHtml =

        roundFeedbackHtml(feedback) +

        myStatusSectionHtml(stats, lastGuestMyStatusStats)

      lastGuestMyStatusStats = {

        totalPoints: stats.totalPoints,

        correctCount: stats.correctCount,

        rank: stats.rank,

        avgSeconds: stats.avgSeconds,

      }

    } else {

      lastGuestMyStatusStats = null

    }



    if (phase === 'waiting') {

      drawWaiting(container, participantLike, myStatusHtml)

      syncCountdownTimer()

      return

    }



    if (phase === 'intro') {

      drawIntroSoon(container, participantLike, myStatusHtml)

      syncCountdownTimer()

      return

    }



    if (

      typeof idx === 'number' &&

      idx >= 0 &&

      idx < QUESTIONS.length &&

      (phase === 'question_intro' || phase === 'question_reveal_answers')

    ) {

      const introQ = QUESTIONS[idx]

      if (introQ) {

        const revealedCount =

          phase === 'question_intro' ? 0 : (lastGame?.revealedCount ?? 0)

        drawQuestionIntroOrReveal(container, participantLike, introQ, {

          revealedCount,

          myStatusHtml,

        })

        syncCountdownTimer()

        return

      }

    }



    if (

      typeof idx === 'number' &&

      idx >= 0 &&

      idx < QUESTIONS.length &&

      phase === 'question_closed'

    ) {

      const closedQ = QUESTIONS[idx]

      if (closedQ) {

        const keepOpenUiForLateConfirmand =

          getCurrentRoleFromRoute() === PARTICIPANT_ROLE_CONFIRMAND &&

          !lastMyAnswer &&

          !answerSubmitting



        if (keepOpenUiForLateConfirmand) {

          const remainingMs = remainingMsFromClosesAt(lastGame?.closesAt)

          drawQuestionOpen(container, participantLike, closedQ, {

            existingAnswer: lastMyAnswer,

            submitting: answerSubmitting,

            remainingMs,

            myStatusHtml,

            optimisticOptionIndex: guestOptimisticOptionIndex,

          })

          syncCountdownTimer()

          return

        }



        drawQuestionClosed(container, participantLike, closedQ, myStatusHtml)

        syncCountdownTimer()

        return

      }

    }



    if (

      typeof idx === 'number' &&

      idx >= 0 &&

      idx < QUESTIONS.length &&

      phase === 'question_open'

    ) {

      const openQ = QUESTIONS[idx]

      if (openQ) {

        const remainingMs = remainingMsFromClosesAt(lastGame?.closesAt)

        drawQuestionOpen(container, participantLike, openQ, {

          existingAnswer: lastMyAnswer,

          submitting: answerSubmitting,

          remainingMs,

          myStatusHtml,

          optimisticOptionIndex: guestOptimisticOptionIndex,

        })

        syncCountdownTimer()

        return

      }

    }



    drawWaiting(container, participantLike, myStatusHtml)

    syncCountdownTimer()

  }



  async function onParticipantOptionClick(e) {

    const btn = e.target.closest('.guest-option-card')

    if (!(btn instanceof HTMLButtonElement)) return

    if (btn.disabled) return



    const optionIndex = Number.parseInt(btn.dataset.optionIndex ?? '', 10)

    if (Number.isNaN(optionIndex)) return



    if (lastMyAnswer || answerSubmitting) return



    const phase = lastGame?.phase

    const qIdx = lastGame?.questionIndex

    const canAnswerThisQuestion =

      phase === 'question_open' ||

      (getCurrentRoleFromRoute() === PARTICIPANT_ROLE_CONFIRMAND &&

        phase === 'question_closed')



    if (!canAnswerThisQuestion || typeof qIdx !== 'number') return



    const bypassTimerForConfirmand =

      getCurrentRoleFromRoute() === PARTICIPANT_ROLE_CONFIRMAND

    if (

      !bypassTimerForConfirmand &&

      remainingMsFromClosesAt(lastGame?.closesAt) <= 0

    )

      return



    const q = QUESTIONS[qIdx]

    if (!q) return



    const label = q.options[optionIndex]

    if (label === undefined) return



    guestOptimisticOptionIndex = optionIndex

    answerSubmitting = true

    applyParticipantView()



    try {

      const role = getCurrentRoleFromRoute()

      if (SPOTQUIZ_DEBUG_ROLE) {
        console.log('[SpotQuiz role] saveNewAnswer', {
          hash: typeof window !== 'undefined' ? window.location.hash : '',
          resolvedRole: role,
          savedParticipantRole: lastParticipant?.role ?? null,
        })
      }

      await saveNewAnswer(qIdx, userId, {

        userId,

        role,

        displayName: formatParticipantDisplay(lastParticipant ?? {}),

        answer: label,

        submittedAt: Date.now(),

      })

    } catch (err) {

      console.error(err)

      answerSubmitting = false

      guestOptimisticOptionIndex = null

      applyParticipantView()

    }

  }



  guestOptionDelegationTarget = container

  guestOptionDelegationHandler = onParticipantOptionClick

  container.addEventListener('click', onParticipantOptionClick)



  guestRealtimeUnsubscribe = subscribeParticipant(userId, (data) => {

    const raw = rawParticipantDisplay(data ?? {})

    cfg.saveSession(userId, raw)

    lastParticipant = data ?? {}

    applyParticipantView()

  })



  guestGameUnsubscribe = subscribeGame((game) => {

    lastGame = game

    if (

      game?.phase === 'question_open' &&

      typeof game.closesAt === 'number' &&

      Date.now() >= game.closesAt

    ) {

      maybeAutoCloseExpiredQuestion().catch(console.error)

    }

    resubscribeMyAnswer()

  })

}


