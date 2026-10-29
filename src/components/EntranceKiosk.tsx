import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COLLECTIONS, formatDuration } from '../lib/dbService';
import { Student, LibraryVisit, AdminUser } from '../types';
import { QrScannerModal } from './QrScannerModal';
import {
  ScanLine,
  Users,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Lock,
} from 'lucide-react';

interface EntranceKioskProps {
  adminUser?: AdminUser | null;
  onStudentVerified?: (student: Student) => void;
  onScanRedirectToRegister?: () => void;
}

export const EntranceKiosk: React.FC<EntranceKioskProps> = ({
  adminUser,
  onStudentVerified,
  onScanRedirectToRegister,
}) => {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeStudentsInside, setActiveStudentsInside] = useState<Student[]>([]);
  const [recentVisits, setRecentVisits] = useState<LibraryVisit[]>([]);
  const [scanStatusMessage, setScanStatusMessage] = useState<{
    type: 'success-entry' | 'success-exit' | 'error';
    student?: Student;
    visit?: Partial<LibraryVisit>;
    message: string;
  } | null>(null);

  const [sampleOutsideStudents, setSampleOutsideStudents] = useState<Student[]>([]);

  // Simulator options combining live inside students with a small sample of outside students
  const allStudentsList = [
    ...activeStudentsInside,
    ...sampleOutsideStudents.filter((s) => !activeStudentsInside.some((ins) => ins.id === s.id)),
  ];

  // Strict role check: Listen to visits and students ONLY if admin/librarian is authenticated
  useEffect(() => {
    if (!adminUser) {
      setRecentVisits([]);
      setActiveStudentsInside([]);
      setSampleOutsideStudents([]);
      return;
    }

    // 1. Listen ONLY to the 15 most recent visits (avoids reading the entire historical visits collection)
    const qVisits = query(
      collection(db, COLLECTIONS.VISITS),
      orderBy('entryTimestamp', 'desc'),
      limit(15)
    );
    const unsubVisits = onSnapshot(
      qVisits,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryVisit));
        setRecentVisits(list);
      },
      (err) => {
        console.warn('Error listening to recent visits:', err);
      }
    );

    // 2. Listen ONLY to students currently marked isInside === true
    const qStudentsInside = query(
      collection(db, COLLECTIONS.STUDENTS),
      where('isInside', '==', true)
    );
    const unsubStudents = onSnapshot(
      qStudentsInside,
      (snap) => {
        const inside = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
        setActiveStudentsInside(inside);
      },
      (err) => {
        console.warn('Error listening to inside students:', err);
      }
    );

    // 3. One-off fetch of up to 20 outside students for the hardware simulator (no persistent listener)
    let isMounted = true;
    const fetchSimulatorSample = async () => {
      try {
        const qSample = query(
          collection(db, COLLECTIONS.STUDENTS),
          where('isInside', '==', false),
          limit(20)
        );
        const snap = await getDocs(qSample);
        if (isMounted) {
          setSampleOutsideStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)));
        }
      } catch (err) {
        console.warn('Error fetching simulator student sample:', err);
      }
    };
    fetchSimulatorSample();

    return () => {
      isMounted = false;
      unsubVisits();
      unsubStudents();
    };
  }, [adminUser]);

  // Handle scanned student QR pass
  const handleQrScanned = async (scannedToken: string) => {
    setIsScannerOpen(false);
    setScanStatusMessage(null);

    if (!adminUser) {
      setScanStatusMessage({
        type: 'error',
        message: 'Access Denied: Only authorized librarians can operate the Turnstile Access Station.',
      });
      return;
    }

    try {
      const cleanToken = scannedToken.trim();
      const studentsRef = collection(db, COLLECTIONS.STUDENTS);
      let student: Student | null = null;

      // 1. Direct match on unique personalQrId (Guaranteed 100% unique per student)
      const qQr = query(studentsRef, where('personalQrId', '==', cleanToken));
      const snapQr = await getDocs(qQr);
      if (!snapQr.empty) {
        student = { id: snapQr.docs[0].id, ...snapQr.docs[0].data() } as Student;
      }

      // 2. Direct match by unique Firestore document ID (e.g. SLMS-STU-${docId} or docId)
      if (!student) {
        const potentialDocId = cleanToken.startsWith('SLMS-STU-') ? cleanToken.replace('SLMS-STU-', '') : cleanToken;
        try {
          const directDoc = await getDoc(doc(db, COLLECTIONS.STUDENTS, potentialDocId));
          if (directDoc.exists()) {
            student = { id: directDoc.id, ...directDoc.data() } as Student;
          }
        } catch (e) {}
      }

      // 3. Unique Membership ID match
      if (!student) {
        const qMem = query(studentsRef, where('membershipId', '==', cleanToken));
        const snapMem = await getDocs(qMem);
        if (!snapMem.empty) {
          student = { id: snapMem.docs[0].id, ...snapMem.docs[0].data() } as Student;
        }
      }

      // 4. If an identifier was entered that matches studentId/roll number:
      // Since duplicate roll numbers can now exist across different programs/semesters,
      // prevent opening the wrong profile if multiple students have this roll number.
      if (!student) {
        const qId = query(studentsRef, where('studentId', '==', cleanToken.toUpperCase()));
        const snapId = await getDocs(qId);
        if (snapId.docs.length === 1) {
          student = { id: snapId.docs[0].id, ...snapId.docs[0].data() } as Student;
        } else if (snapId.docs.length > 1) {
          setScanStatusMessage({
            type: 'error',
            message: `AMBIGUOUS ROLL NUMBER: Multiple students share Roll "${cleanToken.toUpperCase()}" across different academic programs. Please scan your unique Personal QR pass from your Digital ID card.`,
          });
          return;
        }
      }

      if (!student) {
        const isStudentToken = cleanToken.startsWith('SLMS-STU-') || cleanToken.startsWith('SLMS-MEM-');
        setScanStatusMessage({
          type: 'error',
          message: isStudentToken
            ? 'Student profile is no longer active.'
            : `UNRECOGNIZED PASS: No HNGU student record matches token "${cleanToken}". Please register first.`,
        });
        return;
      }

      if (student.status === 'blocked') {
        setScanStatusMessage({
          type: 'error',
          student,
          message: `ACCESS BLOCKED: Account for "${student.name}" (${student.studentId}) is suspended by HNGU Library. Contact circulation desk.`,
        });
        return;
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const dateStr = now.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      if (!student.isInside) {
        // --- TURNSTILE ENTRY ---
        const visitDocRef = doc(collection(db, COLLECTIONS.VISITS));
        const newVisit: Omit<LibraryVisit, 'id'> = {
          studentId: student.studentId,
          studentDocId: student.id,
          studentName: student.name,
          studentPhoto: student.photo,
          entryTime: timeStr,
          entryDate: dateStr,
          entryTimestamp: now.getTime(),
          exitTime: null,
          exitDate: null,
          exitTimestamp: null,
          duration: null,
          active: true,
        };

        await setDoc(visitDocRef, newVisit);

        await updateDoc(doc(db, COLLECTIONS.STUDENTS, student.id), {
          isInside: true,
          currentVisitId: visitDocRef.id,
        });

        if (onStudentVerified) {
          onStudentVerified(student);
        }

        setScanStatusMessage({
          type: 'success-entry',
          student: { ...student, isInside: true },
          visit: newVisit,
          message: `Entry Recorded ✓`,
        });
      } else {
        // --- TURNSTILE EXIT ---
        const exitTimeStr = timeStr;
        const exitDateStr = dateStr;
        let durationStr = '1 min';

        if (student.currentVisitId) {
          const visitRef = doc(db, COLLECTIONS.VISITS, student.currentVisitId);
          let entryTs = recentVisits.find((v) => v.id === student?.currentVisitId)?.entryTimestamp;

          if (!entryTs) {
            try {
              const vSnap = await getDoc(visitRef);
              if (vSnap.exists()) {
                entryTs = vSnap.data()?.entryTimestamp;
              }
            } catch (e) {}
          }

          if (entryTs) {
            const ms = now.getTime() - entryTs;
            durationStr = formatDuration(ms);
          }

          await updateDoc(visitRef, {
            exitTime: exitTimeStr,
            exitDate: exitDateStr,
            exitTimestamp: now.getTime(),
            duration: durationStr,
            active: false,
          });
        } else {
          // Query active visits by unique studentDocId first, then studentId
          const qActiveDoc = query(
            collection(db, COLLECTIONS.VISITS),
            where('studentDocId', '==', student.id),
            where('active', '==', true)
          );
          let activeSnap = await getDocs(qActiveDoc);
          if (activeSnap.empty) {
            const qActiveRoll = query(
              collection(db, COLLECTIONS.VISITS),
              where('studentId', '==', student.studentId),
              where('active', '==', true)
            );
            activeSnap = await getDocs(qActiveRoll);
          }
          if (!activeSnap.empty) {
            const vDoc = activeSnap.docs[0];
            const vData = vDoc.data();
            if (vData.entryTimestamp) {
              const ms = now.getTime() - vData.entryTimestamp;
              durationStr = formatDuration(ms);
            }
            await updateDoc(doc(db, COLLECTIONS.VISITS, vDoc.id), {
              exitTime: exitTimeStr,
              exitTimestamp: now.getTime(),
              duration: durationStr,
              active: false,
            });
          }
        }

        await updateDoc(doc(db, COLLECTIONS.STUDENTS, student.id), {
          isInside: false,
          currentVisitId: null,
        });

        setScanStatusMessage({
          type: 'success-exit',
          student: { ...student, isInside: false },
          visit: {
            exitTime: exitTimeStr,
            duration: durationStr,
          },
          message: `Exit Recorded ✓`,
        });
      }
    } catch (err: any) {
      console.error('Scan processing error:', err);
      setScanStatusMessage({
        type: 'error',
        message: err?.message || 'Error processing entrance scan.',
      });
    }
  };

  if (!adminUser) {
    return (
      <div className="w-full max-w-lg mx-auto py-12 px-4 animate-in fade-in duration-300">
        <div className="glass-panel-elevated rounded-3xl p-8 border border-[#D4AF37]/35 bg-white shadow-2xl text-center space-y-5 text-[#0B1F3A]">
          <div className="w-14 h-14 rounded-2xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center mx-auto shadow-md">
            <Lock className="w-7 h-7 text-[#D4AF37]" />
          </div>
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-[#0B1F3A] font-extrabold">
              Access Control Enforcement
            </span>
            <h2 className="text-xl font-extrabold text-[#0B1F3A] mt-1">Librarian Authorization Required</h2>
            <p className="text-sm text-[#0B1F3A] mt-2 leading-relaxed font-normal">
              The Turnstile Access Station is restricted strictly to authorized HNGU Library staff members. Students and logged-out users are not permitted to operate turnstiles.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Top Turnstile Terminal Header */}
      <div className="rounded-3xl p-6 sm:p-8 border border-[#D4AF37]/40 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden shadow-xl bg-white text-[#0B1F3A]">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F8F6F0] border border-[#D4AF37]/50 text-xs font-bold shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-pulse" />
            <span className="text-[#0B1F3A] font-bold">
              HNGU Turnstile Terminal #01 <span className="text-emerald-700 font-extrabold ml-0.5">Online</span>
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B1F3A] tracking-tight font-serif-academic">
            Turnstile Access Station
          </h2>
          <p className="text-xs sm:text-sm text-[#182F4E] max-w-md leading-relaxed font-medium">
            Scan your personal HNGU Student Card QR to clock in. Scan again on departure to record visit duration.
          </p>
        </div>

        {/* Big Scan Button - Premium Champagne Gold Style with Deep Navy text & icon */}
        <button
          onClick={() => {
            setScanStatusMessage(null);
            setIsScannerOpen(true);
          }}
          aria-label="Launch camera scanner for student turnstile pass"
          className="px-7 py-4 rounded-2xl bg-[#D4AF37] hover:bg-[#c9a42f] text-[#0B1F3A] font-extrabold text-sm shadow-lg shadow-[#D4AF37]/25 flex items-center gap-3 cursor-pointer btn-press border border-[#D4AF37]"
        >
          <ScanLine className="w-5 h-5 text-[#0B1F3A]" />
          <span className="font-extrabold text-[#0B1F3A]">Launch Camera Scanner</span>
        </button>
      </div>

      {/* Real-time Result Banner */}
      {scanStatusMessage && (
        <div
          className={`p-6 rounded-3xl border-2 shadow-2xl feedback-enter ${
            scanStatusMessage.type === 'success-entry'
              ? 'bg-[#0B1F3A] border-emerald-500 text-[#F8F6F0] shadow-xl'
              : scanStatusMessage.type === 'success-exit'
              ? 'bg-[#0B1F3A] border-[#D4AF37] text-[#F8F6F0] shadow-xl'
              : 'bg-[#0B1F3A] border-rose-500 text-[#F8F6F0] shadow-xl'
          }`}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            {scanStatusMessage.student && (
              <img
                src={scanStatusMessage.student.photo}
                alt={scanStatusMessage.student.name}
                className="w-18 h-18 rounded-2xl object-cover border-2 border-[#D4AF37] shadow-xl shrink-0"
              />
            )}
            <div className="space-y-2 flex-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#F8F6F0]/15 text-[#F8F6F0] border border-[#F8F6F0]/25">
                {scanStatusMessage.type === 'success-entry' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Access Granted · Gate Unlocked</span>
                  </>
                ) : scanStatusMessage.type === 'success-exit' ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Departure Logged · Gate Unlocked</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Access Denied · Gate Locked</span>
                  </>
                )}
              </div>
              <h4 className="text-2xl sm:text-3xl font-black text-[#F8F6F0] flex items-center justify-center sm:justify-start gap-2.5">
                {scanStatusMessage.message}
              </h4>
              {scanStatusMessage.student && (
                <div className="text-xs sm:text-sm font-semibold text-[#F8F6F0] flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                  <span className="text-[#F8F6F0] font-extrabold text-base">{scanStatusMessage.student.name}</span>
                  <span className="text-[#D4AF37]">·</span>
                  <span className="text-[#0B1F3A] bg-[#D4AF37] font-mono font-black text-sm px-2 py-0.5 rounded border border-[#D4AF37]">
                    {scanStatusMessage.student.studentId}
                  </span>
                  <span className="text-[#D4AF37]">·</span>
                  <span className="text-[#F8F6F0]/90 font-medium">{scanStatusMessage.student.department} ({scanStatusMessage.student.course})</span>
                </div>
              )}
              {scanStatusMessage.visit && (
                <div className="text-xs font-mono font-bold text-[#D4AF37] pt-1">
                  {scanStatusMessage.visit.exitTime && (
                    <span>Exit Timestamp: <span className="text-[#F8F6F0]">{scanStatusMessage.visit.exitTime}</span> · </span>
                  )}
                  {scanStatusMessage.visit.duration && (
                    <span>Total Session Duration: <strong className="text-[#F8F6F0] text-sm">{scanStatusMessage.visit.duration}</strong></span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Interactive Simulator Bar */}
      <div className="rounded-2xl p-4 sm:p-5 border border-[#D4AF37]/35 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md bg-white text-[#0B1F3A]">
        <div className="flex items-center gap-2.5 text-xs">
          <div className="w-7 h-7 rounded-lg bg-[#0B1F3A] flex items-center justify-center text-[#D4AF37] shrink-0 border border-[#D4AF37]/40 shadow-xs">
            <Zap className="w-3.5 h-3.5 text-[#D4AF37]" />
          </div>
          <div>
            <span className="font-extrabold text-[#0B1F3A] text-xs sm:text-sm mr-2">
              Hardware Gate Simulator:
            </span>
            <span className="text-[#182F4E] font-semibold hidden sm:inline">
              Select registered student pass to trigger instant scan
            </span>
          </div>
        </div>

        <select
          onChange={(e) => {
            if (e.target.value) handleQrScanned(e.target.value);
          }}
          defaultValue=""
          aria-label="Simulate student QR pass scan"
          className="w-full sm:w-auto bg-[#F8F6F0] border border-[#D4AF37]/50 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] font-semibold focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/50 shadow-xs cursor-pointer"
        >
          <option value="" disabled className="bg-white text-[#0B1F3A] font-bold">
            Simulate Student Pass Scan...
          </option>
          {allStudentsList.map((s) => (
            <option key={s.id} value={s.personalQrId} className="bg-white text-[#0B1F3A] font-medium">
              {s.isInside ? '🚪 Exit: ' : '✅ Enter: '} {s.name} ({s.studentId})
            </option>
          ))}
        </select>
      </div>

      {/* 2 Grid Columns: Live Inside & Recent Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Occupants Inside */}
        <div className="rounded-3xl p-6 border border-[#D4AF37]/35 space-y-4 shadow-md bg-white text-[#0B1F3A]">
          <div className="flex items-center justify-between pb-3 border-b border-[#0B1F3A]/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shadow-xs">
                <Users className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <h3 className="text-base font-bold text-[#0B1F3A]">Currently In Library</h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#F8F6F0] border border-[#D4AF37]/50 text-[#0B1F3A] text-xs font-mono font-bold shadow-2xs">
              {activeStudentsInside.length} Students
            </span>
          </div>

          {activeStudentsInside.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#182F4E] font-medium bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/25 p-6">
              Turnstile gates are currently clear. No records yet for students inside.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {activeStudentsInside.map((st) => (
                <div
                  key={st.id}
                  className="p-3 bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/30 flex items-center justify-between gap-3 hover:border-[#D4AF37] transition shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <img src={st.photo} alt={st.name} loading="lazy" className="w-10 h-10 rounded-xl object-cover border border-[#0B1F3A]/20 shadow-xs" />
                    <div>
                      <div className="text-xs font-bold text-[#0B1F3A]">{st.name}</div>
                      <div className="text-xs text-[#0B1F3A] font-mono font-bold">{st.studentId}</div>
                    </div>
                  </div>
                  <span className="text-xs text-emerald-800 font-mono bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-full font-extrabold">
                    Clocked In
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Recent Turnstile Logs */}
        <div className="rounded-3xl p-6 border border-[#D4AF37]/35 space-y-4 shadow-md bg-white text-[#0B1F3A]">
          <div className="flex items-center justify-between pb-3 border-b border-[#0B1F3A]/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0B1F3A] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shadow-xs">
                <Clock className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <h3 className="text-base font-bold text-[#0B1F3A]">Recent Turnstile Telemetry</h3>
            </div>
            <span className="text-xs text-[#0B1F3A] font-mono font-bold bg-[#F8F6F0] px-3 py-1 rounded-full border border-[#D4AF37]/50 shadow-2xs">
              {recentVisits.length} Records
            </span>
          </div>

          {recentVisits.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#182F4E] font-medium bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/25 p-6">
              No records yet. Turnstile attendance will appear here as students enter or exit.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {recentVisits.map((v) => (
                <div
                  key={v.id}
                  className="p-3 bg-[#F8F6F0] rounded-2xl border border-[#D4AF37]/30 flex items-center justify-between text-xs font-mono hover:border-[#D4AF37] transition shadow-xs"
                >
                  <div>
                    <div className="font-sans font-bold text-[#0B1F3A] text-sm">{v.studentName}</div>
                    <div className="text-xs text-[#182F4E] font-medium font-sans">
                      {v.entryDate} · <span className="text-emerald-700 font-bold font-mono">{v.entryTime}</span> → <span className="text-[#0B1F3A] font-bold font-mono">{v.exitTime || 'Inside'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#0B1F3A] font-bold font-mono text-xs">{v.duration || 'Active'}</div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold font-sans ${
                        v.active
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                          : 'bg-white text-[#0B1F3A] border border-[#0B1F3A]/25'
                      }`}
                    >
                      {v.active ? 'Inside' : 'Exited'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* QR Scanner Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleQrScanned}
        title="Turnstile QR Scanner"
        description="Hold student ID pass facing the reader camera"
        expectedType="student"
        manualOptions={allStudentsList.slice(0, 4).map((s) => ({
          label: `${s.name} (${s.studentId})`,
          value: s.personalQrId || `SLMS-STU-${s.id}`,
          hint: s.isInside ? 'Currently Inside → Will Exit' : 'Currently Outside → Will Enter',
        }))}
      />
    </div>
  );
};
