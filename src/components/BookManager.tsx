import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getCountFromServer,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COLLECTIONS } from '../lib/dbService';
import { Book, Student, AdminUser } from '../types';
import { QrCodeDisplay } from './QrCodeDisplay';
import {
  BookOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  QrCode,
  CheckCircle2,
  X,
  AlertCircle,
  MapPin,
  ShieldCheck,
  LayoutGrid,
  List,
  Copy,
  Check,
  ArrowRight,
  BookMarked,
  Info,
  Layers,
  Sparkles,
  Bookmark,
  Hash,
  Barcode,
  Calendar,
  Eye,
} from 'lucide-react';

interface BookManagerProps {
  currentStudent?: Student | null;
  adminUser?: AdminUser | null;
  onOpenAdminLogin?: () => void;
}

// Quick suggested queries for rapid catalogue discovery
const SUGGESTED_QUERIES = [
  'Algorithms',
  'Data Structures',
  'Artificial Intelligence',
  'Database',
  'Software Engineering',
  'Computer Networks',
];

// ---------------------------------------------------------------------------
// PARSED LOCATION INTERFACE & ROBUST PARSER
// ---------------------------------------------------------------------------
export interface ParsedLocation {
  raw: string;
  boardNumber: string;
  lineNumber: string;
  boardNumericIndex: number; // 1 to 5 for 2D visualizer
  lineNumericIndex: number;  // 1 to 5 for 2D shelf tier
  displayBoard: string;      // e.g. "BOARD A" or "BOARD 04"
  displayLine: string;       // e.g. "LINE 03" or "LINE 02"
}

export function parseBookLocation(locationStr?: string): ParsedLocation {
  const raw = (locationStr || 'Section A - Rack 1').trim();
  let board = '';
  let line = '';

  // 1. Check for explicit "Board" or "Section"
  const boardExplicit = raw.match(/board\s*([0-9a-zA-Z]+)/i);
  if (boardExplicit) {
    board = boardExplicit[1];
  }

  const sectionExplicit = raw.match(/section\s*([0-9a-zA-Z]+)/i);
  if (!board && sectionExplicit) {
    board = sectionExplicit[1];
  }

  const shelfExplicit = raw.match(/shelf\s*([a-zA-Z]+)[-\s]*([0-9]+)?/i);
  if (!board && shelfExplicit) {
    board = shelfExplicit[1];
    if (shelfExplicit[2]) line = shelfExplicit[2];
  }

  // 2. Check for explicit "Line" or "Rack"
  const lineExplicit = raw.match(/line\s*([0-9a-zA-Z]+)/i);
  if (lineExplicit) {
    line = lineExplicit[1];
  }

  const rackExplicit = raw.match(/rack\s*([0-9a-zA-Z]+)/i);
  if (!line && rackExplicit) {
    line = rackExplicit[1];
  }

  // 3. Fallback generic regex like "A-3" or "B 2"
  if (!board || !line) {
    const generic = raw.match(/([a-zA-Z]+)[-\s]*([0-9]+)/);
    if (generic) {
      if (!board) board = generic[1];
      if (!line) line = generic[2];
    }
  }

  const cleanBoard = (board || 'A').toUpperCase();
  const cleanLine = (line || '1').toUpperCase();

  const formattedBoard = /^\d+$/.test(cleanBoard)
    ? cleanBoard.length === 1 ? `0${cleanBoard}` : cleanBoard
    : cleanBoard;

  const formattedLine = /^\d+$/.test(cleanLine)
    ? cleanLine.length === 1 ? `0${cleanLine}` : cleanLine
    : cleanLine;

  // Numeric index for 2D visualizer representation (1..5)
  let boardIdx = 1;
  if (/^\d+$/.test(cleanBoard)) {
    boardIdx = Math.min(5, Math.max(1, parseInt(cleanBoard, 10)));
  } else {
    const charCode = cleanBoard.charCodeAt(0) - 64;
    boardIdx = Math.min(5, Math.max(1, charCode > 0 ? charCode : 1));
  }

  let lineIdx = 1;
  if (/^\d+$/.test(cleanLine)) {
    lineIdx = Math.min(5, Math.max(1, parseInt(cleanLine, 10)));
  } else {
    const charCode = cleanLine.charCodeAt(0) - 64;
    lineIdx = Math.min(5, Math.max(1, charCode > 0 ? charCode : 1));
  }

  return {
    raw,
    boardNumber: formattedBoard,
    lineNumber: formattedLine,
    boardNumericIndex: boardIdx,
    lineNumericIndex: lineIdx,
    displayBoard: `BOARD ${formattedBoard}`,
    displayLine: `LINE ${formattedLine}`,
  };
}

// ---------------------------------------------------------------------------
// 2D BOOKCASE LOCATION VISUALIZER COMPONENT
// Subtle, elegant, 2D representation of physical Board and Line tiers
// ---------------------------------------------------------------------------
const BookLocationVisualizer: React.FC<{
  location: ParsedLocation;
  bookTitle: string;
}> = ({ location, bookTitle }) => {
  // 5 standard vertical shelf lines / tiers inside a library bookcase board
  const SHELF_TIERS = [
    { num: '01', label: 'Line 01 • Top Tier' },
    { num: '02', label: 'Line 02 • Upper-Mid Tier' },
    { num: '03', label: 'Line 03 • Eye-Level Tier' },
    { num: '04', label: 'Line 04 • Lower-Mid Tier' },
    { num: '05', label: 'Line 05 • Base Tier' },
  ];

  // Map the parsed line to one of the 5 tiers (defaulting cleanly)
  const targetTierIdx = Math.min(5, Math.max(1, location.lineNumericIndex));

  // Boards present in this stack row
  const STACK_BOARDS = ['Board A', 'Board B', 'Board C', 'Board D'];

  return (
    <div className="rounded-2xl p-4 sm:p-5 bg-[#071629] border border-[#D4AF37]/40 text-[#F8F6F0] space-y-4">
      {/* Visualizer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#D4AF37]/20">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37]">
            Physical Stacks 2D Schematic
          </div>
          <div className="text-xs sm:text-sm font-semibold text-[#F8F6F0] mt-0.5">
            Bookcase Cross-Section • {location.displayBoard}
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B1F3A] border border-[#D4AF37]/35 text-[10px] font-mono text-[#D4AF37]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
          <span>Shelved on {location.displayLine}</span>
        </div>
      </div>

      {/* Row of Boards Indicator (Which bookcase upright column is active) */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-[#F8F6F0]/70 flex items-center justify-between">
          <span>Stack Board Row</span>
          <span className="text-[#D4AF37] font-bold">Active: {location.displayBoard}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {STACK_BOARDS.map((bName, idx) => {
            const isTargetBoard =
              location.boardNumber === bName.replace('Board ', '') ||
              location.boardNumericIndex === idx + 1;

            return (
              <div
                key={bName}
                className={`py-2 px-1 text-center rounded-lg border text-xs font-mono transition-all ${
                  isTargetBoard
                    ? 'bg-[#D4AF37] text-[#0B1F3A] font-extrabold border-[#D4AF37] shadow-sm ring-2 ring-[#D4AF37]/30'
                    : 'bg-[#0B1F3A]/70 text-[#F8F6F0]/50 border-[#D4AF37]/15'
                }`}
              >
                <div className="text-[9px] uppercase tracking-wider">
                  {isTargetBoard ? 'Target Board' : 'Adjacent'}
                </div>
                <div className="font-bold text-xs sm:text-sm">{bName}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2D Bookcase Elevation Diagram (Showing the 5 horizontal Shelf Lines) */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-[#F8F6F0]/70 flex items-center justify-between">
          <span>Shelf Tiers (Lines Top-to-Bottom)</span>
          <span className="text-emerald-300 font-bold">Target Tier Illuminated</span>
        </div>

        {/* Bookcase Outer Wooden Frame */}
        <div className="relative rounded-xl border-2 border-[#D4AF37]/45 bg-[#0B1F3A] p-2.5 sm:p-3 space-y-2 overflow-hidden shadow-inner">
          {/* Subtle wooden texture gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

          {SHELF_TIERS.map((tier, idx) => {
            const tierNum = idx + 1;
            const isTargetLine = tierNum === targetTierIdx;

            return (
              <div
                key={tier.num}
                className={`relative rounded-lg p-2 transition-all flex items-center justify-between gap-3 border ${
                  isTargetLine
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] ring-1 ring-[#D4AF37]/50 shadow-sm'
                    : 'bg-[#071629]/50 border-white/5 opacity-55'
                }`}
              >
                {/* Left Line Label */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`font-mono text-xs px-2 py-0.5 rounded font-bold ${
                      isTargetLine
                        ? 'bg-[#D4AF37] text-[#0B1F3A]'
                        : 'bg-white/10 text-[#F8F6F0]/60'
                    }`}
                  >
                    LINE {tier.num}
                  </span>
                  <span className="text-[10px] text-[#F8F6F0]/70 hidden sm:inline">
                    {tier.label.split(' • ')[1]}
                  </span>
                </div>

                {/* 2D Stylized Books on Shelf */}
                <div className="flex-1 flex items-end justify-center gap-1 h-6 px-2 overflow-hidden">
                  {isTargetLine ? (
                    /* Active Shelf Books: Target volume stands out */
                    <div className="flex items-end gap-1 w-full justify-center">
                      <div className="w-2.5 h-4 bg-white/20 rounded-xs" />
                      <div className="w-2 h-5 bg-white/20 rounded-xs" />
                      <div className="w-3 h-5.5 bg-white/25 rounded-xs" />
                      {/* Target Volume Pin */}
                      <div className="px-2.5 py-0.5 h-6 rounded-xs bg-[#D4AF37] text-[#0B1F3A] font-bold text-[9px] font-mono flex items-center justify-center shadow-xs border border-white/30 truncate max-w-[180px]">
                        ★ {bookTitle}
                      </div>
                      <div className="w-2.5 h-5 bg-white/20 rounded-xs" />
                      <div className="w-2 h-4 bg-white/20 rounded-xs" />
                      <div className="w-3 h-5.5 bg-white/25 rounded-xs" />
                    </div>
                  ) : (
                    /* Inactive Shelf: Muted books */
                    <div className="flex items-end gap-1 opacity-25">
                      <div className="w-2 h-4 bg-white/40 rounded-xs" />
                      <div className="w-2.5 h-5 bg-white/40 rounded-xs" />
                      <div className="w-2 h-4.5 bg-white/40 rounded-xs" />
                      <div className="w-3 h-5 bg-white/40 rounded-xs" />
                      <div className="w-2 h-4 bg-white/40 rounded-xs" />
                      <div className="w-2.5 h-5.5 bg-white/40 rounded-xs" />
                    </div>
                  )}
                </div>

                {/* Right Status Indicator */}
                <div className="shrink-0 text-right">
                  {isTargetLine ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#D4AF37]">
                      <Check className="w-3 h-3 text-[#D4AF37]" />
                      <span>Target Shelf</span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-[#F8F6F0]/40">
                      Tier {tier.num}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Bookcase Base Plank */}
          <div className="h-1.5 w-full bg-[#D4AF37]/40 rounded-full" />
        </div>
      </div>

      {/* Explanatory Educational Caption */}
      <p className="text-[11px] text-[#F8F6F0]/75 leading-relaxed pt-1 border-t border-[#D4AF37]/15">
        <strong className="text-[#D4AF37]">Stack Organization Guide:</strong> In the HNGU Central Library, each freestanding bookcase row is designated as a <strong>Board</strong>, and each vertical shelf tier is numbered as a <strong>Line</strong> (counted top-to-bottom from Line 01).
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MAIN BOOK MANAGER & CATALOGUE COMPONENT
// ---------------------------------------------------------------------------
export const BookManager: React.FC<BookManagerProps> = ({
  currentStudent,
  adminUser,
  onOpenAdminLogin,
}) => {
  const isStudentViewer = !!currentStudent && !adminUser;
  const isAdmin = !!adminUser;

  const [books, setBooks] = useState<Book[]>([]);
  const [totalBooksCount, setTotalBooksCount] = useState<number>(0);
  const [lastBookDoc, setLastBookDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreBooks, setHasMoreBooks] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [availabilityFilter, setAvailabilityFilter] = useState<'All' | 'Available' | 'IssuedOut'>('All');
  const [sortBy, setSortBy] = useState<'titleAsc' | 'titleDesc' | 'copiesDesc' | 'bookIdAsc'>('titleAsc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modal states
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [qrModalBook, setQrModalBook] = useState<Book | null>(null);
  const [detailsModalBook, setDetailsModalBook] = useState<Book | null>(null);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [copiedCoordinate, setCopiedCoordinate] = useState(false);

  // Admin Form states
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('Computer Science');
  const [isbn, setIsbn] = useState('');
  const [bookId, setBookId] = useState('');
  const [totalCopies, setTotalCopies] = useState<number>(3);
  const [availableCopies, setAvailableCopies] = useState<number>(3);
  const [coverImage, setCoverImage] = useState('');
  const [rackLocation, setRackLocation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingLoading, setSavingLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: '/' focuses search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      } else if (e.key === 'Escape') {
        if (detailsModalBook) setDetailsModalBook(null);
        else if (qrModalBook) setQrModalBook(null);
        else if (isAddEditOpen) setIsAddEditOpen(false);
        else if (bookToDelete) setBookToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailsModalBook, qrModalBook, isAddEditOpen, bookToDelete]);

  // Fetch Total Books Count via getCountFromServer and Paginated Initial Page (25 items)
  const fetchInitialBooks = async () => {
    setLoadingInitial(true);
    try {
      // 1. Get total books count using server aggregate
      try {
        const countSnap = await getCountFromServer(collection(db, COLLECTIONS.BOOKS));
        setTotalBooksCount(countSnap.data().count);
      } catch (errCount) {
        console.warn('Error fetching server total books count:', errCount);
      }

      // 2. Fetch first page of books
      const q = query(
        collection(db, COLLECTIONS.BOOKS),
        orderBy('title', 'asc'),
        limit(25)
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Book));
      setBooks(list);
      setLastBookDoc(snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null);
      setHasMoreBooks(snapshot.docs.length === 25);
    } catch (err) {
      console.warn('Error querying books with orderBy, trying fallback without orderBy:', err);
      try {
        const fallbackQ = query(collection(db, COLLECTIONS.BOOKS), limit(25));
        const snapshot = await getDocs(fallbackQ);
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Book));
        setBooks(list);
        setLastBookDoc(snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null);
        setHasMoreBooks(snapshot.docs.length === 25);
      } catch (e2) {
        console.error('Fallback books fetch error:', e2);
      }
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    fetchInitialBooks();
  }, []);

  // Load more books function (next page of 25)
  const loadMoreBooks = async () => {
    if (!lastBookDoc || loadingMore || !hasMoreBooks) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.BOOKS),
        orderBy('title', 'asc'),
        startAfter(lastBookDoc),
        limit(25)
      );
      const snapshot = await getDocs(q);
      const nextList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Book));
      setBooks((prev) => [...prev, ...nextList]);
      setLastBookDoc(snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null);
      setHasMoreBooks(snapshot.docs.length === 25);
    } catch (err) {
      console.warn('Error loading more books:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Reset coordinates copied state after 2 seconds
  useEffect(() => {
    if (copiedCoordinate) {
      const timer = setTimeout(() => setCopiedCoordinate(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedCoordinate]);

  const openAddModal = () => {
    if (!isAdmin) return;
    setEditingBook(null);
    setTitle('');
    setAuthor('');
    setCategory('Computer Science');
    setIsbn('978-013' + Math.floor(1000000 + Math.random() * 9000000));
    setBookId('BK-' + Math.floor(1000 + Math.random() * 9000));
    setTotalCopies(3);
    setAvailableCopies(3);
    setCoverImage('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80');
    setRackLocation('Section A - Rack 3');
    setFormError(null);
    setIsAddEditOpen(true);
  };

  const openEditModal = (b: Book) => {
    if (!isAdmin) return;
    setEditingBook(b);
    setTitle(b.title);
    setAuthor(b.author);
    setCategory(b.category);
    setIsbn(b.isbn || '');
    setBookId(b.bookId);
    setTotalCopies(b.totalCopies);
    setAvailableCopies(b.availableCopies);
    setCoverImage(b.coverImage || '');
    setRackLocation(b.rackLocation || '');
    setFormError(null);
    setIsAddEditOpen(true);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setFormError('Access Denied: Only authenticated library staff can add or edit books in the catalog.');
      return;
    }
    setFormError(null);
    setSavingLoading(true);

    try {
      const cleanBookId = bookId.trim().toUpperCase();
      const bookQrId = `SLMS-BK-${cleanBookId}`;

      if (editingBook) {
        const updatedFields = {
          title: title.trim(),
          author: author.trim(),
          category: category.trim(),
          isbn: isbn.trim(),
          bookId: cleanBookId,
          bookQrId,
          totalCopies: Number(totalCopies),
          availableCopies: Number(availableCopies),
          coverImage:
            coverImage.trim() ||
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80',
          rackLocation: rackLocation.trim(),
        };
        await updateDoc(doc(db, COLLECTIONS.BOOKS, editingBook.id), updatedFields);
        setBooks((prev) =>
          prev.map((b) => (b.id === editingBook.id ? { ...b, ...updatedFields } : b))
        );
      } else {
        const newBookData = {
          title: title.trim(),
          author: author.trim(),
          category: category.trim(),
          isbn: isbn.trim(),
          bookId: cleanBookId,
          bookQrId,
          totalCopies: Number(totalCopies),
          availableCopies: Number(availableCopies),
          coverImage:
            coverImage.trim() ||
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80',
          rackLocation: rackLocation.trim(),
          createdAt: new Date().toISOString(),
        };
        const docRef = await addDoc(collection(db, COLLECTIONS.BOOKS), newBookData);
        setBooks((prev) => [{ id: docRef.id, ...newBookData } as Book, ...prev]);
        setTotalBooksCount((prev) => prev + 1);
      }

      setIsAddEditOpen(false);
    } catch (err: any) {
      console.error('Save book error:', err);
      setFormError(err.message || 'Failed to save book volume.');
    } finally {
      setSavingLoading(false);
    }
  };

  const confirmDeleteBook = async () => {
    if (!bookToDelete || !isAdmin) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.BOOKS, bookToDelete.id));
      setBooks((prev) => prev.filter((b) => b.id !== bookToDelete.id));
      setTotalBooksCount((prev) => Math.max(0, prev - 1));
      setBookToDelete(null);
    } catch (err) {
      console.error('Delete book error:', err);
    }
  };

  const uniqueCategories = useMemo(() => {
    const defaultCats = [
      'All',
      'Computer Science',
      'Information Technology',
      'Mathematics',
      'Physics',
      'Literature',
      'Management & Commerce',
      'Civil Law & Governance',
    ];
    const loadedCats = books.map((b) => b.category).filter(Boolean);
    return Array.from(new Set([...defaultCats, ...loadedCats]));
  }, [books]);

  // Filter & Sort Pipeline
  const filteredAndSortedBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = books.filter((b) => {
      const matchesSearch =
        !query ||
        b.title.toLowerCase().includes(query) ||
        b.author.toLowerCase().includes(query) ||
        b.bookId.toLowerCase().includes(query) ||
        (b.isbn && b.isbn.toLowerCase().includes(query)) ||
        (b.category && b.category.toLowerCase().includes(query)) ||
        (b.rackLocation && b.rackLocation.toLowerCase().includes(query));

      const matchesCategory = categoryFilter === 'All' || b.category === categoryFilter;

      let matchesAvailability = true;
      if (availabilityFilter === 'Available') {
        matchesAvailability = b.availableCopies > 0;
      } else if (availabilityFilter === 'IssuedOut') {
        matchesAvailability = b.availableCopies === 0;
      }

      return matchesSearch && matchesCategory && matchesAvailability;
    });

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'titleAsc':
          return a.title.localeCompare(b.title);
        case 'titleDesc':
          return b.title.localeCompare(a.title);
        case 'copiesDesc':
          return b.availableCopies - a.availableCopies;
        case 'bookIdAsc':
          return a.bookId.localeCompare(b.bookId);
        default:
          return 0;
      }
    });

    return filtered;
  }, [books, searchQuery, categoryFilter, availabilityFilter, sortBy]);

  const hasActiveFilters = searchQuery !== '' || categoryFilter !== 'All' || availabilityFilter !== 'All';

  const clearAllFilters = () => {
    setSearchQuery('');
    setCategoryFilter('All');
    setAvailabilityFilter('All');
    setSortBy('titleAsc');
  };

  const copyCoordinatesToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCoordinate(true);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-7 animate-in fade-in duration-300">
      {/* =========================================================================
          1. INSTITUTIONAL CATALOGUE HEADER & SCOPE
          ========================================================================= */}
      <section className="rounded-2xl p-6 sm:p-8 border border-[#D4AF37]/35 bg-white text-[#0B1F3A] shadow-md relative overflow-hidden">
        {/* Subtle decorative architectural grid line */}
        <div className="absolute top-0 right-0 w-80 h-full pointer-events-none opacity-[0.03] bg-[radial-gradient(#0B1F3A_1px,transparent_1px)] [background-size:16px_16px]" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#8A6D0B] tracking-[0.14em] uppercase">
                HNGU Central Library Repository
              </span>
              <span className="text-[#0B1F3A]/30">·</span>
              <span className="font-mono text-xs text-[#0B1F3A]/70 uppercase tracking-wider">
                Patron Catalogue Service
              </span>
              {isStudentViewer && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono bg-emerald-50 text-emerald-900 border border-emerald-300">
                  <ShieldCheck className="w-3 h-3 text-emerald-700" />
                  <span>Verified Student Patron</span>
                </span>
              )}
              {isAdmin && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40">
                  <BookOpen className="w-3 h-3 text-[#D4AF37]" />
                  <span>Curator Management Mode</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#0B1F3A] tracking-tight font-serif-academic flex items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shadow-sm shrink-0">
                <BookOpen className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <span>Digital University Catalogue</span>
            </h1>

            <p className="text-xs sm:text-sm text-[#1E293B] max-w-2xl font-normal leading-relaxed">
              Explore reference texts, syllabi volumes, and physical Board & Line stack coordinates. Physical checkouts are authenticated with your digital QR pass at the central circulation desk.
            </p>
          </div>

          {/* Right Header Status / Admin CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {isAdmin ? (
              <button
                onClick={openAddModal}
                className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-bold text-xs shadow-sm transition flex items-center gap-2 cursor-pointer border border-[#D4AF37] hover:border-[#D4AF37]"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                <span>Add Volume to Catalog</span>
              </button>
            ) : currentStudent ? (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D4AF37]/35 text-xs text-[#0B1F3A] shadow-xs">
                <img
                  src={currentStudent.photo}
                  alt={currentStudent.name}
                  className="w-9 h-9 rounded-lg object-cover border border-[#0B1F3A]/20 shadow-xs"
                />
                <div>
                  <div className="font-bold text-[#0B1F3A] text-xs truncate max-w-[140px]">
                    {currentStudent.name}
                  </div>
                  <div className="text-[10px] text-[#0B1F3A]/80 font-mono font-bold">
                    ID: {currentStudent.studentId}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={onOpenAdminLogin}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#0B1F3A] hover:text-[#D4AF37] border border-[#D4AF37]/40 hover:border-[#D4AF37] bg-white transition cursor-pointer"
              >
                Staff Portal
              </button>
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. PRIMARY SEARCH AREA (Spacious, Focus Anchor, Modern Academic UX)
          ========================================================================= */}
      <section className="space-y-3">
        <div className="relative group rounded-2xl bg-white border-2 border-[#D4AF37]/45 hover:border-[#D4AF37] focus-within:border-[#D4AF37] focus-within:ring-4 focus-within:ring-[#D4AF37]/15 transition-all shadow-sm">
          <div className="flex items-center px-4 py-3 sm:py-3.5 gap-3">
            <Search className="w-5 h-5 text-[#D4AF37] shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, author, call number (BK-...), ISBN, or discipline..."
              className="w-full bg-transparent text-sm sm:text-base text-[#0B1F3A] placeholder-[#64748B] focus:outline-none font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 rounded-md text-[#64748B] hover:text-[#0B1F3A] hover:bg-[#F8F6F0] transition cursor-pointer"
                title="Clear search query"
                aria-label="Clear search query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <div className="hidden md:flex items-center gap-1.5 pl-3 border-l border-[#0B1F3A]/10 text-xs font-mono font-bold text-[#64748B]">
              <kbd className="px-1.5 py-0.5 rounded bg-[#F8F6F0] border border-[#0B1F3A]/15 text-[#0B1F3A]">
                /
              </kbd>
              <span>to focus</span>
            </div>
          </div>
        </div>

        {/* Quick Discovery Topic Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider font-mono mr-1">
            Common Inquiries:
          </span>
          {SUGGESTED_QUERIES.map((query) => (
            <button
              key={query}
              onClick={() => setSearchQuery(query)}
              className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer border ${
                searchQuery.toLowerCase() === query.toLowerCase()
                  ? 'bg-[#0B1F3A] text-[#F8F6F0] border-[#D4AF37] font-bold'
                  : 'bg-white text-[#0B1F3A] border-[#D4AF37]/25 hover:border-[#D4AF37] hover:bg-[#F8F6F0]'
              }`}
            >
              {query}
            </button>
          ))}
        </div>
      </section>

      {/* =========================================================================
          3. ACADEMIC FILTER & SORT TOOLBAR
          ========================================================================= */}
      <section className="bg-white rounded-2xl p-4 sm:p-5 border border-[#D4AF37]/35 shadow-xs space-y-4 text-[#0B1F3A]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Discipline / Category Filter */}
          <div className="space-y-1">
            <label className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-wider block">
              Academic Discipline
            </label>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-[#F8F6F0] border border-[#D4AF37]/35 rounded-xl px-3.5 py-2 text-xs text-[#0B1F3A] font-semibold focus:outline-none focus:border-[#D4AF37] cursor-pointer"
              >
                {uniqueCategories.map((c) => (
                  <option key={c} value={c} className="bg-white text-[#0B1F3A]">
                    {c === 'All' ? 'All Disciplines' : c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Availability Status Filter */}
          <div className="space-y-1">
            <label className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-wider block">
              Stack Availability
            </label>
            <div className="relative">
              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value as any)}
                className="w-full bg-[#F8F6F0] border border-[#D4AF37]/35 rounded-xl px-3.5 py-2 text-xs text-[#0B1F3A] font-semibold focus:outline-none focus:border-[#D4AF37] cursor-pointer"
              >
                <option value="All" className="bg-white text-[#0B1F3A]">All Stacks Statuses</option>
                <option value="Available" className="bg-white text-[#0B1F3A]">Available on Shelves</option>
                <option value="IssuedOut" className="bg-white text-[#0B1F3A]">Currently Checked Out</option>
              </select>
            </div>
          </div>

          {/* Sort Order */}
          <div className="space-y-1">
            <label className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-wider block">
              Sort Sequence
            </label>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-[#F8F6F0] border border-[#D4AF37]/35 rounded-xl px-3.5 py-2 text-xs text-[#0B1F3A] font-semibold focus:outline-none focus:border-[#D4AF37] cursor-pointer"
              >
                <option value="titleAsc" className="bg-white text-[#0B1F3A]">Title (A → Z)</option>
                <option value="titleDesc" className="bg-white text-[#0B1F3A]">Title (Z → A)</option>
                <option value="copiesDesc" className="bg-white text-[#0B1F3A]">Most Copies Available</option>
                <option value="bookIdAsc" className="bg-white text-[#0B1F3A]">Call Number (BK ID)</option>
              </select>
            </div>
          </div>

          {/* View Switcher & Clear Controls */}
          <div className="space-y-1 flex flex-col justify-end">
            <label className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-wider block">
              Display Format
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#F8F6F0] p-1 rounded-xl border border-[#D4AF37]/35">
                <button
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid View"
                  className={`p-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'grid'
                      ? 'bg-[#0B1F3A] text-[#F8F6F0] font-bold shadow-xs'
                      : 'text-[#0B1F3A] hover:text-[#8A6D0B]'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="text-xs">Grid</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  aria-label="Bibliographic Registry Table"
                  className={`p-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'table'
                      ? 'bg-[#0B1F3A] text-[#F8F6F0] font-bold shadow-xs'
                      : 'text-[#0B1F3A] hover:text-[#8A6D0B]'
                  }`}
                  title="Bibliographic Registry Table"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="text-xs">List</span>
                </button>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  aria-label="Reset all search filters"
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 transition cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Metadata Bar */}
        <div className="pt-3 border-t border-[#0B1F3A]/10 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#64748B] gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#0B1F3A]">
              Showing {filteredAndSortedBooks.length} of {totalBooksCount || books.length} Catalogued Volumes (Loaded: {books.length})
            </span>
            {hasActiveFilters && (
              <span className="text-[11px] font-mono text-[#D4AF37] font-bold">
                (Filtered Selection)
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-800 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              On-Shelf Volumes
            </span>
            <span className="flex items-center gap-1.5 text-rose-800 font-semibold">
              <span className="w-2 h-2 rounded-full bg-rose-600 inline-block" />
              Checked-Out Volumes
            </span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. CATALOGUE LISTINGS (GRID OR BIBLIOGRAPHIC TABLE)
          ========================================================================= */}
      {loadingInitial ? (
        <div className="bg-white rounded-2xl border border-[#0B1F3A]/10 p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#0B1F3A]/10">
            <div className="h-4 w-48 bg-[#0B1F3A]/10 rounded-md animate-pulse" />
            <div className="h-4 w-28 bg-[#0B1F3A]/10 rounded-md animate-pulse" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 rounded-xl bg-[#F8F6F0]/60 border border-[#0B1F3A]/5 animate-pulse">
                <div className="w-10 h-14 bg-[#0B1F3A]/10 rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-[#0B1F3A]/10 rounded" />
                  <div className="h-3 w-1/4 bg-[#0B1F3A]/10 rounded" />
                </div>
                <div className="h-5 w-20 bg-[#0B1F3A]/10 rounded-full shrink-0" />
                <div className="h-5 w-24 bg-[#0B1F3A]/10 rounded-full shrink-0" />
              </div>
            ))}
          </div>
          <p className="text-center text-xs font-mono text-[#64748B] pt-2">
            Synchronizing HNGU Central Library Repository...
          </p>
        </div>
      ) : filteredAndSortedBooks.length === 0 ? (
        /* Empty State */
        <div className="py-16 px-6 text-center space-y-4 rounded-3xl border border-[#D4AF37]/35 bg-white shadow-md max-w-2xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[#F8F6F0] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] mx-auto shadow-xs">
            <Search className="w-6 h-6 text-[#D4AF37]" />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono font-bold tracking-widest text-[#8A6D0B] uppercase">
              Catalogue Search Feedback
            </span>
            <h3 className="font-serif-academic text-xl font-bold text-[#0B1F3A]">
              No Volumes Found Matching Your Criteria
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed max-w-md mx-auto pt-1">
              We couldn't locate any catalogued books matching &ldquo;<span className="text-[#0B1F3A] font-semibold">{searchQuery}</span>&rdquo;. Check the spelling, try searching by author surname, or reset your filters.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={clearAllFilters}
              className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] text-xs font-bold border border-[#D4AF37] shadow-sm transition cursor-pointer"
            >
              Reset Search & Filters
            </button>
            {uniqueCategories.filter(c => c !== 'All').slice(0, 3).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter(cat);
                }}
                className="px-4 py-2 rounded-xl bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] text-xs font-medium border border-[#D4AF37]/30 transition cursor-pointer"
              >
                Browse {cat}
              </button>
            ))}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* =========================================================================
            GRID VIEW: LUXURY HARDCOVER PRESENTATION WITH PROMINENT BOARD & LINE
            ========================================================================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedBooks.map((book) => {
            const isAvailable = book.availableCopies > 0;
            const loc = parseBookLocation(book.rackLocation);

            return (
              <div
                key={book.id}
                className="group rounded-2xl bg-white border border-[#D4AF37]/35 hover:border-[#D4AF37] shadow-xs hover:shadow-md card-interactive flex flex-col justify-between overflow-hidden text-[#0B1F3A]"
              >
                {/* Book Card Upper Section */}
                <div className="p-5 space-y-4">
                  {/* Visual Book Cover & Primary Bibliographic Info */}
                  <div className="flex gap-4 items-start">
                    {/* Realistic Hardcover Book Representation */}
                    <div
                      onClick={() => setDetailsModalBook(book)}
                      className="relative w-24 h-36 shrink-0 rounded-lg overflow-hidden bg-[#071629] shadow-sm border border-[#0B1F3A]/20 group-hover:shadow-md transition-all cursor-pointer"
                    >
                      {book.coverImage ? (
                        <img
                          src={book.coverImage}
                          alt={book.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : null}

                      {/* Spine Crease & Foil Trim Overlay */}
                      <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/40 via-white/10 to-transparent pointer-events-none" />
                      <div className="absolute top-1 right-1 w-2 h-2 border-t border-r border-[#D4AF37]/60 pointer-events-none" />
                      <div className="absolute bottom-1 right-1 w-2 h-2 border-b border-r border-[#D4AF37]/60 pointer-events-none" />
                    </div>

                    {/* Book Metadata Column */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37]/30 truncate max-w-[170px]">
                          {book.category}
                        </span>
                      </div>

                      {/* Title with dominant visual hierarchy */}
                      <h3
                        onClick={() => setDetailsModalBook(book)}
                        className="text-sm sm:text-base font-bold text-[#0B1F3A] group-hover:text-[#D4AF37] transition-colors line-clamp-2 leading-snug cursor-pointer pt-0.5"
                        title={book.title}
                      >
                        {book.title}
                      </h3>

                      <p className="text-xs text-[#475569] font-medium truncate">
                        By {book.author}
                      </p>

                      <div className="pt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#0B1F3A]/80">
                        <span className="font-bold bg-[#F8F6F0] px-1.5 py-0.5 rounded border border-[#0B1F3A]/10">
                          {book.bookId}
                        </span>
                        {book.isbn && (
                          <span className="text-[#64748B] truncate max-w-[110px]" title={book.isbn}>
                            ISBN: {book.isbn}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PROMINENT LOCATION & AVAILABILITY SPOTLIGHT */}
                  <div className="p-3 bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/25 space-y-2">
                    {/* WHERE TO FIND IT Header */}
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider border-b border-[#0B1F3A]/10 pb-1.5">
                      <span className="font-bold text-[#D4AF37] flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#D4AF37]" />
                        <span>WHERE TO FIND IT</span>
                      </span>
                      <span className="text-[#64748B] font-semibold">{loc.raw}</span>
                    </div>

                    {/* Prominent Board & Line Markers */}
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="p-1.5 rounded-lg bg-white border border-[#D4AF37]/30">
                        <div className="text-[9px] font-mono text-[#64748B] uppercase font-bold">STACK BOARD</div>
                        <div className="text-xs font-bold font-mono text-[#0B1F3A]">{loc.displayBoard}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-white border border-[#D4AF37]/30">
                        <div className="text-[9px] font-mono text-[#64748B] uppercase font-bold">SHELF LINE</div>
                        <div className="text-xs font-bold font-mono text-[#0B1F3A]">{loc.displayLine}</div>
                      </div>
                    </div>

                    {/* Availability Status */}
                    <div className="pt-1 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-[#64748B] font-medium">Availability:</span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          isAvailable
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-rose-100 text-rose-900 border-rose-300'
                        }`}
                      >
                        {isAvailable ? `Available • ${book.availableCopies} of ${book.totalCopies}` : `Borrowed • 0 Available`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="p-4 pt-2 border-t border-[#0B1F3A]/10 bg-[#FAF9F5]/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Primary Action: View Details & Location */}
                    <button
                      onClick={() => setDetailsModalBook(book)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#0B1F3A] hover:text-[#D4AF37] bg-white border border-[#D4AF37]/40 hover:border-[#D4AF37] transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>View Details</span>
                    </button>

                    {/* Shelf Tag QR Generator */}
                    <button
                      onClick={() => setQrModalBook(book)}
                      className="p-1.5 rounded-lg text-[#0B1F3A] hover:text-[#D4AF37] hover:bg-white border border-transparent hover:border-[#D4AF37]/30 transition cursor-pointer"
                      title="View Barcode / QR Tag"
                      aria-label={`View barcode QR tag for ${book.title}`}
                    >
                      <QrCode className="w-4 h-4 text-[#D4AF37]" />
                    </button>
                  </div>

                  {/* Admin Toolbar (Strictly Protected) */}
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(book)}
                        className="p-1.5 rounded-lg text-[#0B1F3A] hover:bg-white border border-transparent hover:border-[#D4AF37]/40 transition cursor-pointer"
                        title="Edit catalog record"
                        aria-label={`Edit ${book.title}`}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-[#0B1F3A]" />
                      </button>
                      <button
                        onClick={() => setBookToDelete(book)}
                        className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-300 transition cursor-pointer"
                        title="Delete volume record"
                        aria-label={`Delete ${book.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* =========================================================================
            BIBLIOGRAPHIC REGISTRY TABLE VIEW (High-End University Ledger Design)
            ========================================================================= */
        <div className="bg-white rounded-2xl border border-[#0B1F3A]/10 shadow-xs overflow-hidden text-[#0B1F3A]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[760px]">
              <thead>
                <tr className="bg-[#0B1F3A] text-[#F8F6F0] border-b border-[#D4AF37]/30 font-mono text-[10px] uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-4 w-32">Call Number</th>
                  <th className="py-3.5 px-4 min-w-[260px]">Volume & Author</th>
                  <th className="py-3.5 px-4 w-36">Discipline</th>
                  <th className="py-3.5 px-4 w-44">Stack Coordinates</th>
                  <th className="py-3.5 px-4 text-center w-36">Availability</th>
                  <th className="py-3.5 px-4 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B1F3A]/10 font-sans">
                {filteredAndSortedBooks.map((book) => {
                  const isAvailable = book.availableCopies > 0;
                  const loc = parseBookLocation(book.rackLocation);

                  return (
                    <tr
                      key={book.id}
                      className="table-row-hover hover:bg-[#F8F6F0]/70 transition-colors"
                    >
                      {/* Call Number / Accession ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-[#0B1F3A] text-xs">
                        <span className="bg-[#F8F6F0] px-2 py-0.5 rounded border border-[#0B1F3A]/10">
                          {book.bookId}
                        </span>
                      </td>

                      {/* Title & Author with cover thumbnail */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-11 rounded bg-[#071629] overflow-hidden border border-[#0B1F3A]/15 shrink-0 shadow-2xs flex items-center justify-center">
                            {book.coverImage ? (
                              <img
                                src={book.coverImage}
                                alt={book.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <BookOpen className="w-3.5 h-3.5 text-[#D4AF37]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div
                              onClick={() => setDetailsModalBook(book)}
                              className="font-bold text-[#0B1F3A] hover:text-[#D4AF37] cursor-pointer line-clamp-1 text-xs"
                              title={book.title}
                            >
                              {book.title}
                            </div>
                            <div className="text-[11px] text-[#64748B] truncate">
                              {book.author}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Discipline */}
                      <td className="py-3.5 px-4">
                        <span className="text-[11px] font-medium text-[#1E293B]">
                          {book.category}
                        </span>
                      </td>

                      {/* Stack Coordinates */}
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="font-bold text-[#0B1F3A]">
                          {loc.displayBoard} · {loc.displayLine}
                        </div>
                        <div className="text-[10px] text-[#64748B] truncate max-w-[150px]">
                          {loc.raw}
                        </div>
                      </td>

                      {/* Availability status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                            isAvailable
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                          <span>{isAvailable ? `${book.availableCopies}/${book.totalCopies} Avail` : 'Borrowed (0)'}</span>
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailsModalBook(book)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#0B1F3A] hover:text-[#D4AF37] hover:bg-[#F8F6F0] border border-[#D4AF37]/35 transition cursor-pointer"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => setQrModalBook(book)}
                            className="p-1.5 rounded-lg text-[#0B1F3A] hover:text-[#D4AF37] hover:bg-[#F8F6F0] border border-transparent hover:border-[#D4AF37]/35 transition cursor-pointer"
                            title="View Barcode / QR Tag"
                            aria-label={`View barcode QR tag for ${book.title}`}
                          >
                            <QrCode className="w-3.5 h-3.5 text-[#D4AF37]" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => openEditModal(book)}
                                className="p-1.5 rounded-lg text-[#0B1F3A] hover:bg-[#F8F6F0] border border-transparent hover:border-[#D4AF37]/35 transition cursor-pointer"
                                title="Edit Record"
                                aria-label={`Edit ${book.title}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setBookToDelete(book)}
                                className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-300 transition cursor-pointer"
                                title="Delete Record"
                                aria-label={`Delete ${book.title}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginated Load More Control */}
      {hasMoreBooks && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 pb-2">
          <button
            onClick={loadMoreBooks}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-bold text-xs shadow-sm border border-[#D4AF37] transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
                <span>Fetching Next 25 Titles...</span>
              </>
            ) : (
              <>
                <span>Load More Volumes ({books.length} of {totalBooksCount || books.length})</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
              </>
            )}
          </button>
        </div>
      )}

      {/* =========================================================================
          REDESIGNED PREMIUM BOOK DETAILS & BOOK LOCATION MODAL
          ========================================================================= */}
      {detailsModalBook && (() => {
        const loc = parseBookLocation(detailsModalBook.rackLocation);
        const isAvailable = detailsModalBook.availableCopies > 0;
        const borrowedCount = Math.max(0, detailsModalBook.totalCopies - detailsModalBook.availableCopies);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter overflow-y-auto">
            <div className="relative w-full max-w-2xl rounded-3xl p-6 sm:p-8 border border-[#D4AF37]/45 shadow-2xl bg-white text-[#0B1F3A] my-8 space-y-6 modal-panel-enter">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[#0B1F3A]/10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[#D4AF37] font-bold uppercase tracking-wider">
                    HNGU Central Library Repository
                  </span>
                  <span className="text-[#0B1F3A]/30">·</span>
                  <span className="font-mono text-[10px] text-[#0B1F3A]/70 uppercase">
                    Catalogue Record
                  </span>
                </div>
                <button
                  onClick={() => setDetailsModalBook(null)}
                  className="p-1.5 text-[#0B1F3A] hover:bg-[#F8F6F0] rounded-xl cursor-pointer transition border border-transparent hover:border-[#D4AF37]/30"
                  title="Close Details"
                  aria-label="Close book details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 1. BOOK DETAILS HIERARCHY */}
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                {/* Book Cover Presentation */}
                <div className="relative w-28 sm:w-32 h-40 sm:h-44 shrink-0 rounded-xl overflow-hidden bg-[#071629] border border-[#0B1F3A]/20 shadow-md">
                  {detailsModalBook.coverImage ? (
                    <img
                      src={detailsModalBook.coverImage}
                      alt={detailsModalBook.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <div className="absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/40 via-white/10 to-transparent pointer-events-none" />
                </div>

                {/* Primary Information Hierarchy */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37]/30">
                      {detailsModalBook.category}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#F8F6F0] border border-[#0B1F3A]/15 text-[#0B1F3A]">
                      Call ID: {detailsModalBook.bookId}
                    </span>
                  </div>

                  {/* DOMINANT TITLE */}
                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#0B1F3A] leading-tight font-serif-academic tracking-tight">
                    {detailsModalBook.title}
                  </h2>

                  {/* AUTHOR */}
                  <p className="text-sm text-[#475569] font-medium">
                    By <span className="text-[#0B1F3A] font-semibold">{detailsModalBook.author}</span>
                  </p>

                  {/* AVAILABILITY PILL (High Contrast & Clear) */}
                  <div className="pt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                        isAvailable
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          : 'bg-rose-50 text-rose-900 border-rose-300'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isAvailable ? 'bg-emerald-600' : 'bg-rose-600'
                        }`}
                      />
                      <span>
                        {isAvailable
                          ? `Available on Stack (${detailsModalBook.availableCopies} of ${detailsModalBook.totalCopies} Copies)`
                          : `Borrowed • 0 of ${detailsModalBook.totalCopies} Available`}
                      </span>
                    </span>

                    {borrowedCount > 0 && (
                      <span className="text-[11px] font-mono text-[#64748B] font-semibold">
                        ({borrowedCount} currently in circulation)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. LOCATION SECTION (The Visual Highlight) */}
              <div className="rounded-2xl p-5 bg-[#F8F6F0] border-2 border-[#D4AF37]/45 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-mono font-extrabold tracking-[0.14em] text-[#D4AF37] uppercase flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>PHYSICAL LIBRARY LOCATION</span>
                    </div>
                    <div className="font-serif-academic text-base sm:text-lg font-bold text-[#0B1F3A]">
                      WHERE TO FIND IT
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      copyCoordinatesToClipboard(
                        `${detailsModalBook.title} [${detailsModalBook.bookId}] - ${loc.displayBoard}, ${loc.displayLine} (${loc.raw})`
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF9F5] border border-[#D4AF37]/40 text-xs font-semibold text-[#0B1F3A] transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    {copiedCoordinate ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Copy Coordinates</span>
                      </>
                    )}
                  </button>
                </div>

                {/* THE REFINED BOARD & LINE STRUCTURE */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {/* BOARD HIGHLIGHT */}
                  <div className="p-4 rounded-xl bg-white border border-[#D4AF37]/40 text-center shadow-xs">
                    <div className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-widest">
                      STACK BOOKCASE
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#0B1F3A] font-serif-academic mt-1">
                      {loc.displayBoard}
                    </div>
                    <div className="text-[10px] text-[#64748B] mt-0.5">Freestanding Row</div>
                  </div>

                  {/* LINE HIGHLIGHT */}
                  <div className="p-4 rounded-xl bg-white border border-[#D4AF37]/40 text-center shadow-xs">
                    <div className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-widest">
                      SHELF TIER
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#0B1F3A] font-serif-academic mt-1">
                      {loc.displayLine}
                    </div>
                    <div className="text-[10px] text-[#64748B] mt-0.5">Top-to-Bottom Tier</div>
                  </div>
                </div>

                {/* Raw Shelf Code Entry */}
                <div className="px-3.5 py-2.5 rounded-xl bg-white/70 border border-[#0B1F3A]/10 text-xs text-[#0B1F3A] flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-mono">
                  <span className="text-[#64748B]">Catalogue Location Record:</span>
                  <span className="font-bold text-[#0B1F3A]">{loc.raw}</span>
                </div>

                {/* 3. LOCATION VISUALIZATION (Subtle, Elegant, 2D Schematic) */}
                <BookLocationVisualizer
                  location={loc}
                  bookTitle={detailsModalBook.title}
                />
              </div>

              {/* 6. INFORMATION GROUPING (Secondary Bibliographic & Inventory Metadata) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#FAF9F5] p-4 rounded-2xl border border-[#0B1F3A]/10">
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase font-bold block">
                    Call Number
                  </span>
                  <span className="font-mono font-bold text-[#0B1F3A]">{detailsModalBook.bookId}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase font-bold block">
                    ISBN Number
                  </span>
                  <span className="font-mono text-[#0B1F3A]">{detailsModalBook.isbn || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase font-bold block">
                    Total Copies
                  </span>
                  <span className="font-bold text-[#0B1F3A]">{detailsModalBook.totalCopies} Copies</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#64748B] uppercase font-bold block">
                    Current Loans
                  </span>
                  <span className="font-bold text-[#0B1F3A]">{borrowedCount} Issued</span>
                </div>
              </div>

              {/* 5. ACTIONS SECTION */}
              <div className="pt-3 border-t border-[#0B1F3A]/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {/* View Shelf QR Tag */}
                  <button
                    onClick={() => {
                      const b = detailsModalBook;
                      setDetailsModalBook(null);
                      setQrModalBook(b);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-[#D4AF37]/45 hover:border-[#D4AF37] text-xs font-semibold text-[#0B1F3A] hover:bg-[#F8F6F0] transition cursor-pointer flex items-center gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>View Shelf QR Barcode</span>
                  </button>

                  {/* Search Again Action */}
                  <button
                    onClick={() => {
                      setDetailsModalBook(null);
                      searchInputRef.current?.focus();
                    }}
                    className="px-3.5 py-2.5 rounded-xl border border-[#0B1F3A]/20 hover:bg-[#F8F6F0] text-xs font-semibold text-[#0B1F3A] transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5 text-[#64748B]" />
                    <span>Search Again</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      onClick={() => {
                        const b = detailsModalBook;
                        setDetailsModalBook(null);
                        openEditModal(b);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] border border-[#D4AF37]/40 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-[#0B1F3A]" />
                      <span>Edit Record</span>
                    </button>
                  )}

                  {/* Back to Catalogue / Close */}
                  <button
                    onClick={() => setDetailsModalBook(null)}
                    className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] text-xs font-bold border border-[#D4AF37] transition cursor-pointer"
                  >
                    Back to Catalogue
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          SHELF QR CODE & BARCODE MODAL
          ========================================================================= */}
      {qrModalBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter">
          <div className="relative w-full max-w-sm rounded-3xl p-6 border border-[#D4AF37]/45 shadow-2xl text-center space-y-4 bg-white text-[#0B1F3A] modal-panel-enter">
            <div className="flex items-center justify-between pb-3 border-b border-[#D4AF37]/20">
              <div className="text-left">
                <span className="font-mono text-[9px] text-[#D4AF37] font-bold uppercase tracking-wider block">
                  Stack Barcode Identifier
                </span>
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  Shelf Tag QR Generator
                </h3>
              </div>
              <button
                onClick={() => setQrModalBook(null)}
                className="p-1.5 text-[#0B1F3A] hover:bg-[#F8F6F0] rounded-xl cursor-pointer transition border border-transparent hover:border-[#D4AF37]/30"
                aria-label="Close QR tag modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-[#F8F6F0] rounded-2xl shadow-xs border border-[#D4AF37]/30 inline-block mx-auto">
              <QrCodeDisplay
                value={qrModalBook.bookQrId}
                size={180}
                label={qrModalBook.title}
                sublabel={qrModalBook.bookId}
                showDownload={true}
                downloadFilename={`hngu-book-qr-${qrModalBook.bookId}`}
              />
            </div>

            {/* Location in QR Modal */}
            {(() => {
              const loc = parseBookLocation(qrModalBook.rackLocation);
              return (
                <div className="space-y-1 text-left bg-[#F8F6F0] p-3 rounded-xl border border-[#D4AF37]/20 text-xs">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-[#64748B]">Scan Token:</span>
                    <span className="font-bold text-[#0B1F3A]">{qrModalBook.bookQrId}</span>
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-[#64748B]">Location:</span>
                    <span className="font-bold text-[#0B1F3A]">{loc.displayBoard} • {loc.displayLine}</span>
                  </div>
                  <div className="text-[10px] text-[#64748B] pt-0.5">{loc.raw}</div>
                </div>
              );
            })()}

            <p className="text-[11px] text-[#64748B] leading-relaxed">
              This QR token is affixed to the physical book spine and shelf row to enable rapid scanning during circulation issues and returns.
            </p>
          </div>
        </div>
      )}

      {/* =========================================================================
          ADMIN ADD / EDIT VOLUME (Protected)
          ========================================================================= */}
      {isAddEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter">
          <div className="relative w-full max-w-lg rounded-3xl p-6 sm:p-7 border border-[#D4AF37]/45 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto bg-white text-[#0B1F3A] modal-panel-enter">
            <div className="flex items-center justify-between pb-3 border-b border-[#D4AF37]/20">
              <div>
                <span className="font-mono text-[9px] text-[#D4AF37] font-bold uppercase tracking-wider block">
                  Authorized Librarian Management
                </span>
                <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A] font-serif-academic">
                  {editingBook ? 'Edit Book Record' : 'Add New Book Volume'}
                </h3>
              </div>
              <button
                onClick={() => setIsAddEditOpen(false)}
                className="p-1.5 text-[#0B1F3A] hover:bg-[#F8F6F0] rounded-xl cursor-pointer transition border border-transparent hover:border-[#D4AF37]/30"
                aria-label="Close book editor modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveBook} className="space-y-4 text-xs">
              {/* Section 1: Bibliographic Information */}
              <div className="space-y-3 pb-3 border-b border-[#0B1F3A]/10">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37] block">
                  1. Bibliographic Record
                </span>

                <div>
                  <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                    Book Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Introduction to Algorithms"
                    className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                      Primary Author(s) *
                    </label>
                    <input
                      type="text"
                      required
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="e.g. Thomas H. Cormen, Charles E. Leiserson"
                      className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                      Academic Discipline / Category *
                    </label>
                    <input
                      type="text"
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="e.g. Computer Science & Engineering"
                      className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Accession & Copies */}
              <div className="space-y-3 pb-3 border-b border-[#0B1F3A]/10">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37] block">
                  2. Accession & Inventory Control
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                      Call Number / Accession ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={bookId}
                      onChange={(e) => setBookId(e.target.value)}
                      placeholder="e.g. BK-2045"
                      className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-mono uppercase font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                      Standard ISBN Number
                    </label>
                    <input
                      type="text"
                      value={isbn}
                      onChange={(e) => setIsbn(e.target.value)}
                      placeholder="e.g. 978-0262033848"
                      className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-mono font-medium text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                      Total Copies in Holdings
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={totalCopies}
                      onChange={(e) => setTotalCopies(Number(e.target.value))}
                      className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                      Available on Shelf
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={availableCopies}
                      onChange={(e) => setAvailableCopies(Number(e.target.value))}
                      className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Physical Location & Cover */}
              <div className="space-y-3">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37] block">
                  3. Stack Coordinates & Cover Presentation
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                      Shelf Location (Board & Line)
                    </label>
                    <input
                      type="text"
                      value={rackLocation}
                      onChange={(e) => setRackLocation(e.target.value)}
                      placeholder="e.g. Board 04 · Line 02 or Section A - Rack 3"
                      className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                      Cover Image URL
                    </label>
                    <input
                      type="url"
                      value={coverImage}
                      onChange={(e) => setCoverImage(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#0B1F3A]/10 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-[#0B1F3A] hover:bg-[#F8F6F0] border border-[#0B1F3A]/15 transition cursor-pointer font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-bold shadow-sm transition cursor-pointer border border-[#D4AF37] text-xs disabled:opacity-50 flex items-center gap-2"
                >
                  {savingLoading && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{savingLoading ? 'Saving...' : editingBook ? 'Update Volume Record' : 'Save Volume Record'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE CONFIRMATION (Protected)
          ========================================================================= */}
      {bookToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter">
          <div className="w-full max-w-md rounded-3xl p-6 sm:p-7 border border-[#0B1F3A]/10 bg-white shadow-2xl text-[#0B1F3A] space-y-4 modal-panel-enter">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A] font-serif-academic">Confirm Volume Removal</h3>
                <span className="text-[10px] font-mono text-[#64748B]">Permanent Administrative Action</span>
              </div>
            </div>

            <p className="text-xs text-[#334155] leading-relaxed font-medium">
              Are you sure you want to permanently remove <strong className="text-rose-700 font-semibold">&ldquo;{bookToDelete.title}&rdquo;</strong> (Call ID: <span className="font-mono font-bold text-[#0B1F3A]">{bookToDelete.bookId}</span>) from the HNGU University Catalogue inventory?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#0B1F3A]/10">
              <button
                type="button"
                onClick={() => setBookToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs text-[#0B1F3A] hover:bg-[#F8F6F0] border border-[#0B1F3A]/15 transition cursor-pointer font-bold btn-press"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBook}
                className="px-5 py-2.5 rounded-xl text-xs bg-rose-700 hover:bg-rose-800 text-white font-bold shadow-sm transition cursor-pointer border border-rose-800 flex items-center gap-1.5 btn-destructive-press"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Removal</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
