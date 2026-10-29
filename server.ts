import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';
import dotenv from 'dotenv';
import {
  getStudentDoc,
  findStudentByIdentifier,
  checkStudentDuplicates,
  insertStudentDoc,
  updateStudentFields,
  getStudentVisits,
  getStudentLoans,
  getActiveStudentLoans,
  getLivePresenceCount,
  ensureServerAuthenticated,
  ServiceUnavailableError,
} from './server/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.resolve(__dirname, 'dist');

// Item 3: Set trust proxy to 1 so req.ip uses the immediate reverse proxy IP, NOT the first arbitrary X-Forwarded-For
app.set('trust proxy', 1);

// Body parser with 5MB limit for compressed photo payloads
app.use(express.json({ limit: '5mb' }));

// ---------------------------------------------------------------------------
// 1. Session Secret Validation & Security
// ---------------------------------------------------------------------------
// Item 1: No hardcoded fallback secret. If missing or shorter than 32 chars, refuse to start / disable student routes with 503.
const RAW_SESSION_SECRET = process.env.STUDENT_SESSION_SECRET?.trim() || '';
const IS_SESSION_SECRET_VALID = RAW_SESSION_SECRET.length >= 32;

if (!IS_SESSION_SECRET_VALID) {
  console.error('CRITICAL SECURITY ERROR: STUDENT_SESSION_SECRET environment variable is missing or shorter than 32 characters!');
  console.error('All /api/student/* endpoints will refuse operations and respond with HTTP 503 Service Unavailable.');
}

const SESSION_DURATION_SEC = 12 * 3600; // 12 hours

// Scrypt password hashing (Node.js native, salt = 16 bytes random hex)
function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = parts[1];
    const expectedKey = parts[2];
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derivedKey, 'hex'), Buffer.from(expectedKey, 'hex'));
  } catch {
    return false;
  }
}

function hashPasswordLegacySha256(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Session Token Generation & Verification (HMAC-SHA256 JWT-compatible)
function createSessionToken(studentDocId: string, studentId: string): string {
  if (!IS_SESSION_SECRET_VALID) {
    throw new ServiceUnavailableError('Session encryption secret is unconfigured or invalid.');
  }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: studentDocId,
    studentId: studentId,
    role: 'student',
    iat: now,
    exp: now + SESSION_DURATION_SEC,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', RAW_SESSION_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifySessionToken(token: string): { sub: string; studentId: string } | null {
  if (!IS_SESSION_SECRET_VALID) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', RAW_SESSION_SECRET).update(`${header}.${payload}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return { sub: data.sub, studentId: data.studentId };
  } catch {
    return null;
  }
}

// Sanitize student object to strictly exclude sensitive hashes
function sanitizeStudent(data: any, id?: string) {
  if (!data) return null;
  const { passwordHash, passwordScrypt, ...safe } = data;
  return { id: id || data.id, ...safe };
}

// ---------------------------------------------------------------------------
// Rate Limiters & Periodic Map Cleanup
// ---------------------------------------------------------------------------
interface RateLimitEntry { count: number; resetTime: number; }
const registerRateLimits = new Map<string, RateLimitEntry>();
const loginRateLimits = new Map<string, RateLimitEntry>();
const presenceRateLimits = new Map<string, RateLimitEntry>();
const qrRateLimits = new Map<string, RateLimitEntry>();

// Item 3: Use req.ip directly with app.set('trust proxy', 1)
function getClientIp(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(map: Map<string, RateLimitEntry>, ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = map.get(ip);
  if (!entry || now > entry.resetTime) {
    map.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// Item 3: Periodic cleanup every 5 minutes to prevent Maps growing indefinitely
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of registerRateLimits.entries()) {
    if (now > entry.resetTime) registerRateLimits.delete(key);
  }
  for (const [key, entry] of loginRateLimits.entries()) {
    if (now > entry.resetTime) loginRateLimits.delete(key);
  }
  for (const [key, entry] of presenceRateLimits.entries()) {
    if (now > entry.resetTime) presenceRateLimits.delete(key);
  }
  for (const [key, entry] of qrRateLimits.entries()) {
    if (now > entry.resetTime) qrRateLimits.delete(key);
  }
}, 5 * 60 * 1000);

// Presence Cache (20 seconds TTL)
let cachedLiveCount: number | null = null;
let lastPresenceFetchTime = 0;
const PRESENCE_CACHE_TTL_MS = 20 * 1000;

// ---------------------------------------------------------------------------
// Student Session Protection & Secret Check Middleware
// ---------------------------------------------------------------------------
// Item 1: Refuse all /api/student/* routes with 503 if secret is not set/valid
app.use('/api/student', (_req, res, next) => {
  if (!IS_SESSION_SECRET_VALID) {
    return res.status(503).json({
      error: 'Student authentication service is currently unavailable. Server session configuration required.',
    });
  }
  next();
});

async function requireStudentAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }

  const token = authHeader.slice(7).trim();
  const claims = verifySessionToken(token);
  if (!claims) {
    return res.status(401).json({ error: 'Invalid or expired session token. Please log in again.' });
  }

  // Mandatory re-check against Firestore on every API call
  try {
    const student = await getStudentDoc(claims.sub);
    if (!student || student.data.status !== 'active') {
      return res.status(401).json({ error: 'Student account is inactive, deactivated, or blocked.' });
    }
    (req as any).student = { id: student.id, ...student.data };
    next();
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError || err.statusCode === 503) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please retry in a few moments.' });
    }
    console.error('Session verification error:', err);
    return res.status(500).json({ error: 'Internal server error verifying session status.' });
  }
}

// ---------------------------------------------------------------------------
// Initiate server-side system user authentication at startup
// ---------------------------------------------------------------------------
ensureServerAuthenticated().catch((err) => {
  console.warn('Initial server system user authentication notice:', err.message);
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// 1. Live presence headcount endpoint (cached 20s, rate limited 60 req/min/IP)
app.get('/api/stats/live-presence', async (req, res) => {
  const clientIp = getClientIp(req);
  if (!checkRateLimit(presenceRateLimits, clientIp, 60, 60 * 1000)) {
    return res.status(429).json({ error: 'Rate limit exceeded for presence status inquiries.' });
  }

  const now = Date.now();
  if (cachedLiveCount !== null && now - lastPresenceFetchTime < PRESENCE_CACHE_TTL_MS) {
    return res.json({ insideCount: cachedLiveCount, cached: true });
  }

  try {
    const count = await getLivePresenceCount();
    cachedLiveCount = count;
    lastPresenceFetchTime = now;
    return res.json({ insideCount: count, cached: false });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError || err.statusCode === 503) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please retry.' });
    }
    console.error('Error fetching live presence count:', err);
    return res.json({ insideCount: cachedLiveCount ?? 0, cached: true });
  }
});

// 2. Student Registration endpoint (Rate limited: 5 per IP per hour)
app.post('/api/student/register', async (req, res) => {
  const clientIp = getClientIp(req);
  if (!checkRateLimit(registerRateLimits, clientIp, 5, 3600 * 1000)) {
    return res.status(429).json({ error: 'Registration rate limit exceeded. Please try again later.' });
  }

  try {
    const {
      name,
      studentId,
      college,
      course,
      department,
      semester,
      mobile,
      email,
      password,
      photo,
    } = req.body;

    // Strict field validations
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ error: 'Full student name is required (2–80 characters).' });
    }

    const cleanStudentId = (studentId || '').trim().toUpperCase();
    if (!cleanStudentId || cleanStudentId.length < 3 || cleanStudentId.length > 30) {
      return res.status(400).json({ error: 'Valid student roll number / ID is required (3–30 characters).' });
    }

    // Mobile number normalization & format check
    let cleanMobile = (mobile || '').toString().replace(/\D/g, '');
    if (cleanMobile.length === 12 && cleanMobile.startsWith('91')) cleanMobile = cleanMobile.slice(2);
    if (cleanMobile.length === 11 && cleanMobile.startsWith('0')) cleanMobile = cleanMobile.slice(1);
    if (!/^[6-9][0-9]{9}$/.test(cleanMobile)) {
      return res.status(400).json({ error: 'Invalid mobile number. 10-digit Indian mobile number required.' });
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Valid email address required.' });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanCourse = (course || '').trim();
    const cleanSemester = (semester || '').trim();
    const cleanDepartment = (department || '').trim();
    const cleanCollege = (college || '').trim();

    // Check duplicate registrations
    const dupeCheck = await checkStudentDuplicates(
      cleanStudentId,
      cleanCourse,
      cleanSemester,
      cleanMobile,
      cleanEmail
    );
    if (dupeCheck.duplicate) {
      return res.status(409).json({ error: dupeCheck.reason });
    }

    // Photo validation: Accept ONLY if it is data:image/jpeg or data:image/png base64 string <= 150 KB, otherwise fallback to neutral silhouette
    const DEFAULT_PHOTO =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><rect width="120" height="120" fill="%23E2E8F0"/><circle cx="60" cy="46" r="22" fill="%2394A3B8"/><path d="M26 104c0-18.778 15.222-34 34-34s34 15.222 34 34" fill="%2394A3B8"/></svg>';
    let validatedPhoto = DEFAULT_PHOTO;

    if (photo && typeof photo === 'string') {
      if (photo === DEFAULT_PHOTO || photo.startsWith('data:image/svg+xml')) {
        validatedPhoto = DEFAULT_PHOTO;
      } else {
        const match = photo.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
        if (match) {
          const base64Data = match[2];
          const approxBytes = Math.ceil((base64Data.length * 3) / 4);
          const MAX_BYTES = 150 * 1024; // 150 KB
          if (approxBytes <= MAX_BYTES) {
            validatedPhoto = photo;
          } else {
            console.log(`Uploaded photo exceeds 150 KB (${approxBytes} bytes). Falling back to default photo.`);
          }
        } else {
          console.log('Uploaded photo is not data:image/jpeg or data:image/png base64. Falling back to default photo.');
        }
      }
    }

    // Generate unique Doc ID, QR pass and Membership barcode
    const docId = `stu_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const personalQrId = `SLMS-STU-${docId}`;
    const membershipId = `LIB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Hash passwords (Primary: scrypt with 16-byte random salt; Backup: sha256 for safe rollback)
    const passwordScrypt = hashPasswordScrypt(password);
    const passwordHash = hashPasswordLegacySha256(password);

    const newStudentData = {
      name: name.trim(),
      studentId: cleanStudentId,
      college: cleanCollege,
      course: cleanCourse,
      department: cleanDepartment,
      semester: cleanSemester,
      mobile: cleanMobile,
      email: cleanEmail,
      passwordScrypt,
      passwordHash,
      photo: validatedPhoto,
      personalQrId,
      membershipId,
      role: 'student',
      status: 'active',
      isInside: false,
      currentVisitId: null,
      createdAt: new Date().toISOString(),
    };

    await insertStudentDoc(docId, newStudentData);

    const token = createSessionToken(docId, cleanStudentId);
    return res.status(201).json({
      success: true,
      token,
      student: sanitizeStudent(newStudentData, docId),
    });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError || err.statusCode === 503) {
      return res.status(503).json({ error: 'Registration service temporarily unavailable. Please retry in a few moments.' });
    }
    console.error('Registration processing error:', err);
    return res.status(500).json({ error: err.message || 'Failed to complete registration.' });
  }
});

// Item 2: /api/student/resolve-qr: returns ONLY { success: true, studentId }, rate limited 30/min/IP with generic error
app.post('/api/student/resolve-qr', async (req, res) => {
  const clientIp = getClientIp(req);
  if (!checkRateLimit(qrRateLimits, clientIp, 30, 60 * 1000)) {
    return res.status(429).json({ error: 'Too many QR resolution requests. Please wait.' });
  }

  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid QR token request.' });
    }
    const cleanToken = token.trim();
    const found = await findStudentByIdentifier(cleanToken);
    if (!found) {
      return res.status(404).json({ error: 'No matching student record found.' });
    }
    return res.json({
      success: true,
      studentId: found.data.studentId,
    });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError || err.statusCode === 503) {
      return res.status(503).json({ error: 'QR verification service temporarily unavailable.' });
    }
    console.error('Error resolving QR token:', err);
    return res.status(500).json({ error: 'Unable to resolve QR code at this time.' });
  }
});

// 3. Student Login endpoint (Rate limited: 10 per IP per min, transparent scrypt migration)
// Item 5: Use identical generic error message for unknown identifier AND wrong password
const GENERIC_LOGIN_ERROR = 'Invalid roll number, mobile, or password entered.';

app.post('/api/student/login', async (req, res) => {
  const clientIp = getClientIp(req);
  if (!checkRateLimit(loginRateLimits, clientIp, 10, 60 * 1000)) {
    return res.status(429).json({ error: 'Too many login attempts. Please wait 1 minute.' });
  }

  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password are required.' });
    }

    const found = await findStudentByIdentifier(identifier);
    if (!found) {
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const studentDocId = found.id;
    const student = found.data;

    if (student.status !== 'active') {
      return res.status(403).json({ error: 'This student account has been deactivated or blocked.' });
    }

    let authenticated = false;

    // Check 1: Scrypt verification
    if (student.passwordScrypt && typeof student.passwordScrypt === 'string') {
      authenticated = verifyPasswordScrypt(password, student.passwordScrypt);
    }

    // Check 2: Legacy SHA-256 verification (with transparent migration)
    if (!authenticated && student.passwordHash && typeof student.passwordHash === 'string') {
      const sha256Attempt = hashPasswordLegacySha256(password);
      if (sha256Attempt === student.passwordHash) {
        authenticated = true;

        // Transparent Migration: Generate new scrypt hash in separate field, keep legacy passwordHash untouched
        try {
          const newScrypt = hashPasswordScrypt(password);
          await updateStudentFields(studentDocId, { passwordScrypt: newScrypt });
          student.passwordScrypt = newScrypt;
        } catch (migrationErr) {
          console.warn('Password scrypt migration warning:', migrationErr);
        }
      }
    }

    if (!authenticated) {
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    }

    const token = createSessionToken(studentDocId, student.studentId);
    return res.json({
      success: true,
      token,
      student: sanitizeStudent(student, studentDocId),
    });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError || err.statusCode === 503) {
      return res.status(503).json({ error: 'Authentication service temporarily unavailable. Please retry.' });
    }
    console.error('Login processing error:', err);
    return res.status(500).json({ error: 'Authentication service error.' });
  }
});

// 4. Current Student Profile endpoint (re-checks active status on every call)
app.get('/api/student/me', requireStudentAuth, (req, res) => {
  const student = (req as any).student;
  return res.json({ student: sanitizeStudent(student) });
});

// 5. Current Student Visit History
app.get('/api/student/me/visits', requireStudentAuth, async (req, res) => {
  const student = (req as any).student;
  const limitCount = Math.min(Number(req.query.limit) || 50, 200);

  try {
    const { visits, totalCount } = await getStudentVisits(student.studentId, limitCount);
    return res.json({ visits, totalCount });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError || err.statusCode === 503) {
      return res.status(503).json({ error: 'Visit history service temporarily unavailable.' });
    }
    console.error('Error fetching student visits:', err);
    return res.status(500).json({ error: 'Failed to retrieve visit history.' });
  }
});

// 6. Current Student Book Loan Ledger
app.get('/api/student/me/loans', requireStudentAuth, async (req, res) => {
  const student = (req as any).student;
  const limitCount = Math.min(Number(req.query.limit) || 50, 200);

  try {
    const { transactions, totalCount } = await getStudentLoans(student.studentId, limitCount);
    return res.json({ transactions, totalCount });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError || err.statusCode === 503) {
      return res.status(503).json({ error: 'Book loans service temporarily unavailable.' });
    }
    console.error('Error fetching student loans:', err);
    return res.status(500).json({ error: 'Failed to retrieve book loan records.' });
  }
});

// 7. Current Student Active Loans (for lightweight student profile polling)
app.get('/api/student/me/active-loans', requireStudentAuth, async (req, res) => {
  const student = (req as any).student;
  try {
    const activeLoans = await getActiveStudentLoans(student.studentId);
    return res.json({ activeLoans });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError || err.statusCode === 503) {
      return res.status(503).json({ error: 'Active loans service temporarily unavailable.' });
    }
    console.error('Error fetching active loans:', err);
    return res.status(500).json({ error: 'Failed to retrieve active loans.' });
  }
});

// ---------------------------------------------------------------------------
// Static Assets & Development / Production Handlers
// ---------------------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // In development mode, mount Vite dev server middlewares on Express
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production mode, serve built assets from dist directory
    if (fs.existsSync(DIST_DIR)) {
      app.get(['/register', '/register/'], (_req, res) => {
        const registerFile = path.join(DIST_DIR, 'register', 'index.html');
        if (fs.existsSync(registerFile)) {
          return res.sendFile(registerFile);
        }
        return res.sendFile(path.join(DIST_DIR, 'index.html'));
      });

      app.use(express.static(DIST_DIR));

      app.get('*', (_req, res) => {
        const indexFile = path.join(DIST_DIR, 'index.html');
        if (fs.existsSync(indexFile)) {
          return res.sendFile(indexFile);
        }
        return res.status(200).send('<!doctype html><html><body><div id="root"></div></body></html>');
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HNGU Smart Library server running on port ${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
