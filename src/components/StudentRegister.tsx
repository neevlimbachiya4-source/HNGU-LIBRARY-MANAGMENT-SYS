import React, { useState } from 'react';
import { studentRegisterApi } from '../lib/studentAuth';
import { Student } from '../types';
import {
  UserPlus,
  Upload,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  User,
  Phone,
  Mail,
  Lock,
  GraduationCap,
  Sparkles,
  KeyRound,
  Send,
  CheckCircle2,
} from 'lucide-react';

interface StudentRegisterProps {
  onRegisterSuccess: (student: Student) => void;
  onSwitchToLogin: () => void;
  accessNotice?: string | null;
  onClearAccessNotice?: () => void;
}

export const StudentRegister: React.FC<StudentRegisterProps> = ({
  onRegisterSuccess,
  onSwitchToLogin,
  accessNotice,
  onClearAccessNotice,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [college, setCollege] = useState('Hemchandracharya North Gujarat University');
  const [course, setCourse] = useState('B.Tech');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [semester, setSemester] = useState('4th Semester');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  // Neutral avatar silhouette embedded as inline SVG data URI
  const DEFAULT_STUDENT_PHOTO =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><rect width="120" height="120" fill="%23E2E8F0"/><circle cx="60" cy="46" r="22" fill="%2394A3B8"/><path d="M26 104c0-18.778 15.222-34 34-34s34 15.222 34 34" fill="%2394A3B8"/></svg>';

  // Helper to sanitize & normalize 10-digit Indian phone number
  const sanitizeIndianMobile = (phoneInput: string): string => {
    let clean = phoneInput.replace(/\D/g, '');
    if (clean.length === 12 && clean.startsWith('91')) {
      clean = clean.slice(2);
    } else if (clean.length === 11 && clean.startsWith('0')) {
      clean = clean.slice(1);
    }
    return clean;
  };

  // Indian mobile validation: 10 digits starting with 6, 7, 8, or 9
  const isValidIndianMobile = (phoneInput: string): boolean => {
    const clean = sanitizeIndianMobile(phoneInput);
    return /^[6-9]\d{9}$/.test(clean);
  };

  // Validate email format
  const isValidEmail = (emailInput: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim());
  };

  // Helper to resize and compress photo on client (max 400x400, JPEG quality ~0.7)
  // Ensures base64 string remains ~20-50 KB, safely within Firestore's 1 MiB document limit.
  const compressPhoto = (dataUrl: string, maxDim: number = 400, quality: number = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  // Photo Upload Handler with Format & 3MB Size Check
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Supported formats: JPG/JPEG/PNG
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setError('Supported photo formats: JPG, JPEG, and PNG only.');
      return;
    }

    // Maximum size: 3 MB (3 * 1024 * 1024 bytes)
    const MAX_SIZE_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setError(`Student photo size must be less than 3 MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(2)} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawDataUrl = reader.result as string;
      try {
        const compressed = await compressPhoto(rawDataUrl, 400, 0.7);
        setPhotoUrl(compressed);
      } catch {
        setPhotoUrl(rawDataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Hash password using SHA-256 (Never store plaintext passwords in Firestore)
  const hashPassword = async (pass: string): Promise<string> => {
    const enc = new TextEncoder().encode(pass);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  // Main Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanStudentId = studentId.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = sanitizeIndianMobile(mobile);

    // 1. Mobile number validation (Indian 10-digit)
    if (!isValidIndianMobile(cleanMobile)) {
      setError('Invalid mobile number. Please enter a 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    // 2. Email format validation
    if (!isValidEmail(cleanEmail)) {
      setError('Please provide a valid Gmail address (e.g. yourname@gmail.com).');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      // Ensure photo is strictly compressed if it is a base64 data URL
      let finalPhoto = photoUrl || DEFAULT_STUDENT_PHOTO;
      if (photoUrl && (photoUrl.startsWith('data:image/jpeg') || photoUrl.startsWith('data:image/png'))) {
        try {
          finalPhoto = await compressPhoto(photoUrl, 400, 0.7);
        } catch {
          // keep existing
        }
      }

      const res = await studentRegisterApi({
        name: name.trim(),
        studentId: cleanStudentId,
        college: college.trim(),
        course: course.trim(),
        department: department.trim(),
        semester: semester.trim(),
        mobile: cleanMobile,
        email: cleanEmail,
        password: password,
        photo: finalPhoto,
      });

      onRegisterSuccess(res.student);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err?.message || 'Failed to complete library registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto glass-panel-elevated rounded-2xl sm:rounded-3xl p-4 sm:p-7 md:p-9 border border-[#D4AF37]/35 shadow-2xl relative animate-in fade-in duration-300 bg-white text-[#0B1F3A]">
      <div className="text-center mb-5 sm:mb-6">
        <div className="inline-flex items-center justify-center p-3 sm:p-3.5 bg-[#0B1F3A] border border-[#D4AF37]/50 text-[#D4AF37] rounded-2xl mb-2.5 sm:mb-3 shadow-md">
          <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 text-[#D4AF37]" />
        </div>
        <div className="text-xs font-mono uppercase tracking-widest text-[#8A6D0B] font-bold mb-1">
          HNGU DIGITAL LIBRARY
        </div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif-academic text-[#0B1F3A] tracking-tight">
          Student ID Card Registration
        </h2>
        <p className="text-xs text-[#0B1F3A]/75 mt-1 max-w-md mx-auto leading-relaxed">
          Register once with verified phone and email to receive your unique Digital Library ID Card & Personal QR Pass.
        </p>
      </div>

      {/* Protected Route Security Access Notice */}
      {accessNotice && (
        <div className="mb-5 sm:mb-6 p-3.5 sm:p-4 bg-[#F8F6F0] border border-[#D4AF37]/50 rounded-2xl text-[#0B1F3A] text-xs flex items-start gap-3 shadow-sm animate-in fade-in">
          <div className="w-7 h-7 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/30 flex items-center justify-center shrink-0 mt-0.5">
            <Lock className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-[#0B1F3A] text-xs uppercase tracking-wider mb-0.5">
              Access Control Required
            </h4>
            <p className="text-[#0B1F3A]/80 leading-relaxed text-xs">{accessNotice}</p>
          </div>
          {onClearAccessNotice && (
            <button
              onClick={onClearAccessNotice}
              className="text-[#0B1F3A]/60 hover:text-[#0B1F3A] p-1 text-xs shrink-0 cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss access notice"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-5 sm:mb-6 p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* =========================================================================
            SECTION 1: PATRON IDENTIFICATION & PHOTO
            ========================================================================= */}
        <div className="p-4 sm:p-5 bg-[#FAF9F5] rounded-2xl border border-[#0B1F3A]/10 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-[#0B1F3A]/10">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#8A6D0B] block">
              1. Identity Photograph & Card Rendering
            </span>
            <span className="text-xs text-[#64748B] font-mono">Max: 3 MB • JPG / PNG</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-[#D4AF37]/60 bg-[#0B1F3A] shrink-0 shadow-md">
              <img
                src={photoUrl || DEFAULT_STUDENT_PHOTO}
                alt="Photo Preview"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 w-full space-y-2.5 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <label className="px-4 py-2 bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] border border-[#D4AF37]/60 text-xs font-bold rounded-xl cursor-pointer transition flex items-center gap-1.5 shadow-sm min-h-[40px]">
                  <Upload className="w-3.5 h-3.5 text-[#D4AF37]" /> Upload Photo
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 2: ACADEMIC CREDENTIALS & PROGRAM ENROLLMENT
            ========================================================================= */}
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-[#0B1F3A]/10 space-y-4 shadow-2xs">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#8A6D0B] block pb-2 border-b border-[#0B1F3A]/10">
            2. Academic Enrollment & University Roll
          </span>

          {/* Name & Student ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                Full Legal Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Patel"
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                Student ID / Roll Number *
              </label>
              <input
                type="text"
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. STU-2026-204"
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all uppercase font-mono font-bold"
              />
            </div>
          </div>

          {/* College & Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                College / University Campus *
              </label>
              <input
                type="text"
                required
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                placeholder="Hemchandracharya North Gujarat University"
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                Department / Faculty *
              </label>
              <input
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science & Engineering"
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium"
              />
            </div>
          </div>

          {/* Academic Program & Year/Semester */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                Academic Program Degree *
              </label>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium cursor-pointer"
              >
                <option value="B.Tech">B.Tech (Bachelor of Technology)</option>
                <option value="M.Tech">M.Tech (Master of Technology)</option>
                <option value="B.Sc">B.Sc (Computer Science / IT)</option>
                <option value="BCA">BCA (Computer Applications)</option>
                <option value="MCA">MCA (Master of Computer Applications)</option>
                <option value="BBA">BBA (Business Administration)</option>
                <option value="MBA">MBA (Master of Business Admin)</option>
                <option value="Ph.D.">Ph.D. Research Scholar</option>
                <option value="Integrated M.Sc">Integrated M.Sc (5 Years)</option>
                <option value="Law / Architecture">Law / Architecture (5 Years)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
                Current Semester / Academic Stage *
              </label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium cursor-pointer"
              >
                <option value="1st Semester">1st Semester (Year 1)</option>
                <option value="2nd Semester">2nd Semester (Year 1)</option>
                <option value="3rd Semester">3rd Semester (Year 2)</option>
                <option value="4th Semester">4th Semester (Year 2)</option>
                <option value="5th Semester">5th Semester (Year 3)</option>
                <option value="6th Semester">6th Semester (Year 3)</option>
                <option value="7th Semester">7th Semester (Year 4)</option>
                <option value="8th Semester">8th Semester (Year 4)</option>
                <option value="9th Semester">9th Semester (Year 5)</option>
                <option value="10th Semester">10th Semester (Year 5)</option>
              </select>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 3: CONTACT VERIFICATION & SECURITY CREDENTIALS
            ========================================================================= */}
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-[#0B1F3A]/10 space-y-4 shadow-2xs">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#8A6D0B] block pb-2 border-b border-[#0B1F3A]/10">
            3. Contact Verification & Access Security
          </span>

          {/* Student Mobile Number */}
          <div>
            <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Registered Mobile Number *</span>
              <span className="text-xs text-[#64748B] font-mono">10-Digit Mobile (+91)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs font-bold text-[#8A6D0B]">
                +91
              </span>
              <input
                type="tel"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                maxLength={10}
                placeholder="9876543210"
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl pl-12 pr-3.5 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-mono font-semibold"
              />
            </div>
          </div>

          {/* Student Email Address */}
          <div>
            <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
              Student Gmail Address *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@gmail.com"
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-1.5">
              Account Security Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create password for student member login (min 6 chars)"
                className="w-full bg-[#FAF9F5] border border-[#0B1F3A]/15 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium"
              />
            </div>
          </div>

          {/* Security Note */}
          <div className="p-3 bg-[#FAF9F5] rounded-xl border border-[#0B1F3A]/10 text-xs text-[#64748B] flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#8A6D0B] shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Zero-plaintext security: Passwords are encrypted cryptographically with SHA-256 before storing. Passwords are never embedded in personal QR tokens or printed on ID cards.
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-bold text-xs border border-[#D4AF37] shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Creating Student ID Card...' : 'Generate Verified Library ID Card & Personal QR'}
          <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
        </button>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-xs text-[#0B1F3A]/70 hover:text-[#0B1F3A] transition cursor-pointer"
          >
            Already registered? <span className="underline text-[#0B1F3A] font-semibold hover:text-[#D4AF37]">Sign in to Student Portal</span>
          </button>
        </div>
      </form>
    </div>
  );
};


