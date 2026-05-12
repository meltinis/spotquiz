import { db } from './firebase.js'
import { subscribeGame } from './game.js'
import { subscribeAnswersForQuestion } from './answers.js'
import { QUESTIONS, QUESTION_COUNT } from './questions.js'

let screenGameUnsubscribe = null
let screenAnswersUnsubscribe = null

/** Call when leaving /screen so listeners stop. */
export function disposeScreenSubscriptions() {
  if (screenGameUnsubscribe) {
    screenGameUnsubscribe()
    screenGameUnsubscribe = null
  }
  if (screenAnswersUnsubscribe) {
    screenAnswersUnsubscribe()
    screenAnswersUnsubscribe = null
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function questionProgressHtml(phase, idx) {
  if (phase === 'waiting') {
    return `Question <strong>—</strong> / <strong>${QUESTION_COUNT}</strong>`
  }
  if (typeof idx !== 'number' || idx < 0 || idx >= QUESTIONS.length) {
    return `Question <strong>—</strong> / <strong>${QUESTION_COUNT}</strong>`
  }
  return `Question <strong>${idx + 1}</strong> / <strong>${QUESTION_COUNT}</strong>`
}

export function renderScreen(container) {
  disposeScreenSubscriptions()

  let gameState = null
  let answersForQuestion = {}

  function resubscribeAnswers() {
    if (screenAnswersUnsubscribe) {
      screenAnswersUnsubscribe()
      screenAnswersUnsubscribe = null
    }
    answersForQuestion = {}
    const idx = gameState?.questionIndex
    const phase = gameState?.phase
    if (
      !db ||
      typeof idx !== 'number' ||
      (phase !== 'question_open' && phase !== 'question_closed')
    ) {
      return
    }
    screenAnswersUnsubscribe = subscribeAnswersForQuestion(idx, (map) => {
      answersForQuestion = map ?? {}
      draw()
    })
  }

  function draw() {
    if (!db) {
      container.innerHTML = `
        <div class="screen-empty">
          <h1 class="screen-headline">Screen</h1>
          <p>Connect Firebase (<code>VITE_FIREBASE_DATABASE_URL</code>) to show the quiz.</p>
        </div>`
      return
    }

    if (!gameState) {
      container.innerHTML = `
        <div class="screen-empty">
          <h1 class="screen-headline">Screen</h1>
          <p class="screen-progress">${questionProgressHtml('waiting', 0)}</p>
          <p class="screen-lede">Waiting for game state…</p>
        </div>`
      return
    }

    const phase = gameState.phase ?? '—'
    const idx = gameState.questionIndex
    const q =
      typeof idx === 'number' && idx >= 0 && idx < QUESTIONS.length
        ? QUESTIONS[idx]
        : undefined
    const answered =
      typeof idx === 'number' ? Object.keys(answersForQuestion).length : 0

    const questionBlock =
      q?.text != null
        ? `<p class="screen-question">${escapeHtml(q.text)}</p>`
        : '<p class="screen-question screen-muted">No question</p>'

    container.innerHTML = `
      <div class="screen-layout">
        <p class="screen-progress">${questionProgressHtml(phase, idx)}</p>
        <p class="screen-phase"><span class="screen-label">Phase</span> ${escapeHtml(String(phase))}</p>
        ${questionBlock}
        <p class="screen-count">${answered} answered</p>
      </div>`
  }

  if (!db) {
    draw()
    return
  }

  screenGameUnsubscribe = subscribeGame((next) => {
    gameState = next
    resubscribeAnswers()
    draw()
  })
}
