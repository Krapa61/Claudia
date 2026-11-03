import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, Notification, listNotifications, preparePayment, confirmPayment, cancelPayment, rejectProof, updateJob } from '../services/claudiaNotifications';

type Props = { token: string; role: string; onSignOut: () => void; activeTab?: string };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Port_Moresby' });

export function NotificationBell({ token, role, onSignOut, activeTab }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { const d = await listNotifications(token); setItems(d.notifications); setError(''); }
    catch (e) { if (e instanceof ApiError && e.status === 401) onSignOut(); else setError((e as Error).message); }
  }, [token, onSignOut]);

  useEffect(() => {
    if (role !== 'management') return;
    load();
    const id = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(id);
  }, [role, load]);

  // When a new page/tab is selected, the notification popup must disappear
  useEffect(() => {
    setOpen(false);
  }, [activeTab]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (role !== 'management') return null;

  return (
    <div className="relative" ref={containerRef}>
      <button 
        aria-label="Notifications" 
        onClick={() => setOpen(!open)} 
        className="relative p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white transition flex items-center justify-center text-sm border border-gray-700/60 shadow-sm"
        title="Notifications"
      >
        🔔
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full text-[10px] font-bold px-1.5 py-0.2 shadow">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div 
          className="absolute right-0 mt-2.5 w-96 max-w-[92vw] sm:w-[420px] bg-[#2b2f36] border border-gray-700 text-gray-100 max-h-[80vh] flex flex-col shadow-2xl overflow-hidden rounded-2xl z-[99999] animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="p-3.5 border-b border-gray-700 bg-[#22252a] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔔</span>
              <h2 className="font-bold text-xs text-white uppercase tracking-wider">Notifications & Approvals</h2>
              {items.length > 0 && (
                <span className="bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {items.length} pending
                </span>
              )}
            </div>
            <button 
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 text-xs font-bold transition"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {error && (
              <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-xl">
                {error}
              </div>
            )}
            {items.length === 0 && !error && (
              <div className="text-center py-10 text-gray-400 text-xs">
                No new notifications. All caught up!
              </div>
            )}
            {items.map(n => n.type === 'payment_proof'
              ? <PaymentCard key={n.id} n={n} token={token} onDone={load} />
              : <JobCard key={n.id} n={n} token={token} onDone={load} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentCard({ n, token, onDone }: { n: Notification; token: string; onDone: () => void }) {
  const [invoice, setInvoice] = useState(n.suggested_invoice || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [paidTo, setPaidTo] = useState<'BSP' | 'KINA' | 'TISA' | 'CASH' | ''>('');
  const [receiptBy, setReceiptBy] = useState<'claudia' | 'admin' | ''>('');
  const [pending, setPending] = useState<{ id: string; summary: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(''); try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };

  return (
    <div className="bg-[#22252a] border border-gray-700 rounded-2xl p-3.5 text-xs space-y-2.5 shadow-md">
      <div className="flex items-center justify-between">
        <span className="font-bold text-white flex items-center gap-1.5">💰 {n.title}</span>
        <span className="text-[10px] text-gray-400">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {n.note && <p className="text-gray-300 italic bg-gray-800/50 p-2 rounded-xl">"{n.note}"</p>}
      {n.drive_link && (
        <div>
          <a href={n.drive_link} target="_blank" rel="noreferrer" className="text-[#f5a623] hover:underline font-medium">
            View proof document ({n.file_name}) ↗
          </a>
        </div>
      )}

      {!pending ? (
        <div className="space-y-2 pt-1">
          <input 
            placeholder="Invoice no. e.g. INV-1771" 
            value={invoice} 
            onChange={e => setInvoice(e.target.value)} 
            className="w-full bg-[#1e2024] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#f5a623]" 
          />
          <input 
            placeholder="Amount (K)" 
            type="number" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            className="w-full bg-[#1e2024] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#f5a623]" 
          />
          <input 
            type="date" 
            value={date} 
            max={today()} 
            onChange={e => setDate(e.target.value)} 
            className="w-full bg-[#1e2024] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#f5a623]" 
          />
          <div className="space-y-1">
            <span className="text-gray-400 text-[10px] uppercase font-semibold">Paid to:</span>
            <div className="flex flex-wrap gap-2.5">
              {(['BSP', 'KINA', 'TISA', 'CASH'] as const).map(b => (
                <label key={b} className="flex items-center gap-1 cursor-pointer text-gray-200">
                  <input type="radio" name={`paidTo-${n.id}`} checked={paidTo === b} onChange={() => setPaidTo(b)} className="accent-[#f5a623]" /> {b}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button 
              disabled={busy || !invoice || !(Number(amount) > 0) || !paidTo}
              onClick={() => run(async () => {
                const r = await preparePayment(token, { document_id: n.document_id!, invoice_number: invoice, amount: Number(amount), payment_date: date, paid_to: paidTo as 'BSP' });
                setPending({ id: r.confirmation_id, summary: r.summary });
              })} 
              className="flex-1 bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold px-3 py-2 rounded-xl text-xs transition shadow disabled:opacity-50"
            >
              Check payment
            </button>
            <button 
              disabled={busy} 
              onClick={() => {
                const reason = window.prompt('Reason for rejecting?') || '';
                run(async () => { const r = await rejectProof(token, n.document_id!, reason); setMsg(r.summary); onDone(); });
              }} 
              className="bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 px-3 py-2 rounded-xl text-xs font-semibold transition"
            >
              Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 pt-1 bg-[#1e2024] p-3 rounded-xl border border-gray-700">
          <p className="text-gray-200 font-medium"><strong>Confirm:</strong> {pending.summary}</p>
          <div className="space-y-1 pt-1">
            <span className="text-gray-400 text-[10px] uppercase font-semibold">Who sends the receipt?</span>
            <label className="flex items-center gap-1.5 cursor-pointer text-gray-200">
              <input type="radio" name={`receiptBy-${n.id}`} checked={receiptBy === 'claudia'} onChange={() => setReceiptBy('claudia')} className="accent-[#f5a623]" /> Claudia emails the receipt now
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-gray-200">
              <input type="radio" name={`receiptBy-${n.id}`} checked={receiptBy === 'admin'} onChange={() => setReceiptBy('admin')} className="accent-[#f5a623]" /> Admin will send it from Xero
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button 
              disabled={busy || !receiptBy} 
              onClick={() => run(async () => {
                const r = await confirmPayment(token, { document_id: n.document_id!, confirmation_id: pending.id, receipt_by: receiptBy as 'claudia' });
                setMsg(r.summary + ' ' + r.receipt.message); setTimeout(onDone, 2500);
              })} 
              className="flex-1 bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold px-3 py-2 rounded-xl text-xs transition shadow disabled:opacity-50"
            >
              Confirm & record in Xero
            </button>
            <button 
              disabled={busy} 
              onClick={() => run(async () => { await cancelPayment(token, pending.id); setPending(null); setMsg('Cancelled. Nothing was recorded.'); })} 
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-xl text-xs font-semibold transition border border-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-[#f5a623] font-medium pt-1">{msg}</p>}
    </div>
  );
}

function JobCard({ n, token, onDone }: { n: Notification; token: string; onDone: () => void }) {
  const [msg, setMsg] = useState('');
  const set = async (s: 'in_progress' | 'completed' | 'cancelled') => {
    try { await updateJob(token, n.request_id!, s); setMsg('Updated. The tenant has been emailed.'); setTimeout(onDone, 1500); }
    catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="bg-[#22252a] border border-gray-700 rounded-2xl p-3.5 text-xs space-y-2.5 shadow-md">
      <div className="flex items-center justify-between">
        <span className="font-bold text-white flex items-center gap-1.5">
          🔧 {n.title} 
          {n.priority === 'urgent' || n.priority === 'high' ? <span className="text-red-400 font-semibold text-[10px] bg-red-950/60 px-1.5 py-0.5 rounded border border-red-900">({n.priority})</span> : null}
        </span>
        <span className="text-[10px] text-gray-400">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="text-[10px] text-[#f5a623] font-mono">{n.request_id}</div>
      <p className="text-gray-200">{n.detail}</p>
      {n.location && <div className="text-gray-400 text-[11px]">📍 {n.location}</div>}
      <div className="flex gap-2 pt-1.5">
        <button 
          onClick={() => set('in_progress')} 
          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-xl font-semibold transition"
        >
          Start
        </button>
        <button 
          onClick={() => set('completed')} 
          className="px-3 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded-xl font-semibold transition"
        >
          Complete
        </button>
        <button 
          onClick={() => set('cancelled')} 
          className="px-3 py-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded-xl font-semibold transition"
        >
          Cancel
        </button>
      </div>
      {msg && <p className="text-emerald-300 font-medium pt-1">{msg}</p>}
    </div>
  );
}
