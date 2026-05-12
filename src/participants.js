import { ref, set } from 'firebase/database'
import { db } from './firebase.js'

export async function registerGuestParticipant(userId, name) {
  if (!db) {
    throw new Error(
      'Firebase Realtime Database URL missing. Add VITE_FIREBASE_DATABASE_URL to your .env file.',
    )
  }
  await set(ref(db, `participants/${userId}`), {
    name,
    role: 'guest',
    joinedAt: Date.now(),
  })
}
