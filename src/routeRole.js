/** Set to false to silence temporary role debug logs. */
export const SPOTQUIZ_DEBUG_ROLE = true

export const PARTICIPANT_ROLE_GUEST = 'guest'

export const PARTICIPANT_ROLE_CONFIRMAND = 'confirmand'

/** Hash segment that maps to confirmand (includes common typo `confirmant`). */
const CONFIRMAND_HASH_ALIASES = new Set(['confirmand', 'confirmant'])

/**
 * Reads `window.location.hash`. Supports both `#/admin` and `#admin`.
 * Empty hash, `#`, `#/`, or an unknown first segment => `guest`.
 *
 * @returns {'guest'|'admin'|'screen'|'confirmand'|'dev'|'resetuser'}
 */
export function getCurrentRoute() {
  const key = getHashFirstSegment().toLowerCase()
  if (!key) return 'guest'
  if (CONFIRMAND_HASH_ALIASES.has(key)) return 'confirmand'
  if (key === 'admin') return 'admin'
  if (key === 'screen') return 'screen'
  if (key === 'dev') return 'dev'
  if (key === 'resetuser') return 'resetuser'
  return 'guest'
}

function getHashFirstSegment() {
  if (typeof window === 'undefined') return ''
  let raw = String(window.location.hash ?? '')
  raw = raw.replace(/^#/, '')
  if (raw.startsWith('/')) raw = raw.slice(1)
  raw = raw.replace(/\/+$/, '')
  const parts = raw.split('/').filter(Boolean)
  return parts[0] ?? ''
}

export function getCurrentRoleFromRoute() {
  return getCurrentRoute() === 'confirmand'
    ? PARTICIPANT_ROLE_CONFIRMAND
    : PARTICIPANT_ROLE_GUEST
}

/** True when this URL should load the confirmand participant UI (not admin/screen/etc.). */
export function isConfirmandParticipantRoute() {
  return getCurrentRoute() === 'confirmand'
}
