import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const outputDir = '/tmp/book_frames';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const totalFrames = 60;
const width = 1280;
const height = 720;
const fps = 24;

console.log(`Generating ${totalFrames} transparent SVG frames for HNGU book-opening video...`);

// Helper for smooth easing (easeInOutCubic)
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

for (let i = 0; i < totalFrames; i++) {
  const progress = i / (totalFrames - 1);
  const eased = easeInOutCubic(progress);

  // Book rotation: 0 degrees (closed) to 180 degrees (fully open)
  const angleDeg = eased * 180;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Geometry:
  // When closed (eased = 0): center of front cover is at x=640 (screen center).
  // So spine is at 640 - 170 = 470.
  // When open (eased = 1): spine is at center 640. Left page is 300 to 640, right page is 640 to 980.
  const bookW = 340;
  const bookH = 480;
  const topY = 120;
  const spineCenterX = (640 - bookW / 2) + (bookW / 2) * eased;

  // Right page (interior) reveals as cover opens
  const rightPageVisible = angleDeg > 10;
  const coverFlipped = angleDeg > 90;

  // Cover 3D perspective projection
  const coverCos = Math.cos(angleRad);
  const coverEdgeX = spineCenterX + bookW * coverCos;
  const coverHeightScale = 1 + 0.06 * Math.sin(angleRad); // Gentle perspective lift when turning
  const coverTopY = topY - (bookH * (coverHeightScale - 1)) / 2;
  const coverActualH = bookH * coverHeightScale;

  // Page turning physics: parchment page turns between 30% and 85% of progress
  const pageTurnProgress = Math.max(0, Math.min(1, (progress - 0.25) / 0.6));
  const pageAngleRad = easeInOutCubic(pageTurnProgress) * Math.PI;
  const pageCos = Math.cos(pageAngleRad);
  const pageEdgeX = spineCenterX + (bookW - 10) * pageCos;
  const pageCurlY = Math.sin(pageAngleRad) * 22;

  // Render SVG frame with NO rectangular background (100% transparent canvas!)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- Deep Navy Leather Cover -->
    <linearGradient id="navyCover" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E2F56" />
      <stop offset="40%" stop-color="#0E1932" />
      <stop offset="100%" stop-color="#060C1A" />
    </linearGradient>

    <!-- Inside Page Cream Paper -->
    <linearGradient id="creamPaper" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#E8E2D2" />
      <stop offset="50%" stop-color="#FAF7EE" />
      <stop offset="100%" stop-color="#F2EDE0" />
    </linearGradient>

    <!-- Inner Spine Shadow -->
    <linearGradient id="spineShadow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.45" />
      <stop offset="45%" stop-color="#000000" stop-opacity="0" />
      <stop offset="55%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.45" />
    </linearGradient>

    <!-- Gold Foil Embellishments -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFEBB3" />
      <stop offset="35%" stop-color="#D4AF37" />
      <stop offset="70%" stop-color="#AA7C11" />
      <stop offset="100%" stop-color="#E6C875" />
    </linearGradient>

    <!-- Drop Shadow Filter for Realistic Physical Book Grounding -->
    <filter id="shadowFilter" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.75" />
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.5" />
    </filter>
  </defs>

  <!-- Book Main Group with Realistic Grounding Shadow -->
  <g filter="url(#shadowFilter)">
    <!-- Dynamic Contact Shadow directly under book bottom -->
    <ellipse cx="${spineCenterX + (bookW / 2) * (1 - coverCos)}" cy="${topY + bookH + 16}" rx="${(bookW / 2) * (1.1 + 0.9 * eased)}" ry="${18 + 6 * eased}" fill="#000000" opacity="0.65" />

    <!-- 1. RIGHT SIDE: Fixed interior text block (becomes visible as cover opens) -->
    ${
      rightPageVisible
        ? `
    <!-- Right Page Stack Layers (Realistic paper edges) -->
    <rect x="${spineCenterX}" y="${topY + 6}" width="${bookW - 10}" height="${bookH - 12}" rx="3" fill="#D5CDB8" />
    <rect x="${spineCenterX}" y="${topY + 3}" width="${bookW - 6}" height="${bookH - 6}" rx="3" fill="#E4DDCB" />
    <rect x="${spineCenterX}" y="${topY}" width="${bookW - 2}" height="${bookH}" rx="4" fill="url(#creamPaper)" stroke="#C5BC9F" stroke-width="1" />

    <!-- Right Page Interior Content (HNGU Smart Library Portal) -->
    <g transform="translate(${spineCenterX + 22}, ${topY + 28})">
      <line x1="10" y1="10" x2="276" y2="10" stroke="#AA7C11" stroke-width="1" stroke-opacity="0.5" />
      <circle cx="143" cy="10" r="3" fill="#D4AF37" />

      <!-- Department Emblem Badge -->
      <rect x="113" y="24" width="60" height="38" rx="8" fill="#0D1830" stroke="#D4AF37" stroke-width="1.5" />
      <text x="143" y="47" font-family="serif" font-size="14" font-weight="bold" fill="#FFEBB3" text-anchor="middle">HNGU</text>

      <text x="143" y="85" font-family="serif" font-size="16" font-weight="bold" fill="#0E1A33" text-anchor="middle" letter-spacing="1">SMART LIBRARY</text>
      <text x="143" y="100" font-family="sans-serif" font-size="8" font-weight="bold" fill="#6B5E3C" text-anchor="middle" letter-spacing="2">DIGITAL ACCESS GATEWAY</text>

      <line x1="40" y1="114" x2="246" y2="114" stroke="#D4AF37" stroke-width="0.75" />

      <!-- Feature Rows on Right Page -->
      <rect x="15" y="130" width="256" height="36" rx="6" fill="#F4EFE0" stroke="#DDD4BD" />
      <circle cx="34" cy="148" r="9" fill="#0D1830" />
      <text x="34" y="152" font-family="sans-serif" font-size="9" fill="#E5CA8F" text-anchor="middle">QR</text>
      <text x="54" y="144" font-family="sans-serif" font-size="10" font-weight="bold" fill="#1A253C">Smart Turnstile Pass</text>
      <text x="54" y="156" font-family="sans-serif" font-size="8" fill="#756A54">Instant QR Entrance Access</text>

      <rect x="15" y="176" width="256" height="36" rx="6" fill="#F4EFE0" stroke="#DDD4BD" />
      <circle cx="34" cy="194" r="9" fill="#0D1830" />
      <text x="34" y="198" font-family="sans-serif" font-size="9" fill="#E5CA8F" text-anchor="middle">BK</text>
      <text x="54" y="190" font-family="sans-serif" font-size="10" font-weight="bold" fill="#1A253C">University Catalog</text>
      <text x="54" y="202" font-family="sans-serif" font-size="8" fill="#756A54">Live Shelves, Rack &amp; Row Locators</text>

      <rect x="15" y="222" width="256" height="36" rx="6" fill="#F4EFE0" stroke="#DDD4BD" />
      <circle cx="34" cy="240" r="9" fill="#0D1830" />
      <text x="34" y="244" font-family="sans-serif" font-size="9" fill="#E5CA8F" text-anchor="middle">ID</text>
      <text x="54" y="236" font-family="sans-serif" font-size="10" font-weight="bold" fill="#1A253C">Digital Student ID</text>
      <text x="54" y="248" font-family="sans-serif" font-size="8" fill="#756A54">Instant Verification &amp; Circulation</text>

      <text x="143" y="300" font-family="serif" font-style="italic" font-size="10" fill="#8A7A54" text-anchor="middle">"A great library is a paradise for the curious mind"</text>
      
      <line x1="20" y1="330" x2="266" y2="330" stroke="#AA7C11" stroke-width="0.75" stroke-opacity="0.4" />
      <text x="143" y="348" font-family="sans-serif" font-size="7" font-weight="bold" fill="#998762" text-anchor="middle" letter-spacing="1">PATAN, GUJARAT • INDIA</text>
    </g>

    <!-- Spine Shadow on Right Page -->
    <rect x="${spineCenterX}" y="${topY}" width="35" height="${bookH}" fill="url(#spineShadow)" opacity="0.6" />
    `
        : ''
    }

    <!-- 2. LEFT SIDE: When cover flips past 90 degrees, the left interior spread is shown -->
    ${
      coverFlipped
        ? `
    <!-- Left Page Base -->
    <rect x="${spineCenterX - bookW + 2}" y="${topY}" width="${bookW - 2}" height="${bookH}" rx="4" fill="url(#creamPaper)" stroke="#C5BC9F" stroke-width="1" />

    <!-- Left Page Content: University Seal & Academic Frontispiece -->
    <g transform="translate(${spineCenterX - bookW + 22}, ${topY + 28})">
      <line x1="10" y1="10" x2="276" y2="10" stroke="#AA7C11" stroke-width="1" stroke-opacity="0.5" />
      <circle cx="143" cy="10" r="3" fill="#D4AF37" />

      <!-- Ornate University Insignia -->
      <circle cx="143" cy="62" r="34" fill="#0D1830" stroke="#D4AF37" stroke-width="2" />
      <circle cx="143" cy="62" r="28" fill="none" stroke="#D4AF37" stroke-width="0.75" stroke-dasharray="2,2" />
      <text x="143" y="58" font-family="serif" font-size="11" font-weight="bold" fill="#FFEBB3" text-anchor="middle">HNGU</text>
      <text x="143" y="71" font-family="serif" font-size="7" fill="#D4AF37" text-anchor="middle">ESTD. 1986</text>

      <text x="143" y="122" font-family="serif" font-size="12" font-weight="bold" fill="#0E1A33" text-anchor="middle" letter-spacing="0.5">HEMCHANDRACHARYA</text>
      <text x="143" y="138" font-family="serif" font-size="10" font-weight="bold" fill="#0E1A33" text-anchor="middle" letter-spacing="0.5">NORTH GUJARAT UNIVERSITY</text>
      <text x="143" y="153" font-family="sans-serif" font-size="8" font-weight="semibold" fill="#8C7A4A" text-anchor="middle" letter-spacing="2">PATAN, GUJARAT</text>

      <line x1="50" y1="170" x2="236" y2="170" stroke="#D4AF37" stroke-width="0.75" />

      <text x="143" y="196" font-family="serif" font-size="13" font-weight="bold" fill="#14213D" text-anchor="middle">CENTRAL LIBRARY</text>
      <text x="143" y="212" font-family="sans-serif" font-size="8.5" fill="#5A4E38" text-anchor="middle">Knowledge Repository &amp; Archives</text>

      <rect x="25" y="234" width="236" height="64" rx="4" fill="#F4EFE0" stroke="#DDD4BD" />
      <text x="143" y="256" font-family="serif" font-style="italic" font-size="9" fill="#3D3320" text-anchor="middle">"Knowledge is power. Information is liberating.</text>
      <text x="143" y="271" font-family="serif" font-style="italic" font-size="9" fill="#3D3320" text-anchor="middle">Education is the premise of progress."</text>
      <text x="143" y="286" font-family="sans-serif" font-size="7.5" font-weight="bold" fill="#998762" text-anchor="middle">— HNGU ACADEMIC COUNCIL</text>

      <line x1="20" y1="330" x2="266" y2="330" stroke="#AA7C11" stroke-width="0.75" stroke-opacity="0.4" />
      <text x="143" y="348" font-family="sans-serif" font-size="7" font-weight="bold" fill="#998762" text-anchor="middle" letter-spacing="1">OFFICIAL DIGITAL SYSTEM</text>
    </g>

    <!-- Spine Shadow on Left Page -->
    <rect x="${spineCenterX - 35}" y="${topY}" width="35" height="${bookH}" fill="url(#spineShadow)" opacity="0.6" />
    `
        : ''
    }

    <!-- 3. TURNING PAGE (Mid-flip parchment page for realistic curl) -->
    ${
      pageTurnProgress > 0 && pageTurnProgress < 1
        ? `
    <g>
      <path d="M ${spineCenterX} ${topY + 5} 
               Q ${spineCenterX + (pageEdgeX - spineCenterX) * 0.5} ${topY + 5 - pageCurlY} ${pageEdgeX} ${topY + 8}
               L ${pageEdgeX} ${topY + bookH - 8}
               Q ${spineCenterX + (pageEdgeX - spineCenterX) * 0.5} ${topY + bookH - 5 - pageCurlY} ${spineCenterX} ${topY + bookH - 5} Z"
            fill="url(#creamPaper)" 
            stroke="#C5BC9F" 
            stroke-width="1"
            opacity="0.95" />
    </g>
    `
        : ''
    }

    <!-- 4. ROTATING HARDCOVER (The Navy & Gold front cover as it turns) -->
    ${
      !coverFlipped
        ? `
    <!-- Front Cover -->
    <g>
      <!-- Cover Leather Body -->
      <polygon points="${spineCenterX},${topY} ${coverEdgeX},${coverTopY} ${coverEdgeX},${coverTopY + coverActualH} ${spineCenterX},${topY + bookH}"
               fill="url(#navyCover)"
               stroke="#AA7C11"
               stroke-width="1.5" />

      <!-- Ornate Gold Foil Outer Border (only visible when wide enough) -->
      ${
        coverCos > 0.22
          ? `
      <polygon points="${spineCenterX + 16 * coverCos},${coverTopY + 16} ${coverEdgeX - 16 * coverCos},${coverTopY + 16} ${coverEdgeX - 16 * coverCos},${coverTopY + coverActualH - 16} ${spineCenterX + 16 * coverCos},${coverTopY + coverActualH - 16}"
               fill="none"
               stroke="url(#goldGrad)"
               stroke-width="2" />

      <polygon points="${spineCenterX + 22 * coverCos},${coverTopY + 22} ${coverEdgeX - 22 * coverCos},${coverTopY + 22} ${coverEdgeX - 22 * coverCos},${coverTopY + coverActualH - 22} ${spineCenterX + 22 * coverCos},${coverTopY + coverActualH - 22}"
               fill="none"
               stroke="#E5CA8F"
               stroke-width="0.75"
               stroke-opacity="0.6" />

      <!-- Center Gold Medallion & HNGU Seal -->
      <g transform="translate(${spineCenterX + (bookW / 2) * coverCos}, ${coverTopY + coverActualH / 2}) scale(${Math.max(0.08, coverCos)}, 1)">
        <circle cx="0" cy="-60" r="42" fill="#0D1830" stroke="url(#goldGrad)" stroke-width="2.5" />
        <circle cx="0" cy="-60" r="36" fill="none" stroke="#FFEBB3" stroke-width="1" stroke-dasharray="3,2" />
        <text x="0" y="-53" font-family="serif" font-size="16" font-weight="bold" fill="#FFEBB3" text-anchor="middle">HNGU</text>

        <text x="0" y="10" font-family="serif" font-size="14" font-weight="bold" fill="#FFEBB3" text-anchor="middle" letter-spacing="1">HEMCHANDRACHARYA</text>
        <text x="0" y="28" font-family="serif" font-size="12" font-weight="bold" fill="#FFEBB3" text-anchor="middle" letter-spacing="1">NORTH GUJARAT UNIVERSITY</text>

        <line x1="-80" y1="42" x2="80" y2="42" stroke="url(#goldGrad)" stroke-width="1.5" />

        <text x="0" y="68" font-family="serif" font-size="22" font-weight="bold" fill="url(#goldGrad)" text-anchor="middle" letter-spacing="3">SMART LIBRARY</text>
        <text x="0" y="86" font-family="sans-serif" font-size="9" font-weight="bold" fill="#E5CA8F" text-anchor="middle" letter-spacing="3">CENTRAL REPOSITORY</text>

        <text x="0" y="130" font-family="sans-serif" font-size="8" fill="#B3A27D" text-anchor="middle" letter-spacing="2">ESTABLISHED PATAN • GUJARAT</text>
      </g>
      `
          : ''
      }
    </g>
    `
        : `
    <!-- Back of Front Cover (Satin Navy Lining / Endpaper on left side) -->
    <polygon points="${spineCenterX},${topY} ${coverEdgeX},${coverTopY} ${coverEdgeX},${coverTopY + coverActualH} ${spineCenterX},${topY + bookH}"
             fill="#0E1B38"
             stroke="#AA7C11"
             stroke-width="1" />
    `
    }

    <!-- 5. SPINE & LEATHER BINDING (Left edge hinge) -->
    <rect x="${spineCenterX - 10}" y="${topY - 2}" width="20" height="${bookH + 4}" rx="5" fill="#0A1122" stroke="#AA7C11" stroke-width="1" />
    <line x1="${spineCenterX - 8}" y1="${topY + 30}" x2="${spineCenterX + 8}" y2="${topY + 30}" stroke="#D4AF37" stroke-width="2" />
    <line x1="${spineCenterX - 8}" y1="${topY + 80}" x2="${spineCenterX + 8}" y2="${topY + 80}" stroke="#D4AF37" stroke-width="2" />
    <line x1="${spineCenterX - 8}" y1="${topY + bookH - 80}" x2="${spineCenterX + 8}" y2="${topY + bookH - 80}" stroke="#D4AF37" stroke-width="2" />
    <line x1="${spineCenterX - 8}" y1="${topY + bookH - 30}" x2="${spineCenterX + 8}" y2="${topY + bookH - 30}" stroke="#D4AF37" stroke-width="2" />
    <circle cx="${spineCenterX}" cy="${topY + bookH / 2}" r="4" fill="#D4AF37" />
  </g>
</svg>
`;

  const frameFileName = path.join(outputDir, `frame_${String(i).padStart(4, '0')}.svg`);
  fs.writeFileSync(frameFileName, svg.trim());
}

console.log(`All ${totalFrames} SVG frames generated in ${outputDir}!`);

const publicDir = '/public';
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Encode WebM with VP9 and yuva420p for transparent background
const webmFile = path.join(publicDir, 'hngu_book_opening.webm');
console.log(`Encoding WebM video with transparency to ${webmFile}...`);
try {
  execSync(
    `ffmpeg -y -framerate ${fps} -i "${outputDir}/frame_%04d.svg" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 1500k -auto-alt-ref 0 "${webmFile}"`,
    { stdio: 'inherit' }
  );
  console.log(`SUCCESS! Transparent WebM video created at: ${webmFile}`);
} catch (err) {
  console.warn('WebM encoding failed, falling back to MP4:', err.message);
}

// 2. Encode MP4 with libx264 for universal support
const mp4File = path.join(publicDir, 'hngu_book_opening.mp4');
console.log(`Encoding MP4 video to ${mp4File}...`);
try {
  execSync(
    `ffmpeg -y -framerate ${fps} -i "${outputDir}/frame_%04d.svg" -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -movflags +faststart "${mp4File}"`,
    { stdio: 'inherit' }
  );
  console.log(`SUCCESS! MP4 video created at: ${mp4File}`);
} catch (err) {
  console.error('MP4 encoding failed:', err);
  process.exit(1);
}

// 3. Extract exact frame 0 to PNG for closed book representation
const frame0Path = path.join(publicDir, 'hngu_book_cover_frame0.png');
execSync(`ffmpeg -y -i "${mp4File}" -vframes 1 -f image2 "${frame0Path}"`, { stdio: 'inherit' });
console.log(`Extracted frame 0 to: ${frame0Path}`);

// 4. Extract final open frame to PNG for open book representation
const finalFramePath = path.join(publicDir, 'hngu_book_open_final.png');
execSync(`ffmpeg -y -sseof -0.1 -i "${mp4File}" -update 1 -q:v 1 "${finalFramePath}"`, { stdio: 'inherit' });
console.log(`Extracted final frame to: ${finalFramePath}`);
