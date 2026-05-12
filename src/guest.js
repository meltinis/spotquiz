import {

  rawParticipantDisplay,

  formatParticipantDisplay,

} from './adminParticipants.js'

import { db } from './firebase.js'

import {

  registerGuestParticipant,

  subscribeParticipant,

  updateGuestLastSeen,

} from './participants.js'

import {

  generateUserId,

  getGuestSession,

  saveGuestSession,

} from './guestStorage.js'

import { subscribeGame } from './game.js'

import { QUESTIONS } from './questions.js'



let guestRealtimeUnsubscribe = null

let guestGameUnsubscribe = null



export function disposeGuestSubscriptions() {

  if (guestRealtimeUnsubscribe) {

    guestRealtimeUnsubscribe()

    guestRealtimeUnsubscribe = null

  }

  if (guestGameUnsubscribe) {

    guestGameUnsubscribe()

    guestGameUnsubscribe = null

  }

}



function escapeHtml(text) {

  const div = document.createElement('div')

  div.textContent = text

  return div.innerHTML

}



export function renderGuest(container) {

  disposeGuestSubscriptions()



  const session = getGuestSession()

  if (!session) {

    renderJoinForm(container)

    return

  }



  mountGuestWaiting(container, session.userId)

}



function renderJoinForm(container) {

  container.innerHTML = `

    <h1>Join quiz</h1>

    <p class="guest-lede">Pick the name everyone will see.</p>

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

        placeholder="e.g. Alex"

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

      await registerGuestParticipant(userId, displayName)

      saveGuestSession(userId, displayName.trim())

      renderGuest(container)

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

  `

}



function drawQuestionOpen(container, participantLike, question) {

  const shown = formatParticipantDisplay(participantLike)

  const buttons = question.options

    .map(

      (label, i) => `

      <button type="button" class="guest-option-btn" data-option-index="${i}">

        ${escapeHtml(label)}

      </button>

    `,

    )

    .join('')

  container.innerHTML = `

    <h1>You're in</h1>

    <p class="guest-question-text">${escapeHtml(question.text)}</p>

    <div class="guest-options">${buttons}</div>

    <p class="guest-waiting-secondary">Signed in as <strong>${escapeHtml(shown)}</strong></p>

  `

}



function mountGuestWaiting(container, userId) {

  updateGuestLastSeen(userId).catch(console.error)



  if (!db) {

    const s = getGuestSession()

    drawWaiting(container, { displayName: s?.displayName ?? '' })

    return

  }



  const sess = getGuestSession()

  let lastParticipant = sess ? { displayName: sess.displayName } : null

  let lastGame = null



  function applyGuestView() {

    const participantLike = lastParticipant ?? {}

    const phase = lastGame?.phase

    const idx = lastGame?.questionIndex

    const q =

      typeof idx === 'number' && phase === 'question_open' ? QUESTIONS[idx] : null

    if (q) {

      drawQuestionOpen(container, participantLike, q)

    } else {

      drawWaiting(container, participantLike)

    }

  }



  guestRealtimeUnsubscribe = subscribeParticipant(userId, (data) => {

    const raw = rawParticipantDisplay(data ?? {})

    saveGuestSession(userId, raw)

    lastParticipant = data ?? {}

    applyGuestView()

  })



  guestGameUnsubscribe = subscribeGame((game) => {

    lastGame = game

    applyGuestView()

  })

}


