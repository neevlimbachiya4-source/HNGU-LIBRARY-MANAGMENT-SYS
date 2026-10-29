import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchStudentMe,
  fetchStudentVisitsApi,
  fetchStudentLoansApi,
  fetchStudentActiveLoansApi,
} from '../lib/studentAuth';
import { Student, LibraryVisit, BookTransaction } from '../types';
import { StudentIdCard } from './StudentIdCard';
import { QrCodeDisplay } from './QrCodeDisplay';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  History,
  QrCode,
  LogOut,
  ShieldCheck,
  Search,
  ChevronRight,
  ExternalLink,
  Clock,
  Printer,
  Copy,
  Check,
  ArrowRight,
  GraduationCap,
} from 'lucide-react';

interface StudentProfileProps {
  student: Student;
  onLogout: () => void;
  onRefreshStudent?: () => void;
  onBrowseCatalogue?: () => void;
}

export const StudentProfile: React.FC<StudentProfileProps> = ({
  student: initialStudent,
  onLogout,
  onBrowseCatalogue,
}) => {
  const [student, setStudent] = useState<Student>(initialStudent);
  const [activeTab, setActiveTab] = useState<'idcard' | 'books' | 'visits' | 'qr'>('books');
  const [visits, setVisits] = useState<LibraryVisit[]>([]);
  const [transactions, setTransactions] = useState<BookTransaction[]>([]);
  const [activeLoans, setActiveLoans] = useState<BookTransaction[]>([]);
  const [visitLimit, setVisitLimit] = useState<number>(50);
  const [loanLimit, setLoanLimit] = useState<number>(50);
  const [totalVisitsCount, setTotalVisitsCount] = useState<number>(0);
  const [totalLoansCount, setTotalLoansCount] = useState<number>(0);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [visitsLoadedOnce, setVisitsLoadedOnce] = useState(false);
  const [loansLoadedOnce, setLoansLoadedOnce] = useState(false);

  // Search & filter for borrowed books
  const [loanSearch, setLoanSearch] = useState('');
  const [loanFilter, setLoanFilter] = useState<'all' | 'issued' | 'overdue' | 'returned'>('all');
  const [copiedToken, setCopiedToken] = useState(false);

  // 1. Lightweight background poll: ONLY polls student document and active loans (every 50s, only while visible)
  const pollCoreStudentAndActiveLoans = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return; // Skip poll if browser tab is in background or minimized
    }

    try {
      const [updatedStudent, activeLoansList] = await Promise.all([
        fetchStudentMe(),
        fetchStudentActiveLoansApi(),
      ]);

      if (!updatedStudent || updatedStudent.status !== 'active') {
        onLogout();
        return;
      }

      setStudent(updatedStudent);
      setActiveLoans(activeLoansList);
    } catch (err) {
      console.warn('Lightweight profile polling notice:', err);
    }
  }, [onLogout]);

  // Set up 50-second lightweight poll (restricted to visible tab)
  useEffect(() => {
    pollCoreStudentAndActiveLoans();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollCoreStudentAndActiveLoans();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalTimer = setInterval(pollCoreStudentAndActiveLoans, 50000); // 50s interval

    return () => {
      clearInterval(intervalTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pollCoreStudentAndActiveLoans]);

  // 2. Load historical visits on-demand ONLY when the Visits tab is active
  useEffect(() => {
    if (activeTab !== 'visits') return;

    let isMounted = true;
    const fetchVisits = async () => {
      setLoadingVisits(true);
      try {
        const vRes = await fetchStudentVisitsApi(visitLimit);
        if (isMounted) {
          setVisits(vRes.visits || []);
          setTotalVisitsCount(vRes.totalCount || vRes.visits?.length || 0);
          setVisitsLoadedOnce(true);
        }
      } catch (err) {
        console.warn('Error fetching student visits:', err);
      } finally {
        if (isMounted) setLoadingVisits(false);
      }
    };

    fetchVisits();
    return () => {
      isMounted = false;
    };
  }, [activeTab, visitLimit]);

  // 3. Load full historical loans on-demand ONLY when the Books tab is active
  useEffect(() => {
    if (activeTab !== 'books') return;

    let isMounted = true;
    const fetchLoans = async () => {
      setLoadingTransactions(true);
      try {
        const lRes = await fetchStudentLoansApi(loanLimit);
        if (isMounted) {
          setTransactions(lRes.transactions || []);
          setTotalLoansCount(lRes.totalCount || lRes.transactions?.length || 0);
          setLoansLoadedOnce(true);
        }
      } catch (err) {
        console.warn('Error fetching student loans:', err);
      } finally {
        if (isMounted) setLoadingTransactions(false);
      }
    };

    fetchLoans();
    return () => {
      isMounted = false;
    };
  }, [activeTab, loanLimit]);

  // Active borrowed books derived from activeLoans poll or full ledger
  const activeBorrowed = activeLoans.length > 0
    ? activeLoans
    : transactions.filter((t) => t.status === 'Issued');
  const returnedBooks = transactions.filter((t) => t.status === 'Returned');
  const overdueBorrowed = activeBorrowed.filter((t) => new Date(t.dueDate).getTime() < Date.now());
  const totalVisits = totalVisitsCount || visits.length;

  // Calculate day difference from now to due date
  const getDueStatus = (dueDateStr: string, status: string) => {
    if (status === 'Returned') {
      return { text: 'Returned', type: 'returned' as const, days: 0 };
    }
    const dueTime = new Date(dueDateStr).getTime();
    const nowTime = Date.now();
    const diffDays = Math.ceil((dueTime - nowTime) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      return {
        text: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`,
        type: 'overdue' as const,
        days: diffDays,
      };
    }
    if (diffDays === 0) {
      return { text: 'Due today', type: 'warning' as const, days: 0 };
    }
    if (diffDays <= 3) {
      return {
        text: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
        type: 'warning' as const,
        days: diffDays,
      };
    }
    return {
      text: `Due in ${diffDays} days`,
      type: 'ok' as const,
      days: diffDays,
    };
  };

  const handleCopyToken = () => {
    if (student.personalQrId) {
      navigator.clipboard.writeText(student.personalQrId);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Filter transactions for book tab
  const filteredTransactions = transactions.filter((tx) => {
    const isOverdue = tx.status === 'Issued' && new Date(tx.dueDate).getTime() < Date.now();
    const matchesFilter =
      loanFilter === 'all' ||
      (loanFilter === 'issued' && tx.status === 'Issued') ||
      (loanFilter === 'overdue' && isOverdue) ||
      (loanFilter === 'returned' && tx.status === 'Returned');

    const matchesSearch =
      tx.bookTitle.toLowerCase().includes(loanSearch.toLowerCase()) ||
      tx.bookAuthor.toLowerCase().includes(loanSearch.toLowerCase()) ||
      (tx.bookId && tx.bookId.toLowerCase().includes(loanSearch.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* =========================================================================
          1. REFINED STUDENT COMMAND HEADER (Identity, Status & Essential Data)
          ========================================================================= */}
      <section className="rounded-3xl p-5 sm:p-7 md:p-8 border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-md relative overflow-hidden">
        {/* Subtle decorative academic ambient glows */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#D4AF37]/[0.06] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#0B1F3A]/[0.03] rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
          {/* Left: Student Identity */}
          <div className="flex items-center gap-4 sm:gap-6 min-w-0">
            {/* Student Photo with Live Turnstile Indicator */}
            <div className="relative shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-[#D4AF37]/50 shadow-sm bg-[#F8F6F0]">
                <img
                  src={student.photo}
                  alt={student.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                  student.isInside ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
                title={student.isInside ? 'Currently inside Central Reading Hall' : 'Outside Library'}
              />
            </div>

            {/* Student Details & Credentials */}
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif-academic text-xl sm:text-2xl lg:text-3xl font-bold text-[#0B1F3A] tracking-tight truncate">
                  {student.name}
                </h1>

                {/* Turnstile Status Badge */}
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider border ${
                    student.isInside
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-[#F8F6F0] text-slate-700 border-[#D4AF37]/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      student.isInside ? 'bg-emerald-600' : 'bg-slate-400'
                    }`}
                  />
                  <span>{student.isInside ? 'In Reading Hall' : 'Checked Out'}</span>
                </span>
              </div>

              {/* Student Metadata: Roll No, Program, Department */}
              <div className="text-sm text-[#0B1F3A] font-mono font-bold flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Roll: {student.studentId}</span>
                <span className="text-[#8A6D0B]">•</span>
                <span>Pass: {student.membershipId}</span>
              </div>

              <p className="text-sm text-[#64748B] truncate max-w-xl">
                {student.course} ({student.semester}) · {student.department} · Hemchandracharya North Gujarat University
              </p>
            </div>
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
            <button
              onClick={() => setActiveTab('qr')}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-[#F8F6F0] hover:bg-[#D4AF37]/15 border border-[#D4AF37]/40 rounded-xl transition cursor-pointer shadow-2xs"
              title="View Digital QR Pass"
            >
              <QrCode className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="hidden sm:inline">QR Pass</span>
            </button>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-[#F8F6F0] hover:bg-rose-50 hover:text-rose-700 border border-[#D4AF37]/30 hover:border-rose-300 rounded-xl transition cursor-pointer shadow-2xs"
              title="Sign Out of Library Session"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* High-Priority Overdue Alert Banner (If Applicable) */}
        {overdueBorrowed.length > 0 && (
          <div className="mt-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-300 flex items-center justify-between gap-3 text-xs text-rose-900 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Action Required:</strong> You have <strong>{overdueBorrowed.length}</strong> overdue book volume{overdueBorrowed.length === 1 ? '' : 's'}. Please return them to the circulation desk to maintain active borrowing privileges.
              </span>
            </div>
            <button
              onClick={() => setActiveTab('books')}
              className="font-bold underline text-rose-950 hover:text-rose-700 whitespace-nowrap cursor-pointer shrink-0"
            >
              View Overdue Books
            </button>
          </div>
        )}

        {/* Reading Hall Active Session Banner */}
        {student.isInside && overdueBorrowed.length === 0 && (
          <div className="mt-5 p-3 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-center gap-2.5 text-xs text-emerald-900 animate-in fade-in">
            <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <strong>Active Library Attendance:</strong> You entered through the turnstiles today. Please scan your personal QR pass at the exit barrier when leaving.
            </span>
          </div>
        )}

        {/* Four Key Metrics Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-5 border-t border-[#0B1F3A]/10">
          {/* Metric 1: Currently Borrowed */}
          <div
            onClick={() => setActiveTab('books')}
            className="p-3.5 sm:p-4 rounded-2xl bg-[#F8F6F0] border border-[#D4AF37]/25 hover:border-[#D4AF37] card-interactive cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-medium">Active Loans</span>
              <BookOpen className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#0B1F3A] mt-1">
              {activeBorrowed.length}
            </div>
            <div className="text-xs text-[#64748B] mt-0.5">Currently checked out</div>
          </div>

          {/* Metric 2: Overdue Status */}
          <div
            onClick={() => setActiveTab('books')}
            className={`p-3.5 sm:p-4 rounded-2xl border card-interactive cursor-pointer group ${
              overdueBorrowed.length > 0
                ? 'bg-rose-50 border-rose-300'
                : 'bg-[#F8F6F0] border-[#D4AF37]/25 hover:border-[#D4AF37]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-medium">Overdue</span>
              <AlertTriangle
                className={`w-4 h-4 ${
                  overdueBorrowed.length > 0 ? 'text-rose-600' : 'text-slate-400'
                }`}
              />
            </div>
            <div
              className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums mt-1 ${
                overdueBorrowed.length > 0 ? 'text-rose-700' : 'text-[#0B1F3A]'
              }`}
            >
              {overdueBorrowed.length}
            </div>
            <div className="text-xs text-[#64748B] mt-0.5">
              {overdueBorrowed.length > 0 ? 'Requires immediate return' : 'All loans on schedule'}
            </div>
          </div>

          {/* Metric 3: Total Turnstile Visits */}
          <div
            onClick={() => setActiveTab('visits')}
            className="p-3.5 sm:p-4 rounded-2xl bg-[#F8F6F0] border border-[#D4AF37]/25 hover:border-[#D4AF37] card-interactive cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-medium">Turnstile Visits</span>
              <History className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#0B1F3A] mt-1">
              {totalVisits}
            </div>
            <div className="text-xs text-[#64748B] mt-0.5">Campus attendance logs</div>
          </div>

          {/* Metric 4: Returned Volumes */}
          <div
            onClick={() => setActiveTab('books')}
            className="p-3.5 sm:p-4 rounded-2xl bg-[#F8F6F0] border border-[#D4AF37]/25 hover:border-[#D4AF37] card-interactive cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-medium">Returned Volumes</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#0B1F3A] mt-1">
              {returnedBooks.length}
            </div>
            <div className="text-xs text-[#64748B] mt-0.5">Completed borrowing history</div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. WORKSPACE NAVIGATION TABS (Unboxed, Refined Typography)
          ========================================================================= */}
      <div className="flex items-center gap-2 border-b border-[#0B1F3A]/10 overflow-x-auto pb-1" role="tablist">
        <button
          onClick={() => setActiveTab('books')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer tab-interactive flex items-center gap-2 ${
            activeTab === 'books'
              ? 'bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37] shadow-xs'
              : 'text-[#0B1F3A]/70 hover:text-[#0B1F3A] hover:bg-[#0B1F3A]/5'
          }`}
          role="tab"
          aria-selected={activeTab === 'books'}
        >
          <BookOpen className="w-4 h-4 text-[#D4AF37]" />
          <span>Borrowed Books</span>
          <span className="px-1.5 py-0.2 rounded-full text-xs font-mono bg-white/15 text-[#F8F6F0]">
            {activeBorrowed.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('idcard')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer tab-interactive flex items-center gap-2 ${
            activeTab === 'idcard'
              ? 'bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37] shadow-xs'
              : 'text-[#0B1F3A]/70 hover:text-[#0B1F3A] hover:bg-[#0B1F3A]/5'
          }`}
          role="tab"
          aria-selected={activeTab === 'idcard'}
        >
          <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
          <span>HNGU Digital ID Card</span>
        </button>

        <button
          onClick={() => setActiveTab('qr')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer tab-interactive flex items-center gap-2 ${
            activeTab === 'qr'
              ? 'bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37] shadow-xs'
              : 'text-[#0B1F3A]/70 hover:text-[#0B1F3A] hover:bg-[#0B1F3A]/5'
          }`}
          role="tab"
          aria-selected={activeTab === 'qr'}
        >
          <QrCode className="w-4 h-4 text-[#D4AF37]" />
          <span>Personal QR Pass</span>
        </button>

        <button
          onClick={() => setActiveTab('visits')}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer tab-interactive flex items-center gap-2 ${
            activeTab === 'visits'
              ? 'bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37] shadow-xs'
              : 'text-[#0B1F3A]/70 hover:text-[#0B1F3A] hover:bg-[#0B1F3A]/5'
          }`}
          role="tab"
          aria-selected={activeTab === 'visits'}
        >
          <History className="w-4 h-4 text-[#D4AF37]" />
          <span>Turnstile Logs</span>
          <span className="px-1.5 py-0.2 rounded-full text-xs font-mono bg-white/15 text-[#F8F6F0]">
            {totalVisitsCount || visits.length}
          </span>
        </button>
      </div>

      {/* Tab Content with Unified Page-to-Page Transition */}
      <div key={activeTab} className="page-transition-enter w-full">
      {/* =========================================================================
          3. TAB CONTENT: BORROWED BOOKS (Clear Due Dates, Overdue Highlights)
          ========================================================================= */}
      {activeTab === 'books' && (
        <section className="space-y-5">
          {/* Header & Search / Filter Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0B1F3A]">
                Library Borrowing Ledger
              </h2>
              <p className="text-xs text-[#64748B]">
                Track currently issued volumes, due date countdowns, and loan records
              </p>
            </div>

            {onBrowseCatalogue && (
              <button
                onClick={onBrowseCatalogue}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] border border-[#0B1F3A]/20 hover:border-[#D4AF37] text-xs font-semibold transition shadow-2xs self-start sm:self-auto cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Browse Catalogue to Borrow</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#D4AF37]" />
              </button>
            )}
          </div>

          {/* Search bar & state filter pills */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search your borrowed books by title or author..."
                value={loanSearch}
                onChange={(e) => setLoanSearch(e.target.value)}
                className="w-full bg-white border border-[#D4AF37]/35 rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:outline-none focus:border-[#D4AF37] shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
              <button
                onClick={() => setLoanFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                  loanFilter === 'all'
                    ? 'bg-[#0B1F3A] text-[#F8F6F0] font-bold'
                    : 'bg-white text-[#0B1F3A] border border-[#0B1F3A]/10 hover:border-[#D4AF37]'
                }`}
              >
                All ({transactions.length})
              </button>
              <button
                onClick={() => setLoanFilter('issued')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                  loanFilter === 'issued'
                    ? 'bg-[#0B1F3A] text-[#F8F6F0] font-bold'
                    : 'bg-white text-[#0B1F3A] border border-[#0B1F3A]/10 hover:border-[#D4AF37]'
                }`}
              >
                Active ({activeBorrowed.length})
              </button>
              <button
                onClick={() => setLoanFilter('overdue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                  loanFilter === 'overdue'
                    ? 'bg-rose-700 text-[#F8F6F0] font-bold'
                    : 'bg-white text-[#0B1F3A] border border-[#0B1F3A]/10 hover:border-[#D4AF37]'
                }`}
              >
                Overdue ({overdueBorrowed.length})
              </button>
              <button
                onClick={() => setLoanFilter('returned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                  loanFilter === 'returned'
                    ? 'bg-[#0B1F3A] text-[#F8F6F0] font-bold'
                    : 'bg-white text-[#0B1F3A] border border-[#0B1F3A]/10 hover:border-[#D4AF37]'
                }`}
              >
                Returned ({returnedBooks.length})
              </button>
            </div>
          </div>

          {/* Loan List or Intentional Empty State */}
          {loadingTransactions ? (
            <div className="p-8 rounded-2xl bg-white border border-[#D4AF37]/20 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-[#64748B]">Loading your borrowing records...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-3xl bg-white border border-[#D4AF37]/30 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-[#F8F6F0] border border-[#D4AF37]/40 text-[#D4AF37] flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-serif-academic text-base sm:text-lg font-bold text-[#0B1F3A]">
                {loanSearch
                  ? 'No matching books found'
                  : loanFilter === 'overdue'
                  ? 'No Overdue Books'
                  : 'No Books Checked Out'}
              </h3>
              <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed">
                {loanSearch
                  ? `No loan records matching "${loanSearch}". Try searching by another keyword.`
                  : loanFilter === 'overdue'
                  ? 'Great job! All your borrowed books are currently on schedule with no overdue penalties.'
                  : 'You have no active book loans. Visit the central library or browse the catalogue to check out volumes at the circulation desk.'}
              </p>
              {onBrowseCatalogue && (
                <div className="pt-2">
                  <button
                    onClick={onBrowseCatalogue}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132C4E] text-[#F8F6F0] text-xs font-semibold border border-[#D4AF37]/60 shadow-xs transition cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Browse University Catalogue</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTransactions.map((tx) => {
                const statusInfo = getDueStatus(tx.dueDate, tx.status);
                const isOverdue = statusInfo.type === 'overdue';
                const isWarning = statusInfo.type === 'warning';

                return (
                  <div
                    key={tx.id}
                    className={`rounded-2xl p-5 bg-white border card-interactive shadow-2xs hover:shadow-md flex flex-col justify-between ${
                      isOverdue
                        ? 'border-rose-400 bg-rose-50/20'
                        : isWarning
                        ? 'border-amber-400 bg-amber-50/20'
                        : 'border-[#D4AF37]/30 hover:border-[#D4AF37]'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Header: Title & Status Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-[#0B1F3A] line-clamp-1">
                            {tx.bookTitle}
                          </h3>
                          <p className="text-xs text-[#64748B] truncate">
                            by {tx.bookAuthor || 'Unknown Author'}
                          </p>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider shrink-0 border ${
                            isOverdue
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : isWarning
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : tx.status === 'Issued'
                              ? 'bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37]/50'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {statusInfo.text}
                        </span>
                      </div>

                      {/* Due Date Indicator Line */}
                      <div className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#0B1F3A]/5 grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-xs text-[#64748B] block font-sans">
                            Issued Date
                          </span>
                          <span className="text-[#0B1F3A] font-semibold">
                            {tx.issueDate}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-[#64748B] block font-sans">
                            Due Date
                          </span>
                          <span
                            className={`font-bold ${
                              isOverdue
                                ? 'text-rose-700'
                                : isWarning
                                ? 'text-amber-800'
                                : 'text-[#0B1F3A]'
                            }`}
                          >
                            {tx.dueDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Book ID / Barcode identifier */}
                    <div className="mt-4 pt-3 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs text-[#64748B]">
                      <span className="text-xs font-mono">
                        ID: {tx.bookId || tx.id.slice(0, 8)}
                      </span>
                      {tx.status === 'Issued' ? (
                        <span className="text-xs text-[#0B1F3A] font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Active Loan</span>
                        </span>
                      ) : (
                        <span className="text-xs text-[#64748B] font-medium">
                          Returned
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More Loans Button */}
          {((totalLoansCount > 0 && transactions.length < totalLoansCount) || transactions.length >= loanLimit) && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setLoanLimit((prev) => prev + 50)}
                disabled={loadingTransactions}
                className="px-5 py-2.5 rounded-xl bg-white border border-[#D4AF37]/50 hover:bg-[#F8F6F0] text-[#0B1F3A] font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loadingTransactions ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#0B1F3A] border-t-transparent rounded-full animate-spin" />
                    <span>Loading borrowing records...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Loans ({transactions.length} of {totalLoansCount || transactions.length})</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                  </>
                )}
              </button>
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          4. TAB CONTENT: DIGITAL ID CARD FOCUS
          ========================================================================= */}
      {activeTab === 'idcard' && (
        <section className="space-y-4">
          <div className="text-center max-w-md mx-auto space-y-1">
            <h2 className="font-serif-academic text-lg sm:text-xl font-bold text-[#0B1F3A]">
              Official HNGU Digital Library Pass
            </h2>
            <p className="text-xs text-[#64748B]">
              Authorized university identification for reading hall turnstile access and desk book loans.
            </p>
          </div>

          <div className="py-2">
            <StudentIdCard student={student} />
          </div>
        </section>
      )}

      {/* =========================================================================
          5. TAB CONTENT: PERSONAL QR TOKEN FOR RAPID SCANNING
          ========================================================================= */}
      {activeTab === 'qr' && (
        <section className="max-w-md mx-auto rounded-3xl p-6 sm:p-8 border-2 border-[#D4AF37]/45 text-center space-y-6 bg-white text-[#0B1F3A] shadow-xl relative overflow-hidden">
          {/* Subtle watermark background */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.025] bg-[radial-gradient(#0B1F3A_1px,transparent_1px)] [background-size:14px_14px]" />

          {/* Institutional Pass Header */}
          <div className="space-y-1.5 relative z-10 border-b border-[#0B1F3A]/10 pb-4">
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#8A6D0B]">
                ACTIVE DIGITAL PATRON PASS
              </span>
            </div>
            <h2 className="font-serif-academic text-xl sm:text-2xl font-bold text-[#0B1F3A] tracking-tight">
              Personal Library QR Pass
            </h2>
            <p className="text-sm text-[#64748B] max-w-xs mx-auto leading-relaxed">
              Scan this cryptographic barcode at reading hall turnstiles or circulation desk scanners.
            </p>
          </div>

          {/* High-Resolution Scannable QR Display with Clear Quiet Zone */}
          <div className="relative z-10 p-5 bg-[#FAF9F5] rounded-3xl border border-[#D4AF37]/40 shadow-xs inline-block mx-auto">
            <div className="p-2.5 bg-white rounded-2xl shadow-sm border border-[#0B1F3A]/10">
              <QrCodeDisplay
                value={student.personalQrId}
                size={220}
                label={student.name}
                sublabel={`ID: ${student.studentId} • ${student.course}`}
                showDownload={true}
                downloadFilename={`hngu-qr-pass-${student.studentId}`}
              />
            </div>
          </div>

          {/* Security & Verification Metadata */}
          <div className="relative z-10 space-y-2 text-sm">
            <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#D4AF37]/25 flex items-center justify-between text-xs text-[#0B1F3A] font-mono">
              <div className="text-left truncate max-w-[200px]">
                <span className="text-xs uppercase text-[#64748B] block">Pass Token</span>
                <span className="font-bold text-[#0B1F3A] truncate">{student.personalQrId}</span>
              </div>
              <button
                onClick={handleCopyToken}
                aria-label="Copy personal QR pass token"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-[#FAF9F5] border border-[#D4AF37]/40 text-[#0B1F3A] font-semibold text-xs transition cursor-pointer shadow-2xs shrink-0"
              >
                {copiedToken ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#8A6D0B]" />
                    <span>Copy Token</span>
                  </>
                )}
              </button>
            </div>

            {/* Turnstile Usage Guidance Tips */}
            <div className="p-3.5 rounded-xl bg-[#0B1F3A] text-[#F8F6F0] text-left text-xs space-y-1">
              <div className="font-mono font-bold text-[#D4AF37] uppercase text-xs flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Turnstile Scanner Guidelines</span>
              </div>
              <p className="text-[#F8F6F0]/90 leading-relaxed text-xs">
                Hold your device screen 10–15 cm directly over the optical glass window on Turnstile Terminal #01 or #02 for immediate gate unlock.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          6. TAB CONTENT: TURNSTILE ENTRY & EXIT HISTORY
          ========================================================================= */}
      {activeTab === 'visits' && (
        <section className="rounded-3xl p-5 sm:p-7 border border-[#D4AF37]/35 shadow-sm space-y-5 bg-white text-[#0B1F3A]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#0B1F3A]/10 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0B1F3A]">
                Turnstile Gate Attendance Logs
              </h2>
              <p className="text-xs text-[#64748B]">
                Chronological entry and exit records logged by HNGU automated reading hall barriers
              </p>
            </div>
            <span className="text-xs font-mono text-[#0B1F3A] font-bold bg-[#F8F6F0] px-3 py-1 rounded-full border border-[#D4AF37]/30 self-start sm:self-auto">
              {totalVisitsCount || visits.length} Total Visits Recorded (Showing {visits.length})
            </span>
          </div>

          {loadingVisits ? (
            <div className="py-12 text-center text-xs text-[#64748B] space-y-2">
              <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Loading your campus attendance records...</p>
            </div>
          ) : visits.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#64748B] space-y-2">
              <History className="w-8 h-8 text-[#D4AF37] mx-auto opacity-70" />
              <p className="font-semibold text-[#0B1F3A]">No records yet</p>
              <p className="max-w-xs mx-auto">
                Scan your personal QR code at any university reading hall turnstile to record your attendance.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-2xs">
              <table className="w-full text-left text-xs min-w-[620px]">
                <thead>
                  <tr className="border-b border-[#D4AF37]/30 text-[#F8F6F0] uppercase text-xs tracking-wider font-mono font-semibold bg-[#0B1F3A]">
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Entry Time</th>
                    <th className="py-3.5 px-4">Exit Time</th>
                    <th className="py-3.5 px-4">Session Duration</th>
                    <th className="py-3.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0B1F3A]/10 font-mono text-xs">
                  {visits.map((v) => (
                    <tr key={v.id} className="table-row-hover hover:bg-[#F8F6F0]/70 transition-colors">
                      <td className="py-3.5 px-4 text-[#0B1F3A] font-sans font-medium">
                        {v.entryDate}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-700 font-bold tabular-nums">
                        {v.entryTime}
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B] tabular-nums">
                        {v.exitTime || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-[#0B1F3A] font-medium tabular-nums">
                        {v.duration || 'Active Session'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-sans">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            v.active
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : 'bg-[#F8F6F0] text-[#334155] border border-[#0B1F3A]/10'
                          }`}
                        >
                          {v.active ? 'Inside Hall' : 'Completed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Load More Visits Button */}
          {((totalVisitsCount > 0 && visits.length < totalVisitsCount) || visits.length >= visitLimit) && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisitLimit((prev) => prev + 50)}
                disabled={loadingVisits}
                className="px-5 py-2.5 rounded-xl bg-white border border-[#D4AF37]/50 hover:bg-[#F8F6F0] text-[#0B1F3A] font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loadingVisits ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#0B1F3A] border-t-transparent rounded-full animate-spin" />
                    <span>Loading attendance records...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Visits ({visits.length} of {totalVisitsCount || visits.length})</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                  </>
                )}
              </button>
            </div>
          )}
        </section>
      )}
      </div>
    </div>
  );
};
