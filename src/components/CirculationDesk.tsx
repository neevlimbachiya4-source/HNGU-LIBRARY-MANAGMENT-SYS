import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COLLECTIONS, formatDate, formatTime } from '../lib/dbService';
import { Student, Book, BookTransaction, AdminUser } from '../types';
import { QrScannerModal } from './QrScannerModal';
import {
  BookOpen,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  User,
  Lock,
  ShieldCheck,
  Search,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CirculationDeskProps {
  adminUser?: AdminUser | null;
  currentStudent?: Student | null;
  onOpenAdminLogin?: () => void;
  onBackToHome?: () => void;
}

export const CirculationDesk: React.FC<CirculationDeskProps> = ({
  adminUser,
  currentStudent,
  onOpenAdminLogin,
  onBackToHome,
}) => {
  const [mode, setMode] = useState<'issue' | 'return'>('issue');
  const [scannerTarget, setScannerTarget] = useState<'student' | 'book' | null>(null);

  // Issue workflow state
  const [scannedStudent, setScannedStudent] = useState<Student | null>(null);
  const [scannedBook, setScannedBook] = useState<Book | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Return workflow state
  const [, setReturnSelectedTx] = useState<BookTransaction | null>(null);
  const [returnSearch, setReturnSearch] = useState('');

  // Real-time collections for validation
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [activeTransactions, setActiveTransactions] = useState<BookTransaction[]>([]);

  useEffect(() => {
    if (!adminUser) {
      setAllStudents([]);
      setAllBooks([]);
      setActiveTransactions([]);
      return;
    }

    let isMounted = true;
    const fetchQuickPickSamples = async () => {
      try {
        const qStudents = query(collection(db, COLLECTIONS.STUDENTS), limit(30));
        const sSnap = await getDocs(qStudents);
        if (isMounted) {
          setAllStudents(sSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)));
        }

        const qBooks = query(collection(db, COLLECTIONS.BOOKS), limit(30));
        const bSnap = await getDocs(qBooks);
        if (isMounted) {
          setAllBooks(bSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Book)));
        }
      } catch (err) {
        console.warn('Error fetching quick-pick samples in circulation:', err);
      }
    };
    fetchQuickPickSamples();

    // Listen only to active issued loans (single equality condition, zero composite index needed)
    const qTx = query(collection(db, COLLECTIONS.TRANSACTIONS), where('status', '==', 'Issued'));
    const unsubTx = onSnapshot(qTx, (snap) => {
      setActiveTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookTransaction)));
    });

    return () => {
      isMounted = false;
      unsubTx();
    };
  }, [adminUser]);

  // Handle scanned QR tokens
  const handleQrScanned = async (token: string) => {
    const cleanToken = token.trim();
    setStatusMessage(null);

    if (scannerTarget === 'student') {
      // Find student using truly unique identifiers first
      let found: Student | null = null;

      // 1. Check quick-pick list in memory
      const targetDocId = cleanToken.startsWith('SLMS-STU-') ? cleanToken.replace('SLMS-STU-', '') : cleanToken;
      found =
        allStudents.find(
          (s) =>
            s.personalQrId === cleanToken ||
            s.id === targetDocId ||
            s.id === cleanToken ||
            s.membershipId === cleanToken
        ) || null;

      // 2. Direct Firestore targeted lookups if not present in quick-pick cache
      if (!found) {
        try {
          const qQr = query(collection(db, COLLECTIONS.STUDENTS), where('personalQrId', '==', cleanToken), limit(1));
          const sQr = await getDocs(qQr);
          if (!sQr.empty) {
            found = { id: sQr.docs[0].id, ...sQr.docs[0].data() } as Student;
          }
        } catch (e) {}
      }

      if (!found && targetDocId) {
        try {
          const dSnap = await getDoc(doc(db, COLLECTIONS.STUDENTS, targetDocId));
          if (dSnap.exists()) {
            found = { id: dSnap.id, ...dSnap.data() } as Student;
          }
        } catch (e) {}
      }

      if (!found) {
        try {
          const qMem = query(collection(db, COLLECTIONS.STUDENTS), where('membershipId', '==', cleanToken), limit(1));
          const sMem = await getDocs(qMem);
          if (!sMem.empty) {
            found = { id: sMem.docs[0].id, ...sMem.docs[0].data() } as Student;
          }
        } catch (e) {}
      }

      // 3. Fallback: match by roll number if exactly one student has this roll number
      if (!found) {
        const matchesByRoll = allStudents.filter(
          (s) => s.studentId.toUpperCase() === cleanToken.toUpperCase()
        );
        if (matchesByRoll.length === 1) {
          found = matchesByRoll[0];
        } else if (matchesByRoll.length > 1) {
          setStatusMessage({
            type: 'error',
            text: `AMBIGUOUS ROLL: Multiple students share Roll "${cleanToken.toUpperCase()}" across different academic courses. Please scan student's unique Personal QR pass.`,
          });
          setScannerTarget(null);
          return;
        } else {
          try {
            const qRoll = query(collection(db, COLLECTIONS.STUDENTS), where('studentId', '==', cleanToken.toUpperCase()), limit(2));
            const sRoll = await getDocs(qRoll);
            if (sRoll.docs.length === 1) {
              found = { id: sRoll.docs[0].id, ...sRoll.docs[0].data() } as Student;
            } else if (sRoll.docs.length > 1) {
              setStatusMessage({
                type: 'error',
                text: `AMBIGUOUS ROLL: Multiple students share Roll "${cleanToken.toUpperCase()}" across different academic courses. Please scan student's unique Personal QR pass.`,
              });
              setScannerTarget(null);
              return;
            }
          } catch (e) {}
        }
      }

      if (found) {
        setAllStudents((prev) => (prev.some((s) => s.id === found!.id) ? prev : [found!, ...prev]));
        if (found.status === 'blocked') {
          setStatusMessage({
            type: 'error',
            text: `BORROWING SUSPENDED: Student "${found.name}" is blocked by HNGU administration. Cannot issue books.`,
          });
          setScannedStudent(null);
        } else {
          setScannedStudent(found);
          setStatusMessage({
            type: 'success',
            text: `VERIFIED STUDENT: ${found.name} (${found.studentId}) selected for circulation checkout.`,
          });
        }
      } else {
        const isStudentToken = cleanToken.startsWith('SLMS-STU-') || cleanToken.startsWith('SLMS-MEM-');
        setStatusMessage({
          type: 'error',
          text: isStudentToken ? 'Student profile is no longer active.' : `Student pass token "${cleanToken}" not found in HNGU registry.`,
        });
      }
      setScannerTarget(null);
    } else if (scannerTarget === 'book') {
      const normToken = cleanToken.trim();
      const upperToken = normToken.toUpperCase();
      const cleanIsbnToken = normToken.replace(/[-\s]/g, '');

      // Extract raw book ID suffix if token starts with SLMS-BK-
      let rawBookIdSuffix = '';
      if (upperToken.startsWith('SLMS-BK-')) {
        rawBookIdSuffix = normToken.slice(8).trim();
      }

      let found: Book | null = null;
      for (const b of allBooks) {
        const bQr = (b.bookQrId || '').trim();
        const bId = (b.bookId || '').trim();
        const bDocId = (b.id || '').trim();
        const bIsbn = (b.isbn || '').trim().replace(/[-\s]/g, '');

        if (
          // 1. Direct match on bookQrId (e.g. SLMS-BK-1001, SLMS-BK-BK-1001)
          (bQr && (bQr === normToken || bQr.toUpperCase() === upperToken)) ||
          // 2. Direct match on bookId (e.g. BK-1001)
          (bId && (bId === normToken || bId.toUpperCase() === upperToken)) ||
          // 3. Direct match on Firestore document ID
          (bDocId && bDocId === normToken) ||
          // 4. Match extracted raw book ID from SLMS-BK-${bookId}
          (rawBookIdSuffix && (
            bId.toUpperCase() === rawBookIdSuffix.toUpperCase() ||
            bId.toUpperCase() === ('BK-' + rawBookIdSuffix).toUpperCase() ||
            bDocId === rawBookIdSuffix
          )) ||
          // 5. Match if cleanToken is bookId and b.bookQrId is 'SLMS-BK-' + cleanToken
          (bQr && bQr.toUpperCase() === ('SLMS-BK-' + upperToken)) ||
          // 6. Match ISBN if present
          (bIsbn && cleanIsbnToken && bIsbn === cleanIsbnToken)
        ) {
          found = b;
          break;
        }
      }

      // Targeted Firestore queries if book is not in initial sample
      if (!found) {
        try {
          const qQr = query(collection(db, COLLECTIONS.BOOKS), where('bookQrId', '==', normToken), limit(1));
          const sQr = await getDocs(qQr);
          if (!sQr.empty) found = { id: sQr.docs[0].id, ...sQr.docs[0].data() } as Book;
        } catch (e) {}
      }

      if (!found && rawBookIdSuffix) {
        try {
          const qQrSuff = query(collection(db, COLLECTIONS.BOOKS), where('bookQrId', '==', `SLMS-BK-${rawBookIdSuffix}`), limit(1));
          const sQrSuff = await getDocs(qQrSuff);
          if (!sQrSuff.empty) found = { id: sQrSuff.docs[0].id, ...sQrSuff.docs[0].data() } as Book;
        } catch (e) {}
      }

      if (!found) {
        try {
          const qId = query(collection(db, COLLECTIONS.BOOKS), where('bookId', '==', upperToken), limit(1));
          const sId = await getDocs(qId);
          if (!sId.empty) found = { id: sId.docs[0].id, ...sId.docs[0].data() } as Book;
        } catch (e) {}
      }

      if (!found && cleanIsbnToken) {
        try {
          const qIsbn = query(collection(db, COLLECTIONS.BOOKS), where('isbn', '==', cleanIsbnToken), limit(1));
          const sIsbn = await getDocs(qIsbn);
          if (!sIsbn.empty) found = { id: sIsbn.docs[0].id, ...sIsbn.docs[0].data() } as Book;
        } catch (e) {}
      }

      if (!found) {
        try {
          const dSnap = await getDoc(doc(db, COLLECTIONS.BOOKS, normToken));
          if (dSnap.exists()) found = { id: dSnap.id, ...dSnap.data() } as Book;
        } catch (e) {}
      }

      if (found) {
        setAllBooks((prev) => (prev.some((b) => b.id === found!.id) ? prev : [found!, ...prev]));
        if (found.availableCopies <= 0) {
          setStatusMessage({
            type: 'error',
            text: `UNAVAILABLE: All physical copies of "${found.title}" (${found.bookId}) are currently issued.`,
          });
          setScannedBook(null);
        } else {
          setScannedBook(found);
          setStatusMessage({
            type: 'success',
            text: `BOOK IDENTIFIED: "${found.title}" (${found.availableCopies} available).`,
          });
        }
      } else {
        setStatusMessage({
          type: 'error',
          text: `Book identifier "${cleanToken}" not found in HNGU library catalog.`,
        });
      }
      setScannerTarget(null);
    }
  };

  // Issue Book Function
  const handleIssueBook = async () => {
    if (!adminUser) {
      setStatusMessage({
        type: 'error',
        text: 'Access Denied: Only authenticated library staff/admins can issue books to students.',
      });
      return;
    }

    if (!scannedStudent || !scannedBook) {
      setStatusMessage({
        type: 'error',
        text: 'Please scan both a student QR pass and a book barcode to complete circulation checkout.',
      });
      return;
    }

    if (scannedBook.availableCopies <= 0) {
      setStatusMessage({
        type: 'error',
        text: `Cannot issue "${scannedBook.title}". No available copies remaining on shelves.`,
      });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const now = new Date();
      const dueDate = new Date();
      dueDate.setDate(now.getDate() + 14); // 14 days loan period standard

      const txRef = doc(collection(db, COLLECTIONS.TRANSACTIONS));
      const newTx: Omit<BookTransaction, 'id'> = {
        studentId: scannedStudent.studentId,
        studentDocId: scannedStudent.id,
        studentName: scannedStudent.name,
        studentEmail: scannedStudent.email,
        bookId: scannedBook.bookId,
        bookDocId: scannedBook.id,
        bookTitle: scannedBook.title,
        bookAuthor: scannedBook.author,
        issueDate: formatDate(now),
        issueTime: formatTime(now),
        issueTimestamp: now.getTime(),
        dueDate: formatDate(dueDate),
        dueTimestamp: dueDate.getTime(),
        returnDate: null,
        returnTime: null,
        returnTimestamp: null,
        status: 'Issued',
      };

      await setDoc(txRef, newTx);

      // Decrement available copies
      const bookRef = doc(db, COLLECTIONS.BOOKS, scannedBook.id);
      await updateDoc(bookRef, {
        availableCopies: Math.max(0, scannedBook.availableCopies - 1),
      });

      confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });

      setStatusMessage({
        type: 'success',
        text: `SUCCESS: Issued "${scannedBook.title}" to ${scannedStudent.name}. Return due by ${formatDate(
          dueDate
        )}.`,
      });

      setScannedBook(null);
    } catch (err: any) {
      console.error('Issue book error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to complete book issue.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReturnBook = async (tx: BookTransaction) => {
    if (!adminUser) {
      setStatusMessage({
        type: 'error',
        text: 'Access Denied: Only authenticated library staff/admins can process book returns.',
      });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const now = new Date();
      await updateDoc(doc(db, COLLECTIONS.TRANSACTIONS, tx.id), {
        returnDate: formatDate(now),
        returnTime: formatTime(now),
        returnTimestamp: now.getTime(),
        status: 'Returned',
      });

      const bookDoc = allBooks.find((b) => b.bookId === tx.bookId || b.id === tx.bookDocId);
      if (bookDoc) {
        await updateDoc(doc(db, COLLECTIONS.BOOKS, bookDoc.id), {
          availableCopies: Math.min(bookDoc.totalCopies, bookDoc.availableCopies + 1),
        });
      }

      confetti({ particleCount: 35, spread: 50, origin: { y: 0.7 } });

      setStatusMessage({
        type: 'success',
        text: `SUCCESS: Processed return of "${tx.bookTitle}" from ${tx.studentName}. Inventory updated.`,
      });
      setReturnSelectedTx(null);
    } catch (err: any) {
      console.error('Return book error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to record return.',
      });
    } finally {
      setLoading(false);
    }
  };

  // If not signed in as librarian/admin, enforce access control restriction
  if (!adminUser) {
    return (
      <div className="w-full max-w-lg mx-auto py-12 px-4 animate-in fade-in duration-300">
        <div className="glass-panel-elevated rounded-3xl p-8 border border-[#D4AF37]/35 bg-white shadow-2xl text-center space-y-5 text-[#0B1F3A]">
          <div className="w-14 h-14 rounded-2xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center mx-auto shadow-md">
            <Lock className="w-7 h-7 text-[#D4AF37]" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#0B1F3A] font-extrabold">
              Access Control Enforcement
            </span>
            <h2 className="text-xl font-extrabold text-[#0B1F3A] mt-1">Librarian Authorization Required</h2>
            <p className="text-xs sm:text-sm text-[#0B1F3A] mt-2 leading-relaxed font-normal">
              {currentStudent
                ? `HNGU Security Policy: Students cannot issue or return books. Please present your Digital ID & Personal QR code (${currentStudent.studentId}) at the circulation counter to have a librarian issue or return your books.`
                : 'The Circulation Desk and checkout ledger are strictly restricted to authenticated HNGU Library staff members. Please log in with your authorized institutional Google account.'}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            {onOpenAdminLogin && (
              <button
                onClick={onOpenAdminLogin}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 text-[#F8F6F0] font-extrabold rounded-xl text-xs shadow-md border border-[#D4AF37] transition cursor-pointer flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                <span>Staff Portal Login</span>
              </button>
            )}
            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#F8F6F0] hover:bg-[#D4AF37]/15 text-[#0B1F3A] font-bold rounded-xl text-xs border border-[#D4AF37]/40 transition cursor-pointer"
              >
                Return to Campus Portal
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="rounded-2xl p-6 sm:p-7 border border-[#D4AF37]/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-2xl bg-[#0B1F3A] text-[#F8F6F0]">
        <div>
          <div className="text-[10px] font-mono text-[#D4AF37] font-extrabold uppercase tracking-widest mb-1.5">
            HNGU LIBRARY MANAGEMENT
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#F8F6F0] tracking-tight flex items-center gap-2.5 font-serif-academic">
            <div className="w-9 h-9 rounded-xl bg-[#071629] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-sm">
              <Clock className="w-4 h-4" />
            </div>
            <span>Circulation & Lending Counter</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#F8F6F0]/85 mt-1.5 font-normal">
            Issue and receive books via student QR token and shelf barcode scanning.
          </p>
        </div>

        {/* Toggle Mode Button */}
        <div className="flex p-1 rounded-xl bg-[#071629] border border-[#D4AF37]/40 shadow-md">
          <button
            onClick={() => {
              setMode('issue');
              setStatusMessage(null);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              mode === 'issue'
                ? 'bg-[#D4AF37] text-[#0B1F3A] shadow-sm border border-[#D4AF37]'
                : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Issue Volume</span>
          </button>
          <button
            onClick={() => {
              setMode('return');
              setStatusMessage(null);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              mode === 'return'
                ? 'bg-[#D4AF37] text-[#0B1F3A] shadow-sm border border-[#D4AF37]'
                : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
            }`}
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>Return Volume ({activeTransactions.length})</span>
          </button>
        </div>
      </div>

      {/* Alert Status message */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs sm:text-sm flex items-start gap-3 feedback-enter shadow-lg ${
            statusMessage.type === 'success'
              ? 'bg-[#0B1F3A] border border-emerald-500 text-[#F8F6F0]'
              : 'bg-[#0B1F3A] border border-rose-500 text-[#F8F6F0]'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span className="font-semibold leading-relaxed">{statusMessage.text}</span>
        </div>
      )}

      {/* MODE 1: BOOK ISSUE WORKFLOW */}
      {mode === 'issue' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Step 1: Scan Student Card */}
          <div className="rounded-3xl p-6 border border-[#0B1F3A]/10 space-y-4 shadow-xs bg-white text-[#0B1F3A]">
            <div className="flex items-center justify-between pb-3 border-b border-[#0B1F3A]/10">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37]">
                1. Identify Student Cardholder
              </span>
              <span className="text-xs font-semibold text-[#64748B]">Digital Pass QR</span>
            </div>

            {scannedStudent ? (
              <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#D4AF37]/35 flex items-center gap-4 shadow-2xs">
                <img
                  src={scannedStudent.photo}
                  alt={scannedStudent.name}
                  className="w-14 h-14 rounded-xl object-cover border-2 border-[#D4AF37]/50 shadow-xs"
                />
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-[#0B1F3A]">{scannedStudent.name}</h4>
                  <p className="text-xs text-[#0B1F3A] font-mono font-bold">{scannedStudent.studentId}</p>
                  <p className="text-[11px] text-[#64748B] font-medium">{scannedStudent.department} · {scannedStudent.course} ({scannedStudent.semester})</p>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-[#0B1F3A]/15 rounded-2xl space-y-3 bg-[#FAF9F5]">
                <User className="w-8 h-8 text-[#0B1F3A] mx-auto opacity-50" />
                <p className="text-xs text-[#64748B] font-medium">Scan student ID pass or select from directory</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setScannerTarget('student')}
                className="py-2.5 px-3 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer border border-[#D4AF37]"
              >
                <ScanLine className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Scan Student QR</span>
              </button>

              <select
                onChange={(e) => {
                  const s = allStudents.find((st) => st.studentId === e.target.value);
                  if (s) setScannedStudent(s);
                }}
                value={scannedStudent?.studentId || ''}
                className="bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl px-2.5 text-xs text-[#0B1F3A] font-medium focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 shadow-2xs cursor-pointer"
              >
                <option value="" className="bg-white text-[#0B1F3A] font-medium">Quick-Pick Student...</option>
                {allStudents.map((s) => (
                  <option key={s.id} value={s.studentId} className="bg-white text-[#0B1F3A] font-medium">
                    {s.name} ({s.studentId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2: Scan Book Volume */}
          <div className="rounded-3xl p-6 border border-[#0B1F3A]/10 space-y-4 shadow-xs bg-white text-[#0B1F3A]">
            <div className="flex items-center justify-between pb-3 border-b border-[#0B1F3A]/10">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37]">
                2. Scan Book Shelf Barcode
              </span>
              <span className="text-xs font-semibold text-[#64748B]">Catalog Volume</span>
            </div>

            {scannedBook ? (
              <div className="p-4 bg-[#FAF9F5] rounded-2xl border border-[#D4AF37]/35 flex items-center gap-4 shadow-2xs">
                <img
                  src={scannedBook.coverImage}
                  alt={scannedBook.title}
                  className="w-12 h-16 rounded-lg object-cover border border-[#D4AF37]/30 shadow-2xs"
                />
                <div className="space-y-0.5 min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-[#0B1F3A] truncate">{scannedBook.title}</h4>
                  <p className="text-xs text-[#64748B] font-medium truncate">{scannedBook.author}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-[#0B1F3A] font-mono font-bold">{scannedBook.bookId}</span>
                    <span className="text-[10px] text-emerald-800 font-bold font-mono">
                      ({scannedBook.availableCopies} available)
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-[#0B1F3A]/15 rounded-2xl space-y-3 bg-[#FAF9F5]">
                <BookOpen className="w-8 h-8 text-[#0B1F3A] mx-auto opacity-50" />
                <p className="text-xs text-[#64748B] font-medium">Scan book barcode or select from catalog</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setScannerTarget('book')}
                className="py-2.5 px-3 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer border border-[#D4AF37]"
              >
                <ScanLine className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Scan Book QR</span>
              </button>

              <select
                onChange={(e) => {
                  const b = allBooks.find((bk) => bk.bookId === e.target.value);
                  if (b) setScannedBook(b);
                }}
                value={scannedBook?.bookId || ''}
                className="bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl px-2.5 text-xs text-[#0B1F3A] font-medium focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 shadow-2xs cursor-pointer"
              >
                <option value="" className="bg-white text-[#0B1F3A] font-medium">Quick-Pick Book...</option>
                {allBooks.map((b) => (
                  <option key={b.id} value={b.bookId} className="bg-white text-[#0B1F3A] font-medium">
                    {b.title} ({b.bookId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Confirm Issue Banner */}
          <div className="md:col-span-2 rounded-2xl p-6 border border-[#0B1F3A]/10 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs bg-white text-[#0B1F3A]">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center shadow-xs">
                <Calendar className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0B1F3A]">Standard University Loan Period</div>
                <div className="text-[11px] text-[#64748B] font-medium">
                  Calculated return due date: <span className="text-[#0B1F3A] font-mono font-bold">14 Standard Academic Days</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleIssueBook}
              disabled={loading || !scannedStudent || !scannedBook}
              className="w-full sm:w-auto px-7 py-3 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-bold text-xs shadow-sm border border-[#D4AF37] transition-all cursor-pointer disabled:opacity-40"
            >
              {loading ? 'Processing Checkout...' : 'Confirm Book Checkout & Update Inventory'}
            </button>
          </div>
        </div>
      )}

      {/* MODE 2: BOOK RETURN WORKFLOW */}
      {mode === 'return' && (() => {
        const queryTerm = returnSearch.trim().toLowerCase();
        const filteredTx = activeTransactions.filter((tx) => {
          if (!queryTerm) return true;
          return (
            tx.studentName.toLowerCase().includes(queryTerm) ||
            tx.studentId.toLowerCase().includes(queryTerm) ||
            tx.bookTitle.toLowerCase().includes(queryTerm) ||
            tx.bookId.toLowerCase().includes(queryTerm)
          );
        });

        return (
          <div className="rounded-2xl p-6 border border-[#0B1F3A]/10 shadow-xs space-y-5 bg-white text-[#0B1F3A]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#0B1F3A]/10">
              <div>
                <h3 className="text-lg font-bold text-[#0B1F3A] font-serif-academic">
                  Active Circulation Loans Ready for Return
                </h3>
                <p className="text-xs text-[#64748B] font-medium mt-0.5">
                  Select a borrowed volume to register check-in and replenish available catalogue copies.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Search / Filter Active Loans */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[#D4AF37] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={returnSearch}
                    onChange={(e) => setReturnSearch(e.target.value)}
                    placeholder="Filter student or title..."
                    className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl pl-8 pr-7 py-1.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-all font-medium"
                  />
                  {returnSearch && (
                    <button
                      onClick={() => setReturnSearch('')}
                      className="absolute right-2.5 top-2 text-[#64748B] hover:text-[#0B1F3A] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <span className="text-xs font-mono text-[#0B1F3A] font-bold bg-[#F8F6F0] px-3 py-1.5 rounded-xl border border-[#0B1F3A]/10 shrink-0">
                  {activeTransactions.length} in Circulation
                </span>
              </div>
            </div>

            {activeTransactions.length === 0 ? (
              <div className="py-16 text-center space-y-2 rounded-2xl bg-[#F8F6F0] border border-[#0B1F3A]/5">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="text-sm font-bold text-[#0B1F3A]">All Catalog Volumes Are Accounted For</h4>
                <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                  There are currently no active student loans pending return in the HNGU library registry.
                </p>
              </div>
            ) : filteredTx.length === 0 ? (
              <div className="py-12 text-center space-y-2 rounded-2xl bg-[#F8F6F0] border border-[#0B1F3A]/5">
                <p className="text-xs text-[#64748B]">No borrowed books match filter &ldquo;{returnSearch}&rdquo;.</p>
                <button
                  onClick={() => setReturnSearch('')}
                  className="text-xs font-bold text-[#0B1F3A] underline cursor-pointer"
                >
                  Clear filter
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#0B1F3A]/10 bg-white shadow-2xs">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead>
                    <tr className="border-b border-[#D4AF37]/30 text-[#F8F6F0] uppercase text-[10px] tracking-wider font-mono font-semibold bg-[#0B1F3A]">
                      <th className="py-3.5 px-4 w-48">Student Cardholder</th>
                      <th className="py-3.5 px-4 min-w-[220px]">Volume Details</th>
                      <th className="py-3.5 px-4 w-32">Issue Date</th>
                      <th className="py-3.5 px-4 w-36">Return Due Date</th>
                      <th className="py-3.5 px-4 text-right w-36">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0B1F3A]/10 font-sans">
                    {filteredTx.map((tx) => {
                      const isOverdue = new Date(tx.dueDate).getTime() < Date.now();
                      return (
                        <tr key={tx.id} className="hover:bg-[#F8F6F0]/70 transition-colors">
                          {/* Student */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-[#0B1F3A] text-xs">{tx.studentName}</div>
                            <div className="text-[10px] text-[#64748B] font-mono font-bold">{tx.studentId}</div>
                          </td>

                          {/* Book Title */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-[#0B1F3A] line-clamp-1">{tx.bookTitle}</div>
                            <div className="text-[10px] text-[#64748B] font-mono font-semibold">Call ID: {tx.bookId}</div>
                          </td>

                          {/* Issue Date */}
                          <td className="py-3.5 px-4 text-[#1E293B] font-mono text-xs tabular-nums">
                            {tx.issueDate}
                          </td>

                          {/* Due Date */}
                          <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isOverdue
                                  ? 'bg-rose-50 text-rose-800 border border-rose-300'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              }`}
                            >
                              <span>{tx.dueDate}</span>
                              {isOverdue && <span className="font-extrabold uppercase">· Overdue</span>}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleReturnBook(tx)}
                              disabled={loading}
                              className="px-3.5 py-1.5 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl font-bold text-xs border border-[#D4AF37]/60 transition cursor-pointer shadow-2xs disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                              <ArrowUpFromLine className="w-3 h-3 text-[#D4AF37]" />
                              <span>Accept Return</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Camera / QR Scanner Modal */}
      {scannerTarget && (
        <QrScannerModal
          isOpen={true}
          onClose={() => setScannerTarget(null)}
          onScanSuccess={handleQrScanned}
          title={scannerTarget === 'student' ? 'Scan Student QR Pass' : 'Scan Book Barcode QR'}
          description={
            scannerTarget === 'student'
              ? 'Present student ID pass to camera'
              : 'Scan barcode tag affixed to book volume'
          }
          expectedType={scannerTarget}
          manualOptions={
            scannerTarget === 'student'
              ? allStudents.slice(0, 4).map((s) => ({
                  label: `${s.name} (${s.studentId})`,
                  value: s.personalQrId || `SLMS-STU-${s.id}`,
                  hint: s.department,
                }))
              : allBooks.slice(0, 4).map((b) => ({
                  label: b.title,
                  value: b.bookQrId || b.bookId,
                  hint: `ISBN: ${b.isbn || 'N/A'} • ${b.availableCopies} available`,
                }))
          }
        />
      )}
    </div>
  );
};
