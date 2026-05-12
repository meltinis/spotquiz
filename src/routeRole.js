/** Set to false to silence temporary role debug logs. */
export const SPOTQUIZ_DEBUG_ROLE = true

export const PARTICIPANT_ROLE_GUEST = 'guest'

export const PARTICIPANT_ROLE_CONFIRMAND = 'confirmand'

/** URL path segments that load the confirmand flow (includes common typo `confirmant`). */
const CONFIRMAND_PATH_SEGMENTS = new Set(['confirmand', 'confirmant'])

function lastSegmentIsConfirmandRoute(last) {
  if (last == null || last === '') return false
  return CONFIRMAND_PATH_SEGMENTS.has(String(last).toLowerCase())
}

/**
 * Role from URL only. Confirmand when the last path segment is `confirmand`
 * (any casing) or the common typo `confirmant`, e.g. `/confirmand`, `/base/confirmand/`.
 */
export function getRoleFromPathname(pathname) {
  let path = String(pathname ?? '')
  if (path !== '/' && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  return lastSegmentIsConfirmandRoute(last)
    ? PARTICIPANT_ROLE_CONFIRMAND
    : PARTICIPANT_ROLE_GUEST
}

/** Normalized pathname (no trailing slash except "/"). */
export function normalizedPathname() {
  let path = window.location.pathname
  if (path !== '/' && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  return path
}

/** True when this URL should load the confirmand participant UI (not role for /admin etc.). */
export function isConfirmandParticipantPath(pathname) {
  return getRoleFromPathname(pathname) === PARTICIPANT_ROLE_CONFIRMAND
}

export function getCurrentRoleFromRoute() {
  return getRoleFromPathname(window.location.pathname)
}
