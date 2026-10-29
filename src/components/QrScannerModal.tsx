import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  RefreshCw,
  XCircle,
  AlertCircle,
  Sparkles,
  SwitchCamera,
  ShieldAlert,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
  title: string;
  description?: string;
  expectedType?: 'student' | 'book' | 'any';
  manualOptions?: { label: string; value: string; hint?: string }[];
}

interface VideoDevice {
  deviceId: string;
  label: string;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title,
  description,
  expectedType = 'any',
  manualOptions = [],
}) => {
  const [scannerStatus, setScannerStatus] = useState<
    'idle' | 'requesting' | 'active' | 'denied' | 'error' | 'not-supported'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [availableDevices, setAvailableDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isScanningFrame, setIsScanningFrame] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const scanLoopIdRef = useRef<number | null>(null);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cleanly terminate active stream and scanning loop
  const stopCameraStream = useCallback(() => {
    if (scanLoopIdRef.current) {
      cancelAnimationFrame(scanLoopIdRef.current);
      scanLoopIdRef.current = null;
    }

    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          // ignore track stop error
        }
      });
      activeStreamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (e) {
        // ignore video pause error
      }
    }

    setIsScanningFrame(false);
  }, []);

  // Frame scanner loop using BarcodeDetector (native hardware accelerated) with jsQR fallback
  const startScanningLoop = useCallback(() => {
    if (scanLoopIdRef.current) {
      cancelAnimationFrame(scanLoopIdRef.current);
      scanLoopIdRef.current = null;
    }

    let isBarcodeDetectorSupported = false;
    let barcodeDetector: any = null;

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code'],
        });
        isBarcodeDetectorSupported = true;
      } catch (e) {
        isBarcodeDetectorSupported = false;
      }
    }

    // Lazy canvas creation for offscreen analysis
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let scanThrottleCounter = 0;

    const tick = async () => {
      if (!isMountedRef.current || !activeStreamRef.current) {
        return;
      }

      const video = videoRef.current;
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        // Process every 2nd frame to preserve battery and maintain snappy UI
        scanThrottleCounter++;
        if (scanThrottleCounter % 2 === 0) {
          try {
            let foundText: string | null = null;

            // 1. Try native BarcodeDetector if available
            if (isBarcodeDetectorSupported && barcodeDetector) {
              try {
                const barcodes = await barcodeDetector.detect(video);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  foundText = barcodes[0].rawValue;
                }
              } catch (detectErr) {
                // Fallback to jsQR
              }
            }

            // 2. Fallback to robust jsQR
            if (!foundText && ctx) {
              const width = video.videoWidth;
              const height = video.videoHeight;
              if (width > 0 && height > 0) {
                if (canvas.width !== width || canvas.height !== height) {
                  canvas.width = width;
                  canvas.height = height;
                }
                ctx.drawImage(video, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });
                if (qrResult && qrResult.data) {
                  foundText = qrResult.data;
                }
              }
            }

            if (foundText && isMountedRef.current) {
              stopCameraStream();
              onScanSuccess(foundText);
              return;
            }
          } catch (frameErr) {
            // ignore scan frame exception and continue loop
          }
        }
      }

      if (isMountedRef.current && activeStreamRef.current) {
        scanLoopIdRef.current = requestAnimationFrame(tick);
      }
    };

    scanLoopIdRef.current = requestAnimationFrame(tick);
    setIsScanningFrame(true);
  }, [onScanSuccess, stopCameraStream]);

  // Main camera initialization routine
  const startCamera = useCallback(
    async (preferDeviceId?: string) => {
      if (isStartingRef.current) {
        return;
      }
      isStartingRef.current = true;

      try {
        setErrorMessage(null);
        setScannerStatus('requesting');

        // 1. Environment & API Support Checks
        if (typeof window === 'undefined') {
          return;
        }

        if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
          setScannerStatus('error');
          setErrorMessage(
            'Camera access requires a secure connection (HTTPS). Please open this site via HTTPS or localhost.'
          );
          return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setScannerStatus('not-supported');
          setErrorMessage(
            'Camera access is not supported by this browser. Please try Chrome, Safari, Edge, or Firefox.'
          );
          return;
        }

        // 2. Stop any existing camera stream before starting a new one
        stopCameraStream();

        // 3. Construct constraints
        // Prefer environment (rear) camera on mobile by default unless a specific device is selected
        const targetDeviceId = preferDeviceId || selectedDeviceId;
        const videoConstraints: MediaTrackConstraints = targetDeviceId
          ? { deviceId: { exact: targetDeviceId } }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        let stream: MediaStream | null = null;

        // Attempt 1: Optimal constraints
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: videoConstraints,
          });
        } catch (firstErr: any) {
          // Attempt 2: Minimal fallback constraints (e.g. laptops where environment facingMode might fail)
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: true,
            });
          } catch (fallbackErr: any) {
            throw firstErr || fallbackErr;
          }
        }

        if (!stream || !isMountedRef.current) {
          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
          }
          return;
        }

        activeStreamRef.current = stream;

        // 4. Ensure video element is available and ready (handling React DOM mount timing)
        let video = videoRef.current;
        let retryCount = 0;
        while (!video && retryCount < 10 && isMountedRef.current) {
          await new Promise((res) => setTimeout(res, 50));
          video = videoRef.current;
          retryCount++;
        }

        if (!video || !isMountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          activeStreamRef.current = null;
          return;
        }

        // 5. Explicitly configure video properties for cross-browser iOS Safari & Android Chrome compliance
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;

        // Wait for metadata or data to load safely
        await new Promise<void>((resolve) => {
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            resolve();
          } else {
            const onLoaded = () => {
              video.removeEventListener('loadedmetadata', onLoaded);
              resolve();
            };
            video.addEventListener('loadedmetadata', onLoaded);
            // Fallback timeout in case event is missed
            setTimeout(resolve, 800);
          }
        });

        // 6. Safely invoke play() with promise handling
        try {
          await video.play();
        } catch (playErr: any) {
          // AbortError can occur if pause was called during teardown
          if (playErr.name !== 'AbortError') {
            console.warn('Video playback warning:', playErr);
          }
        }

        if (!isMountedRef.current) {
          stopCameraStream();
          return;
        }

        setScannerStatus('active');

        // 7. Enumerate devices now that permission has been unlocked by getUserMedia
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices
            .filter((d) => d.kind === 'videoinput')
            .map((d, index) => ({
              deviceId: d.deviceId,
              label: d.label || `Camera ${index + 1}`,
            }));

          setAvailableDevices(videoInputs);

          // Track current active device
          const currentTrack = stream.getVideoTracks()[0];
          const settings = currentTrack?.getSettings();
          if (settings?.deviceId) {
            setSelectedDeviceId(settings.deviceId);
          }
        } catch (enumErr) {
          // Device enumeration error is non-fatal
        }

        // 8. Start QR code scanning frame loop
        startScanningLoop();
      } catch (err: any) {
        if (!isMountedRef.current) return;

        console.warn('Camera initialization error:', err);
        stopCameraStream();

        const errName = err?.name || '';
        const errMsg = err?.message || '';

        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errMsg.includes('Permission denied') ||
          errMsg.includes('NotAllowedError')
        ) {
          setScannerStatus('denied');
          setErrorMessage(
            'Camera permission was blocked. Please tap the lock or camera icon in your address bar, set Camera to "Allow", and click "Retry Camera".'
          );
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setScannerStatus('error');
          setErrorMessage('No camera device was detected on your system. You can test with the quick simulation buttons below.');
        } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
          setScannerStatus('error');
          setErrorMessage(
            'Camera is in use by another tab or app. Please close other applications using the camera and click "Retry Camera".'
          );
        } else if (errName === 'OverconstrainedError') {
          setScannerStatus('error');
          setErrorMessage('Could not satisfy camera constraints. Click "Retry Camera" to launch standard video mode.');
        } else {
          setScannerStatus('error');
          setErrorMessage(
            errMsg || 'Unable to open camera. Please check camera permissions and click "Retry Camera".'
          );
        }
      } finally {
        isStartingRef.current = false;
      }
    },
    [selectedDeviceId, startScanningLoop, stopCameraStream]
  );

  // Switch between front/back or alternate cameras
  const handleSwitchCamera = useCallback(() => {
    if (availableDevices.length < 2) return;
    const currentIndex = availableDevices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % availableDevices.length;
    const nextDevice = availableDevices[nextIndex];
    if (nextDevice) {
      setSelectedDeviceId(nextDevice.deviceId);
      startCamera(nextDevice.deviceId);
    }
  }, [availableDevices, selectedDeviceId, startCamera]);

  // Lifecycle when modal opens/closes
  useEffect(() => {
    isMountedRef.current = true;

    if (!isOpen) {
      stopCameraStream();
      setScannerStatus('idle');
      setErrorMessage(null);
      return;
    }

    // When modal opens, start camera cleanly
    startCamera();

    // Listen to browser permission state changes if Permissions API is supported
    let permStatus: PermissionStatus | null = null;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'camera' as PermissionName })
        .then((status) => {
          if (!isMountedRef.current) return;
          permStatus = status;
          status.onchange = () => {
            if (!isMountedRef.current) return;
            if (status.state === 'granted') {
              // Automatically restart camera when user allows permission in browser popup
              startCamera();
            } else if (status.state === 'denied') {
              setScannerStatus('denied');
              setErrorMessage(
                'Camera permission was blocked. Please tap the lock or camera icon in your address bar, set Camera to "Allow", and click "Retry Camera".'
              );
            }
          };
        })
        .catch(() => {
          // Permissions API query for camera is not supported in all browsers; safe to ignore
        });
    }

    return () => {
      isMountedRef.current = false;
      if (permStatus) {
        permStatus.onchange = null;
      }
      stopCameraStream();
    };
  }, [isOpen, startCamera, stopCameraStream]);

  // Accessibility: close scanner modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopCameraStream();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, stopCameraStream]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    stopCameraStream();
    onScanSuccess(manualCode.trim());
  };

  const handleQuickSimulation = (val: string) => {
    stopCameraStream();
    onScanSuccess(val);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0B1F3A]/75 backdrop-blur-md modal-backdrop-enter">
      <div className="relative w-full max-w-lg bg-[#0B1F3A] border border-[#D4AF37]/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-[#F8F6F0] modal-panel-enter">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#D4AF37]/25 flex items-center justify-between bg-[#0B1F3A]">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-[#D4AF37]/15 text-[#D4AF37] rounded-xl border border-[#D4AF37]/30">
              <Camera className="w-5 h-5 animate-pulse text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#F8F6F0] tracking-wide">{title}</h3>
              {description && <p className="text-xs text-[#F8F6F0]/90 font-medium">{description}</p>}
            </div>
          </div>
          <button
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="p-2 text-[#F8F6F0]/80 hover:text-[#F8F6F0] rounded-lg hover:bg-[#D4AF37]/15 transition cursor-pointer"
            aria-label="Close scanner"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Scanner Viewport */}
          <div className="relative rounded-2xl overflow-hidden bg-black border border-[#D4AF37]/40 aspect-square max-w-[320px] mx-auto flex items-center justify-center shadow-lg">
            {/* The actual HTML5 Video Element */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                scannerStatus === 'active' ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
              }`}
            />

            {/* Inactive / Requesting / Error State Overlay */}
            {scannerStatus !== 'active' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center bg-[#0B1F3A]/95 z-10">
                {scannerStatus === 'requesting' ? (
                  <>
                    <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin mb-3" />
                    <p className="text-sm font-bold text-[#F8F6F0]">Starting Camera...</p>
                    <p className="text-xs text-[#F8F6F0]/90 mt-1 max-w-xs leading-relaxed font-medium">
                      Please allow camera permission in your browser prompt.
                    </p>
                  </>
                ) : scannerStatus === 'denied' ? (
                  <>
                    <ShieldAlert className="w-10 h-10 text-rose-400 mb-2.5" />
                    <p className="text-sm font-bold text-rose-200">Camera Access Blocked</p>
                    <p className="text-[11px] text-[#F8F6F0]/90 mt-1.5 max-w-xs leading-relaxed font-medium">
                      {errorMessage ||
                        'Please click the lock/camera icon in your browser address bar, set Camera to "Allow", and click Retry.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer border border-rose-400"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                    </button>
                  </>
                ) : (
                  <>
                    <Camera className="w-10 h-10 text-[#D4AF37] mb-2.5" />
                    <p className="text-sm font-bold text-[#F8F6F0]">Live Camera Scanner</p>
                    <p className="text-xs text-[#F8F6F0]/90 mt-1 max-w-xs leading-relaxed font-medium">
                      Position student ID card QR code or book barcode within view.
                    </p>
                    {errorMessage && (
                      <div className="mt-3 p-2.5 bg-amber-500/20 border border-amber-400/50 rounded-xl text-amber-200 text-xs flex items-center gap-2 text-left font-semibold">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-300" />
                        <span className="leading-tight text-[11px]">{errorMessage}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="mt-4 px-5 py-2.5 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B1F3A] text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer border border-[#D4AF37]"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Start Camera
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Active Scanning Reticle and Visual Targeting Frame */}
            {scannerStatus === 'active' && (
              <div className="pointer-events-none absolute inset-0 border-2 border-[#D4AF37]/40 rounded-2xl flex items-center justify-center z-10">
                <div className="w-48 h-48 border-2 border-[#D4AF37] rounded-xl relative shadow-[0_0_24px_rgba(212,175,55,0.4)]">
                  {/* Calibrated laser scan telemetry bar */}
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent shadow-[0_0_8px_#D4AF37] scanner-sweep-line" />
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-[#D4AF37]" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-[#D4AF37]" />
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-[#D4AF37]" />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-[#D4AF37]" />
                </div>

                {/* Live Camera Badge */}
                <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-emerald-500/25 border border-emerald-400/60 text-xs font-bold text-emerald-300 flex items-center gap-1.5 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  LIVE
                </div>
              </div>
            )}

            {/* Camera Switcher Button (if device has multiple cameras, e.g. front & back) */}
            {scannerStatus === 'active' && availableDevices.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                title="Switch Camera"
                aria-label="Switch between camera devices"
                className="absolute bottom-3 right-3 z-20 p-2 bg-[#0B1F3A]/90 hover:bg-[#0B1F3A] text-white rounded-xl border border-[#D4AF37]/40 shadow-lg cursor-pointer transition flex items-center gap-1 text-xs font-semibold"
              >
                <SwitchCamera className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Switch</span>
              </button>
            )}
          </div>

          {/* Quick Simulation Options */}
          {manualOptions.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-xs font-bold text-[#F8F6F0] uppercase tracking-wider">
                  Quick Testing Simulation
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {manualOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleQuickSimulation(opt.value)}
                    className="p-2.5 rounded-xl border border-[#D4AF37]/35 bg-white/5 hover:bg-white/10 hover:border-[#D4AF37] transition text-left text-xs group cursor-pointer shadow-xs"
                  >
                    <div className="font-bold text-[#F8F6F0] group-hover:text-[#D4AF37] transition truncate">
                      {opt.label}
                    </div>
                    {opt.hint && <div className="text-xs text-[#F8F6F0]/90 font-medium truncate">{opt.hint}</div>}
                    <div className="text-xs text-[#D4AF37] font-mono font-bold mt-0.5">{opt.value}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual Code Input */}
          <form onSubmit={handleManualSubmit} className="pt-2 border-t border-[#D4AF37]/20">
            <label className="block text-xs font-bold text-[#F8F6F0] mb-1.5">
              Or manually enter QR Token / Identifier:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder={
                  expectedType === 'student'
                    ? 'e.g. SLMS-STU-xxxx'
                    : expectedType === 'book'
                    ? 'e.g. SLMS-BK-1001'
                    : 'e.g. SLMS-STU-xxxx or SLMS-BK-1001'
                }
                className="flex-1 bg-[#F8F6F0] border border-[#D4AF37]/50 rounded-xl px-3 py-2 text-xs text-[#0B1F3A] placeholder-[#0B1F3A]/70 focus:outline-none focus:border-[#D4AF37] font-mono font-medium"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-5 py-2 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B1F3A] disabled:opacity-50 font-black rounded-xl text-xs transition cursor-pointer shadow-md border border-[#D4AF37]"
              >
                Scan Token
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

