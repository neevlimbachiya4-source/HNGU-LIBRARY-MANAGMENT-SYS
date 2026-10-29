import { Student, LibraryVisit, BookTransaction } from '../types';

const TOKEN_KEY = 'slms_student_session_token';

export function getStoredStudentToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredStudentToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    console.warn('Failed to store student token:', e);
  }
}

export function clearStoredStudentToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.warn('Failed to remove student token:', e);
  }
}

export async function fetchLivePresenceCount(): Promise<number> {
  try {
    const res = await fetch('/api/stats/live-presence');
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.insideCount) || 0;
  } catch (err) {
    console.warn('Failed to fetch live presence count:', err);
    return 0;
  }
}

export async function studentLoginApi(identifier: string, password: string): Promise<{ success: boolean; token: string; student: Student }> {
  const res = await fetch('/api/student/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch (parseErr) {
    throw new Error(`Server returned unexpected response (status ${res.status}). Please try again.`);
  }

  if (!res.ok) {
    throw new Error(data?.error || 'Student login failed.');
  }

  setStoredStudentToken(data.token);
  return data;
}

export async function resolveQrTokenApi(token: string): Promise<{ success: boolean; studentId: string } | null> {
  try {
    const res = await fetch('/api/student/resolve-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.warn('Failed to resolve QR token via API:', err);
    return null;
  }
}

export async function studentRegisterApi(formData: any): Promise<{ success: boolean; token: string; student: Student }> {
  const res = await fetch('/api/student/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch (parseErr) {
    throw new Error(`Server returned unexpected response (status ${res.status}). Please try again.`);
  }

  if (!res.ok) {
    throw new Error(data?.error || 'Student registration failed.');
  }

  setStoredStudentToken(data.token);
  return data;
}

export async function fetchStudentMe(): Promise<Student | null> {
  const token = getStoredStudentToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/student/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        clearStoredStudentToken();
      }
      return null;
    }
    const data = await res.json();
    return data.student as Student;
  } catch (err) {
    console.warn('Failed to fetch student session:', err);
    return null;
  }
}

export async function fetchStudentVisitsApi(limitCount = 50): Promise<{ visits: LibraryVisit[]; totalCount: number }> {
  const token = getStoredStudentToken();
  if (!token) return { visits: [], totalCount: 0 };

  const res = await fetch(`/api/student/me/visits?limit=${limitCount}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch student visits.');
  }
  return res.json();
}

export async function fetchStudentLoansApi(limitCount = 50): Promise<{ transactions: BookTransaction[]; totalCount: number }> {
  const token = getStoredStudentToken();
  if (!token) return { transactions: [], totalCount: 0 };

  const res = await fetch(`/api/student/me/loans?limit=${limitCount}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch student loans.');
  }
  return res.json();
}

export async function fetchStudentActiveLoansApi(): Promise<BookTransaction[]> {
  const token = getStoredStudentToken();
  if (!token) return [];

  try {
    const res = await fetch('/api/student/me/active-loans', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.activeLoans || []) as BookTransaction[];
  } catch (err) {
    console.warn('Failed to fetch active loans:', err);
    return [];
  }
}
