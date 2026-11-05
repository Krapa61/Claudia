const BASE = 'https://krapa61.app.n8n.cloud/webhook';

export type Role = 'management' | 'tenant';
export type Me = { email: string; role: Role; name?: string; is_owner?: boolean };
export type MaintStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
export type Purpose = 'receipt' | 'remittance' | 'maintenance_photo' | 'other';
export class AuthError extends Error {}

async function post(path: string, token: string, body: unknown) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let json: any = {};
  try { json = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 || res.status === 403) throw new AuthError(json.message || 'Please sign in again.');
  if (!res.ok || json.success === false) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

// ---- Claudia App API (fields are sent flat, never inside "params") ----
const api = (token: string, body: Record<string, unknown>) => post('claudia-api', token, body).then(r => r.data);

export const getMe = (t: string) => api(t, { action: 'me' });
export const rentalReport = (t: string, period: 'month' | 'year', year: number, month?: number) =>
  api(t, { action: 'rental_report', period, year, ...(period === 'month' ? { month } : {}) });

export const listMaintenance = (t: string, status?: string) => api(t, { action: 'maintenance_list', ...(status ? { status } : {}) });
export const createMaintenance = (t: string, issue: string, location: string, priority: string) =>
  api(t, { action: 'maintenance_create', issue, location, priority });
export const updateMaintenance = (t: string, request_id: string, status: string, note?: string) =>
  api(t, { action: 'maintenance_update', request_id, status, ...(note ? { note } : {}) });

export function ensureDocId(rawId?: string): string {
  if (rawId && /^DOC-\d{8}-[A-Z0-9]{6}$/.test(rawId)) {
    return rawId;
  }
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randStr = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DOC-${dateStr}-${randStr}`;
}

export const listDocuments = async (t: string) => {
  const d = await api(t, { action: 'documents_list' });
  if (d && Array.isArray(d.documents)) {
    d.documents = d.documents.map((doc: any) => ({ ...doc, document_id: ensureDocId(doc.document_id || doc.id) }));
  }
  return d;
};
export const listPayments = (t: string) => api(t, { action: 'payment_prepare' });
export const getAccountBalance = (t: string) => api(t, { action: 'account_balance' });
export const listNotifications = (t: string) => api(t, { action: 'notifications_list' });

export async function uploadFile(token: string, file: File, purpose: string, note: string) {
  const b64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await api(token, {
    action: 'upload_file',
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
    file_data_b64: b64,
    purpose,
    note,
  });
  if (res) {
    res.document_id = ensureDocId(res.document_id);
  }
  return res;
}

export async function uploadDocument(token: string, file: File, purpose: string, note: string) {
  const b64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await fetch(`${BASE}/claudia-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      file_base64: b64,
      mime_type: file.type || 'application/octet-stream',
      file_name: file.name,
      purpose,
      note: (note || '').slice(0, 500),
    }),
  });
  let json: any = {};
  try { json = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 || res.status === 403) throw new AuthError(json.message || 'Please sign in again.');
  if (!res.ok || json.success === false) {
    const err: any = new Error(json.message || `Upload failed (${res.status})`);
    err.status = res.status;
    err.json = json;
    throw err;
  }
  if (json) {
    json.document_id = ensureDocId(json.document_id);
  }
  return json;
}

export const driveSearch = (t: string, query: string) => api(t, { action: 'documents_list', query });
export const driveList = (t: string, folderId: string = 'root') => api(t, { action: 'documents_list', folder_id: folderId });
export const driveDownload = (t: string, fileId: string, exportFormat?: string) =>
  api(t, { action: 'documents_list', file_id: fileId, ...(exportFormat ? { export_format: exportFormat } : {}) });

export async function driveUpload(token: string, parentId: string, file: File) {
  const b64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return api(token, {
    action: 'upload_file',
    parent_id: parentId,
    name: file.name,
    mime_type: file.type || 'application/octet-stream',
    file_base64: b64,
  });
}

export const driveShareAdd = (t: string, fileId: string, email: string, role: string = 'reader') =>
  api(t, { action: 'documents_list', file_id: fileId, email, role });

export const driveConfirm = (t: string, confirmationId: string, confirmText: string) =>
  api(t, { action: 'payment_confirm', confirmation_id: confirmationId, confirm_text: confirmText });

export const driveCancel = (t: string, confirmationId: string) =>
  api(t, { action: 'payment_cancel', confirmation_id: confirmationId });

export const paymentReject = (t: string, confirmationId: string) =>
  api(t, { action: 'payment_reject', confirmation_id: confirmationId });

