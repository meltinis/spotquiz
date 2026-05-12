import './style.css'
import { testRealtimeConnection } from './firebase.js'
import { disposeGuestSubscriptions, renderGuest } from './guest.js'
import { disposeAdminSubscriptions, renderAdmin } from './admin.js'
import { renderScreen } from './screen.js'

const appEl = document.getElementById('app')

/** Normalize path so "/" matches home; strip trailing slashes. */
function currentPathname() {
  let path = window.location.pathname
  if (path !== '/' && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  return path
}

function route() {
  disposeAdminSubscriptions()
  disposeGuestSubscriptions()

  const path = currentPathname()

  if (path === '/admin') {
    document.body.className = 'page-admin'
    renderAdmin(appEl)
  } else if (path === '/screen') {
    document.body.className = 'page-screen'
    renderScreen(appEl)
  } else {
    document.body.className = 'page-guest'
    renderGuest(appEl)
  }
}

window.addEventListener('popstate', route)

/** Optional: call from console or future links — history.pushState + re-render. */
export function navigate(to) {
  window.history.pushState({}, '', to)
  route()
}

testRealtimeConnection().catch(console.error)

route()
