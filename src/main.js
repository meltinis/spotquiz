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
import { getCurrentRoute, isConfirmandParticipantRoute } from './routeRole.js'
import { t } from './i18n.js'

const appEl = document.getElementById('app')

document.title = t('common.documentTitle')

function route() {
  disposeAdminSubscriptions()
  disposeGuestSubscriptions()
  disposeScreenSubscriptions()

  const r = getCurrentRoute()

  if (r === 'admin') {
    document.body.className = 'page-admin'
    renderAdmin(appEl)
  } else if (r === 'screen') {
    document.body.className = 'page-screen'
    renderScreen(appEl)
  } else if (r === 'dev') {
    document.body.className = 'page-dev'
    renderDev(appEl)
  } else if (r === 'resetuser') {
    document.body.className = 'page-reset-user'
    renderResetUser(appEl)
  } else if (isConfirmandParticipantRoute()) {
    document.body.className = 'page-confirmand'
    renderConfirmand(appEl)
  } else {
    document.body.className = 'page-guest'
    renderGuest(appEl)
  }
}

window.addEventListener('hashchange', route)

/**
 * Programmatic navigation. Accepts `#/admin`, `#admin`, `/admin`, or `admin`.
 * Uses the hash so refresh works on static hosts.
 */
export function navigate(to) {
  const s = String(to ?? '').trim()
  let next
  if (!s || s === '/') {
    next = '#/'
  } else if (s.startsWith('#')) {
    next = s
  } else if (s.startsWith('/')) {
    const rest = s.replace(/^\/+/, '').replace(/\/+$/, '')
    next = rest ? '#/' + rest : '#/'
  } else {
    next = '#/' + s
  }
  if (!next.startsWith('#')) next = '#' + next
  if (window.location.hash === next) route()
  else window.location.hash = next
}

testRealtimeConnection().catch(console.error)

route()
