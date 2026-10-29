import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  updateDoc,
  orderBy,
  limit,
  where,
  startAt,
  endAt,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COLLECTIONS, deleteStudent, reactivateStudent, deactivateStudent, addLibrarianByOwner } from '../lib/dbService';
import { Student, Book, BookTransaction, LibraryVisit, AdminUser } from '../types';
import { StudentIdCard } from './StudentIdCard';
import { BookManager } from './BookManager';
import { CirculationDesk } from './CirculationDesk';
import { ManagedByNeev } from './ManagedByNeev';
import {
  Users,
  BookOpen,
  History,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Search,
  Eye,
  Shield,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BarChart3,
  BookMarked,
  Lock,
  Unlock,
  UserX,
  Trash2,
  AlertCircle,
  ShieldAlert,
  Check,
  RefreshCw,
  UserCheck,
  UserPlus,
  Filter,
  ArrowRight,
  ArrowLeft,
  ScanLine,
  Layers,
  Calendar,
  X,
} from 'lucide-react';

interface AdminDashboardProps {
  adminUser: AdminUser | null;
  onAdminLogout: () => void;
}

type TabType = 'overview' | 'students' | 'books' | 'circulation' | 'live' | 'activity' | 'student-management';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  adminUser,
  onAdminLogout,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // KPI Counts fetched via getCountFromServer
  const [totalStudentsCount, setTotalStudentsCount] = useState<number>(0);
  const [activeStudentsCount, setActiveStudentsCount] = useState<number>(0);
  const [totalBooksCount, setTotalBooksCount] = useState<number>(0);
  const [todayVisitsCount, setTodayVisitsCount] = useState<number>(0);
  const [activeLoansCount, setActiveLoansCount] = useState<number>(0);

  // Live students currently inside hall (real-time targeted query: isInside == true)
  const [insideStudents, setInsideStudents] = useState<Student[]>([]);

  // Active Loans (status in ['Issued', 'Overdue'] WITHOUT the 100 limit)
  const [activeTransactions, setActiveTransactions] = useState<BookTransaction[]>([]);

  // Returned transactions (limited to latest 50 with "Load more")
  const [returnedTransactions, setReturnedTransactions] = useState<BookTransaction[]>([]);
  const [lastReturnedDoc, setLastReturnedDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreReturned, setHasMoreReturned] = useState(false);
  const [loadingReturned, setLoadingReturned] = useState(false);

  // Visits (limited to latest 50 with "Load more")
  const [visits, setVisits] = useState<LibraryVisit[]>([]);
  const [lastVisitDoc, setLastVisitDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreVisits, setHasMoreVisits] = useState(false);
  const [loadingVisits, setLoadingVisits] = useState(false);

  // Students Paginated State (25 per page, loaded only when tab opened)
  const [paginatedStudents, setPaginatedStudents] = useState<Student[]>([]);
  const [studentsPage, setStudentsPage] = useState<number>(1);
  const [pageDocStack, setPageDocStack] = useState<QueryDocumentSnapshot<DocumentData>[]>([]);
  const [lastStudentDoc, setLastStudentDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreStudents, setHasMoreStudents] = useState<boolean>(false);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);
  const [hasLoadedStudentsOnce, setHasLoadedStudentsOnce] = useState<boolean>(false);

  // Search & Filter state
  const [studentSearch, setStudentSearch] = useState('');
  const [managementSearch, setManagementSearch] = useState('');
  const [isSearchingStudents, setIsSearchingStudents] = useState(false);
  const [searchResults, setSearchResults] = useState<Student[] | null>(null);

  const [managementCourseFilter, setManagementCourseFilter] = useState('all');
  const [managementSemesterFilter, setManagementSemesterFilter] = useState('all');
  const [managementStatusFilter, setManagementStatusFilter] = useState('all');

  // Selected student for Profile modal
  const [selectedStudentForModal, setSelectedStudentForModal] = useState<Student | null>(null);
  const [modalTab, setModalTab] = useState<'card' | 'visits' | 'loans'>('card');
  const [modalVisits, setModalVisits] = useState<LibraryVisit[]>([]);
  const [lastModalVisitDoc, setLastModalVisitDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreModalVisits, setHasMoreModalVisits] = useState(false);
  const [loadingModalVisits, setLoadingModalVisits] = useState(false);

  const [modalTransactions, setModalTransactions] = useState<BookTransaction[]>([]);
  const [lastModalTxDoc, setLastModalTxDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreModalTx, setHasMoreModalTx] = useState(false);
  const [loadingModalTx, setLoadingModalTx] = useState(false);

  // Fallback query active flags (visible warnings when composite index building)
  const [modalVisitsFallbackActive, setModalVisitsFallbackActive] = useState(false);
  const [modalTxFallbackActive, setModalTxFallbackActive] = useState(false);
  const [returnedFallbackActive, setReturnedFallbackActive] = useState(false);
  const [visitsFallbackActive, setVisitsFallbackActive] = useState(false);

  const [studentToDeactivate, setStudentToDeactivate] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deactivatingLoading, setDeactivatingLoading] = useState(false);

  // Activity filter state
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'inside' | 'issued' | 'returned'>('all');
  const [activityStartDate, setActivityStartDate] = useState('');
  const [activityEndDate, setActivityEndDate] = useState('');

  // Live time ticker
  const [currentTime, setCurrentTime] = useState<string>('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Owner action: Add Librarian modal state
  const isOwner = adminUser?.email?.toLowerCase() === 'neevlimbachiya45@gmail.com' || adminUser?.role === 'admin';
  const [showAddLibrarianModal, setShowAddLibrarianModal] = useState(false);
  const [newLibrarianUid, setNewLibrarianUid] = useState('');
  const [newLibrarianEmail, setNewLibrarianEmail] = useState('');
  const [newLibrarianName, setNewLibrarianName] = useState('');
  const [addingLibrarianLoading, setAddingLibrarianLoading] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // 1. Fetch Server Counts (getCountFromServer) for accurate KPIs & tab numbers
  const refreshKpiCounts = useCallback(async () => {
    if (!adminUser) return;
    try {
      const [stuSnap, actStuSnap, bookSnap, todayVisSnap, loansSnap] = await Promise.all([
        getCountFromServer(collection(db, COLLECTIONS.STUDENTS)).catch(() => null),
        getCountFromServer(query(collection(db, COLLECTIONS.STUDENTS), where('status', '==', 'active'))).catch(() => null),
        getCountFromServer(collection(db, COLLECTIONS.BOOKS)).catch(() => null),
        getCountFromServer(query(collection(db, COLLECTIONS.VISITS), where('entryDate', '==', todayStr))).catch(() => null),
        getCountFromServer(query(collection(db, COLLECTIONS.TRANSACTIONS), where('status', 'in', ['Issued', 'Overdue']))).catch(() => null),
      ]);

      if (stuSnap) setTotalStudentsCount(stuSnap.data().count);
      if (actStuSnap) setActiveStudentsCount(actStuSnap.data().count);
      if (bookSnap) setTotalBooksCount(bookSnap.data().count);
      if (todayVisSnap) setTodayVisitsCount(todayVisSnap.data().count);
      if (loansSnap) setActiveLoansCount(loansSnap.data().count);
    } catch (err) {
      console.warn('Error refreshing server KPI counts:', err);
    }
  }, [adminUser, todayStr]);

  useEffect(() => {
    refreshKpiCounts();
  }, [refreshKpiCounts]);

  // 2. Real-time Live Turnstile query: ONLY students currently inside (where isInside == true)
  useEffect(() => {
    if (!adminUser) {
      setInsideStudents([]);
      return;
    }
    const qInside = query(collection(db, COLLECTIONS.STUDENTS), where('isInside', '==', true));
    const unsub = onSnapshot(qInside, (snap) => {
      setInsideStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)));
    });
    return () => unsub();
  }, [adminUser]);

  // 3. Real-time Active Loans query: book_transactions where status in ['Issued', 'Overdue'] WITHOUT 100 limit
  useEffect(() => {
    if (!adminUser) {
      setActiveTransactions([]);
      return;
    }
    const qActive = query(
      collection(db, COLLECTIONS.TRANSACTIONS),
      where('status', 'in', ['Issued', 'Overdue'])
    );
    const unsub = onSnapshot(qActive, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookTransaction));
      setActiveTransactions(list);
      setActiveLoansCount(list.length);
    });
    return () => unsub();
  }, [adminUser]);

  // 4. Returned transactions (bounded to latest 50 with "Load more")
  const fetchInitialReturned = useCallback(async () => {
    setLoadingReturned(true);
    try {
      const qRet = query(
        collection(db, COLLECTIONS.TRANSACTIONS),
        where('status', '==', 'Returned'),
        orderBy('returnTimestamp', 'desc'),
        limit(50)
      );
      const snap = await getDocs(qRet);
      setReturnedTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookTransaction)));
      setLastReturnedDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMoreReturned(snap.docs.length === 50);
      setReturnedFallbackActive(false);
    } catch (err) {
      console.warn('Error loading initial returned transactions with orderBy, using fallback:', err);
      try {
        const qRetFallback = query(
          collection(db, COLLECTIONS.TRANSACTIONS),
          where('status', '==', 'Returned'),
          limit(50)
        );
        const snap = await getDocs(qRetFallback);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookTransaction));
        list.sort((a, b) => (b.returnTimestamp || 0) - (a.returnTimestamp || 0));
        setReturnedTransactions(list);
        setLastReturnedDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
        setHasMoreReturned(false);
        setReturnedFallbackActive(true);
      } catch (err2) {
        console.warn('Fallback returned transactions query failed:', err2);
      }
    } finally {
      setLoadingReturned(false);
    }
  }, []);

  const loadMoreReturned = async () => {
    if (!lastReturnedDoc || loadingReturned) return;
    setLoadingReturned(true);
    try {
      const qRet = query(
        collection(db, COLLECTIONS.TRANSACTIONS),
        where('status', '==', 'Returned'),
        orderBy('returnTimestamp', 'desc'),
        startAfter(lastReturnedDoc),
        limit(50)
      );
      const snap = await getDocs(qRet);
      const nextList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BookTransaction));
      setReturnedTransactions((prev) => [...prev, ...nextList]);
      setLastReturnedDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMoreReturned(snap.docs.length === 50);
    } catch (err) {
      console.warn('Error loading more returned transactions:', err);
    } finally {
      setLoadingReturned(false);
    }
  };

  // 5. Visits (bounded to latest 50 with "Load more")
  const fetchInitialVisits = useCallback(async () => {
    setLoadingVisits(true);
    try {
      const qV = query(
        collection(db, COLLECTIONS.VISITS),
        orderBy('entryTimestamp', 'desc'),
        limit(50)
      );
      const snap = await getDocs(qV);
      setVisits(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryVisit)));
      setLastVisitDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMoreVisits(snap.docs.length === 50);
      setVisitsFallbackActive(false);
    } catch (err) {
      console.warn('Error loading initial visits with orderBy, using fallback:', err);
      try {
        const qVFallback = query(collection(db, COLLECTIONS.VISITS), limit(50));
        const snap = await getDocs(qVFallback);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryVisit));
        list.sort((a, b) => (b.entryTimestamp || 0) - (a.entryTimestamp || 0));
        setVisits(list);
        setLastVisitDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
        setHasMoreVisits(false);
        setVisitsFallbackActive(true);
      } catch (err2) {
        console.warn('Fallback visits query failed:', err2);
      }
    } finally {
      setLoadingVisits(false);
    }
  }, []);

  const loadMoreVisits = async () => {
    if (!lastVisitDoc || loadingVisits) return;
    setLoadingVisits(true);
    try {
      const qV = query(
        collection(db, COLLECTIONS.VISITS),
        orderBy('entryTimestamp', 'desc'),
        startAfter(lastVisitDoc),
        limit(50)
      );
      const snap = await getDocs(qV);
      const nextList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryVisit));
      setVisits((prev) => [...prev, ...nextList]);
      setLastVisitDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMoreVisits(snap.docs.length === 50);
    } catch (err) {
      console.warn('Error loading more visits:', err);
    } finally {
      setLoadingVisits(false);
    }
  };

  // 6. Paginate Students (25 per page, loaded only when tab opened)
  const fetchStudentsPage = useCallback(async (startAfterDoc: QueryDocumentSnapshot<DocumentData> | null = null, newPageNum: number = 1) => {
    setLoadingStudents(true);
    try {
      let qS = query(
        collection(db, COLLECTIONS.STUDENTS),
        orderBy('name'),
        limit(25)
      );
      if (startAfterDoc) {
        qS = query(
          collection(db, COLLECTIONS.STUDENTS),
          orderBy('name'),
          startAfter(startAfterDoc),
          limit(25)
        );
      }
      const snap = await getDocs(qS);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
      setPaginatedStudents(list);
      setStudentsPage(newPageNum);
      setLastStudentDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      setHasMoreStudents(snap.docs.length === 25);
    } catch (err) {
      console.error('Error fetching students page:', err);
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const handleNextStudentsPage = () => {
    if (!lastStudentDoc || !hasMoreStudents) return;
    setPageDocStack((prev) => [...prev, lastStudentDoc]);
    fetchStudentsPage(lastStudentDoc, studentsPage + 1);
  };

  const handlePrevStudentsPage = () => {
    if (studentsPage <= 1) return;
    const newStack = [...pageDocStack];
    newStack.pop(); // Pop current page's cursor
    const prevCursor = newStack.length > 0 ? newStack[newStack.length - 1] : null;
    setPageDocStack(newStack);
    fetchStudentsPage(prevCursor, studentsPage - 1);
  };

  // Lazy load student and activity data only when respective tab is opened
  useEffect(() => {
    if (!adminUser) return;
    if ((activeTab === 'students' || activeTab === 'student-management') && !hasLoadedStudentsOnce) {
      fetchStudentsPage(null, 1);
      setHasLoadedStudentsOnce(true);
    }
    if (activeTab === 'activity' && visits.length === 0) {
      fetchInitialVisits();
      fetchInitialReturned();
    }
  }, [activeTab, adminUser, hasLoadedStudentsOnce, fetchStudentsPage, fetchInitialVisits, fetchInitialReturned, visits.length]);

  // Accessibility: close open modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedStudentForModal) {
          setSelectedStudentForModal(null);
        } else if (studentToDeactivate) {
          setStudentToDeactivate(null);
        } else if (studentToDelete) {
          setStudentToDelete(null);
        } else if (showAddLibrarianModal) {
          setShowAddLibrarianModal(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStudentForModal, studentToDeactivate, studentToDelete, showAddLibrarianModal]);

  // 7. Search students directly querying Firestore (exact match on roll/docId/phone/email/membershipId, prefix on name)
  const handleExecuteStudentSearch = async (searchTerm: string) => {
    const raw = searchTerm.trim();
    if (!raw) {
      setSearchResults(null);
      return;
    }

    setIsSearchingStudents(true);
    try {
      const cleanTerm = raw;
      const upperTerm = cleanTerm.toUpperCase();
      const lowerTerm = cleanTerm.toLowerCase();
      const digitsOnly = cleanTerm.replace(/\D/g, '');

      const foundMap = new Map<string, Student>();

      // Exact Doc ID match
      try {
        const dSnap = await getDoc(doc(db, COLLECTIONS.STUDENTS, cleanTerm));
        if (dSnap.exists()) {
          foundMap.set(dSnap.id, { id: dSnap.id, ...dSnap.data() } as Student);
        }
      } catch (e) {
        // Ignore invalid doc id paths
      }

      const promises = [
        getDocs(query(collection(db, COLLECTIONS.STUDENTS), where('studentId', '==', upperTerm), limit(25))),
        getDocs(query(collection(db, COLLECTIONS.STUDENTS), where('studentId', '==', cleanTerm), limit(25))),
        getDocs(query(collection(db, COLLECTIONS.STUDENTS), where('membershipId', '==', upperTerm), limit(25))),
        getDocs(query(collection(db, COLLECTIONS.STUDENTS), where('email', '==', lowerTerm), limit(25))),
      ];

      if (digitsOnly && digitsOnly.length >= 7) {
        const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
        promises.push(getDocs(query(collection(db, COLLECTIONS.STUDENTS), where('mobile', '==', last10), limit(25))));
        promises.push(getDocs(query(collection(db, COLLECTIONS.STUDENTS), where('mobile', '==', cleanTerm), limit(25))));
      }

      // Prefix match on student name (orderBy + startAt/endAt)
      promises.push(
        getDocs(
          query(
            collection(db, COLLECTIONS.STUDENTS),
            orderBy('name'),
            startAt(cleanTerm),
            endAt(cleanTerm + '\uf8ff'),
            limit(25)
          )
        )
      );

      const capitalizedTerm = cleanTerm.charAt(0).toUpperCase() + cleanTerm.slice(1);
      if (capitalizedTerm !== cleanTerm) {
        promises.push(
          getDocs(
            query(
              collection(db, COLLECTIONS.STUDENTS),
              orderBy('name'),
              startAt(capitalizedTerm),
              endAt(capitalizedTerm + '\uf8ff'),
              limit(25)
            )
          )
        );
      }

      const results = await Promise.all(promises.map((p) => p.catch(() => null)));
      results.forEach((snap) => {
        if (snap) {
          snap.docs.forEach((d) => {
            if (!foundMap.has(d.id)) {
              foundMap.set(d.id, { id: d.id, ...d.data() } as Student);
            }
          });
        }
      });

      setSearchResults(Array.from(foundMap.values()));
    } catch (err) {
      console.error('Error querying students in Firestore:', err);
    } finally {
      setIsSearchingStudents(false);
    }
  };

  // 8. Load on-demand FULL visit and transaction history for staff inspecting any student
  useEffect(() => {
    if (!selectedStudentForModal?.studentId) {
      setModalVisits([]);
      setModalTransactions([]);
      setLastModalVisitDoc(null);
      setLastModalTxDoc(null);
      return;
    }

    const loadStudentData = async () => {
      setLoadingModalVisits(true);
      setLoadingModalTx(true);
      setModalVisitsFallbackActive(false);
      setModalTxFallbackActive(false);

      try {
        const qV = query(
          collection(db, COLLECTIONS.VISITS),
          where('studentId', '==', selectedStudentForModal.studentId),
          orderBy('entryTimestamp', 'desc'),
          limit(20)
        );
        const vSnap = await getDocs(qV);
        setModalVisits(vSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryVisit)));
        setLastModalVisitDoc(vSnap.docs.length > 0 ? vSnap.docs[vSnap.docs.length - 1] : null);
        setHasMoreModalVisits(vSnap.docs.length === 20);
        setModalVisitsFallbackActive(false);
      } catch (err) {
        console.warn('Modal visits with orderBy failed, using fallback query:', err);
        try {
          const qVFallback = query(
            collection(db, COLLECTIONS.VISITS),
            where('studentId', '==', selectedStudentForModal.studentId),
            limit(50)
          );
          const vSnap = await getDocs(qVFallback);
          const list = vSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryVisit));
          list.sort((a, b) => (b.entryTimestamp || 0) - (a.entryTimestamp || 0));
          setModalVisits(list);
          setHasMoreModalVisits(false);
          setModalVisitsFallbackActive(true);
        } catch (e2) {
          console.warn('Error loading student visits modal:', e2);
        }
      } finally {
        setLoadingModalVisits(false);
      }

      try {
        const qT = query(
          collection(db, COLLECTIONS.TRANSACTIONS),
          where('studentId', '==', selectedStudentForModal.studentId),
          orderBy('issueTimestamp', 'desc'),
          limit(20)
        );
        const tSnap = await getDocs(qT);
        setModalTransactions(tSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BookTransaction)));
        setLastModalTxDoc(tSnap.docs.length > 0 ? tSnap.docs[tSnap.docs.length - 1] : null);
        setHasMoreModalTx(tSnap.docs.length === 20);
        setModalTxFallbackActive(false);
      } catch (err) {
        console.warn('Modal transactions with orderBy failed, using fallback query:', err);
        try {
          const qTFallback = query(
            collection(db, COLLECTIONS.TRANSACTIONS),
            where('studentId', '==', selectedStudentForModal.studentId),
            limit(50)
          );
          const tSnap = await getDocs(qTFallback);
          const list = tSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BookTransaction));
          list.sort((a, b) => (b.issueTimestamp || 0) - (a.issueTimestamp || 0));
          setModalTransactions(list);
          setHasMoreModalTx(false);
          setModalTxFallbackActive(true);
        } catch (e2) {
          console.warn('Error loading student transactions modal:', e2);
        }
      } finally {
        setLoadingModalTx(false);
      }
    };

    loadStudentData();
  }, [selectedStudentForModal]);

  const loadMoreModalVisits = async () => {
    if (!selectedStudentForModal?.studentId || !lastModalVisitDoc || loadingModalVisits) return;
    setLoadingModalVisits(true);
    try {
      const qV = query(
        collection(db, COLLECTIONS.VISITS),
        where('studentId', '==', selectedStudentForModal.studentId),
        orderBy('entryTimestamp', 'desc'),
        startAfter(lastModalVisitDoc),
        limit(20)
      );
      const vSnap = await getDocs(qV);
      const nextList = vSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryVisit));
      setModalVisits((prev) => [...prev, ...nextList]);
      setLastModalVisitDoc(vSnap.docs.length > 0 ? vSnap.docs[vSnap.docs.length - 1] : null);
      setHasMoreModalVisits(vSnap.docs.length === 20);
    } catch (err) {
      console.warn('Error loading more modal visits:', err);
    } finally {
      setLoadingModalVisits(false);
    }
  };

  const loadMoreModalTx = async () => {
    if (!selectedStudentForModal?.studentId || !lastModalTxDoc || loadingModalTx) return;
    setLoadingModalTx(true);
    try {
      const qT = query(
        collection(db, COLLECTIONS.TRANSACTIONS),
        where('studentId', '==', selectedStudentForModal.studentId),
        orderBy('issueTimestamp', 'desc'),
        startAfter(lastModalTxDoc),
        limit(20)
      );
      const tSnap = await getDocs(qT);
      const nextList = tSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BookTransaction));
      setModalTransactions((prev) => [...prev, ...nextList]);
      setLastModalTxDoc(tSnap.docs.length > 0 ? tSnap.docs[tSnap.docs.length - 1] : null);
      setHasMoreModalTx(tSnap.docs.length === 20);
    } catch (err) {
      console.warn('Error loading more modal transactions:', err);
    } finally {
      setLoadingModalTx(false);
    }
  };

  // Toggle student status
  const toggleStudentStatus = async (student: Student) => {
    if (!adminUser || (adminUser.role !== 'admin' && adminUser.role !== 'librarian')) {
      setActionNotice({
        type: 'error',
        message: 'Unauthorized: Only authenticated library staff can modify student account status.',
      });
      return;
    }
    const newStatus = student.status === 'active' ? 'blocked' : 'active';
    try {
      await updateDoc(doc(db, COLLECTIONS.STUDENTS, student.id), {
        status: newStatus,
      });
      if (selectedStudentForModal?.id === student.id) {
        setSelectedStudentForModal({ ...selectedStudentForModal, status: newStatus });
      }
      setActionNotice({
        type: 'success',
        message: `Student "${student.name}" account status updated to ${newStatus}.`,
      });
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      console.error('Error updating student status:', err);
      setActionNotice({
        type: 'error',
        message: 'Error updating student status: ' + err.message,
      });
    }
  };

  // Accurate KPIs & counts (aggregates / getCountFromServer)
  const totalStudents = totalStudentsCount;
  const studentsInside = insideStudents.length;
  const totalBooks = totalBooksCount;
  const currentlyIssuedBooks = activeTransactions.length;
  const overdueBooks = activeTransactions.filter((t) => {
    const dueTime = new Date(t.dueDate).getTime();
    return dueTime < Date.now();
  }).length;
  const availableBooks = Math.max(0, totalBooks - currentlyIssuedBooks);
  const todayEntries = todayVisitsCount;
  const todayExits = Math.max(0, todayVisitsCount - studentsInside);

  // Active student list: If search results are present, show search results; otherwise show paginated students page
  const displayedStudents = searchResults !== null ? searchResults : paginatedStudents;

  // Filtered students for Directory tab
  const filteredStudents = displayedStudents.filter(
    (s) =>
      !studentSearch ||
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.department.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  // Courses and Semesters for dropdown filters
  const standardCourses = ['B.Tech', 'B.Sc', 'BCA', 'MCA', 'M.Tech', 'M.Sc', 'B.A', 'M.A', 'Ph.D'];
  const distinctCourses = Array.from(new Set([...standardCourses, ...displayedStudents.map((s) => s.course).filter(Boolean)])).sort();
  const standardSemesters = ['1st Semester', '2nd Semester', '3rd Semester', '4th Semester', '5th Semester', '6th Semester', '7th Semester', '8th Semester'];
  const distinctSemesters = Array.from(new Set([...standardSemesters, ...displayedStudents.map((s) => String(s.semester)).filter(Boolean)])).sort();

  // Filtered students for Student Management (Search by name, roll, email, phone, doc ID + course, semester, status)
  const filteredManagementStudents = displayedStudents.filter((s) => {
    const term = managementSearch.toLowerCase().trim();
    const matchesTerm =
      !term ||
      s.name.toLowerCase().includes(term) ||
      s.studentId.toLowerCase().includes(term) ||
      (s.email && s.email.toLowerCase().includes(term)) ||
      (s.mobile && s.mobile.toLowerCase().includes(term)) ||
      (s.id && s.id.toLowerCase().includes(term)) ||
      (s.course && s.course.toLowerCase().includes(term)) ||
      (s.department && s.department.toLowerCase().includes(term));

    const matchesCourse = managementCourseFilter === 'all' || s.course === managementCourseFilter;
    const matchesSemester = managementSemesterFilter === 'all' || String(s.semester) === managementSemesterFilter;
    const matchesStatus = managementStatusFilter === 'all' || s.status === managementStatusFilter;

    return matchesTerm && matchesCourse && matchesSemester && matchesStatus;
  });

  // Soft Deactivate Student Handler
  const handleConfirmDeactivate = async () => {
    if (!studentToDeactivate || !adminUser) return;
    try {
      setDeactivatingLoading(true);
      await deactivateStudent(studentToDeactivate.id, adminUser);
      setActionNotice({
        type: 'success',
        message: `Student "${studentToDeactivate.name}" (${studentToDeactivate.studentId}) deactivated successfully. All historical records remain safely preserved.`,
      });
      setTimeout(() => setActionNotice(null), 5000);
      setStudentToDeactivate(null);
    } catch (err: any) {
      setActionNotice({ type: 'error', message: 'Deactivation error: ' + err.message });
    } finally {
      setDeactivatingLoading(false);
    }
  };

  // Reactivate Student Handler
  const handleReactivateStudent = async (student: Student) => {
    if (!adminUser) return;
    try {
      await reactivateStudent(student.id, adminUser);
      setActionNotice({
        type: 'success',
        message: `Student "${student.name}" account has been reactivated.`,
      });
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setActionNotice({ type: 'error', message: 'Reactivation error: ' + err.message });
    }
  };

  // Permanent Delete / Remove Student Handler
  const handleConfirmDelete = async () => {
    if (!studentToDelete || !adminUser) return;
    try {
      setDeactivatingLoading(true);
      await deleteStudent(studentToDelete.id, adminUser);
      setActionNotice({
        type: 'success',
        message: 'Student removed successfully.',
      });
      setTimeout(() => setActionNotice(null), 5000);
      setStudentToDelete(null);
    } catch (err: any) {
      setActionNotice({ type: 'error', message: 'Removal error: ' + err.message });
    } finally {
      setDeactivatingLoading(false);
    }
  };

  // Combined Library Activity Table (Active loans + returned transactions + visits)
  const allLoadedTransactions = [...activeTransactions, ...returnedTransactions];

  const combinedActivity = [
    ...visits.map((v) => ({
      id: v.id,
      type: 'visit' as const,
      studentName: v.studentName,
      studentId: v.studentId,
      date: v.entryDate,
      entryTime: v.entryTime,
      exitTime: v.exitTime || 'Inside Library',
      duration: v.duration || 'Active',
      book: '—',
      issueDate: '—',
      returnDate: '—',
      status: v.active ? 'Inside Library' : 'Completed Visit',
      timestamp: v.entryTimestamp || 0,
    })),
    ...allLoadedTransactions.map((t) => ({
      id: t.id,
      type: 'transaction' as const,
      studentName: t.studentName,
      studentId: t.studentId,
      date: t.issueDate,
      entryTime: '—',
      exitTime: '—',
      duration: '—',
      book: `${t.bookTitle} (${t.bookId})`,
      issueDate: `${t.issueDate} ${t.issueTime}`,
      returnDate: t.returnDate ? `${t.returnDate} ${t.returnTime}` : 'Not Returned',
      status: t.status === 'Issued' ? 'Currently Borrowed' : 'Book Returned',
      timestamp: t.issueTimestamp || 0,
    })),
  ];

  combinedActivity.sort((a, b) => b.timestamp - a.timestamp);

  const filteredActivity = combinedActivity.filter((act) => {
    const matchesSearch =
      act.studentName.toLowerCase().includes(activitySearch.toLowerCase()) ||
      act.studentId.toLowerCase().includes(activitySearch.toLowerCase()) ||
      act.book.toLowerCase().includes(activitySearch.toLowerCase());

    if (!matchesSearch) return false;

    if (activityFilter === 'inside') return act.status === 'Inside Library';
    if (activityFilter === 'issued') return act.status === 'Currently Borrowed';
    if (activityFilter === 'returned') return act.status === 'Book Returned';

    // Date filter: single date or date range
    if (activityStartDate) {
      const actDate = new Date(act.timestamp || act.date);
      const start = new Date(activityStartDate);
      start.setHours(0, 0, 0, 0);
      if (actDate.getTime() < start.getTime()) return false;
    }
    if (activityEndDate) {
      const actDate = new Date(act.timestamp || act.date);
      const end = new Date(activityEndDate);
      end.setHours(23, 59, 59, 999);
      if (actDate.getTime() > end.getTime()) return false;
    }

    return true;
  });

  const renderStudentManagement = (isEndOfOverview = false) => (
    <div className={`glass-panel-elevated rounded-3xl p-6 sm:p-7 border border-[#D4AF37]/35 shadow-xl space-y-6 bg-white text-[#0B1F3A] ${isEndOfOverview ? 'mt-8' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D4AF37]/20">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#0B1F3A] border border-[#D4AF37]/35 text-[10px] font-bold uppercase tracking-wider mb-1">
            <UserX className="w-3 h-3 text-[#D4AF37]" />
            <span>Authorized Administration</span>
          </div>
          <h3 className="text-xl font-extrabold text-[#0B1F3A] tracking-tight flex items-center gap-2">
            <span>Student Management & Record Controls</span>
          </h3>
          <p className="text-xs sm:text-sm text-[#182F4E] mt-1 font-medium">
            Search registered students, view academic profiles, or deactivate/remove active library records. Historical visit and loan logs are preserved.
          </p>
        </div>

        {/* Search Input supporting Name, Roll, Email, Phone, Unique Doc ID */}
        <div className="relative w-full sm:w-80">
          <div className="relative">
            <Search className="w-4 h-4 text-[#0B1F3A] absolute left-3.5 top-3" />
            <input
              type="text"
              value={managementSearch}
              onChange={(e) => {
                setManagementSearch(e.target.value);
                handleExecuteStudentSearch(e.target.value);
              }}
              placeholder="Search name, roll, email, phone, doc ID..."
              className="w-full bg-[#F8F6F0] border border-[#D4AF37]/40 rounded-xl pl-10 pr-8 py-2.5 text-xs text-[#0B1F3A] placeholder-[#182F4E]/80 focus:outline-none focus:border-[#D4AF37] shadow-xs font-medium"
            />
            {isSearchingStudents && (
              <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37] animate-spin absolute right-3 top-3" />
            )}
          </div>
          <p className="text-[10px] text-[#0B1F3A]/70 font-medium mt-1 pl-1">
            Enter full roll number, or the first letters of the name.
          </p>
        </div>
      </div>

      {/* Filter Toolbar: Program, Semester, Status */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/25 text-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B1F3A] flex items-center gap-1.5 pl-1">
          <Filter className="w-3.5 h-3.5 text-[#D4AF37]" />
          Filters:
        </span>

        {/* Program Filter */}
        <select
          value={managementCourseFilter}
          onChange={(e) => setManagementCourseFilter(e.target.value)}
          className="bg-white border border-[#D4AF37]/40 text-[#0B1F3A] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#D4AF37] cursor-pointer font-medium"
        >
          <option value="all">All Programs / Courses</option>
          {distinctCourses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Semester Filter */}
        <select
          value={managementSemesterFilter}
          onChange={(e) => setManagementSemesterFilter(e.target.value)}
          className="bg-white border border-[#D4AF37]/40 text-[#0B1F3A] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#D4AF37] cursor-pointer font-medium"
        >
          <option value="all">All Semesters</option>
          {distinctSemesters.map((sem) => (
            <option key={sem} value={sem}>
              Semester {sem}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={managementStatusFilter}
          onChange={(e) => setManagementStatusFilter(e.target.value)}
          className="bg-white border border-[#D4AF37]/40 text-[#0B1F3A] rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#D4AF37] cursor-pointer font-medium"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
          <option value="blocked">Blocked</option>
        </select>

        {(managementSearch || managementCourseFilter !== 'all' || managementSemesterFilter !== 'all' || managementStatusFilter !== 'all') && (
          <button
            onClick={() => {
              setManagementSearch('');
              handleExecuteStudentSearch('');
              setManagementCourseFilter('all');
              setManagementSemesterFilter('all');
              setManagementStatusFilter('all');
            }}
            className="ml-auto text-[11px] text-[#0B1F3A] hover:text-[#0B1F3A] underline font-bold cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-[#0B1F3A] px-1 font-mono font-medium">
        <span>Showing {filteredManagementStudents.length} of {totalStudentsCount} registered students</span>
        <span className="text-[#0B1F3A] text-[11px] font-bold">Primary Identity: Firestore Document ID</span>
      </div>

      {filteredManagementStudents.length === 0 ? (
        <div className="py-12 text-center text-xs sm:text-sm text-[#182F4E] font-medium bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/25 p-8">
          {isSearchingStudents ? 'Searching Firestore...' : `No students match search filter "${managementSearch}".`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-2xs">
          <table className="w-full text-left text-xs min-w-[840px]">
            <thead>
              <tr className="border-b border-[#D4AF37]/30 text-[#F8F6F0] uppercase text-[10px] tracking-wider font-mono font-semibold bg-[#0B1F3A]">
                <th className="py-3.5 px-4 w-52">Student Cardholder</th>
                <th className="py-3.5 px-4 w-36">Roll / Student ID</th>
                <th className="py-3.5 px-4 w-44">Academic Program</th>
                <th className="py-3.5 px-4 w-48">Contact Details</th>
                <th className="py-3.5 px-4 w-32">Document ID</th>
                <th className="py-3.5 px-4 text-center w-28">Status</th>
                <th className="py-3.5 px-4 text-right min-w-[200px]">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B1F3A]/10 font-sans">
              {filteredManagementStudents.map((s) => (
                <tr key={s.id} className="hover:bg-[#F8F6F0]/70 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <img src={s.photo} alt={s.name} className="w-9 h-9 rounded-xl object-cover border border-[#0B1F3A]/15 shadow-2xs" />
                      <div>
                        <div className="font-bold text-[#0B1F3A] text-xs">{s.name}</div>
                        <div className="text-[10px] text-[#64748B] font-mono font-medium">{s.membershipId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#0B1F3A] text-xs tabular-nums">
                    {s.studentId}
                  </td>
                  <td className="py-3.5 px-4 text-[#0B1F3A]">
                    <div className="font-semibold text-[#0B1F3A]">{s.course} (Sem {s.semester})</div>
                    <div className="text-[10px] text-[#64748B] font-medium">{s.department}</div>
                  </td>
                  <td className="py-3.5 px-4 text-[#0B1F3A]">
                    <div className="font-medium text-[#0B1F3A] text-xs">{s.email}</div>
                    <div className="text-[10px] text-[#64748B] font-mono tabular-nums">{s.mobile}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-[10px] text-[#0B1F3A] bg-[#F8F6F0] px-2 py-0.5 rounded border border-[#0B1F3A]/15 font-medium">
                      {s.id.slice(0, 10)}...
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        s.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                          : s.status === 'deactivated'
                          ? 'bg-rose-50 text-rose-800 border border-rose-300'
                          : 'bg-amber-50 text-amber-900 border border-amber-300'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedStudentForModal(s)}
                        className="px-2.5 py-1 text-xs bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl transition cursor-pointer flex items-center gap-1 border border-[#D4AF37]/50 font-bold shadow-2xs"
                        title="View Full Profile & History"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Pass</span>
                      </button>

                      {s.status === 'active' ? (
                        <button
                          onClick={() => setStudentToDeactivate(s)}
                          className="px-2.5 py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition cursor-pointer flex items-center gap-1 border border-amber-300 font-medium"
                          title="Deactivate Student (Soft Delete)"
                        >
                          <UserX className="w-3.5 h-3.5 text-amber-700" />
                          <span>Deactivate</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivateStudent(s)}
                          className="px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl transition cursor-pointer flex items-center gap-1 border border-emerald-300 font-bold"
                          title="Reactivate Student Account"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Reactivate</span>
                        </button>
                      )}

                      <button
                        onClick={() => setStudentToDelete(s)}
                        className="px-2.5 py-1 text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition cursor-pointer flex items-center gap-1 border border-rose-300 font-bold shadow-2xs"
                        title="Delete Student"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls (25 per page) */}
          {searchResults === null && (
            <div className="flex items-center justify-between p-3.5 border-t border-[#0B1F3A]/10 bg-[#F8F6F0]/50 text-xs">
              <span className="text-[#182F4E] font-medium font-mono">
                Page {studentsPage} • 25 students per page
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevStudentsPage}
                  disabled={studentsPage <= 1 || loadingStudents}
                  className="px-3 py-1.5 rounded-xl border border-[#D4AF37]/40 bg-white hover:bg-[#F8F6F0] disabled:opacity-40 disabled:cursor-not-allowed font-bold text-[#0B1F3A] flex items-center gap-1 transition shadow-2xs cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  onClick={handleNextStudentsPage}
                  disabled={!hasMoreStudents || loadingStudents}
                  className="px-3 py-1.5 rounded-xl border border-[#D4AF37]/40 bg-white hover:bg-[#F8F6F0] disabled:opacity-40 disabled:cursor-not-allowed font-bold text-[#0B1F3A] flex items-center gap-1 transition shadow-2xs cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Security Authorization Check: Restricted strictly to authenticated admin users
  if (!adminUser) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto p-8 rounded-3xl border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center mx-auto shadow-sm">
          <Shield className="w-6 h-6 text-[#D4AF37]" />
        </div>
        <h2 className="text-xl font-bold font-serif-academic text-[#0B1F3A]">Admin Authorization Required</h2>
        <p className="text-xs text-[#64748B] leading-relaxed font-medium">
          Access to the HNGU Central Library Executive Console is restricted to authenticated university librarians and administrative faculty.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col lg:flex-row gap-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. COLLAPSIBLE ENTERPRISE SIDEBAR: Desktop Only (Hidden on Mobile/Tablet) */}
      {/* ========================================================================= */}
      <aside
        className={`hidden lg:block ${
          isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
        } transition-all duration-300 shrink-0`}
      >
        <div className="rounded-2xl p-4 lg:sticky lg:top-24 border border-[#D4AF37]/30 shadow-2xl space-y-5 bg-[#0B1F3A] text-[#F8F6F0]">
          {/* Header & Toggle */}
          <div className="flex items-center justify-between px-2 pt-1 pb-3 border-b border-[#D4AF37]/25">
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#071629] border border-[#D4AF37]/60 flex items-center justify-center text-[#D4AF37] shadow-sm">
                  <Shield className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-[#F8F6F0] tracking-wider font-serif-academic">HNGU LIBRARY</div>
                  <div className="text-[10px] text-[#D4AF37] font-mono font-bold">Executive Console</div>
                </div>
              </div>
            )}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 rounded-lg text-[#F8F6F0]/80 hover:text-[#D4AF37] hover:bg-white/10 transition cursor-pointer mx-auto"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-4 h-4 text-[#D4AF37]" /> : <ChevronLeft className="w-4 h-4 text-[#D4AF37]" />}
            </button>
          </div>

          {/* Navigation Items Organized by Priority */}
          <div className="space-y-4">
            {/* Group 1: Primary Library Operations */}
            <div className="space-y-1">
              {!isSidebarCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37] font-bold">
                  Primary Operations
                </div>
              )}

              {/* 1. Students */}
              <button
                onClick={() => setActiveTab('students')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer relative group ${
                  activeTab === 'students'
                    ? 'bg-[#D4AF37]/20 text-[#F8F6F0] font-bold shadow-sm border border-[#D4AF37] pl-3.5 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-[#D4AF37] before:rounded-r-sm'
                    : 'text-[#F8F6F0]/85 hover:bg-white/10 hover:text-[#F8F6F0]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users className={`w-4 h-4 shrink-0 ${activeTab === 'students' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 group-hover:text-[#D4AF37]'}`} />
                  {!isSidebarCollapsed && <span className="font-bold text-[#F8F6F0]">Students</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${activeTab === 'students' ? 'bg-[#D4AF37] text-[#0B1F3A]' : 'bg-[#071629] text-[#F8F6F0]/90 border border-[#D4AF37]/25'}`}>
                    {totalStudentsCount}
                  </span>
                )}
              </button>

              {/* 2. Library / Books */}
              <button
                onClick={() => setActiveTab('books')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer relative group ${
                  activeTab === 'books'
                    ? 'bg-[#D4AF37]/20 text-[#F8F6F0] font-bold shadow-sm border border-[#D4AF37] pl-3.5 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-[#D4AF37] before:rounded-r-sm'
                    : 'text-[#F8F6F0]/85 hover:bg-white/10 hover:text-[#F8F6F0]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <BookOpen className={`w-4 h-4 shrink-0 ${activeTab === 'books' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 group-hover:text-[#D4AF37]'}`} />
                  {!isSidebarCollapsed && <span className="font-bold text-[#F8F6F0]">Library & Books</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${activeTab === 'books' ? 'bg-[#D4AF37] text-[#0B1F3A]' : 'bg-[#071629] text-[#F8F6F0]/90 border border-[#D4AF37]/25'}`}>
                    {totalBooksCount}
                  </span>
                )}
              </button>

              {/* 3. Circulation */}
              <button
                onClick={() => setActiveTab('circulation')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer relative group ${
                  activeTab === 'circulation'
                    ? 'bg-[#D4AF37]/20 text-[#F8F6F0] font-bold shadow-sm border border-[#D4AF37] pl-3.5 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-[#D4AF37] before:rounded-r-sm'
                    : 'text-[#F8F6F0]/85 hover:bg-white/10 hover:text-[#F8F6F0]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Clock className={`w-4 h-4 shrink-0 ${activeTab === 'circulation' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 group-hover:text-[#D4AF37]'}`} />
                  {!isSidebarCollapsed && <span className="font-bold text-[#F8F6F0]">Circulation Desk</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${activeTab === 'circulation' ? 'bg-[#D4AF37] text-[#0B1F3A]' : 'bg-[#071629] text-[#F8F6F0]/90 border border-[#D4AF37]/25'}`}>
                    {currentlyIssuedBooks}
                  </span>
                )}
              </button>

              {/* 4. Live Entry & Exit */}
              <button
                onClick={() => setActiveTab('live')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer relative group ${
                  activeTab === 'live'
                    ? 'bg-[#D4AF37]/20 text-[#F8F6F0] font-bold shadow-sm border border-[#D4AF37] pl-3.5 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-[#D4AF37] before:rounded-r-sm'
                    : 'text-[#F8F6F0]/85 hover:bg-white/10 hover:text-[#F8F6F0]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ScanLine className={`w-4 h-4 shrink-0 ${activeTab === 'live' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 group-hover:text-[#D4AF37]'}`} />
                  {!isSidebarCollapsed && <span className="font-bold text-[#F8F6F0]">Live Entry & Exit</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                    {studentsInside} Inside
                  </span>
                )}
              </button>

              {/* 5. Analytics & Overview */}
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer relative group ${
                  activeTab === 'overview'
                    ? 'bg-[#D4AF37]/20 text-[#F8F6F0] font-bold shadow-sm border border-[#D4AF37] pl-3.5 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-[#D4AF37] before:rounded-r-sm'
                    : 'text-[#F8F6F0]/85 hover:bg-white/10 hover:text-[#F8F6F0]'
                }`}
              >
                <TrendingUp className={`w-4 h-4 shrink-0 ${activeTab === 'overview' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 group-hover:text-[#D4AF37]'}`} />
                {!isSidebarCollapsed && <span className="font-bold text-[#F8F6F0]">Analytics & Overview</span>}
              </button>
            </div>

            {/* Group 2: Secondary / Admin Controls */}
            <div className="space-y-1 pt-3 border-t border-[#D4AF37]/20">
              {!isSidebarCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37] font-bold">
                  Management & Logs
                </div>
              )}

              <button
                onClick={() => setActiveTab('student-management')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer relative group ${
                  activeTab === 'student-management'
                    ? 'bg-[#D4AF37]/20 text-[#F8F6F0] font-bold shadow-sm border border-[#D4AF37] pl-3.5 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-[#D4AF37] before:rounded-r-sm'
                    : 'text-[#F8F6F0]/85 hover:bg-white/10 hover:text-[#F8F6F0]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserX className={`w-4 h-4 shrink-0 ${activeTab === 'student-management' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 group-hover:text-[#D4AF37]'}`} />
                  {!isSidebarCollapsed && <span className="font-bold text-[#F8F6F0]">Record Controls</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] bg-rose-900/60 text-rose-300 border border-rose-500/40 font-mono font-bold">
                    Admin
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('activity')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer relative group ${
                  activeTab === 'activity'
                    ? 'bg-[#D4AF37]/20 text-[#F8F6F0] font-bold shadow-sm border border-[#D4AF37] pl-3.5 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-[#D4AF37] before:rounded-r-sm'
                    : 'text-[#F8F6F0]/85 hover:bg-white/10 hover:text-[#F8F6F0]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <History className={`w-4 h-4 shrink-0 ${activeTab === 'activity' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 group-hover:text-[#D4AF37]'}`} />
                  {!isSidebarCollapsed && <span className="font-bold text-[#F8F6F0]">Activity Ledger</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${activeTab === 'activity' ? 'bg-[#D4AF37] text-[#0B1F3A]' : 'bg-[#071629] text-[#F8F6F0]/90 border border-[#D4AF37]/25'}`}>
                    {combinedActivity.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Admin Profile & Logout */}
          <div className="pt-3 border-t border-[#D4AF37]/20 space-y-2.5">
            {!isSidebarCollapsed ? (
              <div className="p-3 bg-[#071629] rounded-xl border border-[#D4AF37]/30 space-y-0.5 shadow-xs">
                <div className="text-xs font-bold text-[#F8F6F0] truncate">
                  {adminUser?.name || 'HNGU Head Librarian'}
                </div>
                <div className="text-[10px] text-[#D4AF37] truncate font-mono font-bold">
                  {adminUser?.email || 'admin@ngu.ac.in'}
                </div>
              </div>
            ) : null}

            <button
              onClick={onAdminLogout}
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 transition cursor-pointer shadow-xs"
              title="Sign Out Staff"
            >
              <LogOut className="w-3.5 h-3.5" />
              {!isSidebarCollapsed && <span>Sign Out</span>}
            </button>

            {!isSidebarCollapsed && (
              <div className="pt-2 border-t border-[#D4AF37]/15 flex items-center justify-center">
                <ManagedByNeev variant="compact" />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN DASHBOARD CONTENT AREA */}
      {/* ========================================================================= */}
      <main className="flex-1 space-y-4 sm:space-y-6 min-w-0">
        {/* Mobile & Tablet Quick Navigation Strip */}
        <div className="lg:hidden rounded-2xl p-2.5 sm:p-3 border border-[#D4AF37]/35 bg-[#0B1F3A] shadow-xl text-[#F8F6F0]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#D4AF37]/25 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-[#071629] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shrink-0">
                <Shield className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-[#F8F6F0] font-serif-academic truncate">HNGU Executive Console</span>
            </div>
            <button
              onClick={onAdminLogout}
              className="text-[10px] sm:text-[11px] font-bold text-rose-300 hover:text-white px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 flex items-center gap-1 cursor-pointer shrink-0 transition"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign Out</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[38px] tab-interactive ${
                activeTab === 'overview'
                  ? 'bg-[#D4AF37] text-[#0B1F3A] font-bold shadow-sm border border-[#D4AF37]'
                  : 'text-[#F8F6F0]/85 hover:bg-white/10'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('students')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[38px] tab-interactive ${
                activeTab === 'students'
                  ? 'bg-[#D4AF37] text-[#0B1F3A] font-bold shadow-sm border border-[#D4AF37]'
                  : 'text-[#F8F6F0]/85 hover:bg-white/10'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Students ({totalStudentsCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('books')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[38px] tab-interactive ${
                activeTab === 'books'
                  ? 'bg-[#D4AF37] text-[#0B1F3A] font-bold shadow-sm border border-[#D4AF37]'
                  : 'text-[#F8F6F0]/85 hover:bg-white/10'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Books ({totalBooksCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('circulation')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[38px] tab-interactive ${
                activeTab === 'circulation'
                  ? 'bg-[#D4AF37] text-[#0B1F3A] font-bold shadow-sm border border-[#D4AF37]'
                  : 'text-[#F8F6F0]/85 hover:bg-white/10'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Circulation ({currentlyIssuedBooks})</span>
            </button>

            <button
              onClick={() => setActiveTab('live')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[38px] tab-interactive ${
                activeTab === 'live'
                  ? 'bg-[#D4AF37] text-[#0B1F3A] font-bold shadow-sm border border-[#D4AF37]'
                  : 'text-[#F8F6F0]/85 hover:bg-white/10'
              }`}
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>Live ({studentsInside})</span>
            </button>

            <button
              onClick={() => setActiveTab('activity')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[38px] tab-interactive ${
                activeTab === 'activity'
                  ? 'bg-[#D4AF37] text-[#0B1F3A] font-bold shadow-sm border border-[#D4AF37]'
                  : 'text-[#F8F6F0]/85 hover:bg-white/10'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Ledger ({combinedActivity.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('student-management')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[38px] tab-interactive ${
                activeTab === 'student-management'
                  ? 'bg-[#D4AF37] text-[#0B1F3A] font-bold shadow-sm border border-[#D4AF37]'
                  : 'text-[#F8F6F0]/85 hover:bg-white/10'
              }`}
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Controls</span>
            </button>
          </div>
        </div>

        {/* Top Header Bar with Live Operational Status */}
        <div className="rounded-2xl p-5 sm:p-6 md:p-7 border border-[#D4AF37]/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 bg-[#0B1F3A] text-[#F8F6F0] shadow-2xl relative overflow-hidden">
          <div className="space-y-2.5 z-10">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#071629] text-[#D4AF37] border border-[#D4AF37]/40 text-[10px] font-bold uppercase tracking-wider font-mono">
                <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                <span>HNGU Central Library Administration</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Turnstiles & Systems Online</span>
              </div>
            </div>
            <h1 className="font-serif-academic text-2xl sm:text-3xl font-extrabold text-[#F8F6F0] tracking-tight">
              Executive Administration & Overview
            </h1>
            <p className="text-xs sm:text-sm text-[#F8F6F0]/90 leading-relaxed font-medium flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Reading Hall: <strong className="text-[#D4AF37] font-extrabold">{studentsInside} inside</strong></span>
              <span className="text-[#D4AF37]/60">•</span>
              <span>Active Loans: <strong className="text-[#D4AF37] font-extrabold">{currentlyIssuedBooks} books checked out</strong></span>
              <span className="text-[#D4AF37]/60">•</span>
              <span>Catalog Ready: <strong className="text-[#D4AF37] font-extrabold">{availableBooks} on shelves</strong></span>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 z-10 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-[#D4AF37]/20 pt-3 sm:pt-0">
            <div className="px-4 py-2.5 rounded-xl bg-[#071629] border border-[#D4AF37]/35 text-left sm:text-right font-mono shadow-md">
              <div className="text-[10px] text-[#D4AF37] uppercase tracking-widest font-bold">{todayStr}</div>
              <div className="text-base font-extrabold text-[#F8F6F0]">{currentTime}</div>
              <div className="text-[10px] text-[#F8F6F0]/70 flex items-center sm:justify-end gap-1 mt-0.5">
                <Shield className="w-3 h-3 text-[#D4AF37]" />
                <span className="truncate max-w-[140px]">{adminUser?.name || 'Staff Authorized'}</span>
              </div>
            </div>

            {isOwner && (
              <button
                onClick={() => setShowAddLibrarianModal(true)}
                className="px-3.5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#e6c148] text-[#0B1F3A] transition cursor-pointer text-xs font-bold flex items-center gap-1.5 shadow-md border border-[#D4AF37]"
                title="Add authorized librarian profile"
              >
                <UserPlus className="w-4 h-4 text-[#0B1F3A]" />
                <span className="hidden sm:inline">Add Librarian</span>
              </button>
            )}

            <button
              onClick={onAdminLogout}
              className="px-3.5 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-700/50 transition cursor-pointer text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              title="Sign Out Staff"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Action Notice Toast / Banner */}
        {actionNotice && (
          <div
            className={`p-4 rounded-xl text-xs sm:text-sm flex items-center justify-between border shadow-md font-medium ${
              actionNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}
          >
            <span className="font-semibold">{actionNotice.message}</span>
            <button
              onClick={() => setActionNotice(null)}
              className="text-[#0B1F3A] hover:text-[#0B1F3A] text-xs px-2.5 py-1 rounded-lg bg-[#0B1F3A]/10 hover:bg-[#0B1F3A]/20 transition cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top Breadcrumb Bar when viewing an inner module */}
        {activeTab !== 'overview' && (
          <div className="flex items-center justify-between px-1 py-1">
            <button
              onClick={() => setActiveTab('overview')}
              className="inline-flex items-center gap-2 text-xs font-bold text-[#0B1F3A] hover:bg-white transition cursor-pointer px-3.5 py-2 rounded-xl bg-white/90 border border-[#D4AF37]/40 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
              <span>← Back to Executive Overview</span>
            </button>
            <span className="text-xs font-mono text-[#0B1F3A] uppercase tracking-wider font-bold hidden sm:inline-block">
              {activeTab === 'student-management'
                ? 'Student Record Controls'
                : activeTab === 'live'
                ? 'Live Entry & Exit'
                : activeTab === 'students'
                ? 'Students Directory'
                : activeTab === 'books'
                ? 'Library & Books'
                : activeTab === 'circulation'
                ? 'Circulation Desk'
                : 'Activity Ledger'}
            </span>
          </div>
        )}

        {/* Tab Content with Unified Page-to-Page Transition */}
        <div key={activeTab} className="page-transition-enter w-full space-y-6">
        {/* ========================================================================= */}
        {/* TAB 1: EXECUTIVE OVERVIEW — REFINED INFORMATION HIERARCHY */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* 1. KEY DAILY OVERVIEW INFORMATION STRIP: Enterprise KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl p-5 sm:p-6 border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold uppercase tracking-wider text-[11px] text-[#64748B]">Today's Visits</span>
                  <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-105 transition-transform">
                    <ScanLine className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight font-serif-academic tabular-nums">{todayEntries}</div>
                <div className="text-[11px] text-[#475569] font-medium mt-2 pt-2 border-t border-[#0B1F3A]/10 flex items-center justify-between">
                  <span>{todayExits} departures</span>
                  <span className="text-emerald-900 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-300">{studentsInside} inside</span>
                </div>
              </div>

              <div className="rounded-2xl p-5 sm:p-6 border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold uppercase tracking-wider text-[11px] text-[#64748B]">Circulation Loans</span>
                  <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-105 transition-transform">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight font-serif-academic tabular-nums">{currentlyIssuedBooks}</div>
                <div className="text-[11px] mt-2 pt-2 border-t border-[#0B1F3A]/10 flex items-center justify-between">
                  <span className="text-[#475569] font-medium">Checked out</span>
                  <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] font-mono border ${overdueBooks > 0 ? 'text-rose-900 bg-rose-50 border-rose-300' : 'text-emerald-900 bg-emerald-50 border-emerald-300'}`}>
                    {overdueBooks > 0 ? `${overdueBooks} Overdue` : 'On Schedule'}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl p-5 sm:p-6 border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold uppercase tracking-wider text-[11px] text-[#64748B]">Shelves & Catalog</span>
                  <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-105 transition-transform">
                    <BookOpen className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight font-serif-academic tabular-nums">{availableBooks}</div>
                <div className="text-[11px] text-[#475569] font-medium mt-2 pt-2 border-t border-[#0B1F3A]/10 flex items-center justify-between">
                  <span>of {totalBooks} physical copies</span>
                  <span className="text-[#0B1F3A] font-bold">{totalBooksCount} titles</span>
                </div>
              </div>

              <div className="rounded-2xl p-5 sm:p-6 border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold uppercase tracking-wider text-[11px] text-[#64748B]">Cardholders</span>
                  <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-105 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight font-serif-academic tabular-nums">{totalStudents}</div>
                <div className="text-[11px] text-[#475569] font-medium mt-2 pt-2 border-t border-[#0B1F3A]/10 flex items-center justify-between">
                  <span>Registered passes</span>
                  <span className="text-emerald-900 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-300">
                    {activeStudentsCount} active
                  </span>
                </div>
              </div>
            </div>

            {/* FREQUENT DAILY QUICK ACTIONS: 4 prominent, clear actions with text labels */}
            <div className="rounded-2xl p-5 border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-md space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A] flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Frequent Daily Quick Actions</span>
                </span>
                <span className="text-[11px] text-[#182F4E] font-medium hidden sm:inline">Direct access to primary desk workflows</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <button
                  onClick={() => setActiveTab('circulation')}
                  className="px-4 py-3 rounded-xl bg-[#F8F6F0] hover:bg-[#D4AF37]/15 border border-[#D4AF37]/35 hover:border-[#D4AF37] text-[#0B1F3A] text-left transition cursor-pointer flex items-center justify-between group shadow-2xs hover:shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0B1F3A]">
                        Issue / Return Books
                      </div>
                      <div className="text-[10px] text-[#182F4E] font-medium">Circulation Desk scan</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => setActiveTab('live')}
                  className="px-4 py-3 rounded-xl bg-[#F8F6F0] hover:bg-[#D4AF37]/15 border border-[#D4AF37]/35 hover:border-[#D4AF37] text-[#0B1F3A] text-left transition cursor-pointer flex items-center justify-between group shadow-2xs hover:shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
                      <ScanLine className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0B1F3A]">
                        Monitor Live Turnstiles
                      </div>
                      <div className="text-[10px] text-[#182F4E] font-medium">{studentsInside} inside reading hall</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => setActiveTab('students')}
                  className="px-4 py-3 rounded-xl bg-[#F8F6F0] hover:bg-[#D4AF37]/15 border border-[#D4AF37]/35 hover:border-[#D4AF37] text-[#0B1F3A] text-left transition cursor-pointer flex items-center justify-between group shadow-2xs hover:shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0B1F3A]">
                        Search Student Directory
                      </div>
                      <div className="text-[10px] text-[#182F4E] font-medium">{totalStudents} registered cards</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => setActiveTab('books')}
                  className="px-4 py-3 rounded-xl bg-[#F8F6F0] hover:bg-[#D4AF37]/15 border border-[#D4AF37]/35 hover:border-[#D4AF37] text-[#0B1F3A] text-left transition cursor-pointer flex items-center justify-between group shadow-2xs hover:shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0B1F3A]">
                        Catalog & Shelves
                      </div>
                      <div className="text-[10px] text-[#182F4E] font-medium">{totalBooksCount} titles in inventory</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 2. PRIMARY MODULES (IN REQUESTED ORDER: Students, Books, Circulation, Live) */}
            {/* ========================================================================= */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Primary Operational Modules
                </span>
                <span className="text-[11px] text-[#182F4E] font-medium">Click any module to open full workspace</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {/* 1. STUDENTS */}
                <div
                  onClick={() => setActiveTab('students')}
                  className="rounded-2xl p-5 border border-[#D4AF37]/35 hover:border-[#D4AF37] bg-white hover:bg-[#F8F6F0] shadow-sm hover:shadow-md flex flex-col justify-between group cursor-pointer transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-11 h-11 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-sm">
                        <Users className="w-5 h-5 text-[#D4AF37]" />
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                        {activeStudentsCount} Active
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37] block mb-1">
                      Module 01
                    </span>
                    <h3 className="text-sm font-bold text-[#0B1F3A]">Students Registry</h3>
                    <div className="text-3xl font-extrabold text-[#0B1F3A] tracking-tight mt-1 font-serif-academic">{totalStudents}</div>
                    <p className="text-xs text-[#182F4E] font-medium mt-2 leading-relaxed">
                      Student profiles, enrollment verification, and digital pass cards.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs text-[#0B1F3A] font-bold group-hover:text-[#0B1F3A]">
                    <span>Open Students</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>

                {/* 2. BOOKS / LIBRARY */}
                <div
                  onClick={() => setActiveTab('books')}
                  className="rounded-2xl p-5 border border-[#D4AF37]/35 hover:border-[#D4AF37] bg-white hover:bg-[#F8F6F0] shadow-sm hover:shadow-md flex flex-col justify-between group cursor-pointer transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-11 h-11 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-sm">
                        <BookOpen className="w-5 h-5 text-[#D4AF37]" />
                      </div>
                      <span className="text-xs font-mono font-bold text-[#0B1F3A] bg-[#F8F6F0] px-2.5 py-0.5 rounded-full border border-[#D4AF37]/40">
                        {totalBooksCount} Titles
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37] block mb-1">
                      Module 02
                    </span>
                    <h3 className="text-sm font-bold text-[#0B1F3A]">Books & Library</h3>
                    <div className="text-3xl font-extrabold text-[#0B1F3A] tracking-tight mt-1 font-serif-academic">{totalBooks}</div>
                    <p className="text-xs text-[#182F4E] font-medium mt-2 leading-relaxed">
                      {availableBooks} volumes on shelves. Manage acquisitions and rack coordinates.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs text-[#0B1F3A] font-bold group-hover:text-[#0B1F3A]">
                    <span>Manage Catalog</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>

                {/* 3. CIRCULATION */}
                <div
                  onClick={() => setActiveTab('circulation')}
                  className="rounded-2xl p-5 border border-[#D4AF37]/35 hover:border-[#D4AF37] bg-white hover:bg-[#F8F6F0] shadow-sm hover:shadow-md flex flex-col justify-between group cursor-pointer transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-11 h-11 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-sm">
                        <Clock className="w-5 h-5 text-[#D4AF37]" />
                      </div>
                      <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${overdueBooks > 0 ? 'text-rose-900 bg-rose-100 border-rose-300' : 'text-emerald-900 bg-emerald-100 border-emerald-300'}`}>
                        {overdueBooks > 0 ? `${overdueBooks} Overdue` : 'Loans Current'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37] block mb-1">
                      Module 03
                    </span>
                    <h3 className="text-sm font-bold text-[#0B1F3A]">Circulation Desk</h3>
                    <div className="text-3xl font-extrabold text-[#0B1F3A] tracking-tight mt-1 font-serif-academic">{currentlyIssuedBooks}</div>
                    <p className="text-xs text-[#182F4E] font-medium mt-2 leading-relaxed">
                      Active loans. Issue and return books with student pass barcodes.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs text-[#0B1F3A] font-bold group-hover:text-[#0B1F3A]">
                    <span>Open Circulation Desk</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>

                {/* 4. LIVE ENTRY & EXIT */}
                <div
                  onClick={() => setActiveTab('live')}
                  className="rounded-2xl p-5 border border-[#D4AF37]/35 hover:border-[#D4AF37] bg-white hover:bg-[#F8F6F0] shadow-sm hover:shadow-md flex flex-col justify-between group cursor-pointer transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-11 h-11 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-sm">
                        <ScanLine className="w-5 h-5 text-[#D4AF37]" />
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                        {todayEntries} Today
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37] block mb-1">
                      Module 04
                    </span>
                    <h3 className="text-sm font-bold text-[#0B1F3A]">Live Turnstiles</h3>
                    <div className="text-3xl font-extrabold text-[#0B1F3A] tracking-tight mt-1 font-serif-academic">{studentsInside}</div>
                    <p className="text-xs text-[#182F4E] font-medium mt-2 leading-relaxed">
                      Real-time turnstile barrier telemetry and active readers in the hall.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs text-[#0B1F3A] font-bold group-hover:text-[#0B1F3A]">
                    <span>View Turnstiles</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 3. RECENT ACTIVITY & IMPORTANT RECORDS */}
            {/* ========================================================================= */}
            <div className="space-y-4">
              {/* Live Occupants in Hall Preview if anyone is inside */}
              {studentsInside > 0 && (
                <div className="glass-panel-elevated rounded-2xl p-5 border border-[#D4AF37]/35 space-y-3 bg-white text-[#0B1F3A] shadow-md shadow-[#0B1F3A]/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                      <h3 className="text-sm font-bold text-[#0B1F3A]">Currently Reading in Hall</h3>
                      <span className="text-xs text-[#0B1F3A] font-mono font-bold">({studentsInside} Occupants)</span>
                    </div>
                    <button
                      onClick={() => setActiveTab('live')}
                      className="text-xs font-bold text-[#0B1F3A] hover:text-[#0B1F3A] transition cursor-pointer flex items-center gap-1 group"
                    >
                      <span>View Live Turnstiles</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {insideStudents
                      .slice(0, 6)
                      .map((s) => (
                        <div
                          key={s.id}
                          className="p-3 rounded-xl bg-[#F8F6F0] border border-[#D4AF37]/30 flex items-center justify-between gap-3 shadow-xs hover:border-[#D4AF37] transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={s.photo}
                              alt={s.name}
                              className="w-9 h-9 rounded-lg object-cover border border-[#0B1F3A]/20 shadow-xs shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#0B1F3A] truncate">{s.name}</div>
                              <div className="text-[10px] text-[#0B1F3A] font-mono font-bold">{s.studentId}</div>
                            </div>
                          </div>

                          <button
                            onClick={() => setSelectedStudentForModal(s)}
                            className="p-1.5 rounded-lg bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 text-[#F8F6F0] border border-[#D4AF37]/40 transition cursor-pointer shrink-0 shadow-xs"
                            title="View student ID card"
                            aria-label={`View student ID card for ${s.name}`}
                          >
                            <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Recent Activity Table (Last 5 records with quick link) */}
              <div className="glass-panel-elevated rounded-2xl p-5 sm:p-6 border border-[#D4AF37]/35 space-y-4 bg-white text-[#0B1F3A] shadow-md shadow-[#0B1F3A]/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[#D4AF37]" />
                    <div>
                      <h3 className="text-sm font-bold text-[#0B1F3A]">Recent Activity & Turnstile Events</h3>
                      <p className="text-[11px] text-[#182F4E] font-medium">Latest recorded check-ins and book loan transactions</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('activity')}
                    className="text-xs font-bold text-[#0B1F3A] hover:bg-[#F8F6F0] transition cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#D4AF37]/40 shadow-xs"
                  >
                    <span>Full Ledger ({combinedActivity.length})</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                  </button>
                </div>

                {combinedActivity.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#182F4E] font-medium bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/20">
                    No activity recorded yet today.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[#0B1F3A]/10 bg-white shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#D4AF37]/30 text-[#F8F6F0] uppercase text-xs tracking-wider font-mono font-semibold bg-[#0B1F3A]">
                          <th className="py-3 px-3.5">Student</th>
                          <th className="py-3 px-3.5">Action / Details</th>
                          <th className="py-3 px-3.5">Date & Time</th>
                          <th className="py-3 px-3.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#0B1F3A]/10 bg-white">
                        {combinedActivity.slice(0, 5).map((act) => (
                          <tr key={act.id} className="hover:bg-[#F8F6F0] transition">
                            <td className="py-2.5 px-3.5">
                              <div className="font-bold text-[#0B1F3A] text-xs">{act.studentName}</div>
                              <div className="text-[10px] text-[#0B1F3A] font-mono font-bold">{act.studentId}</div>
                            </td>
                            <td className="py-2.5 px-3.5 text-[#0B1F3A]">
                              {act.type === 'visit' ? (
                                <span className="text-[#0B1F3A] font-semibold">Turnstile Entry & Exit</span>
                              ) : (
                                <span className="text-[#0B1F3A] font-bold truncate max-w-xs block">{act.book}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-[#0B1F3A] font-mono text-[11px] font-semibold">
                              {act.date} • {act.type === 'visit' ? act.entryTime : act.issueDate}
                            </td>
                            <td className="py-2.5 px-3.5 text-right">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  act.status === 'Inside Library'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                    : act.status === 'Currently Borrowed'
                                    ? 'bg-amber-50 text-amber-900 border border-amber-300'
                                    : 'bg-[#F8F6F0] text-[#0B1F3A] border border-[#0B1F3A]/25'
                                }`}
                              >
                                {act.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 4. SECONDARY TOOLS & ADVANCED ACTIONS (Quiet, subordinate, and clearly labeled) */}
            {/* ========================================================================= */}
            <div className="pt-2 space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Secondary Administration & System Analytics
                </span>
                <span className="text-[11px] text-[#182F4E] font-medium">Less frequent administrative and reporting tools</span>
              </div>

              {/* Administrative Jump Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div
                  onClick={() => setActiveTab('student-management')}
                  className="p-4 rounded-2xl bg-white hover:bg-[#F8F6F0] border border-[#D4AF37]/35 card-interactive cursor-pointer flex items-center justify-between group shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37]">
                      <UserX className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0B1F3A] group-hover:text-[#0B1F3A] transition-colors">
                        Student Record Controls
                      </div>
                      <div className="text-[11px] text-[#182F4E] font-medium">
                        Deactivate cards, delete profiles, and filter by semester
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-0.5 transition-all" />
                </div>

                <div
                  onClick={() => setActiveTab('activity')}
                  className="p-4 rounded-2xl bg-white hover:bg-[#F8F6F0] border border-[#D4AF37]/35 card-interactive cursor-pointer flex items-center justify-between group shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37]">
                      <History className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#0B1F3A] group-hover:text-[#0B1F3A] transition-colors">
                        Full Activity Ledger & Audit Trail
                      </div>
                      <div className="text-[11px] text-[#182F4E] font-medium">
                        {combinedActivity.length} chronological entry and circulation records
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>

              {/* 2 Operations Analytics Meters */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
                <div className="p-5 rounded-2xl bg-white border border-[#D4AF37]/35 space-y-3 shadow-md shadow-[#0B1F3A]/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-[#D4AF37]" />
                      <h4 className="text-xs font-bold text-[#0B1F3A] tracking-tight">Turnstiles Gateway Flow Breakdown</h4>
                    </div>
                    <span className="text-[11px] text-[#0B1F3A] font-mono font-bold">{todayEntries} Total Check-ins</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-1">
                    <div className="p-3 bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/20 space-y-1.5">
                      <div className="flex justify-between text-xs text-[#0B1F3A] font-medium">
                        <span>Entries Today</span>
                        <span className="font-bold text-[#0B1F3A]">{todayEntries}</span>
                      </div>
                      <div className="w-full bg-[#0B1F3A]/10 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-emerald-600 h-full rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>

                    <div className="p-3 bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/20 space-y-1.5">
                      <div className="flex justify-between text-xs text-[#0B1F3A] font-medium">
                        <span>Exits Today</span>
                        <span className="font-bold text-[#0B1F3A]">{todayExits}</span>
                      </div>
                      <div className="w-full bg-[#0B1F3A]/10 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-[#D4AF37] h-full rounded-full"
                          style={{ width: `${todayEntries ? (todayExits / todayEntries) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#F8F6F0] border border-[#D4AF37]/20 rounded-xl flex items-center justify-between text-[11px]">
                    <span className="text-[#0B1F3A] font-bold">Current Occupants in Hall:</span>
                    <span className="font-mono text-emerald-800 font-bold">
                      {studentsInside} active readers
                    </span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-[#D4AF37]/35 space-y-3 shadow-md shadow-[#0B1F3A]/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-[#D4AF37]" />
                      <h4 className="text-xs font-bold text-[#0B1F3A] tracking-tight">Collection Utilization Breakdown</h4>
                    </div>
                    <span className="text-[11px] text-[#0B1F3A] font-mono font-bold">{totalBooks} Physical Volumes</span>
                  </div>

                  <div className="space-y-2.5 py-1">
                    <div>
                      <div className="flex justify-between text-xs text-[#0B1F3A] font-medium mb-1">
                        <span>Available on Shelves ({availableBooks})</span>
                        <span className="font-mono text-emerald-800 font-bold">
                          {totalBooks ? Math.round((availableBooks / totalBooks) * 100) : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-[#0B1F3A]/10 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-emerald-600 h-full rounded-full"
                          style={{ width: `${totalBooks ? (availableBooks / totalBooks) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[#0B1F3A] font-medium mb-1">
                        <span>Checked Out Loans ({currentlyIssuedBooks})</span>
                        <span className="font-mono text-[#0B1F3A] font-bold">
                          {totalBooks ? Math.round((currentlyIssuedBooks / totalBooks) * 100) : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-[#0B1F3A]/10 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-[#D4AF37] h-full rounded-full"
                          style={{ width: `${totalBooks ? (currentlyIssuedBooks / totalBooks) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#F8F6F0] border border-[#D4AF37]/20 rounded-xl flex items-center justify-between text-[11px]">
                    <span className="text-[#0B1F3A] font-bold">Overdue Risk:</span>
                    <span className={`font-mono font-bold ${overdueBooks > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                      {overdueBooks} overdue loans
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: STUDENTS DIRECTORY */}
        {/* ========================================================================= */}
        {activeTab === 'students' && (
          <div className="glass-panel-elevated rounded-3xl p-6 border border-[#D4AF37]/35 shadow-md shadow-[#0B1F3A]/5 space-y-5 bg-white text-[#0B1F3A]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#0B1F3A]">HNGU Student Cardholder Directory</h3>
                <p className="text-xs text-[#182F4E] font-medium">Total {totalStudentsCount} registered members with personal QR passes</p>
              </div>

              <div className="relative w-full sm:w-80">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      handleExecuteStudentSearch(e.target.value);
                    }}
                    placeholder="Search name, roll, email, phone, doc ID..."
                    className="w-full bg-[#F8F6F0] border border-[#D4AF37]/40 rounded-xl pl-10 pr-8 py-2.5 text-xs text-[#0B1F3A] placeholder-[#182F4E]/80 focus:outline-none focus:border-[#D4AF37] transition-colors focus:ring-1 focus:ring-[#D4AF37]/40 font-medium"
                  />
                  {isSearchingStudents && (
                    <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37] animate-spin absolute right-3 top-3" />
                  )}
                </div>
                <p className="text-[10px] text-[#0B1F3A]/70 font-medium mt-1 pl-1">
                  Enter full roll number, or the first letters of the name.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-2xs">
              <table className="w-full text-left text-xs min-w-[800px]">
                <thead>
                  <tr className="border-b border-[#D4AF37]/30 text-[#F8F6F0] uppercase text-xs tracking-wider font-mono font-semibold bg-[#0B1F3A]">
                    <th className="py-3.5 px-4 w-52">Student Cardholder</th>
                    <th className="py-3.5 px-4 w-36">Roll / Student ID</th>
                    <th className="py-3.5 px-4 w-44">Academic Program</th>
                    <th className="py-3.5 px-4 w-48">Contact Info</th>
                    <th className="py-3.5 px-4 text-center w-36">Turnstile State</th>
                    <th className="py-3.5 px-4 text-center w-32">Status</th>
                    <th className="py-3.5 px-4 text-right w-36">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0B1F3A]/10 font-sans">
                  {filteredStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-[#F8F6F0]/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img src={s.photo} alt={s.name} className="w-9 h-9 rounded-xl object-cover border border-[#0B1F3A]/15 shadow-2xs" />
                          <div>
                            <div className="font-bold text-[#0B1F3A] text-xs">{s.name}</div>
                            <div className="text-[10px] text-[#64748B] font-mono font-medium">{s.membershipId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#0B1F3A] text-xs tabular-nums">{s.studentId}</td>
                      <td className="py-3.5 px-4 text-[#0B1F3A]">
                        <div className="font-semibold text-[#0B1F3A]">{s.course} ({s.semester})</div>
                        <div className="text-[10px] text-[#64748B] font-medium">{s.department}</div>
                      </td>
                      <td className="py-3.5 px-4 text-[#0B1F3A]">
                        <div className="font-medium text-[#0B1F3A] text-xs">{s.email}</div>
                        <div className="text-[10px] text-[#64748B] font-mono tabular-nums">{s.mobile}</div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            s.isInside
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : 'bg-[#F8F6F0] text-[#334155] border border-[#0B1F3A]/10'
                          }`}
                        >
                          {s.isInside ? 'Inside Hall' : 'Outside'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            s.status === 'active'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : s.status === 'deactivated'
                              ? 'bg-rose-50 text-rose-800 border border-rose-300'
                              : 'bg-amber-50 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedStudentForModal(s)}
                            className="px-2.5 py-1 text-xs bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl transition cursor-pointer flex items-center gap-1 border border-[#D4AF37]/50 font-bold shadow-2xs"
                            title="View Full Profile & History"
                            aria-label={`View profile and pass for ${s.name}`}
                          >
                            <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Pass</span>
                          </button>
                          <button
                            onClick={() => toggleStudentStatus(s)}
                            className={`p-1.5 rounded-xl text-xs font-semibold cursor-pointer transition border ${
                              s.status === 'active'
                                ? 'text-rose-800 hover:bg-rose-50 border-rose-300'
                                : 'text-emerald-800 hover:bg-emerald-50 border-emerald-300'
                            }`}
                            title={s.status === 'active' ? 'Suspend privileges' : 'Restore privileges'}
                            aria-label={s.status === 'active' ? `Suspend privileges for ${s.name}` : `Restore privileges for ${s.name}`}
                          >
                            {s.status === 'active' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination Controls (25 per page) */}
              {searchResults === null && (
                <div className="flex items-center justify-between p-3.5 border-t border-[#0B1F3A]/10 bg-[#F8F6F0]/50 text-xs">
                  <span className="text-[#182F4E] font-medium font-mono">
                    Page {studentsPage} • 25 students per page
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevStudentsPage}
                      disabled={studentsPage <= 1 || loadingStudents}
                      className="px-3 py-1.5 rounded-xl border border-[#D4AF37]/40 bg-white hover:bg-[#F8F6F0] disabled:opacity-40 disabled:cursor-not-allowed font-bold text-[#0B1F3A] flex items-center gap-1 transition shadow-2xs cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous</span>
                    </button>
                    <button
                      onClick={handleNextStudentsPage}
                      disabled={!hasMoreStudents || loadingStudents}
                      className="px-3 py-1.5 rounded-xl border border-[#D4AF37]/40 bg-white hover:bg-[#F8F6F0] disabled:opacity-40 disabled:cursor-not-allowed font-bold text-[#0B1F3A] flex items-center gap-1 transition shadow-2xs cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: BOOKS MANAGEMENT - Pass adminUser prop for authorization */}
        {activeTab === 'books' && (
          <div className="space-y-4">
            <BookManager adminUser={adminUser} />
          </div>
        )}

        {/* TAB 4: CIRCULATION DESK - Pass adminUser prop for authorization */}
        {activeTab === 'circulation' && (
          <div className="space-y-4">
            <CirculationDesk adminUser={adminUser} />
          </div>
        )}

        {/* TAB 5: LIVE TURNSTILES & HALL OCCUPANCY */}
        {activeTab === 'live' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="glass-panel-elevated rounded-3xl p-6 sm:p-7 border border-[#D4AF37]/35 shadow-md shadow-[#0B1F3A]/5 space-y-5 bg-white text-[#0B1F3A]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-[#0B1F3A] flex items-center gap-2">
                    <ScanLine className="w-5 h-5 text-[#D4AF37]" />
                    <span>Live Turnstiles & Reading Hall Occupants</span>
                  </h3>
                  <p className="text-xs text-[#182F4E] font-medium mt-1">
                    Real-time automated check-in telemetry from university entrance turnstiles.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-mono font-bold">
                    {studentsInside} Active Readers Inside
                  </span>
                </div>
              </div>

              {/* Occupancy stats strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-4 bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/30 text-center shadow-xs">
                  <div className="text-2xl font-bold text-[#0B1F3A]">{todayEntries}</div>
                  <div className="text-xs text-[#0B1F3A] mt-1 font-bold">Today's Check-ins</div>
                </div>
                <div className="p-4 bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/30 text-center shadow-xs">
                  <div className="text-2xl font-bold text-[#0B1F3A]">{todayExits}</div>
                  <div className="text-xs text-[#0B1F3A] mt-1 font-bold">Today's Exits</div>
                </div>
                <div className="p-4 bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/30 text-center shadow-xs">
                  <div className="text-2xl font-bold text-emerald-700">{studentsInside}</div>
                  <div className="text-xs text-[#0B1F3A] mt-1 font-bold">Currently Inside Hall</div>
                </div>
              </div>

              {/* Grid of students currently inside */}
              <div className="pt-2 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Students Currently Checked In
                </h4>

                {studentsInside === 0 ? (
                  <div className="py-12 text-center text-xs sm:text-sm text-[#182F4E] font-medium bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/20 p-8">
                    No students are currently inside the library hall.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {insideStudents.map((s) => (
                      <div
                        key={s.id}
                        className="p-4 rounded-2xl bg-[#F8F6F0] border border-[#D4AF37]/30 flex items-center justify-between gap-3 shadow-xs hover:border-[#D4AF37] transition"
                      >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={s.photo}
                              alt={s.name}
                              className="w-11 h-11 rounded-xl object-cover border border-[#0B1F3A]/20 shadow-xs shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#0B1F3A] truncate">{s.name}</div>
                              <div className="text-[10px] text-[#0B1F3A] font-mono font-bold">{s.studentId}</div>
                              <div className="text-[10px] text-[#182F4E] font-medium truncate">{s.course} (Sem {s.semester})</div>
                            </div>
                          </div>

                          <button
                            onClick={() => setSelectedStudentForModal(s)}
                            className="px-3 py-1.5 rounded-xl bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 text-[#F8F6F0] border border-[#D4AF37]/40 transition cursor-pointer text-xs font-semibold flex items-center gap-1 shrink-0 shadow-xs"
                            title="View Student Pass"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Pass</span>
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: UNIFIED ACTIVITY LEDGER */}
        {activeTab === 'activity' && (
          <div className="glass-panel-elevated rounded-3xl p-6 border border-[#D4AF37]/35 shadow-md shadow-[#0B1F3A]/5 space-y-4 bg-white text-[#0B1F3A]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#0B1F3A]">Unified HNGU Activity Log</h3>
                <p className="text-xs text-[#182F4E] font-medium">Total {combinedActivity.length} events (Visits & Book Loans)</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Filter log..."
                  className="bg-[#F8F6F0] border border-[#D4AF37]/40 rounded-xl px-3 py-1.5 text-xs text-[#0B1F3A] placeholder-[#182F4E]/80 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 font-medium"
                />

                {/* Date Filter: Range or Single Date */}
                <div className="flex items-center gap-1.5 bg-[#F8F6F0] px-2.5 py-1 rounded-xl border border-[#D4AF37]/30 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="text-[10px] uppercase font-bold text-[#0B1F3A]">Date:</span>
                  <input
                    type="date"
                    value={activityStartDate}
                    onChange={(e) => setActivityStartDate(e.target.value)}
                    className="bg-white border border-[#D4AF37]/40 rounded-lg px-2 py-0.5 text-[11px] text-[#0B1F3A] focus:outline-none focus:border-[#D4AF37]"
                    title="From Date"
                  />
                  <span className="text-[#0B1F3A]/60 font-bold">-</span>
                  <input
                    type="date"
                    value={activityEndDate}
                    onChange={(e) => setActivityEndDate(e.target.value)}
                    className="bg-white border border-[#D4AF37]/40 rounded-lg px-2 py-0.5 text-[11px] text-[#0B1F3A] focus:outline-none focus:border-[#D4AF37]"
                    title="To Date"
                  />
                  {(activityStartDate || activityEndDate) && (
                    <button
                      onClick={() => {
                        setActivityStartDate('');
                        setActivityEndDate('');
                      }}
                      className="text-xs text-rose-700 hover:text-rose-900 font-bold px-1.5 py-0.5 cursor-pointer"
                      title="Clear date filter"
                      aria-label="Clear date filter"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <select
                  value={activityFilter}
                  onChange={(e) => setActivityFilter(e.target.value as any)}
                  className="bg-[#F8F6F0] border border-[#D4AF37]/40 rounded-xl px-3 py-1.5 text-xs text-[#0B1F3A] font-bold focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="all">All Events</option>
                  <option value="inside">Inside Library</option>
                  <option value="issued">Currently Borrowed</option>
                  <option value="returned">Returned Books</option>
                </select>
              </div>
            </div>

            {(returnedFallbackActive || visitsFallbackActive) && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Index is still building, showing partial results</span>
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-xs">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#D4AF37]/30 text-[#F8F6F0] uppercase text-xs tracking-wider font-mono font-semibold bg-[#0B1F3A]">
                    <th className="py-3.5 px-4">Student</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Entry</th>
                    <th className="py-3.5 px-4">Exit</th>
                    <th className="py-3.5 px-4">Book Title</th>
                    <th className="py-3.5 px-4">Issue Time</th>
                    <th className="py-3.5 px-4">Return Time</th>
                    <th className="py-3.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0B1F3A]/10 bg-white">
                  {filteredActivity.map((act) => (
                    <tr key={act.id} className="hover:bg-[#F8F6F0] transition">
                      <td className="py-3 px-4 font-sans font-semibold text-[#0B1F3A]">
                        <div className="font-bold text-[#0B1F3A] text-xs">{act.studentName}</div>
                        <div className="text-[10px] text-[#0B1F3A] font-mono font-bold">{act.studentId}</div>
                      </td>
                      <td className="py-3 px-4 text-[#0B1F3A] font-sans font-medium">{act.date}</td>
                      <td className="py-3 px-4 text-emerald-700 font-bold">{act.entryTime}</td>
                      <td className="py-3 px-4 text-[#0B1F3A] font-bold">{act.exitTime}</td>
                      <td className="py-3 px-4 font-sans text-[#0B1F3A] font-bold">{act.book}</td>
                      <td className="py-3 px-4 text-[#0B1F3A] font-medium">{act.issueDate}</td>
                      <td className="py-3 px-4 text-[#0B1F3A] font-sans font-medium">{act.returnDate}</td>
                      <td className="py-3 px-4 text-right font-sans">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            act.status === 'Inside Library'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : act.status === 'Currently Borrowed'
                              ? 'bg-amber-50 text-amber-900 border border-amber-300'
                              : act.status === 'Book Returned'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : 'bg-[#F8F6F0] text-[#0B1F3A] border border-[#0B1F3A]/25'
                          }`}
                        >
                          {act.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(hasMoreVisits || hasMoreReturned) && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => {
                    if (hasMoreVisits) loadMoreVisits();
                    if (hasMoreReturned) loadMoreReturned();
                  }}
                  disabled={loadingVisits || loadingReturned}
                  className="px-4 py-2 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl text-xs font-bold border border-[#D4AF37] shadow-xs cursor-pointer flex items-center gap-2 transition"
                >
                  {(loadingVisits || loadingReturned) && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />}
                  <span>Load More Historical Activity</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: DEDICATED STUDENT MANAGEMENT VIEW */}
        {activeTab === 'student-management' && renderStudentManagement(false)}
        </div>
      </main>

      {/* Student Detail Modal: Full profile, visit history, and loan transactions on demand */}
      {selectedStudentForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter">
          <div className="relative w-full max-w-3xl bg-white border border-[#D4AF37]/35 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5 text-[#0B1F3A] modal-panel-enter">
            <div className="flex items-center justify-between border-b border-[#0B1F3A]/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A]">Student Master Dossier & Full Audit Trail</h3>
                <p className="text-xs text-[#0B1F3A] font-mono font-bold">
                  {selectedStudentForModal.name} • Roll: {selectedStudentForModal.studentId}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudentForModal(null)}
                className="px-4 py-2 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl text-xs font-bold cursor-pointer border border-[#D4AF37] transition shadow-xs btn-press"
              >
                Close
              </button>
            </div>

            {/* Modal Internal Navigation */}
            <div className="flex items-center gap-2 p-1.5 bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/30 text-xs">
              <button
                onClick={() => setModalTab('card')}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition cursor-pointer text-center ${
                  modalTab === 'card'
                    ? 'bg-[#0B1F3A] text-[#F8F6F0] shadow-xs'
                    : 'text-[#0B1F3A] hover:bg-white/80'
                }`}
              >
                Digital Pass Card
              </button>
              <button
                onClick={() => setModalTab('visits')}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                  modalTab === 'visits'
                    ? 'bg-[#0B1F3A] text-[#F8F6F0] shadow-xs'
                    : 'text-[#0B1F3A] hover:bg-white/80'
                }`}
              >
                <span>Full Visits History</span>
                <span className="px-1.5 py-0.2 rounded-md bg-[#D4AF37]/20 text-[10px] font-mono">
                  {modalVisits.length}
                </span>
              </button>
              <button
                onClick={() => setModalTab('loans')}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                  modalTab === 'loans'
                    ? 'bg-[#0B1F3A] text-[#F8F6F0] shadow-xs'
                    : 'text-[#0B1F3A] hover:bg-white/80'
                }`}
              >
                <span>Full Book Loans</span>
                <span className="px-1.5 py-0.2 rounded-md bg-[#D4AF37]/20 text-[10px] font-mono">
                  {modalTransactions.length}
                </span>
              </button>
            </div>

            {/* TAB 1: ID Card */}
            {modalTab === 'card' && (
              <div className="space-y-4 pt-1">
                <StudentIdCard student={selectedStudentForModal} />
              </div>
            )}

            {/* TAB 2: Full Visits History */}
            {modalTab === 'visits' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#182F4E] font-medium">
                  <span>Turnstile Check-in Logs for {selectedStudentForModal.name}</span>
                  <span className="font-mono">{modalVisits.length} records loaded</span>
                </div>

                {modalVisitsFallbackActive && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Index is still building, showing partial results</span>
                  </div>
                )}

                {loadingModalVisits && modalVisits.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#182F4E] flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#D4AF37]" />
                    <span>Loading student visit history...</span>
                  </div>
                ) : modalVisits.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#182F4E] bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/20">
                    No recorded library visits for this student yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[#0B1F3A]/10 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#D4AF37]/30 text-[#F8F6F0] uppercase text-xs tracking-wider font-mono font-semibold bg-[#0B1F3A]">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Entry Time</th>
                          <th className="py-2.5 px-3">Exit Time</th>
                          <th className="py-2.5 px-3">Duration</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#0B1F3A]/10">
                        {modalVisits.map((v) => (
                          <tr key={v.id} className="hover:bg-[#F8F6F0]">
                            <td className="py-2.5 px-3 font-medium">{v.entryDate}</td>
                            <td className="py-2.5 px-3 text-emerald-700 font-bold">{v.entryTime}</td>
                            <td className="py-2.5 px-3 text-[#0B1F3A]">{v.exitTime || '—'}</td>
                            <td className="py-2.5 px-3 text-[#182F4E]">{v.duration || (v.active ? 'Active' : '—')}</td>
                            <td className="py-2.5 px-3 text-right">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  v.active
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                    : 'bg-[#F8F6F0] text-[#0B1F3A] border border-[#0B1F3A]/20'
                                }`}
                              >
                                {v.active ? 'Inside Library' : 'Completed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {hasMoreModalVisits && (
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={loadMoreModalVisits}
                      disabled={loadingModalVisits}
                      className="px-3.5 py-1.5 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl text-xs font-bold border border-[#D4AF37] shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      {loadingModalVisits && <RefreshCw className="w-3 h-3 animate-spin text-[#D4AF37]" />}
                      <span>Load More Visits</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Full Book Transactions */}
            {modalTab === 'loans' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#182F4E] font-medium">
                  <span>Circulation Loan Ledger for {selectedStudentForModal.name}</span>
                  <span className="font-mono">{modalTransactions.length} records loaded</span>
                </div>

                {modalTxFallbackActive && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Index is still building, showing partial results</span>
                  </div>
                )}

                {loadingModalTx && modalTransactions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#182F4E] flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#D4AF37]" />
                    <span>Loading student book loans...</span>
                  </div>
                ) : modalTransactions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#182F4E] bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/20">
                    No book transactions recorded for this student.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[#0B1F3A]/10 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#D4AF37]/30 text-[#F8F6F0] uppercase text-xs tracking-wider font-mono font-semibold bg-[#0B1F3A]">
                          <th className="py-2.5 px-3">Book Title</th>
                          <th className="py-2.5 px-3">Book ID</th>
                          <th className="py-2.5 px-3">Issue Date</th>
                          <th className="py-2.5 px-3">Due Date</th>
                          <th className="py-2.5 px-3">Return Date</th>
                          <th className="py-2.5 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#0B1F3A]/10">
                        {modalTransactions.map((t) => (
                          <tr key={t.id} className="hover:bg-[#F8F6F0]">
                            <td className="py-2.5 px-3 font-bold text-[#0B1F3A]">{t.bookTitle}</td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">{t.bookId}</td>
                            <td className="py-2.5 px-3 text-[#182F4E]">{t.issueDate}</td>
                            <td className="py-2.5 px-3 font-medium text-[#0B1F3A]">{t.dueDate}</td>
                            <td className="py-2.5 px-3 text-[#182F4E]">{t.returnDate || '—'}</td>
                            <td className="py-2.5 px-3 text-right">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  t.status === 'Issued'
                                    ? new Date(t.dueDate).getTime() < Date.now()
                                      ? 'bg-rose-50 text-rose-800 border border-rose-300'
                                      : 'bg-amber-50 text-amber-900 border border-amber-300'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                {t.status === 'Issued' && new Date(t.dueDate).getTime() < Date.now()
                                  ? 'Overdue'
                                  : t.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {hasMoreModalTx && (
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={loadMoreModalTx}
                      disabled={loadingModalTx}
                      className="px-3.5 py-1.5 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] rounded-xl text-xs font-bold border border-[#D4AF37] shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      {loadingModalTx && <RefreshCw className="w-3 h-3 animate-spin text-[#D4AF37]" />}
                      <span>Load More Loans</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deactivate Student Confirmation Dialog */}
      {studentToDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter">
          <div className="relative w-full max-w-lg bg-white border border-[#D4AF37]/35 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 text-[#0B1F3A] modal-panel-enter">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 border border-amber-300 flex items-center justify-center shadow-xs shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0B1F3A]">Deactivate Student?</h3>
                <p className="text-xs text-[#182F4E] font-medium">Suspend active library privileges & invalidate QR pass</p>
              </div>
            </div>

            <div className="p-4 bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/30 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Student Name:</span>
                <span className="font-bold text-[#0B1F3A]">{studentToDeactivate.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Roll / Student ID:</span>
                <span className="font-mono font-bold text-[#0B1F3A]">{studentToDeactivate.studentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Program:</span>
                <span className="text-[#0B1F3A] font-semibold">{studentToDeactivate.course} (Sem {studentToDeactivate.semester})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Document ID:</span>
                <span className="font-mono text-[#0B1F3A] font-bold">{studentToDeactivate.id}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-[#182F4E] font-medium leading-relaxed">
                This action will deactivate this student's active library profile. All historical Entry/Exit and book loan records remain preserved for audit trails.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={deactivatingLoading}
                onClick={() => setStudentToDeactivate(null)}
                className="px-4 py-2.5 rounded-xl bg-[#F8F6F0] hover:bg-white text-[#0B1F3A] border border-[#0B1F3A]/20 text-xs font-bold transition cursor-pointer btn-press"
              >
                Cancel
              </button>
              <button
                disabled={deactivatingLoading}
                onClick={handleConfirmDeactivate}
                className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] border border-[#D4AF37] text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-2 btn-press"
              >
                {deactivatingLoading ? <RefreshCw className="w-4 h-4 animate-spin text-[#D4AF37]" /> : <UserX className="w-4 h-4 text-[#D4AF37]" />}
                <span>Deactivate Student</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Remove Student Confirmation Dialog */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter">
          <div className="relative w-full max-w-lg bg-white border border-[#D4AF37]/35 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 text-[#0B1F3A] modal-panel-enter">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 border border-rose-300 flex items-center justify-center shadow-xs shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0B1F3A]">Delete Student?</h3>
                <p className="text-xs text-rose-800 font-medium">Remove student active profile</p>
              </div>
            </div>

            <div className="p-4 bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/30 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Student Name:</span>
                <span className="font-bold text-[#0B1F3A]">{studentToDelete.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Roll / Student ID:</span>
                <span className="font-mono font-bold text-[#0B1F3A]">{studentToDelete.studentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Program & Semester:</span>
                <span className="text-[#0B1F3A] font-semibold">{studentToDelete.course} • Sem {studentToDelete.semester}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Email:</span>
                <span className="text-[#0B1F3A] font-semibold">{studentToDelete.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#0B1F3A] font-bold">Document ID:</span>
                <span className="font-mono text-[#0B1F3A] font-bold">{studentToDelete.id}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-[#182F4E] font-medium leading-relaxed">
                This action will remove this student's active library profile. Please confirm that you want to continue.
              </p>
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-[11px] text-emerald-900 font-medium">
                ✓ University Notice: Historical Entry/Exit records and Book Issue/Return ledger records are permanently preserved and will NOT be deleted.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={deactivatingLoading}
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-[#F8F6F0] hover:bg-white text-[#0B1F3A] border border-[#0B1F3A]/20 text-xs font-bold transition cursor-pointer btn-press"
              >
                Cancel
              </button>
              <button
                disabled={deactivatingLoading}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-2 border border-rose-400 btn-destructive-press"
              >
                {deactivatingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete Student</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner Action: Add / Approve Librarian Modal */}
      {showAddLibrarianModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter">
          <div className="relative w-full max-w-md bg-white border border-[#D4AF37]/35 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 text-[#0B1F3A] modal-panel-enter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shadow-xs shrink-0">
                  <UserPlus className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#0B1F3A]">Add Authorized Librarian</h3>
                  <p className="text-xs text-[#182F4E] font-medium">Owner-only staff onboarding to /admins</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddLibrarianModal(false)}
                className="p-1.5 text-[#0B1F3A] hover:bg-[#F8F6F0] rounded-xl transition cursor-pointer"
                aria-label="Close add librarian modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#182F4E] leading-relaxed">
              Register an authorized university staff member. Their Google Auth UID will be assigned the <strong>librarian</strong> role, granting access to books, kiosks, and circulation controls.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!adminUser) return;
                setAddingLibrarianLoading(true);
                try {
                  await addLibrarianByOwner(adminUser, newLibrarianUid, newLibrarianEmail, newLibrarianName);
                  setActionNotice({
                    type: 'success',
                    message: `Librarian "${newLibrarianName}" (${newLibrarianEmail}) successfully authorized!`,
                  });
                  setTimeout(() => setActionNotice(null), 5000);
                  setShowAddLibrarianModal(false);
                  setNewLibrarianUid('');
                  setNewLibrarianEmail('');
                  setNewLibrarianName('');
                } catch (err: any) {
                  setActionNotice({
                    type: 'error',
                    message: 'Error adding librarian: ' + err.message,
                  });
                } finally {
                  setAddingLibrarianLoading(false);
                }
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-[#0B1F3A] mb-1">
                  Firebase Auth UID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 5xG8... (from Firebase Auth console)"
                  value={newLibrarianUid}
                  onChange={(e) => setNewLibrarianUid(e.target.value)}
                  className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/20 rounded-xl px-3 py-2 text-xs font-mono text-[#0B1F3A] input-focus-smooth"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B1F3A] mb-1">
                  Staff Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. staff@ngu.ac.in"
                  value={newLibrarianEmail}
                  onChange={(e) => setNewLibrarianEmail(e.target.value)}
                  className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/20 rounded-xl px-3 py-2 text-xs text-[#0B1F3A] input-focus-smooth"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B1F3A] mb-1">
                  Full Name / Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prof. R. Patel (Assistant Librarian)"
                  value={newLibrarianName}
                  onChange={(e) => setNewLibrarianName(e.target.value)}
                  className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/20 rounded-xl px-3 py-2 text-xs text-[#0B1F3A] input-focus-smooth"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  disabled={addingLibrarianLoading}
                  onClick={() => setShowAddLibrarianModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#F8F6F0] hover:bg-white text-[#0B1F3A] border border-[#0B1F3A]/20 text-xs font-bold transition cursor-pointer btn-press"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingLibrarianLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] border border-[#D4AF37] text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-2 btn-press"
                >
                  {addingLibrarianLoading ? <RefreshCw className="w-4 h-4 animate-spin text-[#D4AF37]" /> : <UserPlus className="w-4 h-4 text-[#D4AF37]" />}
                  <span>Authorize Librarian</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
