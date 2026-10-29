import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore targeting the custom databaseId if configured
export const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId || '(default)');

// Initialize Firebase Authentication
export const auth = getAuth(app);

export default app;
