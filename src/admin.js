import { db } from './firebase.js'
import { t } from './i18n.js'
import {
  startQuestion,
  closeQuestion,
  nextQuestion,
  resetGame,
  subscribeGame,
  maybeAutoCloseExpiredQuestion,
} from './game.js'
import { subscribeAnswersForQuestion } from './answers.js'
import { QUESTIONS, QUESTION_COUNT } from './questions.js'
import {
  rawParticipantDisplay,
  formatParticipantDisplay,
  sortParticipantsByDisplayName,
  subscribeParticipants,
  updateParticipantDisplayName,
} from './adminParticipants.js'
import {
  PARTICIPANT_ROLE_CONFIRMAND,
  PARTICIPANT_ROLE_GUEST,
} from './routeRole.js'

let participantUnsubscribe = null
let gameUnsubscribe = null
let answersUnsubscribe = null
let adminTimerTickId = null
let adminIntroSequenceCancelled = false

function clearAdminTimerTick() {
  if (adminTimerTickId != null) {
    clearInterval(adminTimerTickId)
    adminTimerTickId = null
  }
}

/** Call when leaving #/admin so the realtime listener stops. */
export function disposeAdminSubscriptions() {
  clearAdminTimerTick()
  adminIntroSequenceCancelled = true
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

/** First participant with confirmand role in Firebase, if any. */
function findConfirmandEntry(map) {
  for (const [userId, p] of Object.entries(map || {})) {
    if (p && p.role === PARTICIPANT_ROLE_CONFIRMAND)
      return { userId, participant: p }
  }
  return null
}

/** Answer row where `answers/{questionIndex}/{userId}.role` is confirmand. */
function findConfirmandAnswerEntry(answersMap) {
  for (const [userId, ans] of Object.entries(answersMap || {})) {
    if (ans && ans.role === PARTICIPANT_ROLE_CONFIRMAND)
      return { userId, answer: ans }
  }
  return null
}

function participantRoleLabel(p) {
  return p && p.role === PARTICIPANT_ROLE_CONFIRMAND
    ? PARTICIPANT_ROLE_CONFIRMAND
    : PARTICIPANT_ROLE_GUEST
}

function participantRoleDisplay(p) {
  return p && p.role === PARTICIPANT_ROLE_CONFIRMAND
    ? t('roles.confirmand')
    : t('roles.guest')
}

function phaseLabel(phase) {
  const key = `gamePhase.${phase}`
  const translated = t(key)
  return translated !== key ? translated : String(phase ?? '—')
}

export function renderAdmin(container) {
  disposeAdminSubscriptions()

  let participantsMap = {}
  let gameState = null
  let answersForQuestion = {}
  let editingUserId = null
  let bannerText = ''

  container.innerHTML = `
    <h1>${escapeHtml(t('admin.title'))}</h1>
    <p>${escapeHtml(t('admin.lede'))}</p>
    <p class="admin-game-actions">
      <span class="admin-game-actions-main">
        <button type="button" class="admin-btn" id="admin-start-question">
          ${escapeHtml(t('admin.startQuestionIntro'))}
        </button>
        <button type="button" class="admin-btn" id="admin-close-question">
          ${escapeHtml(t('admin.closeQuestion'))}
        </button>
        <button type="button" class="admin-btn" id="admin-next-question">
          ${escapeHtml(t('admin.nextQuestionIntro'))}
        </button>
      </span>
      <span class="admin-game-actions-aside">
        <button type="button" class="admin-btn admin-btn-secondary" id="admin-reset-game">
          ${escapeHtml(t('admin.resetGame'))}
        </button>
      </span>
    </p>
    <dialog class="admin-reset-dialog" id="admin-reset-dialog" aria-labelledby="admin-reset-dialog-title">
      <div class="admin-reset-dialog-panel">
        <h3 class="admin-reset-dialog-title" id="admin-reset-dialog-title">${escapeHtml(t('admin.resetDialogTitle'))}</h3>
        <p class="admin-reset-dialog-lede">
          ${t('admin.resetDialogLede')}
        </p>
        <label class="admin-reset-dialog-label" for="admin-reset-confirm-input">
          ${t('admin.resetTypeReset')}
        </label>
        <input
          class="admin-reset-dialog-input"
          id="admin-reset-confirm-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          maxlength="32"
        />
        <p class="admin-reset-dialog-error" id="admin-reset-dialog-error" hidden></p>
        <div class="admin-reset-dialog-actions">
          <button type="button" class="admin-btn admin-btn-secondary" id="admin-reset-cancel">
            ${escapeHtml(t('admin.resetCancel'))}
          </button>
          <button type="button" class="admin-btn" id="admin-reset-confirm">${escapeHtml(t('admin.resetConfirm'))}</button>
        </div>
      </div>
    </dialog>
    <p class="admin-banner" id="admin-banner" hidden></p>
    <div id="admin-game-status" class="admin-game-status"></div>
    <div id="admin-confirmand-panel" class="admin-confirmand-panel" aria-live="polite"></div>
    <div id="admin-participants"></div>
  `

  const bannerEl = container.querySelector('#admin-banner')
  const gameStatusMount = container.querySelector('#admin-game-status')
  const confirmandMount = container.querySelector('#admin-confirmand-panel')
  const listMount = container.querySelector('#admin-participants')
  const startQuestionBtn = container.querySelector('#admin-start-question')
  const closeQuestionBtn = container.querySelector('#admin-close-question')
  const nextQuestionBtn = container.querySelector('#admin-next-question')
  const resetGameBtn = container.querySelector('#admin-reset-game')
  const resetDialog = container.querySelector('#admin-reset-dialog')
  const resetConfirmInput = container.querySelector('#admin-reset-confirm-input')
  const resetDialogError = container.querySelector('#admin-reset-dialog-error')
  const resetCancelBtn = container.querySelector('#admin-reset-cancel')
  const resetConfirmBtn = container.querySelector('#admin-reset-confirm')

  function openResetDialog() {
    if (!(resetDialog instanceof HTMLDialogElement)) return
    bannerText = ''
    if (resetDialogError) {
      resetDialogError.hidden = true
      resetDialogError.textContent = ''
    }
    if (resetConfirmInput instanceof HTMLInputElement) {
      resetConfirmInput.value = ''
    }
    resetDialog.showModal()
    resetConfirmInput?.focus()
  }

  function closeResetDialog() {
    if (resetDialog instanceof HTMLDialogElement) resetDialog.close()
  }

  resetGameBtn?.addEventListener('click', () => {
    bannerText = ''
    bannerEl.hidden = true
    bannerEl.textContent = ''
    openResetDialog()
  })

  resetCancelBtn?.addEventListener('click', () => {
    closeResetDialog()
  })

  resetConfirmInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      resetConfirmBtn?.click()
    }
  })

  resetConfirmBtn?.addEventListener('click', async () => {
    if (!(resetConfirmInput instanceof HTMLInputElement) || !resetDialogError) return
    resetDialogError.hidden = true
    resetDialogError.textContent = ''
    if (resetConfirmInput.value !== 'RESET') {
      resetDialogError.textContent = t('admin.resetTypeError')
      resetDialogError.hidden = false
      return
    }
    adminIntroSequenceCancelled = true
    try {
      await resetGame()
      bannerText = ''
      closeResetDialog()
      draw()
    } catch (err) {
      console.error(err)
      resetDialogError.textContent =
        typeof err.message === 'string'
          ? err.message
          : t('admin.resetFailed')
      resetDialogError.hidden = false
    }
  })

  function resubscribeAnswersForCurrentQuestion() {
    if (answersUnsubscribe) {
      answersUnsubscribe()
      answersUnsubscribe = null
    }
    answersForQuestion = {}
    const phase = gameState?.phase
    const qIdx = gameState?.questionIndex
    if (
      !db ||
      typeof qIdx !== 'number' ||
      (phase !== 'question_open' && phase !== 'question_closed')
    ) {
      return
    }
    answersUnsubscribe = subscribeAnswersForQuestion(qIdx, (map) => {
      answersForQuestion = map ?? {}
      draw()
    })
  }

  function questionProgressInnerHtml(phase, idx) {
    if (phase === 'waiting') {
      return `<strong>—</strong> / <strong>${QUESTION_COUNT}</strong>`
    }
    if (typeof idx !== 'number' || idx < 0 || idx >= QUESTIONS.length) {
      return `<strong>—</strong> / <strong>${QUESTION_COUNT}</strong>`
    }
    return `<strong>${idx + 1}</strong> / <strong>${QUESTION_COUNT}</strong>`
  }

  function gameStatusHtml() {
    if (!gameState) {
      return `
        <div class="admin-game-panel">
          <h2 class="admin-game-heading">${escapeHtml(t('admin.gameStatus'))}</h2>
          <p class="admin-question-progress">${escapeHtml(t('common.questionNoun'))} ${questionProgressInnerHtml('waiting', 0)}</p>
          <p class="admin-game-muted">${t('admin.noGameYet')}</p>
        </div>`
    }

    const idx = gameState.questionIndex
    const phase = gameState.phase ?? '—'
    const q =
      phase === 'waiting'
        ? undefined
        : typeof idx === 'number' && idx >= 0 && idx < QUESTIONS.length
          ? QUESTIONS[idx]
          : undefined
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
      (phase === 'question_open' || phase === 'question_closed') &&
      typeof idx === 'number'
        ? Object.keys(answersForQuestion).length
        : 0

    return `
      <div class="admin-game-panel">
        <h2 class="admin-game-heading">${escapeHtml(t('admin.gameStatus'))}</h2>
        <p class="admin-question-progress">${escapeHtml(t('common.questionNoun'))} ${questionProgressInnerHtml(phase, idx)}</p>
        <dl class="admin-game-dl">
          <div class="admin-game-dl-row">
            <dt>${escapeHtml(t('admin.phase'))}</dt>
            <dd>${escapeHtml(phaseLabel(phase))}</dd>
          </div>
          <div class="admin-game-dl-row">
            <dt>${escapeHtml(t('admin.questionIndex'))}</dt>
            <dd>${typeof idx === 'number' ? escapeHtml(String(idx)) : '—'}</dd>
          </div>
          <div class="admin-game-dl-row">
            <dt>${escapeHtml(t('admin.question'))}</dt>
            <dd>${questionText}</dd>
          </div>
          <div class="admin-game-dl-row">
            <dt>${escapeHtml(t('admin.started'))}</dt>
            <dd>${startedAt}</dd>
          </div>
          <div class="admin-game-dl-row">
            <dt>${escapeHtml(t('admin.closes'))}</dt>
            <dd>${closesAt}</dd>
          </div>
        </dl>
        <p class="admin-game-progress">
          <strong>${answeredCount}</strong> / <strong>${participantsCount}</strong>
          ${escapeHtml(t('admin.answeredProgress'))}
        </p>
      </div>`
  }

  function confirmandPanelHtml() {
    const c = findConfirmandEntry(participantsMap)
    const confirmandAnswer = findConfirmandAnswerEntry(answersForQuestion)
    const phase = gameState?.phase
    const idx = gameState?.questionIndex
    const onQuestion =
      (phase === 'question_intro' ||
        phase === 'question_reveal_answers' ||
        phase === 'question_open' ||
        phase === 'question_closed') &&
      typeof idx === 'number'

    let registration = ''
    if (!c) {
      registration = `<p class="admin-confirmand-row"><strong>${escapeHtml(t('admin.registration'))}</strong>: <span class="admin-confirmand-no">${escapeHtml(t('admin.noConfirmand'))}</span></p>`
    } else {
      const name = escapeHtml(formatParticipantDisplay(c.participant))
      registration = `<p class="admin-confirmand-row"><strong>${escapeHtml(t('admin.registration'))}</strong>: <span class="admin-confirmand-yes">${escapeHtml(t('admin.registered'))}</span> ${escapeHtml(t('admin.registeredAs'))} <strong>${name}</strong></p>`
    }

    let currentQ = ''
    if (!onQuestion) {
      currentQ = `<p class="admin-confirmand-row admin-confirmand-muted"><strong>${escapeHtml(t('admin.currentQuestion'))}</strong>: ${t('admin.startQuestionToTrack')}</p>`
    } else if (confirmandAnswer) {
      currentQ = `<p class="admin-confirmand-row"><strong>${escapeHtml(t('admin.currentQuestion'))}</strong>: <span class="admin-confirmand-answered">${escapeHtml(t('admin.hasAnswered'))}</span></p>`
    } else if (!c) {
      currentQ = `<p class="admin-confirmand-row"><strong>${escapeHtml(t('admin.currentQuestion'))}</strong>: <span class="admin-confirmand-muted">${t('admin.currentQuestionNa')}</span></p>`
    } else {
      currentQ = `<p class="admin-confirmand-row"><strong>${escapeHtml(t('admin.currentQuestion'))}</strong>: <span class="admin-confirmand-waiting">${escapeHtml(t('admin.notAnsweredYet'))}</span></p>`
    }

    const closedWithoutKey =
      phase === 'question_closed' &&
      onQuestion &&
      c &&
      !confirmandAnswer

    const warning = closedWithoutKey
      ? `<p class="admin-confirmand-warning" role="alert">${t('admin.closedNoConfirmandWarning')}</p>`
      : ''

    return `
      <div class="admin-confirmand-inner">
        <h2 class="admin-confirmand-heading">${escapeHtml(t('admin.confirmandPanelTitle'))}</h2>
        ${registration}
        ${currentQ}
        ${warning}
      </div>`
  }

  startQuestionBtn?.addEventListener('click', async () => {
    bannerText = ''
    adminIntroSequenceCancelled = false
    draw()
    try {
      await startQuestion(() => adminIntroSequenceCancelled)
    } catch (err) {
      console.error(err)
      bannerText =
        typeof err.message === 'string'
          ? err.message
          : t('admin.couldNotStart')
    }
    draw()
  })

  closeQuestionBtn?.addEventListener('click', async () => {
    bannerText = ''
    adminIntroSequenceCancelled = true
    try {
      await closeQuestion()
    } catch (err) {
      console.error(err)
      bannerText =
        typeof err.message === 'string'
          ? err.message
          : t('admin.couldNotClose')
    }
    draw()
  })

  nextQuestionBtn?.addEventListener('click', async () => {
    bannerText = ''
    adminIntroSequenceCancelled = false
    draw()
    try {
      await nextQuestion(() => adminIntroSequenceCancelled)
    } catch (err) {
      console.error(err)
      bannerText =
        typeof err.message === 'string'
          ? err.message
          : t('admin.couldNotNext')
    }
    draw()
  })

  function participantRowsHtml() {
    const entries = sortParticipantsByDisplayName(participantsMap)
    if (entries.length === 0) {
      return '<p class="admin-empty">' + escapeHtml(t('admin.noParticipants')) + '</p>'
    }

    const items = entries.map(([userId, p]) => {
      const shortId = escapeHtml(userId.slice(0, 4))

      const idAttr = escapeAttr(userId)

      if (editingUserId === userId) {
        const valAttr = escapeAttr(rawParticipantDisplay(p))
        const roleDisplay = escapeHtml(participantRoleDisplay(p))
        const role = participantRoleLabel(p)
        const roleClass =
          role === PARTICIPANT_ROLE_CONFIRMAND
            ? 'admin-role-confirmand'
            : 'admin-role-guest'
        return `
          <li class="admin-row admin-row-edit" data-user-id="${idAttr}">
            <input type="text" class="admin-name-input" maxlength="80" value="${valAttr}" aria-label="${escapeAttr(t('admin.displayNameAria'))}" />
            <span class="admin-role-pill ${roleClass}">${roleDisplay}</span>
            <span class="admin-short-id">${shortId}</span>
            <button type="button" class="admin-btn" data-action="save">${escapeHtml(t('admin.save'))}</button>
            <button type="button" class="admin-btn admin-btn-secondary" data-action="cancel">${escapeHtml(t('admin.cancel'))}</button>
          </li>`
      }

      const label = escapeHtml(formatParticipantDisplay(p))
      const roleDisplay = escapeHtml(participantRoleDisplay(p))
      const role = participantRoleLabel(p)
      const roleClass =
        role === PARTICIPANT_ROLE_CONFIRMAND
          ? 'admin-role-confirmand'
          : 'admin-role-guest'
      return `
        <li class="admin-row" data-user-id="${idAttr}">
          <span class="admin-display-name">${label}</span>
          <span class="admin-role-pill ${roleClass}">${roleDisplay}</span>
          <span class="admin-short-id">${shortId}</span>
          <button type="button" class="admin-btn" data-action="edit">${escapeHtml(t('admin.edit'))}</button>
        </li>`
    })

    return `<ul class="admin-participant-list">${items.join('')}</ul>`
  }

  function draw() {
    bannerEl.hidden = !bannerText
    bannerEl.textContent = bannerText

    if (!db) {
      if (gameStatusMount) gameStatusMount.innerHTML = ''
      if (confirmandMount) confirmandMount.innerHTML = ''
      listMount.innerHTML =
        '<p class="admin-empty">' + escapeHtml(t('admin.connectFirebaseAdmin')) + '</p>'
      return
    }
    if (gameStatusMount) gameStatusMount.innerHTML = gameStatusHtml()
    if (confirmandMount) confirmandMount.innerHTML = confirmandPanelHtml()
    listMount.innerHTML = participantRowsHtml()

    const idx = gameState?.questionIndex
    const phase = gameState?.phase
    const onLastQuestion =
      typeof idx === 'number' && idx >= QUESTION_COUNT - 1
    const inIntroOrReveal =
      phase === 'question_intro' || phase === 'question_reveal_answers'
    const disableNext =
      !gameState ||
      phase === 'waiting' ||
      phase === 'question_open' ||
      inIntroOrReveal ||
      onLastQuestion
    if (nextQuestionBtn) nextQuestionBtn.disabled = disableNext
    const disableStart =
      phase === 'question_intro' ||
      phase === 'question_reveal_answers' ||
      phase === 'question_open' ||
      phase === 'question_closed'
    if (startQuestionBtn) startQuestionBtn.disabled = disableStart
    const disableClose = phase !== 'question_open' && phase !== 'question_closed'
    if (closeQuestionBtn) closeQuestionBtn.disabled = disableClose

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
          : t('admin.couldNotSaveName')
      draw()
    }
  })

  if (!db) {
    draw()
    return
  }

  gameUnsubscribe = subscribeGame((next) => {
    gameState = next
    if (
      next?.phase === 'question_open' &&
      typeof next.closesAt === 'number' &&
      Date.now() >= next.closesAt
    ) {
      maybeAutoCloseExpiredQuestion().catch(console.error)
    }
    resubscribeAnswersForCurrentQuestion()
    draw()
  })

  clearAdminTimerTick()
  adminTimerTickId = window.setInterval(() => {
    if (
      gameState?.phase === 'question_open' &&
      typeof gameState.closesAt === 'number' &&
      Date.now() >= gameState.closesAt
    ) {
      maybeAutoCloseExpiredQuestion().catch(console.error)
    }
  }, 1000)

  participantUnsubscribe = subscribeParticipants((map) => {
    participantsMap = map ?? {}
    draw()
  })
}
