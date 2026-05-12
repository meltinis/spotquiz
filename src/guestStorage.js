import { getCurrentRoleFromRoute } from './routeRole.js'

const KEY_USER_ID = 'spotquiz:userId'
const KEY_DISPLAY_NAME = 'spotquiz:displayName'
/** Cached route role only — never use this to decide the current role. */
const KEY_CACHED_PARTICIPANT_ROLE = 'spotquiz:cachedParticipantRole'

/** Legacy: confirmand used separate identity keys; merged into unified storage. */
const KEY_LEGACY_CONFIRMAND_USER_ID = 'spotquiz:confirmandUserId'
const KEY_LEGACY_CONFIRMAND_DISPLAY_NAME = 'spotquiz:confirmandDisplayName'
const KEY_LEGACY_GUEST_ROLE = 'spotquiz:guestRole'
const KEY_LEGACY_CONFIRMAND_ROLE = 'spotquiz:confirmandRole'

const LEGACY_KEY_NAME = 'spotquiz:guestName'

export function generateUserId() {
  return crypto.randomUUID()
}

function clearLegacyRoleCacheKeys() {
  localStorage.removeItem(KEY_LEGACY_GUEST_ROLE)
  localStorage.removeItem(KEY_LEGACY_CONFIRMAND_ROLE)
}

function readStoredDisplayName() {
  let v = localStorage.getItem(KEY_DISPLAY_NAME)
  if (v != null) return v
  const legacy = localStorage.getItem(LEGACY_KEY_NAME)
  if (legacy != null) {
    localStorage.setItem(KEY_DISPLAY_NAME, legacy)
    localStorage.removeItem(LEGACY_KEY_NAME)
    return legacy
  }
  return null
}

/**
 * One participant identity for both `#/` and `#/confirmand` (same userId).
 * Migrates old confirmand-only keys into unified storage once.
 */
export function getParticipantSession() {
  let userId = localStorage.getItem(KEY_USER_ID)
  let displayName = readStoredDisplayName()

  if (!userId || displayName === null) {
    const legacyUid = localStorage.getItem(KEY_LEGACY_CONFIRMAND_USER_ID)
    const legacyDn = localStorage.getItem(KEY_LEGACY_CONFIRMAND_DISPLAY_NAME)
    if (legacyUid != null && legacyDn != null) {
      const trimmed = String(legacyDn).trim()
      localStorage.setItem(KEY_USER_ID, legacyUid)
      localStorage.setItem(KEY_DISPLAY_NAME, trimmed)
      localStorage.removeItem(KEY_LEGACY_CONFIRMAND_USER_ID)
      localStorage.removeItem(KEY_LEGACY_CONFIRMAND_DISPLAY_NAME)
      userId = legacyUid
      displayName = trimmed
    } else {
      return null
    }
  }

  clearLegacyRoleCacheKeys()
  return { userId, displayName }
}

/** `displayName` is stored exactly as synced from Firebase when possible (may be ""). */
export function saveParticipantSession(userId, displayName) {
  localStorage.setItem(KEY_USER_ID, userId)
  localStorage.setItem(KEY_DISPLAY_NAME, String(displayName).trim())
}

/** Store route-derived role for debugging/UI hints only — never read to decide role. */
export function cacheParticipantRoleFromRoute() {
  localStorage.setItem(KEY_CACHED_PARTICIPANT_ROLE, getCurrentRoleFromRoute())
}

/** All localStorage keys this app uses for participant identity / role on this browser. */
const PARTICIPANT_LOCAL_STORAGE_KEYS = [
  KEY_USER_ID,
  KEY_DISPLAY_NAME,
  KEY_CACHED_PARTICIPANT_ROLE,
  KEY_LEGACY_CONFIRMAND_USER_ID,
  KEY_LEGACY_CONFIRMAND_DISPLAY_NAME,
  KEY_LEGACY_GUEST_ROLE,
  KEY_LEGACY_CONFIRMAND_ROLE,
  LEGACY_KEY_NAME,
]

/** Clears saved user id, display name, and cached role for this device only (no Firebase). */
export function clearLocalParticipantStorage() {
  for (const k of PARTICIPANT_LOCAL_STORAGE_KEYS) {
    localStorage.removeItem(k)
  }
}
