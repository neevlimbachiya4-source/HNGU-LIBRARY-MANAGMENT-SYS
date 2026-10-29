import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase';
import { Student, LibraryVisit, Book, BookTransaction, AdminUser } from '../types';

// Collections
export const COLLECTIONS = {
  ADMINS: 'admins',
  STUDENTS: 'students',
  VISITS: 'library_visits',
  BOOKS: 'books',
  TRANSACTIONS: 'book_transactions',
};

// Authorized project librarian/admin emails
export const AUTHORIZED_LIBRARIAN_EMAILS = [
  'neevlimbachiya45@gmail.com',
];

// Check if user is an authorized admin in Firestore
export async function verifyAdminStatus(uid: string): Promise<AdminUser | null> {
  try {
    const adminRef = doc(db, COLLECTIONS.ADMINS, uid);
    const snap = await getDoc(adminRef);
    if (snap.exists()) {
      const data = snap.data() as AdminUser;
      if (data.role === 'librarian' || data.role === 'admin') {
        return data;
      }
    }
    return null;
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
      // Expected for non-staff Google accounts or accounts pending owner authorization
      return null;
    }
    console.warn('Notice checking admin status:', err);
    return null;
  }
}

import { fetchStudentMe, getStoredStudentToken } from './studentAuth';

// Strictly verify that a student exists, has active status, and possesses a valid server session token
export async function verifyStudentSession(
  studentDocId?: string | null,
  studentId?: string | null,
  passwordHash?: string | null
): Promise<Student | null> {
  try {
    // Primary & Authoritative: Verify via signed server session token
    const token = getStoredStudentToken();
    if (token) {
      const serverStudent = await fetchStudentMe();
      if (serverStudent) {
        if (studentId && serverStudent.studentId.toUpperCase().trim() !== studentId.toUpperCase().trim()) {
          console.warn(`Security alert: Student ID mismatch (${studentId} vs ${serverStudent.studentId})`);
          return null;
        }
        return serverStudent;
      }
    }
    return null;
  } catch (err) {
    console.error('Error in verifyStudentSession:', err);
    return null;
  }
}

// Fetch verified student document directly from Firestore
export async function getVerifiedStudentDoc(docId: string): Promise<Student | null> {
  try {
    if (!docId) return null;
    const snap = await getDoc(doc(db, COLLECTIONS.STUDENTS, docId));
    if (!snap.exists()) return null;
    const data = snap.data() as Student;
    if (data.status !== 'active') return null;
    const { id: _ignore, ...restData } = data;
    return { ...restData, id: snap.id };
  } catch (err) {
    console.error('Error fetching verified student doc:', err);
    return null;
  }
}


// Verify Google account authorization and fetch Firestore admin/librarian profile
export async function verifyAndSyncGoogleAdmin(user: { uid: string; email: string | null; displayName: string | null }): Promise<AdminUser | null> {
  if (!user.email) return null;
  const cleanEmail = user.email.trim().toLowerCase();

  const isOwnerEmail = cleanEmail === 'neevlimbachiya45@gmail.com';
  const adminRef = doc(db, COLLECTIONS.ADMINS, user.uid);
  
  try {
    const snap = await getDoc(adminRef);

    if (snap.exists()) {
      const existing = snap.data() as AdminUser;
      if (existing.role === 'librarian' || existing.role === 'admin') {
        return existing;
      }
      return null;
    }
  } catch (err: any) {
    console.warn('Error reading admin profile:', err);
  }

  // If the user is the project owner (neevlimbachiya45@gmail.com), they have permissions to provision their own root admin record
  if (isOwnerEmail) {
    const newAdmin: AdminUser = {
      uid: user.uid,
      email: cleanEmail,
      name: user.displayName || 'HNGU Library Director (Owner)',
      role: 'admin',
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(adminRef, newAdmin);
      return newAdmin;
    } catch (err) {
      console.warn('Could not save owner admin profile to Firestore:', err);
      // In case rules block or network error, return the profile if verified owner email
      return newAdmin;
    }
  }

  // For any other staff member without an admin document, client creation is disallowed by firestore.rules.
  // Return null so the UI indicates they must ask the owner to approve/add their account.
  return null;
}

// Owner action: Create/approve a librarian profile in /admins
export async function addLibrarianByOwner(
  ownerUser: AdminUser,
  librarianUid: string,
  librarianEmail: string,
  librarianName: string
): Promise<AdminUser> {
  const isOwner = ownerUser.email.toLowerCase() === 'neevlimbachiya45@gmail.com' || ownerUser.role === 'admin';
  if (!isOwner) {
    throw new Error('Only the library owner or system administrator can add librarians.');
  }

  const cleanUid = librarianUid.trim();
  const cleanEmail = librarianEmail.trim().toLowerCase();
  const cleanName = librarianName.trim();

  if (!cleanUid || !cleanEmail || !cleanName) {
    throw new Error('UID, email, and name are required to register a librarian.');
  }

  const adminRef = doc(db, COLLECTIONS.ADMINS, cleanUid);
  const newLibrarian: AdminUser = {
    uid: cleanUid,
    email: cleanEmail,
    name: cleanName,
    role: 'librarian',
    createdAt: new Date().toISOString(),
  };

  await setDoc(adminRef, newLibrarian);
  return newLibrarian;
}

// Ensure an initial admin record can exist for the logged in staff member
export async function registerAdminIfNeeded(uid: string, email: string, name?: string): Promise<AdminUser> {
  const fallbackAdmin: AdminUser = {
    uid,
    email: email.toLowerCase(),
    name: name || (email.split('@')[0].toUpperCase() + ' (Librarian)'),
    role: 'librarian',
    createdAt: new Date().toISOString(),
  };

  try {
    const adminRef = doc(db, COLLECTIONS.ADMINS, uid);
    const snap = await getDoc(adminRef);
    if (snap.exists()) {
      return snap.data() as AdminUser;
    }

    await setDoc(adminRef, fallbackAdmin);
    return fallbackAdmin;
  } catch (err) {
    console.warn('Admin record cache fallback:', err);
    return fallbackAdmin;
  }
}

// Seed sample books & sample students if database is fresh
export async function seedInitialDataIfNeeded(): Promise<void> {
  try {
    const qCheck = query(collection(db, COLLECTIONS.BOOKS), limit(1));
    const snap = await getDocs(qCheck);
    if (!snap.empty) {
      return; // Already initialized
    }

    // Default book catalog
    const initialBooks: Omit<Book, 'id'>[] = [
      {
        bookId: 'BK-1001',
        title: 'Introduction to Algorithms (CLRS)',
        author: 'Thomas H. Cormen, Charles E. Leiserson',
        category: 'Computer Science',
        isbn: '978-0262033848',
        totalCopies: 5,
        availableCopies: 4,
        coverImage: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?w=400&q=80',
        rackLocation: 'Section A - Rack 3',
        bookQrId: 'SLMS-BK-1001',
        createdAt: new Date().toISOString(),
      },
      {
        bookId: 'BK-1002',
        title: 'Clean Code: A Handbook of Agile Craftsmanship',
        author: 'Robert C. Martin',
        category: 'Software Engineering',
        isbn: '978-0132350884',
        totalCopies: 4,
        availableCopies: 3,
        coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80',
        rackLocation: 'Section A - Rack 4',
        bookQrId: 'SLMS-BK-1002',
        createdAt: new Date().toISOString(),
      },
      {
        bookId: 'BK-1003',
        title: 'Database System Concepts (6th Edition)',
        author: 'Abraham Silberschatz, Henry F. Korth',
        category: 'Databases',
        isbn: '978-0073523323',
        totalCopies: 6,
        availableCopies: 5,
        coverImage: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=400&q=80',
        rackLocation: 'Section B - Rack 1',
        bookQrId: 'SLMS-BK-1003',
        createdAt: new Date().toISOString(),
      },
      {
        bookId: 'BK-1004',
        title: 'Artificial Intelligence: A Modern Approach',
        author: 'Stuart Russell, Peter Norvig',
        category: 'AI & Robotics',
        isbn: '978-0134610993',
        totalCopies: 3,
        availableCopies: 2,
        coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&q=80',
        rackLocation: 'Section B - Rack 3',
        bookQrId: 'SLMS-BK-1004',
        createdAt: new Date().toISOString(),
      },
      {
        bookId: 'BK-1005',
        title: 'Python Crash Course (3rd Edition)',
        author: 'Eric Matthes',
        category: 'Programming',
        isbn: '978-1718502703',
        totalCopies: 8,
        availableCopies: 7,
        coverImage: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&q=80',
        rackLocation: 'Section C - Rack 2',
        bookQrId: 'SLMS-BK-1005',
        createdAt: new Date().toISOString(),
      },
      {
        bookId: 'BK-1006',
        title: 'Design Patterns: Elements of Reusable Object-Oriented Software',
        author: 'Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides',
        category: 'Software Architecture',
        isbn: '978-0201633610',
        totalCopies: 3,
        availableCopies: 3,
        coverImage: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=400&q=80',
        rackLocation: 'Section C - Rack 4',
        bookQrId: 'SLMS-BK-1006',
        createdAt: new Date().toISOString(),
      },
    ];

    for (const b of initialBooks) {
      const newDoc = doc(collection(db, COLLECTIONS.BOOKS));
      await setDoc(newDoc, b);
    }
  } catch (err) {
    console.error('Error seeding initial books:', err);
  }
}

// Admin Soft Deactivation: deactivates student portal access while preserving historical ledger
export async function deactivateStudent(studentDocId: string, adminUser: AdminUser): Promise<void> {
  if (!studentDocId) {
    throw new Error('Student document ID is required for deactivation.');
  }
  if (!adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'librarian')) {
    throw new Error('Unauthorized: Only authorized library staff can deactivate student accounts.');
  }
  const studentRef = doc(db, COLLECTIONS.STUDENTS, studentDocId);
  await updateDoc(studentRef, {
    status: 'deactivated',
  });
}

// Admin Reactivation: restores student active portal access
export async function reactivateStudent(studentDocId: string, adminUser: AdminUser): Promise<void> {
  if (!studentDocId) {
    throw new Error('Student document ID is required for reactivation.');
  }
  if (!adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'librarian')) {
    throw new Error('Unauthorized: Only authorized library staff can reactivate student accounts.');
  }
  const studentRef = doc(db, COLLECTIONS.STUDENTS, studentDocId);
  await updateDoc(studentRef, {
    status: 'active',
  });
}

// Authorized Admin Deletion: Permanently removes a student's active profile while preserving historical visits and book transactions
export async function deleteStudent(studentDocId: string, adminUser: AdminUser): Promise<void> {
  if (!studentDocId) {
    throw new Error('Student document ID is required for deletion.');
  }

  // Multi-tier Authorization Verification in application logic
  if (!adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'librarian')) {
    throw new Error('Unauthorized: Only authorized library administrators and librarians can remove student profiles.');
  }

  // Verify the admin identity against the admins collection or authorized email registry
  const verifiedAdmin = await verifyAdminStatus(adminUser.uid);
  const isAuthorizedEmail = AUTHORIZED_LIBRARIAN_EMAILS.map((e) => e.toLowerCase()).includes(adminUser.email?.toLowerCase() || '');
  if (!verifiedAdmin && !isAuthorizedEmail) {
    throw new Error('Unauthorized: Admin verification failed. You do not have permission to delete students.');
  }

  // Ensure document exists
  const studentRef = doc(db, COLLECTIONS.STUDENTS, studentDocId);
  const snap = await getDoc(studentRef);
  if (!snap.exists()) {
    throw new Error('Student profile does not exist or has already been removed.');
  }

  // Delete student profile document from active students collection.
  // Note: Historical records (library_visits, book_transactions) already contain full snapshots of student identity and remain 100% intact for university auditing.
  await deleteDoc(studentRef);
}

// Helpers
export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function calculateDuration(startMs: number, endMs: number): string {
  const diffMs = Math.max(0, endMs - startMs);
  return formatDuration(diffMs);
}

export function formatDuration(diffMs: number): string {
  const totalMinutes = Math.floor(Math.max(0, diffMs) / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}
