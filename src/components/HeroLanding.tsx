import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  limit,
  getDocs,
  getCountFromServer,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COLLECTIONS } from '../lib/dbService';
import { fetchLivePresenceCount } from '../lib/studentAuth';
import { Book, Student, LibraryVisit, AdminUser } from '../types';
import { QrCodeDisplay } from './QrCodeDisplay';
import { QrScannerModal } from './QrScannerModal';
import libraryInteriorImage from '../assets/images/hngu_university_library_interior_1791103395027.jpg';
import {
  ScanLine,
  ArrowRight,
  ShieldCheck,
  BookOpen,
  Search,
  Lock,
  GraduationCap,
  MapPin,
  ChevronRight,
  User,
  Shield,
  Activity,
  Sparkles,
  QrCode,
  Compass,
} from 'lucide-react';

interface HeroLandingProps {
  onScanEntranceQr: () => void;
  onOpenEntranceKiosk: () => void;
  onOpenCirculationDesk: () => void;
  onOpenAdminLogin: () => void;
  onStudentLogin: () => void;
  onStudentQrScannedForLogin: (token: string) => void;
  onOpenBooksCatalog?: () => void;
  currentStudent?: Student | null;
  adminUser?: AdminUser | null;
  onRegisterToAccessBooks?: () => void;
}

export const HeroLanding: React.FC<HeroLandingProps> = ({
  onScanEntranceQr,
  onOpenEntranceKiosk,
  onOpenCirculationDesk,
  onOpenAdminLogin,
  onStudentLogin,
  onStudentQrScannedForLogin,
  onOpenBooksCatalog,
  currentStudent,
  adminUser,
  onRegisterToAccessBooks,
}) => {
  const hasAccessToBooks = !!currentStudent || !!adminUser;

  // Public Library Entrance QR payload: URL to open student registration
  const entranceQrValue =
    typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('https://')
      ? `${window.location.origin}/register`
      : 'https://hngu-smart-library-9008.ai.studio/register';

  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Live data from Firestore (optimized queries)
  const [books, setBooks] = useState<Book[]>([]);
  const [totalBooksCount, setTotalBooksCount] = useState<number>(0);
  const [lastVisibleBookDoc, setLastVisibleBookDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreBooks, setHasMoreBooks] = useState(false);
  const [loadingMoreBooks, setLoadingMoreBooks] = useState(false);
  const [activeStudentsCount, setActiveStudentsCount] = useState<number>(0);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);

  // Parallax interaction state for signature visual
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  // Book showcase search & filter state
  const [bookSearch, setBookSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Total library seat capacity
  const MAX_SEATS = 450;

  useEffect(() => {
    // 1. Fetch total book count via server aggregation (1 aggregated read instead of N document reads)
    let isMounted = true;
    const fetchCatalogCount = async () => {
      try {
        const countSnap = await getCountFromServer(collection(db, COLLECTIONS.BOOKS));
        if (isMounted) {
          setTotalBooksCount(countSnap.data().count);
        }
      } catch (err) {
        console.warn('Error fetching book count:', err);
      }
    };
    fetchCatalogCount();

    // 2. Fetch active students inside library count via secure cached endpoint (prevents student document exposure)
    const fetchPresence = async () => {
      const count = await fetchLivePresenceCount();
      if (isMounted) {
        setActiveStudentsCount(count);
      }
    };
    fetchPresence();
    const presenceTimer = setInterval(fetchPresence, 20000);

    return () => {
      isMounted = false;
      clearInterval(presenceTimer);
    };
  }, []);

  // 3. Books: Load only when user has access, with limit(20) and "Load more"
  useEffect(() => {
    if (!hasAccessToBooks) {
      setBooks([]);
      setLastVisibleBookDoc(null);
      setHasMoreBooks(false);
      return;
    }

    let isMounted = true;
    const loadInitialBooks = async () => {
      try {
        const qBooks = query(collection(db, COLLECTIONS.BOOKS), limit(20));
        const snap = await getDocs(qBooks);
        if (isMounted) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book));
          setBooks(list);
          const lastDoc = snap.docs[snap.docs.length - 1] || null;
          setLastVisibleBookDoc(lastDoc);
          setHasMoreBooks(snap.docs.length === 20);
        }
      } catch (err) {
        console.warn('Error loading initial books:', err);
      }
    };

    loadInitialBooks();

    return () => {
      isMounted = false;
    };
  }, [hasAccessToBooks]);

  const loadMoreBooks = async () => {
    if (!lastVisibleBookDoc || loadingMoreBooks) return;
    try {
      setLoadingMoreBooks(true);
      const qMore = query(
        collection(db, COLLECTIONS.BOOKS),
        startAfter(lastVisibleBookDoc),
        limit(20)
      );
      const snap = await getDocs(qMore);
      const moreList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book));
      setBooks((prev) => [...prev, ...moreList]);
      const lastDoc = snap.docs[snap.docs.length - 1] || null;
      setLastVisibleBookDoc(lastDoc);
      setHasMoreBooks(snap.docs.length === 20);
    } catch (err) {
      console.error('Error loading more books:', err);
    } finally {
      setLoadingMoreBooks(false);
    }
  };

  const handleStudentQrScan = (token: string) => {
    setIsScannerOpen(false);
    onStudentQrScannedForLogin(token);
  };

  // Subtle interactive parallax for the signature visual composition
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2; // -1 to 1
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setMousePos({ x: 0, y: 0 });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const categories = ['All', 'Computer Science', 'Electrical Engineering', 'Mechanical', 'Management', 'Sciences'];

  const filteredBooks = books.filter((book) => {
    const matchesCategory = selectedCategory === 'All' || book.category === selectedCategory;
    const matchesSearch =
      book.title.toLowerCase().includes(bookSearch.toLowerCase()) ||
      book.author.toLowerCase().includes(bookSearch.toLowerCase()) ||
      book.category.toLowerCase().includes(bookSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const occupancyPercentage = Math.min(100, Math.round((activeStudentsCount / MAX_SEATS) * 100));
  const availableSeats = Math.max(0, MAX_SEATS - activeStudentsCount);
  const activityState =
    occupancyPercentage < 40 ? 'Quiet Study' : occupancyPercentage < 80 ? 'Moderate' : 'Peak Hours';

  return (
    <div className="space-y-12 sm:space-y-20 pb-16 animate-in fade-in duration-500">
      {/* =========================================================================
          1. FIRST VIEWPORT: SIGNATURE HERO COMPOSITION
             "THE PHYSICAL LIBRARY → DIGITAL LIBRARY"
          ========================================================================= */}
      <section className="relative pt-1 sm:pt-4 pb-2 sm:pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center">
          {/* Left Column: Confident Editorial Typography & Primary Actions */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-6 text-left">
            {/* Institutional Overline (Zero-Pill Typographic Line) */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#8A6D0B]">
                Hemchandracharya North Gujarat University
              </span>
              <span aria-hidden="true" className="text-[#8A6D0B]/60">·</span>
              <span className="text-xs font-medium tracking-wider text-[#0B1F3A]/70 uppercase">
                Est. 1986 · Patan, Gujarat
              </span>
            </div>

            {/* Monumental Institutional Title */}
            <div className="space-y-0.5">
              <h1 className="space-y-0.5">
                <span className="block font-serif-academic text-3xl sm:text-5xl xl:text-6xl font-bold tracking-tight text-[#0B1F3A] leading-[1.04]">
                  HNGU
                </span>
                <span className="block font-serif-academic text-2xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-[#0B1F3A] leading-[1.06]">
                  Central Library
                </span>
              </h1>
              <p className="font-serif-academic italic text-lg sm:text-xl xl:text-2xl text-[#8A6D0B] font-semibold tracking-normal pt-1 leading-snug">
                Physical Archives · Digital Gateway
              </p>
            </div>

            {/* Refined Academic Lead Statement */}
            <p className="text-sm sm:text-base text-[#1E293B] leading-relaxed max-w-xl font-normal">
              The central intellectual sanctuary of North Gujarat University. Preserving classical research volumes while delivering automated turnstile campus entry, real-time desk occupancy telemetry, and digital syllabus circulation.
            </p>

            {/* Action Group: Dominant Primary CTA + Clean Secondary Controls */}
            <div className="space-y-3 pt-0.5">
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5">
                {/* DOMINANT PRIMARY ACTION: Turnstile QR Entry */}
                <button
                  onClick={onOpenEntranceKiosk}
                  className="inline-flex items-center justify-center gap-2.5 px-5 sm:px-6 py-3 rounded-xl bg-[#0B1F3A] hover:bg-[#132C4E] text-[#F8F6F0] font-bold text-xs sm:text-sm tracking-wide shadow-md border border-[#D4AF37] transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] group"
                >
                  <ScanLine className="w-4 h-4 text-[#D4AF37] transition-transform group-hover:rotate-45" />
                  <span>Turnstile QR Entry</span>
                  <ArrowRight className="w-4 h-4 text-[#D4AF37] transition-transform group-hover:translate-x-0.5" />
                </button>

                {/* Secondary Action: Student Portal */}
                <button
                  onClick={onStudentLogin}
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-xl bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] font-semibold text-xs sm:text-sm tracking-wide border border-[#0B1F3A]/20 hover:border-[#D4AF37] transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-[0.99]"
                >
                  <User className="w-4 h-4 text-[#D4AF37]" />
                  <span>Student ID Portal</span>
                </button>

                {/* Secondary Action: Registration */}
                <button
                  onClick={onScanEntranceQr}
                  className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-3 rounded-xl bg-transparent hover:bg-[#0B1F3A]/5 text-[#0B1F3A] font-semibold text-xs sm:text-sm tracking-wide border border-transparent hover:border-[#D4AF37]/40 transition-all cursor-pointer"
                >
                  <GraduationCap className="w-4 h-4 text-[#D4AF37]" />
                  <span>Register for Pass</span>
                </button>
              </div>

              {/* Tertiary Catalog Quick Link */}
              {onOpenBooksCatalog && (
                <div className="pt-0.5">
                  <button
                    onClick={onOpenBooksCatalog}
                    className="inline-flex items-center gap-1.5 text-xs text-[#0B1F3A]/80 hover:text-[#0B1F3A] font-medium transition cursor-pointer group"
                  >
                    <Search className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span className="underline underline-offset-4 decoration-[#D4AF37]/50 group-hover:decoration-[#D4AF37]">
                      Browse library book catalog directly ({totalBooksCount || books.length} titles indexed)
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              )}
            </div>

            {/* Quiet Real-Time Telemetry Row (Zero-Pill Typographic Separators) */}
            <div className="pt-2.5 border-t border-[#0B1F3A]/10 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#64748B]">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-[#0B1F3A] tabular-nums text-sm">450</span>
                <span>Study Desks</span>
              </div>
              <span aria-hidden="true" className="text-[#D4AF37]">•</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-[#0B1F3A] tabular-nums text-sm">{activeStudentsCount}</span>
                <span>Active Readers</span>
              </div>
              <span aria-hidden="true" className="text-[#D4AF37]">•</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-[#0B1F3A] tabular-nums text-sm">{totalBooksCount || books.length}</span>
                <span>Volumes Cataloged</span>
              </div>
              <span aria-hidden="true" className="text-[#D4AF37]">•</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[#065F46] font-semibold">Turnstiles Active</span>
              </div>
            </div>
          </div>

          {/* Right Column: DISTINCTIVE SIGNATURE COMPOSITION (Physical → Digital Parallax) */}
          <div
            className="lg:col-span-5 relative select-none"
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Outer Architectural Container */}
            <div className="relative w-full max-w-lg mx-auto">
              {/* LAYER 1: The Architectural Ground (Physical Reading Hall Photograph) */}
              <div
                className="relative rounded-3xl overflow-hidden border border-[#D4AF37]/45 shadow-xl bg-[#0B1F3A] transition-transform duration-300 ease-out"
                style={{
                  transform: `translate3d(${isHovered ? mousePos.x * -5 : 0}px, ${isHovered ? mousePos.y * -5 : 0}px, 0)`,
                }}
              >
                {/* Authentic Library Interior Image */}
                <div className="aspect-[4/3] sm:aspect-[16/11] relative overflow-hidden">
                  <img
                    src={libraryInteriorImage}
                    alt="HNGU Central Library Reading Hall Interior"
                    className="w-full h-full object-cover filter contrast-[1.02] brightness-[0.98] transition-transform duration-700 hover:scale-103"
                  />
                  {/* Subtle Archival Vignette */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/25 to-transparent opacity-90" />

                  {/* Corner Registration Markings (Classical Architectural Blueprint Style) */}
                  <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-[#D4AF37]/60 pointer-events-none" />
                  <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-[#D4AF37]/60 pointer-events-none" />

                  {/* Archival Identification Stamp (Top-Left) */}
                  <div className="absolute top-3.5 left-5 px-2.5 py-1 rounded bg-[#0B1F3A]/85 backdrop-blur-md border border-[#D4AF37]/40 text-xs text-[#F8F6F0] font-mono tracking-widest uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
                    <span>HNGU ARCHIVAL HALL · BAY 01</span>
                  </div>

                  {/* Atmospheric Callout (Top-Right): In dark navy pill with light/gold text for readability on any image */}
                  <div className="absolute top-3.5 right-5 hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0B1F3A]/90 backdrop-blur-md border border-[#D4AF37]/50 text-xs text-[#F8F6F0] font-mono shadow-md">
                    <span className="text-[#D4AF37] font-bold">450</span>
                    <span className="text-[#F8F6F0]/90">SEATS</span>
                  </div>
                </div>

                {/* Lower Base: Physical Catalog Coordinates */}
                <div className="px-5 py-3.5 bg-[#071629] border-t border-[#D4AF37]/30 flex items-center justify-between text-xs text-[#F8F6F0]">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span className="font-mono text-xs text-[#F8F6F0]/90">
                      STACKS: PHYSICAL & DIGITAL INDEX
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#D4AF37] font-semibold">
                    {activityState.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* LAYER 2: The Physical Shelf Card Bridge (Overlapping Tactile Ivory Card) */}
              <div
                className="hidden sm:block absolute -top-4 -left-4 w-56 rounded-2xl p-3.5 bg-[#F8F6F0] border border-[#D4AF37]/60 shadow-lg shadow-[#0B1F3A]/10 text-[#0B1F3A] transition-transform duration-300 ease-out pointer-events-none z-10"
                style={{
                  transform: `translate3d(${isHovered ? mousePos.x * 7 : 0}px, ${isHovered ? mousePos.y * 7 : 0}px, 0)`,
                }}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-[#0B1F3A]/10">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#8A6D0B] font-bold">
                    INDEX CARD #04
                  </span>
                  <span className="text-xs font-mono text-[#0B1F3A]/60">HNGU-CAT</span>
                </div>
                <div className="pt-1.5 space-y-0.5">
                  <div className="text-xs font-bold text-[#0B1F3A] font-mono truncate">
                    CALL: QA 76.73 · C66
                  </div>
                  <p className="text-xs text-[#0B1F3A]/70 line-clamp-2 leading-tight">
                    &ldquo;Where classical inquiry converges with digital discovery.&rdquo;
                  </p>
                </div>
              </div>

              {/* LAYER 3: The Digital Transformation Gateway (Floating Interactive Pass Plate) */}
              <div
                onClick={currentStudent ? onStudentLogin : adminUser ? onOpenEntranceKiosk : onOpenAdminLogin}
                className="absolute -bottom-5 sm:-bottom-6 right-2 sm:-right-4 w-[92%] sm:w-72 rounded-2xl p-4 bg-[#0B1F3A] border-2 border-[#D4AF37] shadow-2xl text-[#F8F6F0] transition-all duration-300 ease-out cursor-pointer hover:border-white hover:scale-[1.02] group z-20"
                style={{
                  transform: `translate3d(${isHovered ? mousePos.x * 12 : 0}px, ${isHovered ? mousePos.y * 12 : 0}px, 0)`,
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-[#D4AF37]/30">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
                    <span className="text-[10px] font-mono font-bold tracking-wider text-[#D4AF37] uppercase">
                      TURNSTILE GATEWAY
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase">
                    ONLINE
                  </span>
                </div>

                {/* Reader Count & Occupancy Meter */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[#F8F6F0] leading-none">
                      {activeStudentsCount}
                    </div>
                    <div className="text-[10px] text-[#F8F6F0]/75 mt-0.5">
                      Readers in Hall / {MAX_SEATS} Desks
                    </div>
                  </div>

                  {/* Compact QR Thumbnail with Launch Indicator */}
                  <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 border border-[#D4AF37]/50 group-hover:scale-105 transition-transform">
                    <QrCode className="w-6 h-6 text-[#0B1F3A]" />
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-2">
                  <div
                    className="h-full bg-[#D4AF37] rounded-full transition-all duration-500"
                    style={{ width: `${occupancyPercentage}%` }}
                  />
                </div>

                {/* Interactive Click Hint */}
                <div className="pt-1 flex items-center justify-between text-[10px] text-[#D4AF37] font-semibold group-hover:text-white transition-colors">
                  <span>{currentStudent ? 'View My Entrance QR Pass' : adminUser ? 'Open Turnstiles Station' : 'Staff Station Login'}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. THREE CORE CAMPUS PATHWAYS (Human Editorial Numbering 01., 02., 03.)
          ========================================================================= */}
      <section className="space-y-6">
        <div className="border-b border-[#0B1F3A]/10 pb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono font-bold tracking-widest text-[#8A6D0B] uppercase">
              Campus Workspaces & Gateways
            </div>
            <h2 className="font-serif-academic text-xl sm:text-2xl font-bold text-[#0B1F3A] tracking-tight mt-0.5">
              Library Access Pathways
            </h2>
          </div>
          <span className="text-xs text-[#64748B] hidden sm:inline">HNGU Smart Systems</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
          {/* PATHWAY 01: Student Registration */}
          <div
            onClick={onScanEntranceQr}
            className="group relative rounded-2xl p-6 sm:p-7 bg-white border border-[#D4AF37]/30 hover:border-[#D4AF37] shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs font-bold text-[#D4AF37] tracking-wider">01.</span>
                <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-105 transition-transform">
                  <GraduationCap className="w-5 h-5 text-[#D4AF37]" />
                </div>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A] tracking-tight group-hover:text-[#D4AF37] transition-colors">
                Student Registration
              </h3>
              <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
                Register as an enrolled university student to activate your permanent membership and generate your personal digital library card.
              </p>
            </div>

            <div className="pt-5 mt-5 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs font-semibold text-[#0B1F3A] group-hover:text-[#D4AF37] transition-colors">
              <span>Register Online</span>
              <ArrowRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* PATHWAY 02: Student ID & Reading Hall Access */}
          <div
            onClick={onStudentLogin}
            className="group relative rounded-2xl p-6 sm:p-7 bg-white border border-[#D4AF37]/30 hover:border-[#D4AF37] shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs font-bold text-[#D4AF37] tracking-wider">02.</span>
                <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-105 transition-transform">
                  <User className="w-5 h-5 text-[#D4AF37]" />
                </div>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A] tracking-tight group-hover:text-[#D4AF37] transition-colors">
                Student ID Pass & Portal
              </h3>
              <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
                View your personal high-resolution university ID card, scan QR pass for immediate authentication, track active book loans, and view visits.
              </p>
            </div>

            <div className="pt-5 mt-5 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs font-semibold text-[#0B1F3A] group-hover:text-[#D4AF37] transition-colors">
              <span>Enter Student Portal</span>
              <ArrowRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* PATHWAY 03: Library Book Catalogue (or Librarian Console for guests/staff) */}
          {currentStudent ? (
            <div
              onClick={onOpenBooksCatalog}
              className="group relative rounded-2xl p-6 sm:p-7 bg-white border border-[#D4AF37]/30 hover:border-[#D4AF37] shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs font-bold text-[#D4AF37] tracking-wider">03.</span>
                  <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-105 transition-transform">
                    <BookOpen className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A] tracking-tight group-hover:text-[#D4AF37] transition-colors">
                  University Book Catalogue
                </h3>
                <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
                  Search indexed academic volumes, review real-time stack availability, and find physical Board & Line bookshelf coordinates across all faculties.
                </p>
              </div>

              <div className="pt-5 mt-5 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs font-semibold text-[#0B1F3A] group-hover:text-[#D4AF37] transition-colors">
                <span>Browse Catalogue</span>
                <ArrowRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ) : (
            <div
              onClick={onOpenAdminLogin}
              className="group relative rounded-2xl p-6 sm:p-7 bg-white border border-[#D4AF37]/30 hover:border-[#D4AF37] shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs font-bold text-[#D4AF37] tracking-wider">03.</span>
                  <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-105 transition-transform">
                    <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A] tracking-tight group-hover:text-[#D4AF37] transition-colors">
                  Librarian Console
                </h3>
                <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
                  Authorized administrative interface for library directors and faculty to manage book catalogs, circulation desks, inventory, and student passes.
                </p>
              </div>

              <div className="pt-5 mt-5 border-t border-[#0B1F3A]/10 flex items-center justify-between text-xs font-semibold text-[#0B1F3A] group-hover:text-[#D4AF37] transition-colors">
                <span>Staff Login</span>
                <ArrowRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          3. CENTRAL READING HALL & PHYSICAL GATEWAY ACCESS
          ========================================================================= */}
      <section className="rounded-3xl p-6 sm:p-8 lg:p-10 border border-[#D4AF37]/40 shadow-xl bg-[#0B1F3A] text-[#F8F6F0]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left: Reading Hall Seating & Status */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37] font-mono">
                  Central Reading Hall Telemetry
                </span>
              </div>
              <div className="text-xs text-[#F8F6F0]/80">
                Turnstiles: <span className="text-[#D4AF37] font-semibold">Active</span>
              </div>
            </div>

            {/* Capacity Progress Bar */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                <span className="text-[#F8F6F0]/80 font-medium">Study Seating Capacity</span>
                <span className="font-mono font-bold text-[#F8F6F0]">
                  {activeStudentsCount} of {MAX_SEATS} seats ({occupancyPercentage}% Occupied)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#071629] border border-[#D4AF37]/20 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    occupancyPercentage > 80
                      ? 'bg-rose-400'
                      : occupancyPercentage > 50
                      ? 'bg-[#D4AF37]'
                      : 'bg-[#D4AF37]'
                  }`}
                  style={{ width: `${occupancyPercentage}%` }}
                />
              </div>
            </div>

            {/* 3 Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-[#071629] border border-[#D4AF37]/25 text-center">
                <div className="text-2xl font-bold text-[#F8F6F0] tracking-tight font-mono tabular-nums">{activeStudentsCount}</div>
                <div className="text-[11px] text-[#F8F6F0]/70 mt-1 font-medium">Students Present</div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#071629] border border-[#D4AF37]/25 text-center">
                <div className="text-2xl font-bold text-[#D4AF37] tracking-tight font-mono tabular-nums">{availableSeats}</div>
                <div className="text-[11px] text-[#F8F6F0]/70 mt-1 font-medium">Desks Available</div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#071629] border border-[#D4AF37]/25 text-center">
                <div className="text-2xl font-bold text-[#D4AF37] tracking-tight">{activityState}</div>
                <div className="text-[11px] text-[#F8F6F0]/70 mt-1 font-medium">Study Atmosphere</div>
              </div>
            </div>

            {/* Turnstile Navigation Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <button
                onClick={onOpenEntranceKiosk}
                className="px-5 py-3 bg-[#D4AF37] hover:bg-[#C29F2F] text-[#0B1F3A] font-bold rounded-xl text-xs border border-[#D4AF37] shadow-sm transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                <ScanLine className="w-4 h-4 text-[#0B1F3A]" />
                <span>Open Turnstiles Gateway</span>
              </button>
              <button
                onClick={onOpenCirculationDesk}
                className="px-5 py-3 bg-[#0B1F3A] hover:bg-[#132C4E] text-[#F8F6F0] font-semibold text-xs rounded-xl border border-[#D4AF37]/50 shadow-sm transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                <span>Circulation Desk</span>
              </button>
            </div>
          </div>

          {/* Right: Live Entrance Barrier QR Card */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="p-5 rounded-2xl bg-white border border-[#D4AF37]/40 shadow-xl flex flex-col items-center w-full max-w-sm text-[#0B1F3A]">
              <div className="flex items-center justify-between w-full pb-3 border-b border-[#0B1F3A]/10 mb-3">
                <span className="text-xs font-bold text-[#0B1F3A] tracking-wider font-mono">UNIVERSITY PASS ACCESS</span>
                <span className="text-[10px] text-[#D4AF37] font-bold">Ready</span>
              </div>

              <div className="p-3 bg-white rounded-xl shadow-xs border border-[#D4AF37]/30">
                <QrCodeDisplay
                  value={entranceQrValue}
                  size={165}
                  label="HNGU DIGITAL ACCESS"
                  sublabel="SCAN TO REGISTER"
                  showDownload={true}
                  downloadFilename="hngu-library-entrance-pass"
                />
              </div>

              <p className="text-[11px] text-[#64748B] text-center mt-3 leading-relaxed">
                Scan with any smartphone camera to register and activate your student library account.
              </p>

              <button
                onClick={onScanEntranceQr}
                className="w-full mt-3 py-2.5 px-3 bg-[#0B1F3A] hover:bg-[#132C4E] text-[#F8F6F0] rounded-xl text-xs font-semibold border border-[#D4AF37]/50 transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-2"
              >
                <ScanLine className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Simulate Entrance Pass Scan</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. CURATED ACADEMIC CATALOG SHOWCASE
          ========================================================================= */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#0B1F3A]/10 pb-4">
          <div>
            <div className="text-xs font-mono font-bold tracking-widest text-[#8A6D0B] uppercase flex items-center gap-1.5">
              <span>HNGU ACADEMIC COLLECTION</span>
              {!hasAccessToBooks && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#D4AF37]/20 text-[#0B1F3A] border border-[#D4AF37]/40 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-[#0B1F3A]" />
                  <span>Members Only</span>
                </span>
              )}
            </div>
            <h2 className="font-serif-academic text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight mt-1">
              Curated Library Catalog
            </h2>
          </div>

          {hasAccessToBooks ? (
            onOpenBooksCatalog && (
              <button
                onClick={onOpenBooksCatalog}
                className="text-xs text-[#0B1F3A] hover:text-[#D4AF37] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Browse Full Catalog ({totalBooksCount || books.length} titles)</span>
                <ChevronRight className="w-4 h-4 text-[#D4AF37]" />
              </button>
            )
          ) : (
            <button
              onClick={onRegisterToAccessBooks || onScanEntranceQr}
              className="text-xs text-[#0B1F3A] hover:text-[#D4AF37] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Register to Access Books Catalog</span>
              <ChevronRight className="w-4 h-4 text-[#D4AF37]" />
            </button>
          )}
        </div>

        {/* Access Notice for Unregistered Students */}
        {!hasAccessToBooks && (
          <div className="p-4 rounded-2xl bg-white border border-[#D4AF37]/35 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#0B1F3A]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <p className="text-[#1E293B] text-xs leading-relaxed">
                <strong className="text-[#0B1F3A]">Student Access Policy:</strong> Full access to the university catalog, syllabus reference texts, and borrowing permissions requires an active student account.
              </p>
            </div>
            <button
              onClick={onRegisterToAccessBooks || onScanEntranceQr}
              className="px-4 py-2 rounded-xl bg-[#0B1F3A] hover:bg-[#132C4E] text-[#F8F6F0] border border-[#D4AF37]/50 font-bold text-xs shrink-0 cursor-pointer shadow-2xs transition-colors"
            >
              Register for Free ID Card
            </button>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, author, or discipline..."
              value={bookSearch}
              onChange={(e) => setBookSearch(e.target.value)}
              className="w-full bg-white border border-[#D4AF37]/35 rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:outline-none focus:border-[#D4AF37] shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
            {categories.slice(0, 4).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37] font-bold shadow-2xs'
                    : 'bg-white text-[#0B1F3A] border border-[#D4AF37]/30 hover:border-[#D4AF37]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Books Grid or Locked Access Panel */}
        {!hasAccessToBooks ? (
          <div className="rounded-3xl p-6 sm:p-10 border border-[#D4AF37]/35 text-center space-y-4 bg-white shadow-md">
            <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] border border-[#D4AF37]/40 flex items-center justify-center mx-auto text-[#D4AF37] shadow-xs">
              <Lock className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-widest text-[#8A6D0B] font-bold">
                Student Access Policy Enforcement
              </span>
              <h3 className="font-serif-academic text-xl font-bold text-[#0B1F3A]">University Book Catalogue Locked</h3>
              <p className="text-xs text-[#64748B] max-w-lg mx-auto leading-relaxed pt-1 font-normal">
                In compliance with HNGU Smart Library regulations, physical library volumes, shelf coordinates, and lending privileges are reserved for verified registered students.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={onRegisterToAccessBooks || onScanEntranceQr}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#132C4E] text-[#F8F6F0] border border-[#D4AF37]/50 font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Register Student ID Card
              </button>
              <button
                onClick={onStudentLogin}
                className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] font-medium rounded-xl text-xs border border-[#0B1F3A]/20 hover:border-[#D4AF37] transition-colors cursor-pointer"
              >
                Sign In with Phone
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filteredBooks.slice(0, 4).map((book) => {
              const isAvailable = book.availableCopies > 0;
              return (
                <div
                  key={book.id}
                  className="rounded-2xl p-4 sm:p-5 border border-[#D4AF37]/25 hover:border-[#D4AF37] transition-all duration-200 flex flex-col justify-between group bg-white shadow-2xs hover:shadow-md text-[#0B1F3A]"
                >
                  <div className="space-y-3.5">
                    <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-[#F8F6F0] border border-[#0B1F3A]/10 group-hover:shadow-sm transition-all">
                      <img
                        src={book.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80'}
                        alt={book.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/80 via-transparent to-transparent opacity-80" />

                      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[10px] text-white">
                        <span className="flex items-center gap-1 bg-[#0B1F3A]/90 px-2 py-0.5 rounded-md backdrop-blur-xs text-[#F8F6F0]">
                          <MapPin className="w-3 h-3 text-[#D4AF37]" />
                          {book.rackLocation || 'Shelf General'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${
                            isAvailable
                              ? 'bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40'
                              : 'bg-rose-900/90 text-white'
                          }`}
                        >
                          {isAvailable ? `${book.availableCopies} Available` : 'All Issued'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase font-bold tracking-wider text-[#8A6D0B]">
                        {book.category}
                      </div>
                      <h4 className="text-sm font-bold text-[#0B1F3A] group-hover:text-[#D4AF37] transition-colors line-clamp-1">
                        {book.title}
                      </h4>
                      <p className="text-xs text-[#64748B] truncate">
                        by {book.author}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#0B1F3A]/10 flex items-center justify-between">
                    {adminUser ? (
                      <button
                        onClick={onOpenCirculationDesk}
                        className="text-xs font-semibold text-[#0B1F3A] hover:text-[#D4AF37] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Shield className="w-3 h-3 text-[#D4AF37]" />
                        <span>Issue at Desk</span>
                      </button>
                    ) : (
                      <button
                        onClick={onOpenBooksCatalog}
                        className="text-xs font-semibold text-[#0B1F3A] hover:text-[#D4AF37] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <BookOpen className="w-3 h-3 text-[#D4AF37]" />
                        <span>View in Catalogue</span>
                      </button>
                    )}
                    <span className="text-[10px] text-[#64748B] font-mono">
                      {book.bookId}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasAccessToBooks && hasMoreBooks && (
          <div className="pt-2 flex justify-center">
            <button
              onClick={loadMoreBooks}
              disabled={loadingMoreBooks}
              className="px-6 py-2.5 rounded-xl bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] font-semibold text-xs border border-[#D4AF37]/50 hover:border-[#D4AF37] transition shadow-2xs cursor-pointer flex items-center gap-2"
            >
              <span>{loadingMoreBooks ? 'Loading titles...' : 'Load more titles (+20)'}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#D4AF37]" />
            </button>
          </div>
        )}
      </section>

      {/* QR Scanner for Student Login Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleStudentQrScan}
        title="Scan Student Personal QR to Log In"
        description="Scan your digital ID card QR to identify your student account"
        expectedType="student"
        manualOptions={availableStudents.slice(0, 4).map((s) => ({
          label: `${s.name} (${s.studentId})`,
          value: s.personalQrId || `SLMS-STU-${s.id}`,
          hint: s.department,
        }))}
      />
    </div>
  );
};
