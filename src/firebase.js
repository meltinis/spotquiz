import { initializeApp } from 'firebase/app'
import { getDatabase, ref, set } from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = firebaseConfig.databaseURL ? initializeApp(firebaseConfig) : null

/** Realtime Database instance, or null if `VITE_FIREBASE_DATABASE_URL` is not set. */
export const db = app ? getDatabase(app) : null

/** Writes startup ping to `debug/lastConnection`. No-op when Realtime Database is not configured. */
export async function testRealtimeConnection() {
  if (!db) return
  await set(ref(db, 'debug/lastConnection'), {
    connectedAt: Date.now(),
  })
}
