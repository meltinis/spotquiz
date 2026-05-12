import { ref, set } from 'firebase/database'
import { db } from './firebase.js'
import { DEV_TOOLS_ENABLED } from './devConfig.js'

const PATHS_TO_CLEAR = ['game', 'participants', 'answers', 'scores', 'debug']

export async function deleteAllTestData() {
  if (!db) {
    throw new Error(
      'Firebase Realtime Database URL missing. Add VITE_FIREBASE_DATABASE_URL to your .env file.',
    )
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
        <h1>Developer tools</h1>
        <p class="dev-tools-disabled">Developer tools disabled</p>
      `
      return
    }

    if (!db) {
      container.innerHTML = `
        <h1>Developer tools</h1>
        <p class="dev-tools-warning">Connect Firebase (<code>VITE_FIREBASE_DATABASE_URL</code>) to use this page.</p>
      `
      return
    }

    if (deleted) {
      container.innerHTML = `
        <h1>Developer tools</h1>
        <p class="dev-tools-success">All test data deleted</p>
      `
      return
    }

    container.innerHTML = `
      <h1>Developer tools</h1>
      <p class="dev-tools-warning">
        <strong>Test only.</strong> This removes live data under:
        <code>game</code>, <code>participants</code>, <code>answers</code>,
        <code>scores</code>, and <code>debug</code> in your Realtime Database.
        There is no undo.
      </p>
      <p>
        <button type="button" class="dev-tools-delete-btn" id="dev-delete-all">
          Delete all test data
        </button>
      </p>
    `

    const btn = container.querySelector('#dev-delete-all')
    btn?.addEventListener('click', async () => {
      if (
        !window.confirm(
          'Delete ALL data under game, participants, answers, scores, and debug?',
        )
      ) {
        return
      }
      try {
        await deleteAllTestData()
        deleted = true
        draw()
      } catch (err) {
        console.error(err)
        window.alert(
          typeof err.message === 'string' ? err.message : 'Deletion failed.',
        )
      }
    })
  }

  draw()
}
