import React, { useState } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { verifyAndSyncGoogleAdmin } from '../lib/dbService';
import { AdminUser } from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Sparkles,
  Lock,
  Building,
  CheckCircle2,
} from 'lucide-react';

interface AdminLoginProps {
  onAdminLoginSuccess: (admin: AdminUser) => void;
  onBackToHome: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onAdminLoginSuccess,
  onBackToHome,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // 1. Google Authentication via Firebase Popup
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // 2. Verify that the signed-in Google email is an authorized librarian
      const adminProfile = await verifyAndSyncGoogleAdmin({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });

      // 3. If account has no approved admin document, sign out immediately and show required message
      if (!adminProfile) {
        await signOut(auth);
        setError('No administrator record found for this Google account. Please ask the library owner (neevlimbachiya45@gmail.com) to approve and add your staff account.');
        return;
      }

      // 4. Authorized librarian logged in successfully
      onAdminLoginSuccess(adminProfile);
    } catch (err: any) {
      console.error('Google admin login error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignored duplicate action
      } else {
        setError(err?.message || 'Authentication failed. Please verify your internet connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto py-10 px-4 animate-in fade-in duration-300">
      <button
        onClick={onBackToHome}
        className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B1F3A]/70 hover:text-[#0B1F3A] transition mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
        Return to HNGU Campus Portal
      </button>

      <div className="relative rounded-3xl overflow-hidden glass-panel-elevated p-8 sm:p-10 border border-[#D4AF37]/35 shadow-2xl bg-white text-[#0B1F3A] text-center">
        {/* Ambient subtle glow */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-44 h-44 bg-[#0B1F3A]/5 rounded-full blur-3xl pointer-events-none" />

        {/* Institution Badge & Header */}
        <div className="relative mb-6">
          <div className="inline-flex items-center justify-center p-3.5 bg-[#0B1F3A] border border-[#D4AF37]/40 text-[#D4AF37] rounded-2xl mb-4 shadow-md">
            <ShieldCheck className="w-7 h-7 text-[#D4AF37]" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F8F6F0] border border-[#D4AF37]/30 text-[#0B1F3A]/80 text-[11px] font-semibold mb-3">
            <Building className="w-3 h-3 text-[#D4AF37]" />
            <span>Hemchandracharya North Gujarat University</span>
          </div>

          <h2 className="text-2xl font-extrabold text-[#0B1F3A] tracking-tight">
            Librarian Console
          </h2>
          <p className="text-xs text-[#0B1F3A]/70 mt-2 max-w-xs mx-auto leading-relaxed">
            Restricted access portal for authorized HNGU head librarians and administrative staff.
          </p>
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-800 text-xs text-left flex items-start gap-3 shadow-sm animate-in fade-in duration-200">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block text-rose-900">Access Denied</span>
              <span className="leading-relaxed block text-rose-800">{error}</span>
            </div>
          </div>
        )}

        {/* Action: Continue with Google */}
        <div className="space-y-4 my-2">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3.5 px-5 bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 text-[#F8F6F0] rounded-2xl text-sm font-bold border border-[#D4AF37] shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-3.5 disabled:opacity-50 active:scale-[0.99] group"
          >
            {loading ? (
              <span className="flex items-center gap-2 text-[#F8F6F0]">
                <span className="w-4 h-4 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
                Verifying Google Account...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="font-bold text-[#F8F6F0]">Sign in with Institutional Google</span>
              </>
            )}
          </button>
        </div>

        {/* Security & Access Policies */}
        <div className="mt-8 pt-5 border-t border-[#D4AF37]/20 text-left space-y-2.5">
          <div className="flex items-start gap-2 text-[11px] text-[#0B1F3A]/70">
            <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
            <span>
              Authentication is restricted exclusively to authorized institutional Google accounts. Unauthorized login attempts are safely blocked and logged.
            </span>
          </div>
          <div className="flex items-start gap-2 text-[11px] text-[#0B1F3A]/60">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Protected by Firebase Authentication and Firestore Zero-Trust Security.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
