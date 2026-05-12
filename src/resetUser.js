import { clearLocalParticipantStorage } from './guestStorage.js'

export function renderResetUser(container) {
  let done = false

  function draw() {
    if (done) {
      container.innerHTML = `
        <h1>Reset this user</h1>
        <p class="reset-user-success">This user has been reset</p>
        <p class="reset-user-next">
          <a href="/">Back to quiz home</a>
        </p>
      `
      return
    }

    container.innerHTML = `
      <h1>Reset this user</h1>
      <p class="reset-user-lede">
        This only clears saved data in <strong>this browser on this device</strong>
        (your user id, display name, and cached role). Nothing is deleted from the
        server and other people are not affected.
      </p>
      <p>
        <button type="button" class="reset-user-btn" id="reset-user-submit">
          Reset this user
        </button>
      </p>
    `

    container.querySelector('#reset-user-submit')?.addEventListener('click', () => {
      clearLocalParticipantStorage()
      done = true
      draw()
    })
  }

  draw()
}
