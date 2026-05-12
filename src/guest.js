import {

  rawParticipantDisplay,

  formatParticipantDisplay,

} from './adminParticipants.js'

import { db } from './firebase.js'

import {

  registerParticipantForRoute,

  subscribeParticipant,

  syncParticipantRoleAndPresence,

} from './participants.js'

import {

  getCurrentRoleFromRoute,

  getRoleFromPathname,

  PARTICIPANT_ROLE_CONFIRMAND,

  SPOTQUIZ_DEBUG_ROLE,

} from './routeRole.js'

import {

  generateUserId,

  getParticipantSession,

  saveParticipantSession,

  cacheParticipantRoleFromRoute,

} from './guestStorage.js'

import { subscribeGame } from './game.js'

import { QUESTIONS } from './questions.js'

import {

  subscribeUserAnswer,

  saveNewAnswer,

} from './answers.js'



const GUEST_VIEW_CONFIG = {

  getSession: getParticipantSession,

  saveSession: saveParticipantSession,

  registerParticipant: registerParticipantForRoute,

  joinTitle: 'Join quiz',

  joinLede: 'Pick the name everyone will see.',

  namePlaceholder: 'e.g. Alex',

}



const CONFIRMAND_VIEW_CONFIG = {

  getSession: getParticipantSession,

  saveSession: saveParticipantSession,

  registerParticipant: registerParticipantForRoute,

  joinTitle: 'Confirmand',

  joinLede: 'Enter the name organizers will see.',

  namePlaceholder: 'Your name',

}



let guestRealtimeUnsubscribe = null

let guestGameUnsubscribe = null

let guestAnswerUnsubscribe = null

let guestCountdownIntervalId = null



export function disposeGuestSubscriptions() {

  clearGuestCountdown()

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

      ? 'Confirmand'

      : 'Guest'

  return `<p class="guest-route-role-hint">Playing as <strong>${escapeHtml(label)}</strong></p>`

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

    <h1>${escapeHtml(cfg.joinTitle)}</h1>

    <p class="guest-lede">${escapeHtml(cfg.joinLede)}</p>

    <form class="guest-form" id="guest-join-form">

      <label class="guest-label" for="guest-display-name">Display name</label>

      <input

        class="guest-input"

        id="guest-display-name"

        name="displayName"

        type="text"

        autocomplete="nickname"

        maxlength="80"

        required

        placeholder="${escapeHtml(cfg.namePlaceholder)}"

      />

      <p class="guest-error" id="guest-error" hidden></p>

      <button class="guest-button" type="submit" id="guest-submit">Join</button>

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

      errorEl.textContent =

        'Could not join right now. Check your connection and Firebase config, then try again.'

      errorEl.hidden = false

      submitBtn.disabled = false

    }

  })

}



function drawWaiting(container, participantLike) {

  const shown = formatParticipantDisplay(participantLike)

  container.innerHTML = `

    <h1>You're in</h1>

    <p class="guest-waiting-primary">Waiting for next question</p>

    <p class="guest-waiting-secondary">Signed in as <strong>${escapeHtml(shown)}</strong></p>

    ${routeRoleLabelHtml()}

  `

}



function drawQuestionClosed(container, participantLike, question) {

  const shown = formatParticipantDisplay(participantLike)

  container.innerHTML = `

    <h1>You're in</h1>

    <p class="guest-question-text">${escapeHtml(question.text)}</p>

    <p class="guest-phase-closed">Question closed</p>

    <p class="guest-waiting-secondary">Signed in as <strong>${escapeHtml(shown)}</strong></p>

    ${routeRoleLabelHtml()}

  `

}



function drawQuestionOpen(

  container,

  participantLike,

  question,

  { existingAnswer, submitting, remainingMs },

) {

  const shown = formatParticipantDisplay(participantLike)

  const timeUp = !existingAnswer && remainingMs <= 0

  const locked =

    !!existingAnswer || submitting || remainingMs <= 0

  const countdownLine =

    !existingAnswer && remainingMs > 0

      ? `<p class="guest-countdown">Time left: ${escapeHtml(formatCountdown(remainingMs))}</p>`

      : ''

  const timeUpLine =

    timeUp ? '<p class="guest-time-up">Time is up</p>' : ''

  const buttons = question.options

    .map(

      (label, i) => `

      <button

        type="button"

        class="guest-option-btn"

        data-option-index="${i}"

        ${locked ? 'disabled' : ''}

      >

        ${escapeHtml(label)}

      </button>

    `,

    )

    .join('')

  const registeredBlock =

    existingAnswer

      ? '<p class="guest-answer-registered">Your answer has been registered</p>'

      : ''

  container.innerHTML = `

    <h1>You're in</h1>

    <p class="guest-question-text">${escapeHtml(question.text)}</p>

    ${registeredBlock}

    ${countdownLine}

    ${timeUpLine}

    <div class="guest-options">${buttons}</div>

    <p class="guest-waiting-secondary">Signed in as <strong>${escapeHtml(shown)}</strong></p>

    ${routeRoleLabelHtml()}

  `

}



function mountParticipantWaiting(container, userId, cfg) {

  syncParticipantRoleAndPresence(userId).catch(console.error)

  cacheParticipantRoleFromRoute()



  if (SPOTQUIZ_DEBUG_ROLE && typeof window !== 'undefined') {

    const pathname = window.location.pathname

    console.log('[SpotQuiz role] mountParticipantWaiting', {

      pathname,

      resolvedRole: getRoleFromPathname(pathname),

    })

  }



  if (!db) {

    const s = cfg.getSession()

    drawWaiting(container, { displayName: s?.displayName ?? '' })

    return

  }



  clearGuestOptionDelegation()



  const sess = cfg.getSession()

  let lastParticipant = sess ? { displayName: sess.displayName } : null

  let lastGame = null

  /** Clears local answer UI when `questionIndex` advances to a new question. */
  let prevOpenQuestionIndex = null

  let lastMyAnswer = null

  let answerSubmitting = false



  function resubscribeMyAnswer() {

    if (guestAnswerUnsubscribe) {

      guestAnswerUnsubscribe()

      guestAnswerUnsubscribe = null

    }

    const phase = lastGame?.phase

    const idx = lastGame?.questionIndex



    if (typeof idx === 'number' && phase === 'question_open') {

      if (prevOpenQuestionIndex !== idx) {

        prevOpenQuestionIndex = idx

        lastMyAnswer = null

        answerSubmitting = false

      }

    } else {

      prevOpenQuestionIndex = null

    }



    if (typeof idx !== 'number' || phase !== 'question_open') {

      applyParticipantView()

      return

    }



    guestAnswerUnsubscribe = subscribeUserAnswer(idx, userId, (data) => {

      lastMyAnswer = data

      if (data) answerSubmitting = false

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



    if (lastMyAnswer) {

      clearGuestCountdown()

      return

    }



    const remains = remainingMsFromClosesAt(lastGame?.closesAt)

    if (remains <= 0) {

      clearGuestCountdown()

      return

    }



    if (guestCountdownIntervalId == null) {

      guestCountdownIntervalId = window.setInterval(() => {

        applyParticipantView()

      }, 1000)

    }

  }



  function applyParticipantView() {

    const participantLike = lastParticipant ?? {}

    const phase = lastGame?.phase

    const idx = lastGame?.questionIndex



    if (phase === 'waiting') {

      drawWaiting(container, participantLike)

      syncCountdownTimer()

      return

    }



    if (

      typeof idx === 'number' &&

      idx >= 0 &&

      idx < QUESTIONS.length &&

      phase === 'question_closed'

    ) {

      const closedQ = QUESTIONS[idx]

      if (closedQ) {

        drawQuestionClosed(container, participantLike, closedQ)

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

        })

        syncCountdownTimer()

        return

      }

    }



    drawWaiting(container, participantLike)

    syncCountdownTimer()

  }



  async function onParticipantOptionClick(e) {

    const btn = e.target.closest('.guest-option-btn')

    if (!(btn instanceof HTMLButtonElement)) return

    if (btn.disabled) return



    const optionIndex = Number.parseInt(btn.dataset.optionIndex ?? '', 10)

    if (Number.isNaN(optionIndex)) return



    if (lastMyAnswer || answerSubmitting) return



    const phase = lastGame?.phase

    const qIdx = lastGame?.questionIndex

    if (phase !== 'question_open' || typeof qIdx !== 'number') return



    if (remainingMsFromClosesAt(lastGame?.closesAt) <= 0) return



    const q = QUESTIONS[qIdx]

    if (!q) return



    const label = q.options[optionIndex]

    if (label === undefined) return



    answerSubmitting = true

    applyParticipantView()



    try {

      const pathname =
        typeof window !== 'undefined' ? window.location.pathname : ''

      const role = getRoleFromPathname(pathname)

      if (SPOTQUIZ_DEBUG_ROLE) {
        console.log('[SpotQuiz role] saveNewAnswer', {
          pathname,
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

    resubscribeMyAnswer()

  })

}


