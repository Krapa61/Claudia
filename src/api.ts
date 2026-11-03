const BASE = 'https://krapa61.app.n8n.cloud/webhook';
const TOKEN_KEY = 'claudia_session_token';
const USER_KEY = 'claudia_user';

export type ClaudiaUser = { email: string; role: string; name?: string };
export type ApiResult = {
  success: boolean;
  message: string;
  session_token?: string;
  expires_at?: string;
  user?: ClaudiaUser;
  session_id?: string;
  status: number;
};

async function post(path: string, body: unknown, token?: string): Promise<ApiResult> {
  try {
    const res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    let data: any = {};
    try { data = await res.json(); } catch { /* empty body */ }
    return {
      success: res.ok && data.success !== false,
      message: data.message || (res.ok ? '' : `Request failed (${res.status}).`),
      ...data,
      status: res.status,
    };
  } catch {
    return { success: false, message: 'Cannot reach Claudia. Check your connection.', status: 0 };
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser = (): ClaudiaUser | null => {
  const u = localStorage.getItem(USER_KEY);
  return u ? JSON.parse(u) : null;
};
function saveSession(r: ApiResult) {
  if (r.success && r.session_token) {
    localStorage.setItem(TOKEN_KEY, r.session_token);
    if (r.user) localStorage.setItem(USER_KEY, JSON.stringify(r.user));
  }
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export const requestCode = (email: string) =>
  post('claudia-auth', { action: 'request_code', email: email.trim().toLowerCase() });

export async function verifyCode(email: string, code: string, password: string) {
  const r = await post('claudia-auth', {
    action: 'verify_code', email: email.trim().toLowerCase(), code: code.trim(), password,
  });
  saveSession(r);
  return r;
}

export async function login(email: string, password: string) {
  const r = await post('claudia-auth', { action: 'login', email: email.trim().toLowerCase(), password });
  saveSession(r);
  return r;
}

export async function logout() {
  const t = getToken();
  if (t) await post('claudia-auth', { action: 'logout' }, t);
  clearSession();
}

export async function sendMessage(message: string, sessionId: string) {
  const t = getToken();
  if (!t) return { success: false, message: 'Please sign in.', status: 401 } as ApiResult;
  const r = await post('claudia-chat', { message, session_id: sessionId }, t);
  if (r.status === 401) clearSession(); // expired or revoked: force sign-in again
  return r;
}

export const newSessionId = () => `chat-${crypto.randomUUID()}`;
