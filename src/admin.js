import { db } from './firebase.js'
import { startQuestion } from './game.js'
import {
  rawParticipantDisplay,
  formatParticipantDisplay,
  sortParticipantsByDisplayName,
  subscribeParticipants,
  updateParticipantDisplayName,
} from './adminParticipants.js'

let participantUnsubscribe = null

/** Call when leaving /admin so the realtime listener stops. */
export function disposeAdminSubscriptions() {
  if (participantUnsubscribe) {
    participantUnsubscribe()
    participantUnsubscribe = null
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
    <div id="admin-participants"></div>
  `

  const bannerEl = container.querySelector('#admin-banner')
  const listMount = container.querySelector('#admin-participants')
  const startQuestionBtn = container.querySelector('#admin-start-question')

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
      listMount.innerHTML =
        '<p class="admin-empty">Connect Firebase (<code>VITE_FIREBASE_DATABASE_URL</code>) to manage participants.</p>'
      return
    }
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

  participantUnsubscribe = subscribeParticipants((map) => {
    participantsMap = map ?? {}
    draw()
  })
}
