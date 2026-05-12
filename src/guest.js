import { registerGuestParticipant } from './participants.js'
import {
  generateUserId,
  getGuestSession,
  saveGuestSession,
} from './guestStorage.js'

export function renderGuest(container) {
  const session = getGuestSession()
  if (session) {
    renderWaitingScreen(container, session.name)
    return
  }
  renderJoinForm(container)
}

function renderJoinForm(container) {
  container.innerHTML = `
    <h1>Join quiz</h1>
    <p class="guest-lede">Enter your name so the host can see who is in the room.</p>
    <form class="guest-form" id="guest-join-form">
      <label class="guest-label" for="guest-name">Your name</label>
      <input
        class="guest-input"
        id="guest-name"
        name="name"
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
  const input = container.querySelector('#guest-name')
  const errorEl = container.querySelector('#guest-error')
  const submitBtn = container.querySelector('#guest-submit')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const name = input.value.trim()
    if (!name) return

    const userId = generateUserId()
    errorEl.hidden = true
    submitBtn.disabled = true

    try {
      await registerGuestParticipant(userId, name)
      saveGuestSession(userId, name)
      renderWaitingScreen(container, name)
    } catch (err) {
      console.error(err)
      errorEl.textContent =
        'Could not join right now. Check your connection and Firebase config, then try again.'
      errorEl.hidden = false
      submitBtn.disabled = false
    }
  })
}

function renderWaitingScreen(container, displayName) {
  container.innerHTML = `
    <h1>You're in</h1>
    <p class="guest-waiting-primary">Waiting for next question</p>
    <p class="guest-waiting-secondary">Signed in as <strong>${escapeHtml(displayName)}</strong></p>
  `
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
