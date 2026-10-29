import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { seedInitialDataIfNeeded, verifyAdminStatus, verifyAndSyncGoogleAdmin, verifyStudentSession, COLLECTIONS } from './lib/dbService';
import { fetchStudentMe, clearStoredStudentToken } from './lib/studentAuth';
import { Student, AdminUser } from './types';
import { HeroLanding } from './components/HeroLanding';
import { StudentRegister } from './components/StudentRegister';
import { StudentLogin } from './components/StudentLogin';
import { StudentProfile } from './components/StudentProfile';
import { EntranceKiosk } from './components/EntranceKiosk';
import { CirculationDesk } from './components/CirculationDesk';
import { BookManager } from './components/BookManager';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLogin } from './components/AdminLogin';
import { LibraryBackgroundEnvironment } from './components/LibraryBackgroundEnvironment';
import { ManagedByNeev } from './components/ManagedByNeev';
import {
  BookOpen,
  ScanLine,
  User,
  Shield,
  Layers,
  Sparkles,
  LogOut,
  QrCode,
  Home,
  CheckCircle2,
  Lock,
  GraduationCap,
  Library,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

type AppRoute =
  | 'landing'
  | 'register'
  | 'student-login'
  | 'student-profile'
  | 'kiosk'
  | 'circulation'
  | 'books'
  | 'admin-login'
  | 'admin-dashboard';

export default function App() {
  // Navigation view state
  const [activeView, setActiveView] = useState<AppRoute>('landing');

  // Access control security notification message
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  // Currently authenticated and verified student
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);

  // Temporary scanned QR token waiting for student login verification
  const [scannedStudentToken, setScannedStudentToken] = useState<string | null>(null);

  // Authenticated Admin / Librarian state
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Scroll detection for navbar solidity
  const [scrolled, setScrolled] = useState(false);

  // Mobile menu open
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard accessibility: Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Clean viewport reset on page-to-page navigation
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeView]);

  // Helper to safely parse raw requested route from URL path, hash, or query params
  const parseRouteFromLocation = (): AppRoute => {
    const rawPath = window.location.pathname.toLowerCase();
    const path = rawPath.replace(/\/+$/, '') || '/';
    const hash = window.location.hash.toLowerCase().replace(/^[#/]+/, '');
    const searchParams = new URLSearchParams(window.location.search);
    const queryRoute = (searchParams.get('route') || searchParams.get('page') || searchParams.get('view') || '').toLowerCase().trim();

    // Priority 1: Direct public Student Registration / Library ID Card route (/register, /register/, #register, ?route=register)
    if (
      path === '/register' ||
      path.endsWith('/register') ||
      path.includes('register') ||
      hash === 'register' ||
      hash.includes('register') ||
      queryRoute === 'register'
    ) {
      return 'register';
    }

    if (path === '/admin' || path.endsWith('/admin') || hash === 'admin' || queryRoute === 'admin') return 'admin-dashboard';
    if (path === '/admin-login' || path.endsWith('/admin-login') || hash === 'admin-login' || queryRoute === 'admin-login') return 'admin-login';
    if (path === '/student' || path.endsWith('/student') || hash === 'student' || queryRoute === 'student') return 'student-profile';
    if (path === '/student-login' || path.endsWith('/student-login') || hash === 'student-login' || queryRoute === 'student-login') return 'student-login';
    if (path === '/kiosk' || path.endsWith('/kiosk') || hash === 'kiosk' || queryRoute === 'kiosk') return 'kiosk';
    if (path === '/circulation' || path.endsWith('/circulation') || hash === 'circulation' || queryRoute === 'circulation') return 'circulation';
    if (path === '/books' || path.endsWith('/books') || hash === 'books' || queryRoute === 'books') return 'books';
    return 'landing';
  };

  // Direct URL Protection & Access Control Engine
  // Direct URL Protection & Access Control Engine
  const evaluateRouteAccess = (
    targetRoute: AppRoute,
    student: Student | null,
    admin: AdminUser | null
  ): { finalRoute: AppRoute; notice: string | null } => {
    // 1. Admin Dashboard: Strictly Admin ONLY.
    if (targetRoute === 'admin-dashboard') {
      if (student) {
        return {
          finalRoute: 'student-profile',
          notice:
            'Access Denied: Students are not permitted to access administrator controls or the executive console.',
        };
      }
      if (!admin) {
        return {
          finalRoute: 'admin-login',
          notice:
            'Staff Login Required: Please sign in with your authorized university librarian Google account.',
        };
      }
      return { finalRoute: 'admin-dashboard', notice: null };
    }

    // 2. Circulation Desk: Strictly Admin ONLY.
    if (targetRoute === 'circulation') {
      if (student) {
        return {
          finalRoute: 'student-profile',
          notice:
            'Student Policy Notice: Circulation Desk operations are restricted to authorized library staff. Present your personal QR pass at the physical desk to checkout books.',
        };
      }
      if (!admin) {
        return {
          finalRoute: 'admin-login',
          notice:
            'Staff Portal Required: Authorized librarian credentials needed for circulation operations.',
        };
      }
      return { finalRoute: 'circulation', notice: null };
    }

    // 3. Admin Login:
    if (targetRoute === 'admin-login') {
      if (admin) {
        return { finalRoute: 'admin-dashboard', notice: null };
      }
      if (student) {
        return {
          finalRoute: 'student-profile',
          notice:
            'You are currently signed in as a student. Sign out of your student session to access the librarian portal.',
        };
      }
      return { finalRoute: 'admin-login', notice: null };
    }

    // 4. Student Profile: Student ONLY.
    if (targetRoute === 'student-profile') {
      if (admin) {
        return {
          finalRoute: 'admin-dashboard',
          notice: 'Staff session active: You are in librarian management mode.',
        };
      }
      if (!student) {
        return {
          finalRoute: 'student-login',
          notice:
            'Authentication Required: Please sign in with your student credentials or register for a university pass.',
        };
      }
      return { finalRoute: 'student-profile', notice: null };
    }

    // 5. Books Catalog: Registered Student (Read-Only) OR Admin (Management).
    if (targetRoute === 'books') {
      if (!student && !admin) {
        return {
          finalRoute: 'student-login',
          notice:
            'Authentication Required: Access to the HNGU Library Catalogue is reserved for enrolled students and university staff. Please log in.',
        };
      }
      return { finalRoute: 'books', notice: null };
    }

    // 6. Turnstiles Access Station: Strictly Admin / Librarian ONLY.
    if (targetRoute === 'kiosk') {
      if (student) {
        return {
          finalRoute: 'student-profile',
          notice:
            'Access Denied: The Turnstile Access Station is restricted to authorized librarians and library staff.',
        };
      }
      if (!admin) {
        return {
          finalRoute: 'admin-login',
          notice:
            'Staff Login Required: Access to the Turnstile Access Station is restricted to authorized librarians.',
        };
      }
      return { finalRoute: 'kiosk', notice: null };
    }

    // 7. Student Registration and Login:
    if (targetRoute === 'register' || targetRoute === 'student-login') {
      if (student) {
        return { finalRoute: 'student-profile', notice: null };
      }
      return { finalRoute: targetRoute, notice: null };
    }

    // Public routes (landing)
    return { finalRoute: targetRoute, notice: null };
  };

  // Synchronize route with URL bar and enforce access control
  const navigateTo = (route: AppRoute) => {
    const check = evaluateRouteAccess(route, currentStudent, adminUser);
    if (check.notice) {
      setAccessNotice(check.notice);
    } else {
      setAccessNotice(null);
    }

    const finalRoute = check.finalRoute;
    setActiveView(finalRoute);
    setMobileMenuOpen(false);

    let path = '/';
    if (finalRoute === 'admin-dashboard') path = '/admin';
    else if (finalRoute === 'admin-login') path = '/admin-login';
    else if (finalRoute === 'student-profile') path = '/student';
    else if (finalRoute === 'student-login') path = '/student-login';
    else if (finalRoute === 'register') path = '/register';
    else if (finalRoute === 'kiosk') path = '/kiosk';
    else if (finalRoute === 'circulation') path = '/circulation';
    else if (finalRoute === 'books') path = '/books';

    // Security: Clean any query parameters (such as untrusted ?studentId=) from URL bar
    window.history.pushState({ route: finalRoute }, '', path);
  };

  // Handle browser back/forward, hash changes, and initial URL with access control
  useEffect(() => {
    const rawRoute = parseRouteFromLocation();
    const check = evaluateRouteAccess(rawRoute, currentStudent, adminUser);
    if (check.notice) {
      setAccessNotice(check.notice);
    }
    setActiveView(check.finalRoute);

    const handlePopState = () => {
      const poppedRaw = parseRouteFromLocation();
      const poppedCheck = evaluateRouteAccess(poppedRaw, currentStudent, adminUser);
      if (poppedCheck.notice) {
        setAccessNotice(poppedCheck.notice);
      }
      setActiveView(poppedCheck.finalRoute);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, [currentStudent, adminUser]);

  // Initialize and seed database if empty, and verify student session in Firestore
  useEffect(() => {
    seedInitialDataIfNeeded();

    // Verify student session via secure API (blocks local storage / parameter tampering)
    const restoreAndVerifyStudentSession = async () => {
      const savedStudent = sessionStorage.getItem('slms_active_student');
      if (savedStudent) {
        try {
          const verified = await fetchStudentMe();
          if (verified && verified.status === 'active') {
            setCurrentStudent(verified);
          } else {
            console.warn('Student session verification failed or inactive. Clearing storage.');
            clearStoredStudentToken();
            sessionStorage.removeItem('slms_active_student');
            setCurrentStudent(null);
          }
        } catch (e) {
          clearStoredStudentToken();
          sessionStorage.removeItem('slms_active_student');
          setCurrentStudent(null);
        }
      }
    };

    restoreAndVerifyStudentSession();

    // Subscribe to Firebase Auth state for Admin (Strictly verified against Firebase Auth + Firestore)
    // NEVER blindly trust untrusted sessionStorage without active authenticated Firebase credential!
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const verified = await verifyAdminStatus(user.uid);
        if (verified) {
          setAdminUser(verified);
        } else {
          // If authorized owner email, verify and sync
          const cleanEmail = user.email?.trim().toLowerCase();
          if (cleanEmail === 'neevlimbachiya45@gmail.com') {
            const synced = await verifyAndSyncGoogleAdmin({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
            });
            if (synced) {
              setAdminUser(synced);
            } else {
              setAdminUser(null);
              sessionStorage.removeItem('slms_active_admin');
            }
          } else {
            console.warn('Google account is not authorized as an HNGU librarian. Revoking session.');
            setAdminUser(null);
            sessionStorage.removeItem('slms_active_admin');
          }
        }
      } else {
        setAdminUser(null);
        sessionStorage.removeItem('slms_active_admin');
      }
      setAuthLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // Periodic validation of student session if profile is deactivated or deleted by an administrator
  useEffect(() => {
    if (!currentStudent?.id) return;
    let isMounted = true;

    const pollStudentSession = async () => {
      const activeStudent = await fetchStudentMe();
      if (!isMounted) return;
      if (!activeStudent || activeStudent.status !== 'active') {
        console.warn('Active student profile is no longer valid or active. Session invalidated.');
        setCurrentStudent(null);
        clearStoredStudentToken();
        sessionStorage.removeItem('slms_active_student');
        setAccessNotice('Your student library profile is no longer active. Session expired.');
        navigateTo('landing');
      } else {
        // Keep updated
        setCurrentStudent(activeStudent);
      }
    };

    const interval = setInterval(pollStudentSession, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentStudent?.id]);

  // When student successfully registers or logs in
  const handleStudentLoginSuccess = (student: Student) => {
    setCurrentStudent(student);
    setScannedStudentToken(null);
    setAccessNotice(null);
    sessionStorage.setItem('slms_active_student', JSON.stringify(student));
    navigateTo('student-profile');
  };

  // Student logout
  const handleStudentLogout = () => {
    clearStoredStudentToken();
    setCurrentStudent(null);
    setScannedStudentToken(null);
    setAccessNotice(null);
    sessionStorage.removeItem('slms_active_student');
    navigateTo('landing');
  };

  // When a student scans their QR code from landing page or scanner to login
  const handleStudentQrScannedForLogin = (token: string) => {
    setScannedStudentToken(token);
    navigateTo('student-login');
  };

  // Admin login success
  const handleAdminLoginSuccess = (admin: AdminUser) => {
    setAdminUser(admin);
    sessionStorage.setItem('slms_active_admin', JSON.stringify(admin));
    navigateTo('admin-dashboard');
  };

  // Admin logout
  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    setAdminUser(null);
    sessionStorage.removeItem('slms_active_admin');
    navigateTo('landing');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F6F0] text-[#0B1F3A] font-sans selection:bg-[#D4AF37] selection:text-[#0B1F3A] relative">
      {/* Immersive Library Background Environment (Landing Page Only) */}
      {activeView === 'landing' && <LibraryBackgroundEnvironment />}

      {/* Floating Glass Navigation Header */}
      <header className="sticky top-1 sm:top-3 z-40 max-w-6xl w-[96%] sm:w-[94%] mx-auto mt-1 sm:mt-2 mb-2 sm:mb-4">
        <div
          className={`rounded-2xl px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-6 border transition-all duration-300 backdrop-blur-2xl ${
            scrolled
              ? 'bg-[#0B1F3A] border-[#D4AF37]/50 shadow-2xl text-[#F8F6F0]'
              : 'bg-[#0B1F3A]/95 border-[#D4AF37]/35 shadow-xl text-[#F8F6F0]'
          }`}
        >
          {/* Part 1: Institutional Brand Identity */}
          <button
            onClick={() => navigateTo('landing')}
            className="flex items-center gap-2 sm:gap-3 group text-left cursor-pointer min-w-0 shrink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded-xl"
            aria-label="Return to HNGU Central Library Home"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0B1F3A] border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shadow-md shadow-[#0B1F3A]/40 group-hover:scale-105 transition-all shrink-0">
              <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-[#D4AF37]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-serif-academic font-bold text-sm sm:text-base tracking-wider text-[#F8F6F0] group-hover:text-[#D4AF37] transition-colors truncate">
                  HNGU
                </span>
                <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-mono bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/40 font-bold hidden sm:inline-block tracking-wider">
                  CENTRAL LIBRARY
                </span>
              </div>
              <p className="text-[10px] text-[#F8F6F0]/70 font-sans tracking-tight hidden lg:block truncate">
                Hemchandracharya North Gujarat University
              </p>
            </div>
          </button>

          {/* Part 2: Desktop Contextual Navigation Links (Center) */}
          <nav className="hidden md:flex items-center gap-5 lg:gap-7" aria-label="Main Navigation">
            <button
              onClick={() => navigateTo('landing')}
              className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                activeView === 'landing' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
              }`}
            >
              <span>Home</span>
              {activeView === 'landing' && (
                <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
              )}
            </button>

            {currentStudent ? (
              <>
                <button
                  onClick={() => navigateTo('student-profile')}
                  className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                    activeView === 'student-profile' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
                  }`}
                >
                  <span>My ID & Pass</span>
                  {activeView === 'student-profile' && (
                    <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
                  )}
                </button>

                <button
                  onClick={() => navigateTo('books')}
                  className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                    activeView === 'books' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
                  }`}
                >
                  <span>Catalogue</span>
                  {activeView === 'books' && (
                    <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
                  )}
                </button>
              </>
            ) : adminUser ? (
              <>
                <button
                  onClick={() => navigateTo('admin-dashboard')}
                  className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                    activeView === 'admin-dashboard' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
                  }`}
                >
                  <span>Admin Console</span>
                  {activeView === 'admin-dashboard' && (
                    <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
                  )}
                </button>

                <button
                  onClick={() => navigateTo('circulation')}
                  className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                    activeView === 'circulation' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
                  }`}
                >
                  <span>Circulation</span>
                  {activeView === 'circulation' && (
                    <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
                  )}
                </button>

                <button
                  onClick={() => navigateTo('books')}
                  className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                    activeView === 'books' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
                  }`}
                >
                  <span>Books</span>
                  {activeView === 'books' && (
                    <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
                  )}
                </button>

                <button
                  onClick={() => navigateTo('kiosk')}
                  className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                    activeView === 'kiosk' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
                  }`}
                >
                  <span>Turnstiles</span>
                  {activeView === 'kiosk' && (
                    <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigateTo('books')}
                  className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                    activeView === 'books' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
                  }`}
                >
                  <span>Catalogue</span>
                  {activeView === 'books' && (
                    <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
                  )}
                </button>

                <button
                  onClick={() => navigateTo('register')}
                  className={`text-xs font-semibold tracking-wide transition-all relative py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded ${
                    activeView === 'register' ? 'text-[#D4AF37]' : 'text-[#F8F6F0]/80 hover:text-[#F8F6F0]'
                  }`}
                >
                  <span>Register Pass</span>
                  {activeView === 'register' && (
                    <span className="absolute bottom-[-3px] left-0 right-0 h-[2px] bg-[#D4AF37] rounded-full animate-in fade-in" />
                  )}
                </button>
              </>
            )}
          </nav>

          {/* Part 3: Right Area (User Session / Primary Action / Menu Trigger) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {currentStudent ? (
              <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-[#D4AF37]/30">
                <button
                  onClick={() => navigateTo('student-profile')}
                  className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-[#071629] border border-[#D4AF37]/40 text-xs hover:border-[#D4AF37] transition cursor-pointer"
                  title="View Student Profile"
                >
                  <img
                    src={currentStudent.photo}
                    alt={currentStudent.name}
                    className="w-5 h-5 rounded-full object-cover border border-[#D4AF37]/60 shrink-0"
                  />
                  <span className="font-semibold text-[#F8F6F0] max-w-[100px] truncate hidden sm:inline">
                    {currentStudent.name}
                  </span>
                  <span className="text-[9px] font-mono text-[#D4AF37] font-bold uppercase hidden md:inline">
                    (Student)
                  </span>
                </button>

                <button
                  onClick={handleStudentLogout}
                  className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-white/10 hover:bg-rose-950/40 text-[#F8F6F0] hover:text-rose-300 border border-[#D4AF37]/30 hover:border-rose-400/50 transition cursor-pointer text-xs flex items-center gap-1"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline text-[11px] font-medium">Exit</span>
                </button>
              </div>
            ) : adminUser ? (
              <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-[#D4AF37]/30">
                <button
                  onClick={() => navigateTo('admin-dashboard')}
                  className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-[#071629] border border-[#D4AF37]/40 text-xs hover:border-[#D4AF37] transition cursor-pointer"
                  title="View Admin Console"
                >
                  <Shield className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <span className="font-semibold text-[#F8F6F0] max-w-[100px] truncate hidden sm:inline">
                    {adminUser.name}
                  </span>
                  <span className="text-[9px] font-mono text-[#D4AF37] font-bold uppercase hidden md:inline">
                    (Staff)
                  </span>
                </button>

                <button
                  onClick={handleAdminLogout}
                  className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-white/10 hover:bg-rose-950/40 text-[#F8F6F0] hover:text-rose-300 border border-[#D4AF37]/30 hover:border-rose-400/50 transition cursor-pointer text-xs flex items-center gap-1"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline text-[11px] font-medium">Exit</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateTo('student-login')}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37] hover:bg-[#C29F2F] text-[#0B1F3A] font-bold text-xs tracking-wide shadow-xs transition cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Student Sign In</span>
                </button>

                <button
                  onClick={() => navigateTo('admin-login')}
                  className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#F8F6F0] hover:text-[#D4AF37] border border-[#D4AF37]/30 text-xs font-medium transition cursor-pointer"
                  title="Authorized Staff Portal"
                >
                  <Shield className="w-3 h-3 text-[#D4AF37]" />
                  <span className="text-[11px]">Staff</span>
                </button>
              </div>
            )}

            {/* Clean Modern Menu Trigger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="px-3 py-1.5 sm:py-2 rounded-xl bg-[#071629] hover:bg-[#102744] text-[#F8F6F0] hover:text-[#D4AF37] border border-[#D4AF37]/35 hover:border-[#D4AF37] shadow-md transition-all cursor-pointer flex items-center gap-2 group min-h-[38px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37]"
              aria-label="Open Campus Navigation Menu"
            >
              <span className="text-xs font-semibold tracking-wider text-[#F8F6F0] group-hover:text-[#D4AF37]">
                Menu
              </span>
              <div className="w-5 h-5 rounded-lg bg-white/10 group-hover:bg-[#D4AF37]/20 text-[#F8F6F0] group-hover:text-[#D4AF37] flex items-center justify-center transition-colors">
                <Menu className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>
        </div>

        {/* Clean Modern Full-Height Navigation Drawer Panel */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-[#0B1F3A]/60 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div
              className="w-full max-w-md h-full bg-[#0B1F3A] border-l border-[#D4AF37]/30 p-6 sm:p-8 flex flex-col justify-between shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300 text-[#F8F6F0]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header inside Menu */}
              <div className="flex items-center justify-between pb-6 border-b border-[#D4AF37]/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0B1F3A] border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shadow-md">
                    <GraduationCap className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div>
                    <div className="font-serif-academic font-bold text-sm tracking-wide text-[#F8F6F0]">
                      HNGU Central Library
                    </div>
                    <div className="text-[10px] text-[#D4AF37] font-mono tracking-wider uppercase font-semibold">
                      Campus Navigation
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-[#D4AF37]/20 text-[#F8F6F0] hover:text-[#D4AF37] border border-[#D4AF37]/30 transition cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                  title="Close Menu (Esc)"
                >
                  <X className="w-4 h-4" />
                  <span>Close</span>
                </button>
              </div>

              {/* Numbered Luxury Navigation Links */}
              <div className="py-6 space-y-2 flex-1">
                {/* 01 HOME */}
                <button
                  onClick={() => {
                    navigateTo('landing');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                    activeView === 'landing'
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                      : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs text-[#D4AF37] font-bold">01</span>
                    <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide">
                      Home
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                </button>

                {/* ROLE CONDITION: STUDENT LOGGED IN */}
                {currentStudent ? (
                  <>
                    {/* 02 MY ID / QR */}
                    <button
                      onClick={() => {
                        navigateTo('student-profile');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'student-profile'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">02</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            My Digital ID & QR Pass
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Personal barcode & library pass</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>

                    {/* 03 LIBRARY CATALOGUE (Read Only) */}
                    <button
                      onClick={() => {
                        navigateTo('books');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'books'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">03</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Library Catalogue
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Browse volumes & syllabus books (Read Only)</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>
                  </>
                ) : adminUser ? (
                  /* ROLE CONDITION: ADMIN / LIBRARIAN LOGGED IN */
                  <>
                    {/* 02 ADMIN CONSOLE */}
                    <button
                      onClick={() => {
                        navigateTo('admin-dashboard');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'admin-dashboard'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">02</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Admin Console
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Command Hub, KPIs & Student Management</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>

                    {/* 03 CIRCULATION DESK */}
                    <button
                      onClick={() => {
                        navigateTo('circulation');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'circulation'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">03</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Circulation Desk
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Issue & receive books with student QR</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>

                    {/* 04 BOOKS MANAGEMENT */}
                    <button
                      onClick={() => {
                        navigateTo('books');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'books'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">04</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Books Management
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Add, edit, inventory & shelf barcodes</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>

                    {/* 05 TURNSTILE STATION */}
                    <button
                      onClick={() => {
                        navigateTo('kiosk');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'kiosk'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">05</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Turnstiles Station
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Physical gate entry/exit scanner</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>
                  </>
                ) : (
                  /* ROLE CONDITION: GUEST / VISITOR */
                  <>
                    {/* 02 STUDENT REGISTRATION */}
                    <button
                      onClick={() => {
                        navigateTo('register');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'register'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">02</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Student Registration
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Register for university digital library pass</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>

                    {/* 03 STUDENT LOGIN */}
                    <button
                      onClick={() => {
                        navigateTo('student-login');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'student-login'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">03</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Student ID / QR Login
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Sign in with phone & password or scan QR</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>

                    {/* 04 LIBRARY BOOKS */}
                    <button
                      onClick={() => {
                        navigateTo('books');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'books'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">04</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Library Catalogue
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Academic books & course reference material</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>

                    {/* 05 STAFF PORTAL (ADMIN LOGIN) */}
                    <button
                      onClick={() => {
                        navigateTo('admin-login');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer border ${
                        activeView === 'admin-login'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#D4AF37]'
                          : 'border-transparent hover:border-[#D4AF37]/30 hover:bg-white/5 text-[#F8F6F0]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-[#D4AF37] font-bold">05</span>
                        <div className="text-left">
                          <span className="font-serif-academic text-base sm:text-lg font-bold tracking-wide block">
                            Librarian Staff Portal
                          </span>
                          <span className="text-[11px] text-[#F8F6F0]/80 block font-normal">Authorized university staff sign-in</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-all" />
                    </button>
                  </>
                )}
              </div>

              {/* Drawer Bottom Session Info & Sign Out */}
              <div className="pt-6 border-t border-[#D4AF37]/20 space-y-4">
                {currentStudent ? (
                  <div className="p-4 rounded-2xl bg-[#071629] border border-[#D4AF37]/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={currentStudent.photo}
                        alt={currentStudent.name}
                        className="w-10 h-10 rounded-xl object-cover border border-[#D4AF37]/60"
                      />
                      <div>
                        <div className="text-xs font-bold text-[#F8F6F0] truncate max-w-[160px]">
                          {currentStudent.name}
                        </div>
                        <div className="text-[10px] text-[#D4AF37] font-mono font-bold">
                          {currentStudent.studentId}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        handleStudentLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-[#D4AF37]/20 text-[#F8F6F0] hover:text-[#D4AF37] border border-[#D4AF37]/40 text-xs font-semibold transition cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : adminUser ? (
                  <div className="p-4 rounded-2xl bg-[#071629] border border-[#D4AF37]/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37]">
                        <Shield className="w-5 h-5 text-[#D4AF37]" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#F8F6F0] truncate max-w-[160px]">
                          {adminUser.name}
                        </div>
                        <div className="text-[10px] text-[#D4AF37] font-mono font-bold">
                          {adminUser.email}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        handleAdminLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-[#D4AF37]/20 text-[#F8F6F0] hover:text-[#D4AF37] border border-[#D4AF37]/40 text-xs font-semibold transition cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-[11px] text-[#F8F6F0]/70 font-mono">
                    HNGU Central Library System • Patan, Gujarat
                  </div>
                )}

                {/* Professional Creator Credit in Drawer */}
                <div className="pt-3 border-t border-[#D4AF37]/20 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-[#F8F6F0]/60 font-mono">
                    HNGU Library System
                  </span>
                  <ManagedByNeev variant="compact" />
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3.5 sm:py-6 lg:py-8 relative z-10 overflow-x-hidden">
        <div key={activeView} className="page-transition-enter w-full">
          {/* Landing Page with Hero and Quick Access */}
        {activeView === 'landing' && (
          <HeroLanding
            onScanEntranceQr={() => navigateTo('kiosk')}
            onOpenEntranceKiosk={() => navigateTo('kiosk')}
            onOpenCirculationDesk={() => navigateTo('circulation')}
            onOpenAdminLogin={() => navigateTo('admin-login')}
            onStudentLogin={() => navigateTo('student-login')}
            onStudentQrScannedForLogin={(token) => {
              setScannedStudentToken(token);
              navigateTo('student-login');
            }}
            onOpenBooksCatalog={() => navigateTo('books')}
            currentStudent={currentStudent}
            adminUser={adminUser}
            onRegisterToAccessBooks={() => navigateTo('register')}
          />
        )}

        {/* Student Register */}
        {activeView === 'register' && (
          <StudentRegister
            onRegisterSuccess={(student) => {
              handleStudentLoginSuccess(student);
            }}
            onSwitchToLogin={() => navigateTo('student-login')}
            accessNotice={accessNotice}
            onClearAccessNotice={() => setAccessNotice(null)}
          />
        )}

        {/* Student Login */}
        {activeView === 'student-login' && (
          <StudentLogin
            onLoginSuccess={(student) => {
              handleStudentLoginSuccess(student);
            }}
            onSwitchToRegister={() => navigateTo('register')}
            scannedStudentToken={scannedStudentToken}
            onClearScannedStudent={() => setScannedStudentToken(null)}
            accessNotice={accessNotice}
            onClearAccessNotice={() => setAccessNotice(null)}
          />
        )}

        {/* Student Profile / ID Card / History */}
        {activeView === 'student-profile' && (
          currentStudent ? (
            <StudentProfile
              student={currentStudent}
              onLogout={handleStudentLogout}
              onBrowseCatalogue={() => navigateTo('books')}
            />
          ) : (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto glass-panel-elevated rounded-3xl p-8 border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center mx-auto">
                <User className="w-6 h-6 text-[#D4AF37]" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1F3A]">Student Registration Required</h2>
              <p className="text-xs text-[#0B1F3A]/75">
                You must complete registration and obtain your valid HNGU Digital Library ID to access your profile, personal QR code, and borrowing ledger.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  onClick={() => navigateTo('register')}
                  className="px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-bold rounded-xl text-xs border border-[#D4AF37]/50 shadow-md transition cursor-pointer"
                >
                  Register Student Account
                </button>
                <button
                  onClick={() => navigateTo('student-login')}
                  className="px-4 py-2.5 bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] border border-[#0B1F3A]/20 hover:border-[#D4AF37] rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            </div>
          )
        )}

        {/* Entrance Gate Kiosk - Restricted ONLY to Authorized Librarian / Admin */}
        {activeView === 'kiosk' && (
          adminUser ? (
            <EntranceKiosk
              adminUser={adminUser}
              onScanRedirectToRegister={() => navigateTo('register')}
            />
          ) : currentStudent ? (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto glass-panel-elevated rounded-3xl p-8 border border-[#D4AF37]/40 bg-white text-[#0B1F3A] shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6 text-[#D4AF37]" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1F3A]">Student Access Restricted</h2>
              <p className="text-xs text-[#182F4E] font-medium leading-relaxed">
                HNGU Library Policy: The Turnstile Access Station is restricted to authorized librarians. Students cannot operate turnstiles. Please present your Personal QR code at the physical barrier.
              </p>
              <button
                onClick={() => navigateTo('student-profile')}
                className="px-6 py-2.5 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-semibold rounded-xl text-xs border border-[#D4AF37]/50 shadow-md transition cursor-pointer"
              >
                View My Digital ID & Personal QR
              </button>
            </div>
          ) : (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto glass-panel-elevated rounded-3xl p-8 border border-[#D4AF37]/40 bg-white text-[#0B1F3A] shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6 text-[#D4AF37]" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1F3A]">Librarian Authorization Required</h2>
              <p className="text-xs text-[#0B1F3A]/75 leading-relaxed">
                You must be authenticated as an authorized HNGU librarian or administrator to operate the Turnstile Access Station.
              </p>
              <button
                onClick={() => navigateTo('admin-login')}
                className="px-6 py-3 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-semibold rounded-xl text-xs border border-[#D4AF37]/50 shadow-md transition cursor-pointer"
              >
                Go to Librarian Staff Login
              </button>
            </div>
          )
        )}

        {/* Book Circulation - Librarian / Admin ONLY */}
        {activeView === 'circulation' && (
          <CirculationDesk
            adminUser={adminUser}
            currentStudent={currentStudent}
            onOpenAdminLogin={() => navigateTo('admin-login')}
            onBackToHome={() => navigateTo('landing')}
          />
        )}

        {/* Book Catalog: Registered Student (Read-Only) OR Admin (Management) */}
        {activeView === 'books' && (
          (currentStudent || adminUser) ? (
            <BookManager
              currentStudent={currentStudent}
              adminUser={adminUser}
              onOpenAdminLogin={() => navigateTo('admin-login')}
            />
          ) : (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto glass-panel-elevated rounded-3xl p-8 border border-[#D4AF37]/40 bg-white text-[#0B1F3A] shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6 text-[#D4AF37]" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1F3A]">Student Registration Required</h2>
              <p className="text-xs text-[#0B1F3A]/75 leading-relaxed">
                Access to the HNGU University Book Catalogue and academic resources is reserved for verified registered students and library staff. Please register to obtain your Digital Library ID Card.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  onClick={() => navigateTo('register')}
                  className="px-6 py-2.5 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-bold rounded-xl text-xs border border-[#D4AF37]/50 shadow-md transition cursor-pointer"
                >
                  Register for Free ID Card
                </button>
                <button
                  onClick={() => navigateTo('student-login')}
                  className="px-4 py-2.5 bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] border border-[#0B1F3A]/20 hover:border-[#D4AF37] rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            </div>
          )
        )}

        {/* Protected Admin Login */}
        {activeView === 'admin-login' && (
          <AdminLogin
            onAdminLoginSuccess={handleAdminLoginSuccess}
            onBackToHome={() => navigateTo('landing')}
          />
        )}

        {/* Protected Admin Dashboard */}
        {activeView === 'admin-dashboard' && (
          adminUser ? (
            <AdminDashboard
              adminUser={adminUser}
              onAdminLogout={handleAdminLogout}
            />
          ) : (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto glass-panel-elevated rounded-3xl p-8 border border-[#D4AF37]/40 bg-white text-[#0B1F3A] shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6 text-[#D4AF37]" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1F3A]">Admin Access Required</h2>
              <p className="text-xs text-[#0B1F3A]/75 leading-relaxed">
                You must be authenticated as an authorized HNGU library staff member or administrator to view this dashboard. Students are forbidden from accessing admin controls.
              </p>
              <button
                onClick={() => navigateTo('admin-login')}
                className="px-6 py-3 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-semibold rounded-xl text-xs border border-[#D4AF37]/50 shadow-md transition cursor-pointer"
              >
                Go to Librarian Staff Login
              </button>
            </div>
          )
        )}
        </div>
      </main>

      {/* Minimal, Elegant University Footer in Deep Navy #0B1F3A with Champagne Gold Accents & Ivory Text */}
      <footer className="mt-auto border-t border-[#D4AF37]/25 bg-[#0B1F3A] py-10 px-4 text-xs text-[#F8F6F0]/80 relative z-10 shadow-2xl">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-[#D4AF37]/20">
            <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0B1F3A] border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] font-bold text-xs shadow-md">
                  H
                </div>
                <span className="text-[#F8F6F0] font-bold text-sm tracking-tight">HNGU Smart Library</span>
              </div>
              <span className="hidden sm:inline text-[#D4AF37]/60">·</span>
              <span className="text-[#F8F6F0]/75">Hemchandracharya North Gujarat University · Patan, Gujarat, India</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#071629] border border-[#D4AF37]/35 text-[#D4AF37] text-xs font-medium font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
                <span>Turnstile Relays: Operational</span>
              </div>
              {adminUser ? (
                <span className="text-[#D4AF37] flex items-center gap-1 font-medium text-xs">
                  <Shield className="w-3.5 h-3.5" /> Staff ({adminUser.name})
                </span>
              ) : currentStudent ? (
                <span className="text-[#D4AF37] flex items-center gap-1 font-medium text-xs">
                  <User className="w-3.5 h-3.5" /> Student ({currentStudent.name})
                </span>
              ) : (
                <button
                  onClick={() => navigateTo('admin-login')}
                  className="text-[#F8F6F0] hover:text-[#D4AF37] transition cursor-pointer flex items-center gap-1.5 font-medium text-xs px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-[#D4AF37]/30"
                >
                  <Lock className="w-3 h-3 text-[#D4AF37]" />
                  Staff Portal
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#F8F6F0]/75">
            {/* Quick Links */}
            <div className="flex flex-wrap items-center justify-center gap-5">
              <button onClick={() => navigateTo('landing')} className="hover:text-[#D4AF37] transition cursor-pointer">
                Home
              </button>
              {currentStudent ? (
                <>
                  <button onClick={() => navigateTo('student-profile')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    My Student ID & Pass
                  </button>
                  <button onClick={() => navigateTo('books')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    Books Catalogue
                  </button>
                </>
              ) : adminUser ? (
                <>
                  <button onClick={() => navigateTo('admin-dashboard')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    Admin Console
                  </button>
                  <button onClick={() => navigateTo('books')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    Books Management
                  </button>
                  <button onClick={() => navigateTo('circulation')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    Circulation Desk
                  </button>
                  <button onClick={() => navigateTo('kiosk')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    Turnstiles
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => navigateTo('student-login')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    Student Sign In
                  </button>
                  <button onClick={() => navigateTo('register')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    Register Pass
                  </button>
                  <button onClick={() => navigateTo('books')} className="hover:text-[#D4AF37] transition cursor-pointer">
                    Books Catalogue
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bottom Copyright & Professional Creator Credit Line */}
          <div className="pt-4 border-t border-[#D4AF37]/15 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#F8F6F0]/75">
            <div>
              &copy; 2026 HNGU Smart Library. Hemchandracharya North Gujarat University. All rights reserved.
            </div>

            {/* Subtle, Premium Personal Branding Credit */}
            <div className="flex items-center gap-2 shrink-0">
              <ManagedByNeev variant="footer" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
