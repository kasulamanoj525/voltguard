import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  set
} from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const configured = Object.values(firebaseConfig).every(Boolean);

let db = null;

if (configured) {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
}

export const firebaseReady = configured;

export function subscribeLive(callback) {
  if (!db) return () => {};

  return onValue(
    ref(db, "energyMonitor/live"),
    (snapshot) => {
      callback(snapshot.val());
    }
  );
}

export function subscribeSettings(callback) {
  if (!db) return () => {};

  return onValue(
    ref(db, "energyMonitor/settings"),
    (snapshot) => {
      callback(snapshot.val());
    }
  );
}

export function subscribeControl(callback) {
  if (!db) return () => {};

  return onValue(
    ref(db, "energyMonitor/control"),
    (snapshot) => {
      callback(snapshot.val());
    }
  );
}

export async function writeLoad(value) {
  if (!db) return;

  await set(
    ref(db, "energyMonitor/control/load"),
    value
  );
}

export async function writeSettings(settings) {
  if (!db) return;

  await set(
    ref(db, "energyMonitor/settings"),
    settings
  );
}