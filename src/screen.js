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

/** Call when leaving /screen so listeners stop. */
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

/** This round: time from question start to submit (for scoreboard column). */
function averageAnswerTimeForRound(questionResult, userId) {
  const scored = questionResult && questionResult.scored === true
  if (!scored) return t('common.emDash')
  const startedAt = questionResult.startedAt
  const submittedAt = questionResult.scores?.[userId]?.submittedAt
  if (typeof startedAt !== 'number' || typeof submittedAt !== 'number') {
    return t('common.emDash')
  }
  const sec = (submittedAt - startedAt) / 1000
  if (!Number.isFinite(sec) || sec < 0) return t('common.emDash')
  return `${sec.toFixed(1)}${t('common.secondsUnit')}`
}

function scoreboardRowsHtml(participantsMap, scoresMap, questionResult) {
  const guests = sortParticipantsByDisplayName(participantsMap).filter(
    ([, p]) => p && p.role === PARTICIPANT_ROLE_GUEST,
  )
  if (guests.length === 0) {
    return `<p class="screen-muted">${escapeHtml(t('screen.noGuests'))}</p>`
  }
  const scored = questionResult && questionResult.scored === true
  const em = t('common.emDash')
  const rows = guests
    .map(([userId, p]) => {
      const raw = scoresMap?.[userId]
      const total = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
      const s = questionResult?.scores?.[userId]
      let roundPts = em
      let avgAnswerStr = em
      if (scored) {
        if (s && typeof s.totalPoints === 'number') {
          roundPts = String(s.totalPoints)
        } else {
          roundPts = '0'
        }
        avgAnswerStr = averageAnswerTimeForRound(questionResult, userId)
      }
      return { name: formatParticipantDisplay(p), total, roundPts, avgAnswerStr }
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    .map(
      ({ name, total, roundPts, avgAnswerStr }) =>
        `<tr><td class="screen-score-name">${escapeHtml(name)}</td><td class="screen-score-round">${escapeHtml(roundPts)}</td><td class="screen-score-avgtime">${escapeHtml(avgAnswerStr)}</td><td class="screen-score-total">${total}</td></tr>`,
    )
  return `
    <table class="screen-scoreboard">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('screen.colPlayer'))}</th>
          <th scope="col">${escapeHtml(t('screen.colRound'))}</th>
          <th scope="col">${escapeHtml(t('screen.colAvgAnswer'))}</th>
          <th scope="col">${escapeHtml(t('screen.colTotal'))}</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>`
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

export function renderScreen(container) {
  disposeScreenSubscriptions()

  let gameState = null
  let answersForQuestion = {}
  let scoresMap = {}
  let participantsMap = {}
  let questionResult = null

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
      container.innerHTML = `
        <div class="screen-empty">
          <h1 class="screen-headline">${escapeHtml(t('screen.headline'))}</h1>
          <p>${t('common.firebaseConnectShort')}</p>
        </div>`
      return
    }

    if (!gameState) {
      container.innerHTML = `
        <div class="screen-empty">
          <h1 class="screen-headline">${escapeHtml(t('screen.headline'))}</h1>
          <p class="screen-progress">${questionProgressHtml('waiting', 0)}</p>
          <p class="screen-lede">${escapeHtml(t('screen.waitingGameState'))}</p>
        </div>`
      return
    }

    const phase = gameState.phase ?? '—'
    const idx = gameState.questionIndex
    const q =
      typeof idx === 'number' && idx >= 0 && idx < QUESTIONS.length
        ? QUESTIONS[idx]
        : undefined

    if (phase === 'question_open' && q) {
      const answered =
        typeof idx === 'number' ? Object.keys(answersForQuestion).length : 0
      const questionBlock = `<p class="screen-question">${escapeHtml(q.text)}</p>`
      container.innerHTML = `
      <div class="screen-layout">
        <p class="screen-progress">${questionProgressHtml(phase, idx)}</p>
        ${questionBlock}
        <p class="screen-count">${answered} ${escapeHtml(t('screen.answered'))}</p>
      </div>`
      return
    }

    if (phase === 'question_closed' && q) {
      const scored = questionResult && questionResult.scored === true
      const confirmandAns = confirmandAnswerFromMap(answersForQuestion)
      let correctLine
      if (scored) {
        correctLine = `<p class="screen-correct"><span class="screen-label">${escapeHtml(t('screen.correctAnswer'))}</span> ${escapeHtml(String(questionResult.correctAnswer))}</p>`
      } else if (confirmandAns != null) {
        correctLine = `<p class="screen-correct"><span class="screen-label">${escapeHtml(t('screen.correctAnswer'))}</span> ${escapeHtml(String(confirmandAns))}</p><p class="screen-muted">${escapeHtml(t('screen.applyingScores'))}</p>`
      } else {
        correctLine = `<p class="screen-correct screen-warn">${escapeHtml(t('screen.noConfirmandScores'))}</p>`
      }
      const board = scoreboardRowsHtml(participantsMap, scoresMap, questionResult)
      const questionRecall = `<p class="screen-question screen-question-recap">${escapeHtml(q.text)}</p>`
      container.innerHTML = `
      <div class="screen-layout screen-layout-results">
        <p class="screen-progress">${questionProgressHtml(phase, idx)}</p>
        ${questionRecall}
        ${correctLine}
        <div class="screen-scoreboard-wrap">
          <h2 class="screen-scoreboard-title">${escapeHtml(t('screen.scoreboard'))}</h2>
          ${board}
        </div>
      </div>`
      return
    }

    container.innerHTML = `
      <div class="screen-layout">
        <p class="screen-progress">${questionProgressHtml(phase, idx)}</p>
        <p class="screen-question screen-muted">${escapeHtml(t('screen.waitingNextQuestion'))}</p>
      </div>`
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
  }, 1000)
}
