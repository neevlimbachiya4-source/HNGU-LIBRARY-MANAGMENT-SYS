import React, { useRef, useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Student } from '../types';

interface StudentIdCardProps {
  student: Student;
  onPrint?: () => void;
  onDownload?: () => void;
}

export const StudentIdCard: React.FC<StudentIdCardProps> = ({
  student,
  onPrint,
  onDownload,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');

  const studentId = student.studentId || student.id || 'HNGU-STUDENT';
  const fullName = student.name || 'HNGU Scholar';
  const department = student.department || 'Computer Applications';
  const course = student.course || 'Postgraduate';
  const college = student.college || 'Department of Computer Science';
  const semester = student.semester ? `Semester ${student.semester}` : 'Regular Academic';
  const email = student.email || 'scholar@gmail.com';
  const qrValue = student.personalQrId || student.studentId || student.id;
  const membershipId = student.membershipId || `LIB-${studentId}`;

  // Generate QR code onto canvas
  useEffect(() => {
    if (activeSide !== 'front' || !canvasRef.current || !qrValue) return;

    QRCode.toCanvas(
      canvasRef.current,
      qrValue,
      {
        width: 130,
        margin: 1,
        color: {
          dark: '#0B1F3A',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      },
      (error) => {
        if (error) console.error('Error generating Student ID QR:', error);
      }
    );
  }, [qrValue, activeSide]);

  const handleCopyId = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(studentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }
    window.print();
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (canvasRef.current) {
      const url = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `HNGU_Pass_${studentId}.png`;
      a.click();
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Top Controls: Card Flipping / Toggle & Quick Print */}
      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200">
          <button
            type="button"
            onClick={() => setActiveSide('front')}
            aria-label="View credential pass front side"
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeSide === 'front'
                ? 'bg-white text-[#0B1F3A] shadow-sm font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Credential Pass
          </button>
          <button
            type="button"
            onClick={() => setActiveSide('back')}
            aria-label="View library regulations back side"
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeSide === 'back'
                ? 'bg-white text-[#0B1F3A] shadow-sm font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Library Regulations
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyId}
            aria-label="Copy student ID number"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-200 rounded-md hover:bg-stone-50 transition-colors shadow-2xs cursor-pointer"
            title="Copy Student ID"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-700 font-bold">Copied</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                <span>Copy ID</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleNativePrint}
            aria-label="Print official student library pass"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] bg-stone-100 border border-stone-300 rounded-md hover:bg-stone-200 transition-colors shadow-2xs cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H9v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print Pass</span>
          </button>
        </div>
      </div>

      {/* Physical / Digital University ID Credential Card */}
      <div
        ref={cardRef}
        id="hngu-digital-id-card"
        className="relative bg-white rounded-2xl border border-stone-200/90 shadow-xl overflow-hidden transition-all duration-300 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      >
        {activeSide === 'front' ? (
          <div>
            {/* Academic Header Banner */}
            <div className="bg-[#0B1F3A] text-white px-4 sm:px-6 py-3.5 sm:py-4.5 border-b-2 border-[#D4AF37] relative">
              <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-white/10 border border-[#D4AF37]/50 flex items-center justify-center font-serif-academic text-base sm:text-lg font-bold text-[#D4AF37] shadow-inner shrink-0">
                    H
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] sm:text-xs tracking-wider sm:tracking-[0.2em] uppercase text-[#D4AF37] font-semibold truncate sm:whitespace-normal">
                      Hemchandracharya North Gujarat University
                    </div>
                    <h2 className="text-xs sm:text-base font-bold font-serif-academic tracking-tight text-white truncate sm:whitespace-normal">
                      Central University Library • Patan
                    </h2>
                  </div>
                </div>

                <div className="text-right hidden sm:block">
                  <span className="inline-block text-xs font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-white/10 text-stone-200 border border-white/15">
                    Official Student Pass
                  </span>
                  <div className="text-xs text-stone-300 mt-0.5 font-mono">
                    Member #{membershipId}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Card Body */}
            <div className="p-4 sm:p-7 bg-[#FCFCFD]">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                
                {/* Left/Main Column: Student Identity Profile */}
                <div className="sm:col-span-7 space-y-4">
                  {/* Photo & Name Row */}
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      {student.photo ? (
                        <img
                          src={student.photo}
                          alt={fullName}
                          loading="lazy"
                          className="w-18 h-22 object-cover rounded-lg border-2 border-stone-200 shadow-sm"
                        />
                      ) : (
                        <div className="w-18 h-22 rounded-lg bg-stone-100 border-2 border-stone-200 flex flex-col items-center justify-center text-stone-400 shadow-sm">
                          <svg className="w-8 h-8 text-stone-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                          </svg>
                          <span className="text-xs font-mono uppercase text-stone-400 mt-1">HNGU</span>
                        </div>
                      )}
                      <span className="absolute -bottom-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-xs" title="Active Scholar Credential">
                        ✓
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs tracking-wider uppercase font-semibold text-stone-600">
                        Authorized Scholar
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-[#0B1F3A] tracking-tight truncate leading-tight font-serif-academic">
                        {fullName}
                      </h3>
                      <div className="text-xs font-mono font-bold text-amber-900 bg-amber-50 inline-block px-2 py-0.5 rounded border border-amber-200/80 mt-1.5">
                        {studentId}
                      </div>
                    </div>
                  </div>

                  {/* Curated Field Records */}
                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-stone-200">
                    <div>
                      <div className="text-xs uppercase font-mono tracking-wider text-stone-600">
                        Department / Program
                      </div>
                      <div className="text-xs font-bold text-stone-900 truncate mt-0.5" title={`${department} - ${course}`}>
                        {department}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase font-mono tracking-wider text-stone-600">
                        Academic Standing
                      </div>
                      <div className="text-xs font-semibold text-stone-800 mt-0.5">
                        {semester}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs uppercase font-mono tracking-wider text-stone-600">
                        Student Gmail
                      </div>
                      <div className="text-xs font-mono text-stone-800 truncate mt-0.5">
                        {email}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: High-Prominence QR Code Pass */}
                <div className="sm:col-span-5 flex flex-col items-center justify-center sm:border-l sm:border-stone-200 sm:pl-6 pt-4 sm:pt-0 border-t sm:border-t-0 border-stone-200">
                  <div className="relative p-3 bg-white rounded-xl border border-stone-200/90 shadow-sm flex flex-col items-center">
                    {/* Corner accent bracket markers */}
                    <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 border-t-2 border-l-2 border-[#D4AF37]" />
                    <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 border-t-2 border-r-2 border-[#D4AF37]" />
                    <div className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 border-b-2 border-l-2 border-[#D4AF37]" />
                    <div className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 border-b-2 border-r-2 border-[#D4AF37]" />

                    {/* QR Canvas with Quiet Zone */}
                    <div className="p-1 bg-white">
                      <canvas ref={canvasRef} className="block rounded-sm max-w-full h-auto" />
                    </div>
                  </div>

                  <div className="mt-2.5 text-center">
                    <span className="text-xs font-mono tracking-wider uppercase font-bold text-[#0B1F3A] bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                      SCAN FOR ENTRY & LOANS
                    </span>
                    <p className="text-xs text-stone-600 mt-1 max-w-[190px] leading-tight">
                      Present at Turnstile Gate or Circulation Kiosk
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Security Hologram & Footer */}
            <div className="bg-stone-100 px-6 py-2.5 border-t border-stone-200 flex items-center justify-between text-xs font-mono text-stone-600">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-stone-700">Digital Smart Pass • RFID/QR Synced</span>
              </div>
              <div className="flex items-center gap-2 text-stone-600">
                <span>{college}</span>
                <span className="text-amber-800 font-bold">★ VALID</span>
              </div>
            </div>
          </div>
        ) : (
          /* Back of Card: Academic Regulations & Circulation Rights */
          <div className="p-6 sm:p-7 bg-white min-h-[310px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#0B1F3A] text-white flex items-center justify-center font-serif-academic text-xs font-bold">
                    H
                  </div>
                  <h4 className="text-xs font-bold font-serif-academic text-[#0B1F3A] uppercase tracking-wider">
                    Library Membership Regulations
                  </h4>
                </div>
                <span className="text-xs font-mono text-stone-600">Form HNGU-REG-04</span>
              </div>

              <div className="mt-4 space-y-2.5 text-xs text-stone-600 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-[#0B1F3A] text-xs">1.</span>
                  <p>
                    This digital credential remains the property of Hemchandracharya North Gujarat University Central Library and is strictly non-transferable.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-[#0B1F3A] text-xs">2.</span>
                  <p>
                    Scholars are entitled to borrow up to 3 circulation volumes for 14 calendar days. Renewals may be requested prior to due date.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-[#0B1F3A] text-xs">3.</span>
                  <p>
                    Present this digital QR pass at the Entrance Turnstile Scanner for automated entry and exit time recording.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-[#0B1F3A] text-xs">4.</span>
                  <p>
                    In case of card or credential compromise, immediately notify the University Librarian at <span className="font-mono text-stone-800">library@ngu.ac.in</span>.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-200 flex items-center justify-between text-xs text-stone-600">
              <div>
                University Librarian Signature:{' '}
                <span className="font-serif-academic italic font-bold text-stone-700">Dr. K. M. Patel</span>
              </div>
              <div className="font-mono">Patan, Gujarat 384265</div>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-4 flex items-center justify-between px-1 no-print">
        <button
          type="button"
          onClick={handleDownload}
          aria-label="Download student pass QR code image"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-[#0B1F3A] transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4 text-[#8A6D0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Download Pass QR Code</span>
        </button>

        <div className="text-xs text-stone-600 font-mono">
          Last Verified: {new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
        </div>
      </div>
    </div>
  );
};

export default StudentIdCard;
