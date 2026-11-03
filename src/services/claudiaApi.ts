const PROXY_BASE = '/api/proxy/claudia';
const DIRECT_BASE = 'https://krapa61.app.n8n.cloud/webhook';
const TOKEN_KEY = 'claudia_session_token';
const USER_KEY = 'claudia_user';
const N8N_URL_KEY = 'claudia_n8n_url';
const N8N_SECRET_KEY = 'claudia_n8n_secret';

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

// Memory fallback to ensure zero crashes in sandboxed iframes or private browsing
const memoryStore: Record<string, string> = {};

function safeGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    console.warn('[Storage] localStorage read restricted, using in-memory fallback', e);
  }
  return memoryStore[key] || null;
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn('[Storage] localStorage write restricted, using in-memory fallback', e);
  }
  memoryStore[key] = value;
}

function safeRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('[Storage] localStorage remove restricted, using in-memory fallback', e);
  }
  delete memoryStore[key];
}

export const getN8nUrl = () => safeGet(N8N_URL_KEY) || '';
export const setN8nUrl = (url: string) => {
  if (url) safeSet(N8N_URL_KEY, url.trim());
  else safeRemove(N8N_URL_KEY);
};

export const getN8nSecret = () => safeGet(N8N_SECRET_KEY) || '';
export const setN8nSecret = (secret: string) => {
  if (secret) safeSet(N8N_SECRET_KEY, secret.trim());
  else safeRemove(N8N_SECRET_KEY);
};

export const getToken = () => safeGet(TOKEN_KEY);
export const getUser = (): ClaudiaUser | null => {
  const s = safeGet(USER_KEY);
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
export const setSession = (token: string, user: ClaudiaUser) => {
  safeSet(TOKEN_KEY, token);
  safeSet(USER_KEY, JSON.stringify(user));
};
export const clearSession = () => {
  safeRemove(TOKEN_KEY);
  safeRemove(USER_KEY);
};

async function post(endpoint: string, body: unknown, token?: string): Promise<ApiResult> {
  const customUrl = getN8nUrl();
  const customSecret = getN8nSecret();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(customUrl ? { 'x-n8n-webhook-url': customUrl } : {}),
    ...(customSecret ? { 'x-n8n-secret': customSecret } : {}),
  };

  // Try server proxy first, then direct n8n webhook
  const urls = [
    `${PROXY_BASE}/${endpoint}`,
    customUrl || `${DIRECT_BASE}/${endpoint}`
  ];

  let lastError = '';
  for (const targetUrl of urls) {
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      let rawText = '';
      try {
        rawText = await res.text();
      } catch {
        rawText = '';
      }

      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { message: rawText };
      }

      if (res.ok || (res.status !== 502 && res.status !== 404)) {
        return {
          success: res.ok && data.success !== false,
          message: data.message || data.error || (res.ok ? '' : `Request failed (${res.status}).`),
          ...data,
          status: res.status,
        };
      }
      lastError = data.message || `HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err.message || 'Network error';
    }
  }

  return { success: false, message: `Cannot reach Claudia service: ${lastError}`, status: 0 };
}

export async function login(email: string, password: string): Promise<ApiResult> {
  const r = await post('claudia-auth', { action: 'login', email, password });
  if (r.success && r.session_token && r.user) {
    setSession(r.session_token, r.user);
  }
  return r;
}

export async function requestCode(email: string): Promise<ApiResult> {
  return post('claudia-auth', { action: 'request_code', email });
}

export async function verifyCode(email: string, code: string, newPassword: string): Promise<ApiResult> {
  const r = await post('claudia-auth', {
    action: 'verify_code',
    email,
    code,
    new_password: newPassword,
    password: newPassword,
  });
  if (r.success && r.session_token && r.user) {
    setSession(r.session_token, r.user);
  }
  return r;
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    await post('claudia-auth', { action: 'logout' }, token);
  }
  clearSession();
}

export async function sendMessage(message: string, sessionId: string, token?: string): Promise<ApiResult> {
  const directUrl = 'https://krapa61.app.n8n.cloud/webhook/claudia-chat';
  const authToken = token || getToken();
  const user = getUser();
  const safeEmail = (user?.email || 'user').replace(/[^a-zA-Z0-9_\-\.:]/g, '_');
  const stableSessionId = sessionId && sessionId.length <= 100 && /^[a-zA-Z0-9_\-\.:]+$/.test(sessionId)
    ? sessionId
    : `chat-${safeEmail}`;

  try {
    const res = await fetch(directUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        message: message.trim(),
        session_id: stableSessionId,
      }),
    });

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (res.status === 401) {
      clearSession();
      return {
        success: false,
        message: data.message || 'Unauthorized',
        status: 401,
      };
    }

    if (res.status === 400 || res.status === 413) {
      return {
        success: false,
        message: data.message || data.error || 'Bad request or payload too large.',
        status: res.status,
      };
    }

    if (res.status >= 500) {
      return {
        success: false,
        message: "Claudia couldn't answer right now, please try again.",
        status: res.status,
      };
    }

    const replyMsg = data.message || data.response || data.output || data.text || data.reply || (res.ok ? '' : `Request failed (${res.status}).`);
    return {
      success: res.ok && data.success !== false,
      message: replyMsg,
      ...data,
      status: res.status,
    };
  } catch (err: any) {
    return {
      success: false,
      message: "Claudia couldn't answer right now, please try again.",
      status: 0,
    };
  }
}

export const newSessionId = () => 'sess_' + Math.random().toString(36).slice(2, 11);
