import { initializeApp as initAdminApp, cert, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClientApp, getApps as getClientApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, User } from 'firebase/auth';
import {
  getFirestore as getClientFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  limit,
  orderBy,
} from 'firebase/firestore';
import fs from 'fs';

const PROJECT_ID = 'speedy-park-5tsmh';
const DATABASE_ID = 'ai-studio-107a95b1-246c-442f-8759-d6b4af62ee08';
const API_KEY = 'AIzaSyBWkGKEyPLOgZrD2KIiSsiMCo-1gFN_QAM';

// ---------------------------------------------------------------------------
// 1. Initialize Firebase Admin SDK ONLY IF FIREBASE_SERVICE_ACCOUNT_KEY is set
// ---------------------------------------------------------------------------
let adminDb: FirebaseFirestore.Firestore | null = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    let credential;
    const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (fs.existsSync(keyEnv)) {
      credential = cert(JSON.parse(fs.readFileSync(keyEnv, 'utf8')));
    } else {
      credential = cert(JSON.parse(keyEnv));
    }

    const existingAdminApps = getAdminApps();
    const adminApp = existingAdminApps.length > 0
      ? existingAdminApps[0]
      : initAdminApp(
          { credential, projectId: PROJECT_ID },
          'slms-admin-instance'
        );

    adminDb = getAdminFirestore(adminApp, DATABASE_ID);
  } catch (e: any) {
    console.warn('Firebase Admin SDK initialization notice:', e.message);
    adminDb = null;
  }
}

// ---------------------------------------------------------------------------
// 2. Initialize Firebase Client SDK & Auth for Zero-Key Server Authentication
// ---------------------------------------------------------------------------
const existingClientApps = getClientApps();
const clientApp = existingClientApps.length > 0
  ? existingClientApps[0]
  : initClientApp({
      apiKey: API_KEY,
      projectId: PROJECT_ID,
    }, 'slms-client-instance');

const clientDb = getClientFirestore(clientApp, DATABASE_ID);
const serverAuth = getAuth(clientApp);
let serverAuthPromise: Promise<User | null> | null = null;
let loggedAuthSuccessOnce = false;

// Custom 503 error class when service account is not authenticated
export class ServiceUnavailableError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.statusCode = 503;
  }
}

// Helper sleep function for backoff
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ensureServerAuthenticated(retries = 3): Promise<User> {
  const email = process.env.SYSTEM_SERVICE_EMAIL;
  const password = process.env.SYSTEM_SERVICE_PASSWORD;

  if (!email || !password) {
    throw new ServiceUnavailableError('System service credentials (SYSTEM_SERVICE_EMAIL / SYSTEM_SERVICE_PASSWORD) not configured on server.');
  }

  if (serverAuth.currentUser) {
    return serverAuth.currentUser;
  }

  if (!serverAuthPromise) {
    serverAuthPromise = (async () => {
      let lastError: any = null;
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const cred = await signInWithEmailAndPassword(serverAuth, email.trim(), password);
          if (!loggedAuthSuccessOnce) {
            console.log(`Server authenticated as system service user. UID: ${cred.user.uid}`);
            loggedAuthSuccessOnce = true;
          }
          return cred.user;
        } catch (err: any) {
          lastError = err;
          console.warn(`Server authentication attempt ${attempt}/${retries} failed: ${err.message}`);
          if (attempt < retries) {
            await sleep(attempt * 500); // Backoff: 500ms, 1000ms
          }
        }
      }
      serverAuthPromise = null;
      throw new ServiceUnavailableError(`Authentication service unavailable: Unable to authenticate system service user (${lastError?.message || 'timeout'}).`);
    })();
  }

  const user = await serverAuthPromise;
  if (!user) {
    throw new ServiceUnavailableError('Authentication service unavailable: Server system user session inactive.');
  }
  return user;
}

// ---------------------------------------------------------------------------
// 3. Robust Data Access Methods (Awaiting ensureServerAuthenticated first)
// ---------------------------------------------------------------------------

export async function getStudentDoc(docId: string): Promise<{ id: string; data: any } | null> {
  if (adminDb) {
    try {
      const snap = await adminDb.collection('students').doc(docId).get();
      if (snap.exists) {
        return { id: snap.id, data: snap.data() };
      }
      return null;
    } catch (e: any) {
      console.warn('Admin SDK getStudentDoc fallback to Client SDK:', e.message);
    }
  }

  await ensureServerAuthenticated();
  const snap = await getDoc(doc(clientDb, 'students', docId));
  if (snap.exists()) {
    return { id: snap.id, data: snap.data() };
  }
  return null;
}

export async function findStudentByIdentifier(identifier: string): Promise<{ id: string; data: any } | null> {
  const clean = identifier.trim();
  const upper = clean.toUpperCase();
  const lower = clean.toLowerCase();

  // Try direct doc ID first
  const direct = await getStudentDoc(clean);
  if (direct) return direct;

  if (adminDb) {
    try {
      const col = adminDb.collection('students');
      const queries = [
        col.where('studentId', '==', upper).limit(1).get(),
        col.where('studentId', '==', clean).limit(1).get(),
        col.where('membershipId', '==', upper).limit(1).get(),
        col.where('membershipId', '==', clean).limit(1).get(),
        col.where('email', '==', lower).limit(1).get(),
        col.where('email', '==', clean).limit(1).get(),
        col.where('mobile', '==', clean).limit(1).get(),
      ];
      const results = await Promise.all(queries);
      for (const res of results) {
        if (!res.empty) {
          const docSnap = res.docs[0];
          return { id: docSnap.id, data: docSnap.data() };
        }
      }
      return null;
    } catch (e: any) {
      console.warn('Admin SDK findStudentByIdentifier fallback to Client SDK:', e.message);
    }
  }

  // Fallback to client SDK
  await ensureServerAuthenticated();
  const colRef = collection(clientDb, 'students');
  const queries = [
    getDocs(query(colRef, where('studentId', '==', upper), limit(1))),
    getDocs(query(colRef, where('studentId', '==', clean), limit(1))),
    getDocs(query(colRef, where('membershipId', '==', upper), limit(1))),
    getDocs(query(colRef, where('membershipId', '==', clean), limit(1))),
    getDocs(query(colRef, where('email', '==', lower), limit(1))),
    getDocs(query(colRef, where('email', '==', clean), limit(1))),
    getDocs(query(colRef, where('mobile', '==', clean), limit(1))),
  ];
  const results = await Promise.all(queries);
  for (const res of results) {
    if (!res.empty) {
      const docSnap = res.docs[0];
      return { id: docSnap.id, data: docSnap.data() };
    }
  }
  return null;
}

export async function checkStudentDuplicates(
  studentId: string,
  course: string,
  semester: string,
  mobile: string,
  email: string
): Promise<{ duplicate: boolean; reason?: string }> {
  const cleanId = studentId.trim().toUpperCase();
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = mobile.trim();

  if (adminDb) {
    try {
      const col = adminDb.collection('students');
      const [rollSnap, mobileSnap, emailSnap] = await Promise.all([
        col.where('studentId', '==', cleanId).get(),
        col.where('mobile', '==', cleanMobile).limit(1).get(),
        col.where('email', '==', cleanEmail).limit(1).get(),
      ]);

      const academicDupe = rollSnap.docs.some((d) => {
        const data = d.data();
        return (
          data.course?.trim().toLowerCase() === course.trim().toLowerCase() &&
          data.semester?.trim().toLowerCase() === semester.trim().toLowerCase()
        );
      });

      if (academicDupe) {
        return { duplicate: true, reason: `Student Roll Number "${cleanId}" is already registered for ${course} (${semester}).` };
      }
      if (!mobileSnap.empty) {
        return { duplicate: true, reason: 'This mobile number is already registered with another student account.' };
      }
      if (!emailSnap.empty) {
        return { duplicate: true, reason: 'This email address is already associated with an existing student membership.' };
      }
      return { duplicate: false };
    } catch (e: any) {
      console.warn('Admin SDK duplicate check fallback to Client SDK:', e.message);
    }
  }

  // Client SDK
  await ensureServerAuthenticated();
  const colRef = collection(clientDb, 'students');
  const [rollSnap, mobileSnap, emailSnap] = await Promise.all([
    getDocs(query(colRef, where('studentId', '==', cleanId))),
    getDocs(query(colRef, where('mobile', '==', cleanMobile), limit(1))),
    getDocs(query(colRef, where('email', '==', cleanEmail), limit(1))),
  ]);

  const academicDupe = rollSnap.docs.some((d) => {
    const data = d.data();
    return (
      data.course?.trim().toLowerCase() === course.trim().toLowerCase() &&
      data.semester?.trim().toLowerCase() === semester.trim().toLowerCase()
    );
  });

  if (academicDupe) {
    return { duplicate: true, reason: `Student Roll Number "${cleanId}" is already registered for ${course} (${semester}).` };
  }
  if (!mobileSnap.empty) {
    return { duplicate: true, reason: 'This mobile number is already registered with another student account.' };
  }
  if (!emailSnap.empty) {
    return { duplicate: true, reason: 'This email address is already associated with an existing student membership.' };
  }
  return { duplicate: false };
}

export async function insertStudentDoc(docId: string, studentData: any): Promise<void> {
  if (adminDb) {
    try {
      await adminDb.collection('students').doc(docId).set(studentData);
      return;
    } catch (e: any) {
      console.warn('Admin SDK insertStudentDoc fallback to Client SDK:', e.message);
    }
  }
  await ensureServerAuthenticated();
  await setDoc(doc(clientDb, 'students', docId), studentData);
}

export async function updateStudentFields(docId: string, fields: any): Promise<void> {
  if (adminDb) {
    try {
      await adminDb.collection('students').doc(docId).update(fields);
      return;
    } catch (e: any) {
      console.warn('Admin SDK updateStudentFields fallback to Client SDK:', e.message);
    }
  }
  await ensureServerAuthenticated();
  await updateDoc(doc(clientDb, 'students', docId), fields);
}

export async function getStudentVisits(studentId: string, limitCount = 50): Promise<{ visits: any[]; totalCount: number }> {
  let visits: any[] = [];
  let totalCount = 0;

  if (adminDb) {
    try {
      const col = adminDb.collection('library_visits');
      const q = col.where('studentId', '==', studentId).orderBy('entryTimestamp', 'desc').limit(limitCount);
      const [snap, countSnap] = await Promise.all([
        q.get(),
        col.where('studentId', '==', studentId).count().get(),
      ]);
      visits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      totalCount = countSnap.data().count;
      return { visits, totalCount };
    } catch (e: any) {
      console.warn('Admin SDK getStudentVisits fallback to Client SDK:', e.message);
    }
  }

  // Client SDK
  await ensureServerAuthenticated();
  try {
    const colRef = collection(clientDb, 'library_visits');
    const q = query(
      colRef,
      where('studentId', '==', studentId),
      orderBy('entryTimestamp', 'desc'),
      limit(limitCount)
    );
    const [snap, countSnap] = await Promise.all([
      getDocs(q),
      getCountFromServer(query(colRef, where('studentId', '==', studentId))),
    ]);
    visits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    totalCount = countSnap.data().count;
  } catch (err) {
    // In case index building
    const fallbackQ = query(
      collection(clientDb, 'library_visits'),
      where('studentId', '==', studentId),
      limit(limitCount)
    );
    const snap = await getDocs(fallbackQ);
    visits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    visits.sort((a, b) => (b.entryTimestamp || 0) - (a.entryTimestamp || 0));
    totalCount = visits.length;
  }

  return { visits, totalCount };
}

export async function getStudentLoans(studentId: string, limitCount = 50): Promise<{ transactions: any[]; totalCount: number }> {
  let transactions: any[] = [];
  let totalCount = 0;

  if (adminDb) {
    try {
      const col = adminDb.collection('book_transactions');
      const q = col.where('studentId', '==', studentId).orderBy('issueTimestamp', 'desc').limit(limitCount);
      const [snap, countSnap] = await Promise.all([
        q.get(),
        col.where('studentId', '==', studentId).count().get(),
      ]);
      transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      totalCount = countSnap.data().count;
      return { transactions, totalCount };
    } catch (e: any) {
      console.warn('Admin SDK getStudentLoans fallback to Client SDK:', e.message);
    }
  }

  // Client SDK
  await ensureServerAuthenticated();
  try {
    const colRef = collection(clientDb, 'book_transactions');
    const q = query(
      colRef,
      where('studentId', '==', studentId),
      orderBy('issueTimestamp', 'desc'),
      limit(limitCount)
    );
    const [snap, countSnap] = await Promise.all([
      getDocs(q),
      getCountFromServer(query(colRef, where('studentId', '==', studentId))),
    ]);
    transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    totalCount = countSnap.data().count;
  } catch (err) {
    const fallbackQ = query(
      collection(clientDb, 'book_transactions'),
      where('studentId', '==', studentId),
      limit(limitCount)
    );
    const snap = await getDocs(fallbackQ);
    transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    transactions.sort((a, b) => (b.issueTimestamp || 0) - (a.issueTimestamp || 0));
    totalCount = transactions.length;
  }

  return { transactions, totalCount };
}

export async function getActiveStudentLoans(studentId: string): Promise<any[]> {
  if (adminDb) {
    try {
      const cleanId = studentId.trim().toUpperCase();
      const snap = await adminDb
        .collection('book_transactions')
        .where('studentId', '==', cleanId)
        .where('status', '==', 'Issued')
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e: any) {
      console.warn('Admin SDK getActiveStudentLoans fallback to Client SDK:', e.message);
    }
  }

  await ensureServerAuthenticated();
  const cleanId = studentId.trim().toUpperCase();
  const colRef = collection(clientDb, 'book_transactions');
  const q = query(
    colRef,
    where('studentId', '==', cleanId),
    where('status', '==', 'Issued')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getLivePresenceCount(): Promise<number> {
  if (adminDb) {
    try {
      const snap = await adminDb.collection('students').where('isInside', '==', true).count().get();
      return snap.data().count;
    } catch (e: any) {
      console.warn('Admin SDK live presence fallback to Client SDK:', e.message);
    }
  }

  await ensureServerAuthenticated();
  try {
    const snap = await getCountFromServer(
      query(collection(clientDb, 'students'), where('isInside', '==', true))
    );
    return snap.data().count;
  } catch {
    const snap = await getDocs(
      query(collection(clientDb, 'students'), where('isInside', '==', true), limit(500))
    );
    return snap.size;
  }
}
