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

export const listDocuments = (t: string) => api(t, { action: 'documents_list' });

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

  return api(token, {
    action: 'upload_file',
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
    file_data_b64: b64,
    purpose,
    note,
  });
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
  return json;
}
