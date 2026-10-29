export interface Student {
  id: string; // Firestore document ID
  name: string;
  studentId: string; // Roll number / Unique student ID e.g. "STU-2026-104"
  college: string;
  course: string;
  department: string;
  semester: string;
  mobile: string;
  email: string;
  passwordHash?: string; // Stored library credential
  photo: string; // Base64 data URL or photo URL
  personalQrId: string; // Unique QR Token e.g. "SLMS-STU-8F9E2A1C"
  membershipId: string; // e.g. "LIB-2026-9042"
  role?: 'student';
  status: 'active' | 'blocked' | 'deactivated';
  isInside: boolean;
  currentVisitId?: string | null;
  createdAt: string; // ISO String
  lastVisitAt?: string | null;
}

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  role: 'librarian' | 'admin';
  createdAt?: string;
}

export interface LibraryVisit {
  id: string;
  studentId: string;
  studentDocId: string;
  studentName: string;
  studentDepartment?: string;
  studentPhoto?: string;
  entryDate: string; // e.g., "26 Sep 2026"
  entryTime: string; // e.g., "10:05 AM"
  entryTimestamp: number; // epoch ms
  exitDate?: string | null;
  exitTime?: string | null;
  exitTimestamp?: number | null;
  duration?: string | null; // e.g. "2h 15m" or "45m"
  active: boolean; // true if student currently inside
}

export interface Book {
  id: string;
  bookId: string; // e.g. "BK-1001"
  title: string;
  author: string;
  category: string;
  isbn: string;
  totalCopies: number;
  availableCopies: number;
  coverImage?: string;
  rackLocation?: string;
  bookQrId: string; // e.g. "SLMS-BK-1001"
  createdAt: string;
}

export interface BookTransaction {
  id: string;
  studentId: string; // Roll / ID
  studentDocId: string;
  studentName: string;
  studentEmail: string;
  bookId: string; // e.g. "BK-1001"
  bookDocId: string;
  bookTitle: string;
  bookAuthor: string;
  issueDate: string; // e.g. "26 Sep 2026"
  issueTime: string; // e.g. "10:15 AM"
  issueTimestamp: number;
  dueDate: string; // e.g. "10 Oct 2026"
  dueTimestamp?: number;
  returnDate?: string | null;
  returnTime?: string | null;
  returnTimestamp?: number | null;
  status: 'Issued' | 'Returned' | 'Overdue';
}
