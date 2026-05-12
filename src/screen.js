import { db } from './firebase.js'
import { t } from './i18n.js'
import { subscribeGame, maybeAutoCloseExpiredQuestion, closeQuestion } from './game.js'
import { subscribeAnswersForQuestion } from './answers.js'
import {
  subscribeScores,
  subscribeQuestionResult,
} from './results.js'
import {
  formatParticipantDisplay,
  sortParticipantsByDisplayName,
  subscribeParticipants,
} from './adminParticipants.js'
import { PARTICIPANT_ROLE_GUEST, PARTICIPANT_ROLE_CONFIRMAND } from './routeRole.js'
import { QUESTIONS, QUESTION_COUNT } from './questions.js'
import { formatAnswerDisplayText } from './questionDisplay.js'

let screenGameUnsubscribe = null
let screenAnswersUnsubscribe = null
let screenScoresUnsubscribe = null
let screenParticipantsUnsubscribe = null
let screenResultUnsubscribe = null
let screenTimerTickId = null

function clearScreenTimerTick() {
  if (screenTimerTickId != null) {
    clearInterval(screenTimerTickId)
    screenTimerTickId = null
  }
}

/** Call when leaving #/screen so listeners stop. */
export function disposeScreenSubscriptions() {
  clearScreenTimerTick()
  if (screenGameUnsubscribe) {
    screenGameUnsubscribe()
    screenGameUnsubscribe = null
  }
  if (screenAnswersUnsubscribe) {
    screenAnswersUnsubscribe()
    screenAnswersUnsubscribe = null
  }
  if (screenScoresUnsubscribe) {
    screenScoresUnsubscribe()
    screenScoresUnsubscribe = null
  }
  if (screenParticipantsUnsubscribe) {
    screenParticipantsUnsubscribe()
    screenParticipantsUnsubscribe = null
  }
  if (screenResultUnsubscribe) {
    screenResultUnsubscribe()
    screenResultUnsubscribe = null
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/** First confirmand answer string on this question, if any. */
function confirmandAnswerFromMap(answersMap) {
  for (const ans of Object.values(answersMap || {})) {
    if (
      ans &&
      ans.role === PARTICIPANT_ROLE_CONFIRMAND &&
      typeof ans.answer === 'string'
    ) {
      return ans.answer
    }
  }
  return null
}

function cumulativePointsForUser(scoresMap, userId) {
  const v = scoresMap?.[userId]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v.totalPoints === 'number' && Number.isFinite(v.totalPoints)) {
    return v.totalPoints
  }
  return 0
}

function countGuestParticipants(participantsMap) {
  let n = 0
  for (const p of Object.values(participantsMap || {})) {
    if (p && p.role === PARTICIPANT_ROLE_GUEST) n++
  }
  return n
}

function roundCorrectGuestCount(questionResult) {
  if (!questionResult?.scores) return 0
  let n = 0
  for (const row of Object.values(questionResult.scores)) {
    if (row && row.correct === true) n++
  }
  return n
}

/** Mean time-to-answer (seconds) for this round across guests with a submitted time. */
function roundAverageAnswerSeconds(questionResult) {
  if (!questionResult?.scored || typeof questionResult.startedAt !== 'number') {
    return null
  }
  const started = questionResult.startedAt
  const deltas = []
  for (const row of Object.values(questionResult.scores || {})) {
    if (!row || typeof row.submittedAt !== 'number') continue
    const d = row.submittedAt - started
    if (Number.isFinite(d) && d >= 0) deltas.push(d)
  }
  if (deltas.length === 0) return null
  const avgMs = deltas.reduce((a, b) => a + b, 0) / deltas.length
  return avgMs / 1000
}

/** Shape icon class per option index (0–3) — matches guest page. */
const SCREEN_OPTION_SHAPE_CLASSES = [
  'guest-option-shape-triangle',
  'guest-option-shape-diamond',
  'guest-option-shape-circle',
  'guest-option-shape-square',
]

/**
 * Progressive reveal (intro / reveal phases). Options past `revealedCount` stay hidden.
 */
function screenOptionsHtml(question, revealedCount, animateReveal) {
  const total = question.options.length
  const visibleCount = Math.max(
    0,
    Math.min(total, Math.floor(revealedCount ?? 0)),
  )
  const cards = question.options
    .map((label, i) => {
      const displayLabel = formatAnswerDisplayText(label)
      const shapeClass =
        SCREEN_OPTION_SHAPE_CLASSES[i] ?? SCREEN_OPTION_SHAPE_CLASSES[0]
      const visible = i < visibleCount
      const hiddenClass = visible ? '' : ' screen-option-card-hidden'
      const revealedClass =
        visible && animateReveal ? ' screen-option-card-revealed' : ''
      return `
        <div
          class="screen-option-card option-${i}${hiddenClass}${revealedClass}"
          aria-hidden="${visible ? 'false' : 'true'}"
        >
          <span class="guest-option-shape ${shapeClass}" aria-hidden="true"></span>
          <span class="screen-option-label">${escapeHtml(displayLabel)}</span>
        </div>`
    })
    .join('')
  return `<div class="screen-options-grid">${cards}</div>`
}

/** Result phase: large centered correct card when known; dimmed row of incorrect (same colors/shapes as guest). */
function screenResultOptionsHtml(question, correctRaw, showOutcome) {
  const correctIdx =
    correctRaw != null && typeof correctRaw === 'string'
      ? question.options.findIndex((o) => o === correctRaw)
      : -1
  const cardHtml = (i, outcomeClass) => {
    const label = question.options[i]
    const displayLabel = formatAnswerDisplayText(label)
    const shapeClass =
      SCREEN_OPTION_SHAPE_CLASSES[i] ?? SCREEN_OPTION_SHAPE_CLASSES[0]
    return `
        <div class="screen-option-card option-${i} screen-option-card--static${outcomeClass}">
          <span class="guest-option-shape ${shapeClass}" aria-hidden="true"></span>
          <span class="screen-option-label">${escapeHtml(displayLabel)}</span>
        </div>`
  }
  if (showOutcome && correctIdx >= 0) {
    const hero = cardHtml(correctIdx, ' screen-option-card--result-correct')
    const rest = question.options
      .map((_, i) =>
        i === correctIdx ? '' : cardHtml(i, ' screen-option-card--result-wrong'),
      )
      .join('')
    return `<div class="screen-result-hero">${hero}</div><div class="screen-result-rest">${rest}</div>`
  }
  return question.options
    .map((_, i) => cardHtml(i, ''))
    .join('')
}

function topFiveBoardHtml(participantsMap, scoresMap, prevTop5Order) {
  const guests = sortParticipantsByDisplayName(participantsMap).filter(
    ([, p]) => p && p.role === PARTICIPANT_ROLE_GUEST,
  )
  if (guests.length === 0) {
    return {
      html: `<p class="screen-muted screen-top5-empty">${escapeHtml(t('screen.noGuests'))}</p>`,
      order: [],
    }
  }
  const rows = guests.map(([userId, p]) => ({
    userId,
    name: formatParticipantDisplay(p),
    pts: cumulativePointsForUser(scoresMap, userId),
  }))
  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    return a.userId.localeCompare(b.userId)
  })
  const top = rows.slice(0, 5)
  const newOrder = top.map((r) => r.userId)
  const prev = prevTop5Order || []
  const items = top.map((r, i) => {
    const rank = i + 1
    let moveClass = ' screen-top5-row--same'
    if (prev.length > 0) {
      const prevPos = prev.indexOf(r.userId)
      if (prevPos < 0) moveClass = ' screen-top5-row--new'
      else if (prevPos > i) moveClass = ' screen-top5-row--up'
      else if (prevPos < i) moveClass = ' screen-top5-row--down'
      else moveClass = ' screen-top5-row--same'
    }
    return `
      <div class="screen-top5-row${moveClass}">
        <span class="screen-top5-rank">${rank}</span>
        <span class="screen-top5-name">${escapeHtml(r.name)}</span>
        <span class="screen-top5-pts">${escapeHtml(String(r.pts))}</span>
      </div>`
  })
  return {
    html: `
      <div class="screen-top5">
        <h3 class="screen-top5-heading">${escapeHtml(t('screen.top5Heading'))}</h3>
        <div class="screen-top5-head">
          <span>${escapeHtml(t('screen.top5ColRank'))}</span>
          <span>${escapeHtml(t('screen.top5ColName'))}</span>
          <span>${escapeHtml(t('screen.top5ColPoints'))}</span>
        </div>
        <div class="screen-top5-body">${items.join('')}</div>
      </div>`,
    order: newOrder,
  }
}

function remainingMsFromClosesAt(closesAt) {
  if (typeof closesAt !== 'number') return 0
  return Math.max(0, closesAt - Date.now())
}

function formatScreenCountdown(remainingMs) {
  const s = Math.max(0, Math.ceil(remainingMs / 1000))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function questionProgressHtml(phase, idx) {
  const qWord = escapeHtml(t('common.questionNoun'))
  if (phase === 'waiting') {
    return `${qWord} <strong>—</strong> / <strong>${QUESTION_COUNT}</strong>`
  }
  if (typeof idx !== 'number' || idx < 0 || idx >= QUESTIONS.length) {
    return `${qWord} <strong>—</strong> / <strong>${QUESTION_COUNT}</strong>`
  }
  return `${qWord} <strong>${idx + 1}</strong> / <strong>${QUESTION_COUNT}</strong>`
}

function paintScreen(container, html, transitionKey, lastKeyRef) {
  const useVt =
    transitionKey != null &&
    transitionKey !== lastKeyRef.current &&
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function'
  lastKeyRef.current = transitionKey
  if (useVt) {
    document.startViewTransition(() => {
      container.innerHTML = html
    })
  } else {
    container.innerHTML = html
  }
}

export function renderScreen(container) {
  disposeScreenSubscriptions()

  let gameState = null
  let answersForQuestion = {}
  let scoresMap = {}
  let participantsMap = {}
  let questionResult = null
  let lastTransitionKey = { current: null }
  let lastTop5Order = []

  function resubscribeAnswers() {
    if (screenAnswersUnsubscribe) {
      screenAnswersUnsubscribe()
      screenAnswersUnsubscribe = null
    }
    answersForQuestion = {}
    const idx = gameState?.questionIndex
    const phase = gameState?.phase
    const listenForAnswers =
      typeof idx === 'number' &&
      (phase === 'question_open' || phase === 'question_closed')
    if (!db || !listenForAnswers) {
      return
    }
    screenAnswersUnsubscribe = subscribeAnswersForQuestion(idx, (map) => {
      answersForQuestion = map ?? {}
      const phaseNow = gameState?.phase
      const idxNow = gameState?.questionIndex
      if (
        phaseNow === 'question_closed' &&
        typeof idxNow === 'number' &&
        idxNow === idx &&
        confirmandAnswerFromMap(answersForQuestion) != null &&
        !(questionResult && questionResult.scored === true)
      ) {
        closeQuestion().catch(console.error)
      }
      draw()
    })
  }

  function resubscribeQuestionResult() {
    if (screenResultUnsubscribe) {
      screenResultUnsubscribe()
      screenResultUnsubscribe = null
    }
    questionResult = null
    const idx = gameState?.questionIndex
    const phase = gameState?.phase
    if (!db || typeof idx !== 'number' || phase !== 'question_closed') {
      return
    }
    screenResultUnsubscribe = subscribeQuestionResult(idx, (data) => {
      questionResult = data
      draw()
    })
  }

  function draw() {
    if (!db) {
      lastTransitionKey.current = null
      container.innerHTML = `
        <div class="screen-empty">
          <h1 class="screen-headline">${escapeHtml(t('screen.headline'))}</h1>
          <p>${t('common.firebaseConnectShort')}</p>
        </div>`
      return
    }

    if (!gameState) {
      paintScreen(
        container,
        `
        <div class="screen-empty">
          <h1 class="screen-headline">${escapeHtml(t('screen.headline'))}</h1>
          <p class="screen-progress">${questionProgressHtml('waiting', 0)}</p>
          <p class="screen-lede">${escapeHtml(t('screen.waitingGameState'))}</p>
        </div>`,
        'empty',
        lastTransitionKey,
      )
      return
    }

    const phase = gameState.phase ?? '—'
    const idx = gameState.questionIndex
    const q =
      typeof idx === 'number' && idx >= 0 && idx < QUESTIONS.length
        ? QUESTIONS[idx]
        : undefined

    const transitionKey = `${phase}:${typeof idx === 'number' ? idx : 'x'}`

    if (
      (phase === 'question_intro' || phase === 'question_reveal_answers') &&
      q
    ) {
      const revealedCount =
        phase === 'question_intro' ? 0 : (gameState.revealedCount ?? 0)

      const revealRoot = container.querySelector(
        '.screen-show--intro[data-reveal-q-idx]',
      )
      if (
        revealRoot &&
        revealRoot.getAttribute('data-reveal-q-idx') === String(idx) &&
        revealRoot.getAttribute('data-screen-phase') === phase
      ) {
        const oldGrid = revealRoot.querySelector('.screen-options-grid')
        if (oldGrid) {
          const wrap = document.createElement('div')
          wrap.innerHTML = screenOptionsHtml(q, revealedCount, true)
          const newGrid = wrap.firstElementChild
          if (newGrid) {
            oldGrid.replaceWith(newGrid)
            return
          }
        }
      }

      const html = `
      <div class="screen-show screen-show--intro" data-screen-phase="${escapeHtml(String(phase))}" data-reveal-q-idx="${idx}">
        <div class="screen-pill">${questionProgressHtml(phase, idx)}</div>
        <h2 class="screen-question screen-question--hero">${escapeHtml(q.text)}</h2>
        ${screenOptionsHtml(q, revealedCount, true)}
      </div>`
      paintScreen(container, html, transitionKey, lastTransitionKey)
      return
    }

    if (phase === 'question_open' && q) {
      const answered =
        typeof idx === 'number' ? Object.keys(answersForQuestion).length : 0
      const guestTotal = countGuestParticipants(participantsMap)
      const remainingMs = remainingMsFromClosesAt(gameState.closesAt)
      const digits = escapeHtml(formatScreenCountdown(remainingMs))
      const totalOptions = q.options.length

      const openRoot = container.querySelector('.screen-show--open[data-open-idx]')
      if (openRoot && openRoot.getAttribute('data-open-idx') === String(idx)) {
        const timerBlock = openRoot.querySelector('.screen-timer-block')
        const digitsEl = timerBlock?.querySelector('.screen-timer-digits')
        const progress = openRoot.querySelector('.screen-answer-progress')
        const nums = progress?.querySelectorAll('.screen-answer-progress-num')
        if (digitsEl && nums && nums.length >= 2) {
          digitsEl.textContent = formatScreenCountdown(remainingMs)
          nums[0].textContent = String(answered)
          nums[1].textContent = String(guestTotal)
          openRoot.setAttribute('data-live-answered', String(answered))
          openRoot.setAttribute('data-live-guest-total', String(guestTotal))
          return
        }
      }

      const html = `
      <div class="screen-show screen-show--open" data-screen-phase="question_open" data-open-idx="${idx}" data-live-answered="${answered}" data-live-guest-total="${guestTotal}">
        <div class="screen-pill">${questionProgressHtml(phase, idx)}</div>
        <h2 class="screen-question screen-question--hero">${escapeHtml(q.text)}</h2>
        ${screenOptionsHtml(q, totalOptions, false)}
        <div class="screen-timer-block">
          <div class="screen-timer-digits">${digits}</div>
          <div class="screen-timer-caption">${escapeHtml(t('screen.timerCaption'))}</div>
        </div>
        <div class="screen-answer-progress">
          <span class="screen-answer-progress-num">${answered}</span>
          <span class="screen-answer-progress-sep">/</span>
          <span class="screen-answer-progress-num">${guestTotal}</span>
          <span class="screen-answer-progress-suffix">${escapeHtml(t('screen.answerProgressSuffix'))}</span>
        </div>
      </div>`
      paintScreen(container, html, transitionKey, lastTransitionKey)
      return
    }

    if (phase === 'question_closed' && q) {
      const scored = questionResult && questionResult.scored === true
      const confirmandAns = confirmandAnswerFromMap(answersForQuestion)
      const correctRaw = scored
        ? questionResult.correctAnswer
        : confirmandAns != null
          ? confirmandAns
          : null
      const showOutcome = scored || confirmandAns != null

      let bannerHtml = ''
      if (!scored && confirmandAns == null) {
        bannerHtml = `<p class="screen-result-banner screen-result-banner--warn">${escapeHtml(t('screen.noConfirmandScores'))}</p>`
      } else if (!scored && confirmandAns != null) {
        bannerHtml = `<p class="screen-result-banner">${escapeHtml(t('screen.applyingScores'))}</p>`
      }

      const correctCount = scored ? roundCorrectGuestCount(questionResult) : null
      const avgSec = scored ? roundAverageAnswerSeconds(questionResult) : null
      let statsHtml = ''
      if (scored) {
        const avgLine =
          avgSec != null && Number.isFinite(avgSec)
            ? `<div class="screen-round-stat"><span class="screen-round-stat-label">${escapeHtml(t('screen.roundAvgSpeed'))}</span> <span class="screen-round-stat-value">${escapeHtml(`${avgSec.toFixed(1)}${t('common.secondsUnit')}`)}</span></div>`
            : ''
        statsHtml = `
        <div class="screen-round-stats">
          <div class="screen-round-stat">
            <span class="screen-round-stat-label">${escapeHtml(t('screen.roundCorrectGuests'))}</span>
            <span class="screen-round-stat-value">${correctCount}</span>
          </div>
          ${avgLine}
        </div>`
      }

      const top = topFiveBoardHtml(participantsMap, scoresMap, lastTop5Order)
      lastTop5Order = top.order

      const html = `
      <div class="screen-show screen-show--closed" data-screen-phase="question_closed">
        <div class="screen-pill">${questionProgressHtml(phase, idx)}</div>
        <h2 class="screen-question screen-question--hero screen-question--recap">${escapeHtml(q.text)}</h2>
        <p class="screen-result-label">${escapeHtml(t('screen.correctAnswer'))}</p>
        <div class="screen-result-grid">
          ${screenResultOptionsHtml(q, correctRaw, showOutcome)}
        </div>
        ${bannerHtml}
        ${statsHtml}
        ${top.html}
      </div>`
      paintScreen(container, html, transitionKey, lastTransitionKey)
      return
    }

    paintScreen(
      container,
      `
      <div class="screen-show screen-show--idle">
        <div class="screen-pill">${questionProgressHtml(phase, idx)}</div>
        <p class="screen-question screen-muted screen-question--idle">${escapeHtml(t('screen.waitingNextQuestion'))}</p>
      </div>`,
      transitionKey,
      lastTransitionKey,
    )
  }

  if (!db) {
    draw()
    return
  }

  screenScoresUnsubscribe = subscribeScores((map) => {
    scoresMap = map ?? {}
    draw()
  })

  screenParticipantsUnsubscribe = subscribeParticipants((map) => {
    participantsMap = map ?? {}
    draw()
  })

  screenGameUnsubscribe = subscribeGame((next) => {
    gameState = next
    if (
      next?.phase === 'question_open' &&
      typeof next.closesAt === 'number' &&
      Date.now() >= next.closesAt
    ) {
      maybeAutoCloseExpiredQuestion().catch(console.error)
    }
    resubscribeAnswers()
    resubscribeQuestionResult()
    draw()
  })

  clearScreenTimerTick()
  screenTimerTickId = window.setInterval(() => {
    if (
      gameState?.phase === 'question_open' &&
      typeof gameState.closesAt === 'number' &&
      Date.now() >= gameState.closesAt
    ) {
      maybeAutoCloseExpiredQuestion().catch(console.error)
    }
    if (gameState?.phase === 'question_open') {
      draw()
    }
  }, 1000)
}
