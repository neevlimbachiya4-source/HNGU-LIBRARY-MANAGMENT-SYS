import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Check, ShieldCheck } from 'lucide-react';

interface QrDisplayProps {
  value: string;
  size?: number;
  label?: string;
  sublabel?: string;
  showDownload?: boolean;
  downloadFilename?: string;
  darkColor?: string;
  lightColor?: string;
}

export const QrCodeDisplay: React.FC<QrDisplayProps> = ({
  value,
  size = 200,
  label,
  sublabel,
  showDownload = false,
  downloadFilename = 'hngu-qr-code',
  darkColor = '#0B1F3A',
  lightColor = '#ffffff',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string>('');
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 2,
        color: {
          dark: darkColor,
          light: lightColor,
        },
        errorCorrectionLevel: 'H',
      },
      (error) => {
        if (error) {
          console.error('Error generating QR code:', error);
        } else if (canvasRef.current) {
          setDataUrl(canvasRef.current.toDataURL());
        }
      }
    );
  }, [value, size, darkColor, lightColor]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${downloadFilename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  return (
    <div className="flex flex-col items-center">
      {/* High-Contrast Frame with Quiet Zone */}
      <div className="relative p-3.5 bg-white rounded-2xl shadow-md border border-stone-200/90 group transition-all duration-200 hover:shadow-lg max-w-full">
        {/* Subtle academic corner brackets */}
        <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[#D4AF37]" />
        <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#D4AF37]" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[#D4AF37]" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[#D4AF37]" />

        <div className="p-1 bg-white rounded-lg">
          <canvas ref={canvasRef} className="rounded-md block max-w-full h-auto" />
        </div>
      </div>

      {label && (
        <p className="mt-3 text-xs sm:text-sm font-bold text-[#0B1F3A] tracking-tight text-center font-serif-academic">
          {label}
        </p>
      )}
      {sublabel && (
        <p className="text-[11px] text-stone-600 font-mono text-center mt-0.5">
          {sublabel}
        </p>
      )}

      {showDownload && (
        <button
          onClick={handleDownload}
          className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] bg-stone-100 hover:bg-stone-200 rounded-lg border border-stone-300 transition-colors cursor-pointer shadow-2xs"
        >
          {downloaded ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700 font-bold">Saved PNG</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Download High-Res QR</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
