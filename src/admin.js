import { db } from './firebase.js'
import { startQuestion, subscribeGame } from './game.js'
import { subscribeAnswersForQuestion } from './answers.js'
import { QUESTIONS } from './questions.js'
import {
  rawParticipantDisplay,
  formatParticipantDisplay,
  sortParticipantsByDisplayName,
  subscribeParticipants,
  updateParticipantDisplayName,
} from './adminParticipants.js'

let participantUnsubscribe = null
let gameUnsubscribe = null
let answersUnsubscribe = null

/** Call when leaving /admin so the realtime listener stops. */
export function disposeAdminSubscriptions() {
  if (participantUnsubscribe) {
    participantUnsubscribe()
    participantUnsubscribe = null
  }
  if (gameUnsubscribe) {
    gameUnsubscribe()
    gameUnsubscribe = null
  }
  if (answersUnsubscribe) {
    answersUnsubscribe()
    answersUnsubscribe = null
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

export function renderAdmin(container) {
  disposeAdminSubscriptions()

  let participantsMap = {}
  let gameState = null
  let answersForQuestion = {}
  let editingUserId = null
  let bannerText = ''

  container.innerHTML = `
    <h1>Admin</h1>
    <p>Set up rounds, prompts, and see who confirmed in real time.</p>
    <p>
      <button type="button" class="admin-btn" id="admin-start-question">
        Start Question
      </button>
    </p>
    <p class="admin-banner" id="admin-banner" hidden></p>
    <div id="admin-game-status" class="admin-game-status"></div>
    <div id="admin-participants"></div>
  `

  const bannerEl = container.querySelector('#admin-banner')
  const gameStatusMount = container.querySelector('#admin-game-status')
  const listMount = container.querySelector('#admin-participants')
  const startQuestionBtn = container.querySelector('#admin-start-question')

  function resubscribeAnswersForCurrentQuestion() {
    if (answersUnsubscribe) {
      answersUnsubscribe()
      answersUnsubscribe = null
    }
    answersForQuestion = {}
    const phase = gameState?.phase
    const qIdx = gameState?.questionIndex
    if (!db || typeof qIdx !== 'number' || phase !== 'question_open') {
      return
    }
    answersUnsubscribe = subscribeAnswersForQuestion(qIdx, (map) => {
      answersForQuestion = map ?? {}
      draw()
    })
  }

  function gameStatusHtml() {
    if (!gameState) {
      return `
        <div class="admin-game-panel">
          <h2 class="admin-game-heading">Game status</h2>
          <p class="admin-game-muted">No active game yet. Use <strong>Start Question</strong> when ready.</p>
        </div>`
    }

    const idx = gameState.questionIndex
    const phase = gameState.phase ?? '—'
    const q = typeof idx === 'number' ? QUESTIONS[idx] : undefined
    const questionText =
      q?.text != null ? escapeHtml(q.text) : `<span class="admin-game-muted">—</span>`
    const startedAt =
      typeof gameState.startedAt === 'number'
        ? escapeHtml(new Date(gameState.startedAt).toLocaleString())
        : '—'
    const closesAt =
      typeof gameState.closesAt === 'number'
        ? escapeHtml(new Date(gameState.closesAt).toLocaleString())
        : '—'
    const participantsCount = Object.keys(participantsMap).length
    const answeredCount =
      phase === 'question_open' && typeof idx === 'number'
        ? Object.keys(answersForQuestion).length
        : 0

    return `
      <div class="admin-game-panel">
        <h2 class="admin-game-heading">Game status</h2>
        <dl class="admin-game-dl">
          <div class="admin-game-dl-row">
            <dt>Phase</dt>
            <dd>${escapeHtml(String(phase))}</dd>
          </div>
          <div class="admin-game-dl-row">
            <dt>Question index</dt>
            <dd>${typeof idx === 'number' ? escapeHtml(String(idx)) : '—'}</dd>
          </div>
          <div class="admin-game-dl-row">
            <dt>Question</dt>
            <dd>${questionText}</dd>
          </div>
          <div class="admin-game-dl-row">
            <dt>Started</dt>
            <dd>${startedAt}</dd>
          </div>
          <div class="admin-game-dl-row">
            <dt>Closes</dt>
            <dd>${closesAt}</dd>
          </div>
        </dl>
        <p class="admin-game-progress">
          <strong>${answeredCount}</strong> / <strong>${participantsCount}</strong>
          answered
        </p>
      </div>`
  }

  startQuestionBtn?.addEventListener('click', async () => {
    bannerText = ''
    try {
      await startQuestion()
    } catch (err) {
      console.error(err)
      bannerText =
        typeof err.message === 'string'
          ? err.message
          : 'Could not start question.'
    }
    draw()
  })

  function participantRowsHtml() {
    const entries = sortParticipantsByDisplayName(participantsMap)
    if (entries.length === 0) {
      return '<p class="admin-empty">No participants yet.</p>'
    }

    const items = entries.map(([userId, p]) => {
      const shortId = escapeHtml(userId.slice(0, 4))

      const idAttr = escapeAttr(userId)

      if (editingUserId === userId) {
        const valAttr = escapeAttr(rawParticipantDisplay(p))
        return `
          <li class="admin-row admin-row-edit" data-user-id="${idAttr}">
            <input type="text" class="admin-name-input" maxlength="80" value="${valAttr}" aria-label="Display name" />
            <span class="admin-short-id">${shortId}</span>
            <button type="button" class="admin-btn" data-action="save">Save</button>
            <button type="button" class="admin-btn admin-btn-secondary" data-action="cancel">Cancel</button>
          </li>`
      }

      const label = escapeHtml(formatParticipantDisplay(p))
      return `
        <li class="admin-row" data-user-id="${idAttr}">
          <span class="admin-display-name">${label}</span>
          <span class="admin-short-id">${shortId}</span>
          <button type="button" class="admin-btn" data-action="edit">Edit</button>
        </li>`
    })

    return `<ul class="admin-participant-list">${items.join('')}</ul>`
  }

  function draw() {
    bannerEl.hidden = !bannerText
    bannerEl.textContent = bannerText

    if (!db) {
      if (gameStatusMount) gameStatusMount.innerHTML = ''
      listMount.innerHTML =
        '<p class="admin-empty">Connect Firebase (<code>VITE_FIREBASE_DATABASE_URL</code>) to manage participants.</p>'
      return
    }
    if (gameStatusMount) gameStatusMount.innerHTML = gameStatusHtml()
    listMount.innerHTML = participantRowsHtml()

    const input = listMount.querySelector('.admin-name-input')
    if (input) {
      input.focus()
      if (typeof input.select === 'function') input.select()
    }
  }

  listMount.addEventListener('click', async (e) => {
    const el = e.target
    if (!(el instanceof HTMLElement)) return

    const action = el.getAttribute('data-action')
    const row = el.closest('[data-user-id]')
    const userId = row?.dataset.userId

    if (action === 'edit' && userId) {
      bannerText = ''
      editingUserId = userId
      draw()
      return
    }

    if (action === 'cancel') {
      editingUserId = null
      bannerText = ''
      draw()
      return
    }

    if (action !== 'save' || !userId) return

    const inp = row?.querySelector('.admin-name-input')
    const raw = inp?.value ?? ''
    try {
      await updateParticipantDisplayName(userId, raw)
      editingUserId = null
      bannerText = ''
      draw()
    } catch (err) {
      console.error(err)
      bannerText =
        typeof err.message === 'string'
          ? err.message
          : 'Could not save display name.'
      draw()
    }
  })

  if (!db) {
    draw()
    return
  }

  gameUnsubscribe = subscribeGame((next) => {
    gameState = next
    resubscribeAnswersForCurrentQuestion()
    draw()
  })

  participantUnsubscribe = subscribeParticipants((map) => {
    participantsMap = map ?? {}
    draw()
  })
}
