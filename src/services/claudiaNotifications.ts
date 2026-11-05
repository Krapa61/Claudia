const API = 'https://krapa61.app.n8n.cloud/webhook/claudia-api';

export type Notification = {
  id: string;
  type: 'payment_proof' | 'job_request';
  title: string;
  detail: string;
  created_at: string;
  document_id?: string; file_name?: string; drive_link?: string;
  tenant_email?: string; suggested_invoice?: string; note?: string;
  request_id?: string; location?: string; priority?: string;
};

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function call<T>(token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success !== true) throw new ApiError(res.status, json.message || 'Request failed');
  return json.data as T;
}

export function ensureDocId(rawId?: string): string {
  if (rawId && /^DOC-\d{8}-[A-Z0-9]{6}$/.test(rawId)) {
    return rawId;
  }
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randStr = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DOC-${dateStr}-${randStr}`;
}

export async function listNotifications(t: string) {
  const res = await call<{ count: number; payment_proofs: number; job_requests: number; notifications: Notification[] }>(t, { action: 'notifications_list' });
  if (res && Array.isArray(res.notifications)) {
    res.notifications = res.notifications.map(n => ({
      ...n,
      document_id: ensureDocId(n.document_id)
    }));
  }
  return res;
}

export const preparePayment = (t: string, p: { document_id: string; invoice_number: string; amount: number; payment_date: string; paid_to: 'BSP' | 'KINA' | 'TISA' | 'CASH' }) =>
  call<{ confirmation_id: string; summary: string; expires_at: string }>(t, { action: 'payment_prepare', ...p });

export const confirmPayment = (t: string, p: { document_id: string; confirmation_id: string; receipt_by: 'claudia' | 'admin' }) =>
  call<{ summary: string; receipt: { by: string; sent: boolean; receipt_number?: string; message: string } }>(t, { action: 'payment_confirm', ...p });

export const cancelPayment = (t: string, confirmation_id: string) =>
  call<{ summary: string }>(t, { action: 'payment_cancel', confirmation_id });

export const rejectProof = (t: string, document_id: string, note: string) =>
  call<{ summary: string }>(t, { action: 'payment_reject', document_id, note });

export const updateJob = (t: string, request_id: string, status: 'in_progress' | 'completed' | 'cancelled', note = '') =>
  call<unknown>(t, { action: 'maintenance_update', request_id, status, note });
