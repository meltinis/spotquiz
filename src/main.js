import './style.css'
import { testRealtimeConnection } from './firebase.js'
import {
  disposeGuestSubscriptions,
  renderGuest,
  renderConfirmand,
} from './guest.js'
import { disposeAdminSubscriptions, renderAdmin } from './admin.js'
import { disposeScreenSubscriptions, renderScreen } from './screen.js'
import { renderDev } from './devTools.js'
import { renderResetUser } from './resetUser.js'
import {
  normalizedPathname,
  isConfirmandParticipantPath,
} from './routeRole.js'

const appEl = document.getElementById('app')

function route() {
  disposeAdminSubscriptions()
  disposeGuestSubscriptions()
  disposeScreenSubscriptions()

  const path = normalizedPathname()

  if (path === '/admin') {
    document.body.className = 'page-admin'
    renderAdmin(appEl)
  } else if (path === '/screen') {
    document.body.className = 'page-screen'
    renderScreen(appEl)
  } else if (path === '/dev') {
    document.body.className = 'page-dev'
    renderDev(appEl)
  } else if (path === '/resetuser') {
    document.body.className = 'page-reset-user'
    renderResetUser(appEl)
  } else if (isConfirmandParticipantPath(window.location.pathname)) {
    document.body.className = 'page-confirmand'
    renderConfirmand(appEl)
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
