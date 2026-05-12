import { clearLocalParticipantStorage } from './guestStorage.js'
import { t } from './i18n.js'

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function renderResetUser(container) {
  let done = false

  function draw() {
    if (done) {
      container.innerHTML = `
        <h1>${escapeHtml(t('resetUser.title'))}</h1>
        <p class="reset-user-success">${escapeHtml(t('resetUser.success'))}</p>
        <p class="reset-user-next">
          <a href="#/">${escapeHtml(t('resetUser.backHome'))}</a>
        </p>
      `
      return
    }

    container.innerHTML = `
      <h1>${escapeHtml(t('resetUser.title'))}</h1>
      <p class="reset-user-lede">
        ${t('resetUser.lede')}
      </p>
      <p>
        <button type="button" class="reset-user-btn" id="reset-user-submit">
          ${escapeHtml(t('resetUser.submit'))}
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
