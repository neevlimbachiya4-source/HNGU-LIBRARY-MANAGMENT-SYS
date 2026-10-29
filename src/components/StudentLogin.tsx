import React, { useState, useEffect } from 'react';
import { studentLoginApi, resolveQrTokenApi } from '../lib/studentAuth';
import { Student } from '../types';
import {
  LogIn,
  Lock,
  Phone,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  User,
  QrCode,
  CheckCircle2,
  X,
  GraduationCap,
  Eye,
  EyeOff,
  Sparkles,
  BookOpen,
} from 'lucide-react';

interface StudentLoginProps {
  onLoginSuccess: (student: Student) => void;
  onSwitchToRegister: () => void;
  scannedStudentToken?: string | null;
  onClearScannedStudent?: () => void;
  accessNotice?: string | null;
  onClearAccessNotice?: () => void;
}

export const StudentLogin: React.FC<StudentLoginProps> = ({
  onLoginSuccess,
  onSwitchToRegister,
  scannedStudentToken,
  onClearScannedStudent,
  accessNotice,
  onClearAccessNotice,
}) => {
  // Credentials: Registered Phone Number & Password ONLY
  const [phoneInput, setPhoneInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedStudentIdFromQr, setResolvedStudentIdFromQr] = useState<string | null>(null);
  const [resolvingQr, setResolvingQr] = useState(false);

  // Helper to extract clean Indian 10-digit mobile number
  const extractCleanMobile = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      return digits.slice(1);
    }
    return digits;
  };

  // If a student scanned their personal QR card, resolve student ID and prefill identifier
  useEffect(() => {
    if (!scannedStudentToken) {
      setResolvedStudentIdFromQr(null);
      return;
    }

    const resolveToken = async () => {
      setResolvingQr(true);
      setError(null);

      try {
        const token = scannedStudentToken.trim();
        const resolved = await resolveQrTokenApi(token);

        if (resolved && resolved.studentId) {
          setResolvedStudentIdFromQr(resolved.studentId);
          setPhoneInput(resolved.studentId);
        } else {
          setPhoneInput(token);
        }
      } catch (err: any) {
        console.error('Error resolving QR token:', err);
      } finally {
        setResolvingQr(false);
      }
    };

    resolveToken();
  }, [scannedStudentToken]);

  // Main login submission: Phone Number + Password ONLY
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cleanPhone = extractCleanMobile(phoneInput.trim());
      const identifier = cleanPhone || phoneInput.trim();

      const res = await studentLoginApi(identifier, password);
      onLoginSuccess(res.student);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || 'Login failed. Please check network connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-12 rounded-3xl overflow-hidden glass-panel-elevated border border-[#D4AF37]/35 shadow-2xl bg-white text-[#0B1F3A]">
        {/* Left Side: HNGU Brand & Identity in Deep Navy Theme */}
        <div className="md:col-span-5 bg-[#0B1F3A] p-8 flex flex-col justify-between relative overflow-hidden border-b md:border-b-0 md:border-r border-[#D4AF37]/30 text-[#F8F6F0]">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shadow-md">
                <GraduationCap className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <span className="font-bold text-sm tracking-tight text-[#F8F6F0]">HNGU STUDENT PORTAL</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-bold font-serif-academic text-[#F8F6F0] tracking-tight leading-snug">
                Welcome back to HNGU Library.
              </h3>
              <p className="text-xs text-[#F8F6F0]/75 leading-relaxed">
                Log in to inspect your digital student ID card, active book loans, turnstile visit history, and renewal options.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 border border-[#D4AF37]/25 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <QrCode className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#F8F6F0]">QR Token Identification</div>
                  <div className="text-xs text-[#F8F6F0]/70">Scan digital card to pre-select account</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 border border-[#D4AF37]/25 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-[#0B1F3A] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <BookOpen className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#F8F6F0]">Active Loan Management</div>
                  <div className="text-xs text-[#F8F6F0]/70">Track due dates and overdue statuses</div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative pt-6 text-xs text-[#F8F6F0]/65 border-t border-[#D4AF37]/20">
            Hemchandracharya North Gujarat University • Patan Campus
          </div>
        </div>

        {/* Right Side: Authentication Form in Ivory / Clean Surface */}
        <div className="md:col-span-7 p-6 sm:p-10 bg-white text-[#0B1F3A] flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold font-serif-academic text-[#0B1F3A] tracking-tight">
              Member Sign In
            </h2>
            <p className="text-xs text-[#0B1F3A]/70 mt-1">
              Enter your registered mobile phone number along with your password.
            </p>
          </div>

          {/* Access Control Notice */}
          {accessNotice && (
            <div className="mb-5 p-3.5 bg-[#F8F6F0] border border-[#D4AF37]/50 rounded-2xl text-[#0B1F3A] text-xs flex items-start gap-2.5 shadow-sm feedback-enter">
              <Lock className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-[#0B1F3A] block text-xs uppercase tracking-wider mb-0.5">
                  Authentication Required
                </span>
                <span className="text-[#0B1F3A]/80 text-xs leading-relaxed">{accessNotice}</span>
              </div>
              {onClearAccessNotice && (
                <button
                  type="button"
                  onClick={onClearAccessNotice}
                  aria-label="Dismiss notice"
                  className="text-[#0B1F3A]/60 hover:text-[#0B1F3A] p-1 text-xs icon-interactive"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {resolvedStudentIdFromQr && (
            <div className="mb-5 p-3.5 bg-[#F8F6F0] border border-[#D4AF37]/40 rounded-2xl flex items-center justify-between text-xs feedback-enter">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <div className="font-bold text-[#0B1F3A] flex items-center gap-1.5">
                    <span>Roll Number Detected</span>
                  </div>
                  <div className="text-xs text-[#0B1F3A]/80 font-mono font-bold">
                    {resolvedStudentIdFromQr} • Scanned via QR
                  </div>
                </div>
              </div>
              {onClearScannedStudent && (
                <button
                  type="button"
                  onClick={() => {
                    setResolvedStudentIdFromQr(null);
                    setPhoneInput('');
                    onClearScannedStudent();
                  }}
                  className="text-[#0B1F3A]/60 hover:text-[#0B1F3A] p-1 rounded hover:bg-[#0B1F3A]/5 cursor-pointer icon-interactive"
                  title="Clear QR Selection"
                  aria-label="Clear QR Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {resolvingQr && (
            <div className="mb-4 p-3 bg-[#F8F6F0] border border-[#D4AF37]/35 rounded-xl text-[#0B1F3A] text-xs text-center flex items-center justify-center gap-2 feedback-enter">
              <QrCode className="w-4 h-4 animate-spin text-[#D4AF37]" />
              Resolving scanned student QR code...
            </div>
          )}

          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-start gap-2.5 feedback-enter">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B1F3A] mb-1.5 flex items-center justify-between">
                <span>Registered Phone Number</span>
                <span className="text-xs text-[#8A6D0B] font-mono font-bold">10-Digit Mobile</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#0B1F3A]/40 absolute left-3.5 top-3.5" />
                <input
                  type="tel"
                  required
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Enter 10-digit registered mobile number (e.g. 9876543210)"
                  className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl pl-10 pr-3.5 py-3 text-xs text-[#0B1F3A] placeholder-[#0B1F3A]/45 input-focus-smooth"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B1F3A] mb-1.5">
                Account Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#0B1F3A]/40 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your student portal password"
                  className="w-full bg-[#F8F6F0] border border-[#0B1F3A]/15 rounded-xl pl-10 pr-10 py-3 text-xs text-[#0B1F3A] placeholder-[#0B1F3A]/45 input-focus-smooth"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-3.5 text-[#0B1F3A]/50 hover:text-[#0B1F3A] cursor-pointer icon-interactive"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-[#0B1F3A]/50" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-[#0B1F3A] hover:bg-[#132c4e] text-[#F8F6F0] font-bold text-xs border border-[#D4AF37]/60 transition duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 btn-press"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#F8F6F0] border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Student Account</span>
                  <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="text-xs text-[#0B1F3A]/70 hover:text-[#0B1F3A] transition cursor-pointer"
              >
                First time at HNGU library?{' '}
                <span className="text-[#0B1F3A] font-semibold underline hover:text-[#8A6D0B]">Register for Library ID</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
