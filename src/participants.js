import { ref, set, update, get, onValue } from 'firebase/database'
import { db } from './firebase.js'
import { t } from './i18n.js'
import { getCurrentRoleFromRoute, SPOTQUIZ_DEBUG_ROLE } from './routeRole.js'

function requireDb() {
  if (!db) {
    throw new Error(t('errors.firebaseUrlMissing'))
  }
}

/** Create or update participant; `role` is always from the current hash route. */
export async function registerParticipantForRoute(userId, displayName) {
  requireDb()
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  const role = getCurrentRoleFromRoute()
  const now = Date.now()
  const trimmed = displayName.trim()
  const r = ref(db, `participants/${userId}`)
  const snap = await get(r)
  if (snap.exists()) {
    await update(r, {
      displayName: trimmed,
      role,
      lastSeenAt: now,
    })
  } else {
    await set(r, {
      displayName: trimmed,
      role,
      joinedAt: now,
      lastSeenAt: now,
    })
  }
  if (SPOTQUIZ_DEBUG_ROLE) {
    const after = await get(r)
    console.log('[SpotQuiz role] registerParticipantForRoute saved', {
      hash,
      resolvedRole: role,
      savedParticipantRole: after.exists() ? after.val()?.role : null,
    })
  }
}

export async function registerGuestParticipant(userId, displayName) {
  return registerParticipantForRoute(userId, displayName)
}

export async function registerConfirmandParticipant(userId, displayName) {
  return registerParticipantForRoute(userId, displayName)
}

/**
 * On guest or confirmand hash routes: set `participants/{userId}/role` to
 * `getCurrentRoleFromRoute()` and refresh `lastSeenAt` (overwrites saved role if different).
 */
export async function syncParticipantRoleAndPresence(userId) {
  requireDb()
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  const role = getCurrentRoleFromRoute()
  const now = Date.now()
  const r = ref(db, `participants/${userId}`)
  const snap = await get(r)
  if (!snap.exists()) return
  await update(r, {
    role,
    lastSeenAt: now,
  })
  if (SPOTQUIZ_DEBUG_ROLE) {
    const after = await get(r)
    console.log('[SpotQuiz role] syncParticipantRoleAndPresence saved', {
      hash,
      resolvedRole: role,
      savedParticipantRole: after.exists() ? after.val()?.role : null,
    })
  }
}

/**
 * Listen to one participant node. Callback receives `null` if the node is missing.
 * Use for the guest view to stay in sync with `displayName`.
 */
export function subscribeParticipant(userId, onData) {
  if (!db) {
    onData(null)
    return () => {}
  }
  const r = ref(db, `participants/${userId}`)
  return onValue(r, (snap) => {
    onData(snap.exists() ? snap.val() : null)
  })
}
