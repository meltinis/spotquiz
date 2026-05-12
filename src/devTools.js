import { ref, set } from 'firebase/database'
import { db } from './firebase.js'
import { DEV_TOOLS_ENABLED } from './devConfig.js'
import { t } from './i18n.js'

const PATHS_TO_CLEAR = ['game', 'participants', 'answers', 'results', 'scores', 'debug']

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export async function deleteAllTestData() {
  if (!db) {
    throw new Error(t('errors.firebaseUrlMissing'))
  }
  await Promise.all(
    PATHS_TO_CLEAR.map((p) => set(ref(db, p), null)),
  )
}

export function renderDev(container) {
  let deleted = false

  function draw() {
    if (!DEV_TOOLS_ENABLED) {
      container.innerHTML = `
        <h1>${escapeHtml(t('devTools.title'))}</h1>
        <p class="dev-tools-disabled">${escapeHtml(t('devTools.disabled'))}</p>
      `
      return
    }

    if (!db) {
      container.innerHTML = `
        <h1>${escapeHtml(t('devTools.title'))}</h1>
        <p class="dev-tools-warning">${t('common.firebaseConnect')}</p>
      `
      return
    }

    if (deleted) {
      container.innerHTML = `
        <h1>${escapeHtml(t('devTools.title'))}</h1>
        <p class="dev-tools-success">${escapeHtml(t('devTools.allDeleted'))}</p>
      `
      return
    }

    container.innerHTML = `
      <h1>${escapeHtml(t('devTools.title'))}</h1>
      <p class="dev-tools-warning">
        ${t('devTools.warningIntro')}
        <code>game</code>, <code>participants</code>, <code>answers</code>,
        <code>results</code>, <code>scores</code> og <code>debug</code> ${t('devTools.warningOutro')}
      </p>
      <p>
        <button type="button" class="dev-tools-delete-btn" id="dev-delete-all">
          ${escapeHtml(t('devTools.deleteAll'))}
        </button>
      </p>
    `

    const btn = container.querySelector('#dev-delete-all')
    btn?.addEventListener('click', async () => {
      if (!window.confirm(t('devTools.confirmDelete'))) {
        return
      }
      try {
        await deleteAllTestData()
        deleted = true
        draw()
      } catch (err) {
        console.error(err)
        window.alert(
          typeof err.message === 'string' ? err.message : t('errors.deletionFailed'),
        )
      }
    })
  }

  draw()
}
