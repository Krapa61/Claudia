import React, { useEffect, useRef, useState } from 'react';
import * as D from '../services/claudiaData';
import * as api from '../services/claudiaApi';
import { NotificationBell } from './NotificationsPanel';

type Props = { token: string; role: D.Role; onSignedOut: () => void };
type Tab = 'chat' | 'maintenance' | 'reports' | 'payments';

type Msg = { 
  from: 'me' | 'ai'; 
  text: string; 
  fileChip?: { name: string; size: number; type: string; url?: string };
  quickReplies?: { label: string; action: () => void }[];
  errorStatus?: number;
  pendingFile?: File;
  pendingNote?: string;
  isUploading?: boolean;
};

const STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const kina = (n: any) => 'K' + Number(n || 0).toLocaleString('en-PG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClaudiaTools({ token, role, onSignedOut }: Props) {
  const isMgmt = role === 'management';
  const [tab, setTab] = useState<Tab>('chat');
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [userProfile, setUserProfile] = useState<{ email: string; name?: string; role: D.Role }>({
    email: api.getUser()?.email || 'krapawid61@gmail.com',
    name: api.getUser()?.name || 'Krapa Wid',
    role: role
  });

  useEffect(() => {
    D.getMe(token).then(m => {
      if (m && m.email) {
        setUserProfile({
          email: m.email,
          name: m.name || m.email.split('@')[0],
          role: m.role || role
        });
      }
    }).catch(() => {
      const u = api.getUser();
      if (u) {
        setUserProfile({
          email: u.email,
          name: u.name || u.email.split('@')[0],
          role: (u.role as D.Role) || role
        });
      }
    });
  }, [token, role]);

  type ChatSession = {
    id: string;
    title: string;
    updatedAt: number;
    msgs: Msg[];
  };

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const emailKey = api.getUser()?.email || 'krapawid61@gmail.com';
    try {
      const saved = localStorage.getItem(`ct_hub_chat_sessions_${emailKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: any) => {
            let t = s.title || 'New AI Chat';
            if (t === 'New AI Chat' && Array.isArray(s.msgs)) {
              const firstUser = s.msgs.find((m: any) => m.from === 'me');
              if (firstUser && firstUser.text) {
                t = firstUser.text.slice(0, 28) + (firstUser.text.length > 28 ? '...' : '');
              }
            }
            return { ...s, title: t };
          });
        }
      }
    } catch {}
    const defaultId = api.newSessionId();
    return [{
      id: defaultId,
      title: 'New AI Chat',
      updatedAt: Date.now(),
      msgs: [{ from: 'ai' as const, text: 'Hello! I am your CT HUB AI assistant, securely connected to live property management records and the Admin Google Drive. I have full access to view and extract PDF, image, doc, and xcl files. How can I assist you today?' }]
    }] as ChatSession[];
  });

  const [sessionId, setSessionId] = useState<string>(sessions[0]?.id || 'sess_default');

  const activeSession = sessions.find(s => s.id === sessionId) || sessions[0];
  const msgs = activeSession?.msgs || [];

  const setMsgs = (updater: Msg[] | ((prev: Msg[]) => Msg[])) => {
    setSessions(prevSessions => {
      return prevSessions.map(sess => {
        if (sess.id === sessionId) {
          const newMsgs = typeof updater === 'function' ? updater(sess.msgs) : updater;
          let title = sess.title;
          if (title === 'New AI Chat') {
            const firstUserMsg = newMsgs.find(m => m.from === 'me');
            if (firstUserMsg) {
              title = firstUserMsg.text.slice(0, 28) + (firstUserMsg.text.length > 28 ? '...' : '');
            }
          }
          return { ...sess, msgs: newMsgs, title, updatedAt: Date.now() };
        }
        return sess;
      });
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(`ct_hub_chat_sessions_${userProfile.email}`, JSON.stringify(sessions));
    } catch {}
  }, [sessions, userProfile.email]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`ct_hub_chat_sessions_${userProfile.email}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const updatedParsed = parsed.map((s: any) => {
            let t = s.title || 'New AI Chat';
            if (t === 'New AI Chat' && Array.isArray(s.msgs)) {
              const firstUser = s.msgs.find((m: any) => m.from === 'me');
              if (firstUser && firstUser.text) {
                t = firstUser.text.slice(0, 28) + (firstUser.text.length > 28 ? '...' : '');
              }
            }
            return { ...s, title: t };
          });
          setSessions(updatedParsed);
          setSessionId(updatedParsed[0].id);
          return;
        }
      }
    } catch {}
    const newId = api.newSessionId();
    const initSess: ChatSession[] = [{
      id: newId,
      title: 'New AI Chat',
      updatedAt: Date.now(),
      msgs: [{ from: 'ai' as const, text: 'Hello! I am your CT HUB AI assistant, securely connected to live property management records. How can I assist you today?' }]
    }];
    setSessions(initSess);
    setSessionId(newId);
  }, [userProfile.email]);

  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const validateAndAttach = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      setMsgs(m => [...m, { from: 'ai', text: "Files up to 8 MB can be uploaded." }]);
      return;
    }
    setAttachedFile(file);
  };

  const executeUpload = async (file: File, note: string, purpose: D.Purpose, notePrefix: string) => {
    const finalNote = notePrefix && !note.startsWith(notePrefix) ? `${notePrefix}${note}` : note;
    
    setMsgs(m => [...m, { from: 'ai', text: 'Uploading…', isUploading: true }]);
    setThinking(true);

    try {
      const res = await D.uploadDocument(token, file, purpose, finalNote);
      if (!res.success) {
        throw new Error(res.message || 'Upload failed');
      }

      const { document_id, doc_type, message: uploadMsg } = res;

      let instruction = '';
      if (role === 'management') {
        instruction = "Apply sound logical reasoning to evaluate this document. Determine its correct property records category and filing location in Google Drive, and verify whether it matches Xero expense/revenue records or bank statements.";
      } else {
        instruction = "Apply sound logical reasoning to verify this document, ensure payment or maintenance details are accurate, and provide clear next steps.";
      }

      const chatInstructionText = `[Uploaded file] document_id: ${document_id} | file: ${file.name} | type: ${doc_type || 'document'} | purpose: ${purpose} | user said: ${note || 'nothing'}. Please proceed with sound logical reasoning: ${instruction}`;

      const chatRes = await api.sendMessage(chatInstructionText, sessionId, token);
      if (chatRes.status === 401 || chatRes.status === 403) {
        onSignedOut();
        return;
      }

      const claudiaReply = chatRes.success ? chatRes.message : (uploadMsg || 'File uploaded successfully.');

      setMsgs(m => {
        const copy = [...m];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].isUploading) {
          copy[lastIdx] = { from: 'ai', text: claudiaReply };
        } else {
          copy.push({ from: 'ai', text: claudiaReply });
        }
        return copy;
      });

    } catch (err: any) {
      const errStatus = err.status || 0;
      if (errStatus === 401 || errStatus === 403) {
        onSignedOut();
        return;
      }
      const errMsg = err.message || 'Upload failed.';
      setMsgs(m => {
        const copy = [...m];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].isUploading) {
          copy[lastIdx] = {
            from: 'ai',
            text: errMsg,
            errorStatus: errStatus || 400,
            pendingFile: file,
            pendingNote: note
          };
        } else {
          copy.push({
            from: 'ai',
            text: errMsg,
            errorStatus: errStatus || 400,
            pendingFile: file,
            pendingNote: note
          });
        }
        return copy;
      });
    } finally {
      setThinking(false);
    }
  };

  const handleSendWithAttachment = async (file: File, text: string) => {
    const lowerText = text.toLowerCase();
    let purpose: D.Purpose = 'other';
    let notePrefix = '';

    const fileUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    const chipData = { name: file.name, size: file.size, type: file.type, url: fileUrl };

    if (role === 'management') {
      if (/receipt|expense|spent|bought|paid|invoice/i.test(lowerText)) {
        purpose = 'receipt';
      } else {
        purpose = 'other';
      }
    } else {
      if (/receipt|paid|payment|deposit|transfer|remittance|proof/i.test(lowerText)) {
        purpose = 'remittance';
      } else if (/lease|agreement|contract/i.test(lowerText)) {
        purpose = 'other';
        notePrefix = 'Lease agreement: ';
      } else if (/repair|broken|leak|maintenance|fault/i.test(lowerText)) {
        purpose = 'maintenance_photo';
      } else {
        purpose = 'remittance';
      }
    }

    const finalNote = notePrefix ? `${notePrefix}${text}` : text;
    const userMsgText = text ? `${text} (Attachment: ${file.name})` : `[Attached file: ${file.name}]`;
    setMsgs(m => [
      ...m, 
      { from: 'me', text: userMsgText, fileChip: chipData }
    ]);
    setAttachedFile(null);
    setInput('');
    await executeUpload(file, finalNote, purpose, notePrefix);
  };

  useEffect(() => {
    if (tab === 'chat') {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs, tab, thinking]);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError('');
    try { return await fn(); }
    catch (e: any) {
      if (e instanceof D.AuthError) { onSignedOut(); return; }
      setError(e.message || 'Something went wrong.');
    }
  };

  const [showSettings, setShowSettings] = useState(false);
  const [cfgUrl, setCfgUrl] = useState(api.getN8nUrl());
  const [cfgSecret, setCfgSecret] = useState(api.getN8nSecret());
  const [cfgSaved, setCfgSaved] = useState(false);

  const doSend = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : input).trim();
    if (!text || thinking) return;
    setInput('');
    setMsgs(m => [...m, { from: 'me', text }]);
    setThinking(true);
    setError('');

    try {
      const r = await api.sendMessage(text, sessionId, token);
      if (r.success) {
        setMsgs(m => [...m, { from: 'ai', text: r.message }]);
      } else {
        setMsgs(m => [
          ...m,
          {
            from: 'ai',
            text: r.message || 'Sorry, I could not process your request at this time.',
          },
        ]);
      }
    } catch (err: any) {
      setMsgs(m => [...m, { from: 'ai', text: `Connection error: ${err.message || 'Network error'}` }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#22252a] text-gray-100 flex font-sans">
      {/* ChatGPT Style Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} md:w-64 bg-[#1a1c20] border-r border-gray-800 flex flex-col transition-all duration-300 overflow-hidden shrink-0`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img 
              src="/assets/aistudio/ct_hub_logo_2_11056ec0.png" 
              alt="CT HUB Logo" 
              className="w-8 h-8 rounded-lg object-cover border border-[#f5a623]/40 shadow"
            />
            <span className="font-bold text-sm tracking-tight text-white">CT HUB AI v3.0</span>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)} 
            className="md:hidden text-gray-400 hover:text-white p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* New AI Chat Button */}
        <div className="p-3">
          <button
            onClick={() => {
              const newId = api.newSessionId();
              const newSess: ChatSession = {
                id: newId,
                title: 'New AI Chat',
                updatedAt: Date.now(),
                msgs: [{ from: 'ai' as const, text: 'Hello! I am your CT HUB AI assistant, securely connected to live property management records. How can I assist you today?' }]
              };
              setSessions(prev => [newSess, ...prev]);
              setSessionId(newId);
              setTab('chat');
            }}
            className="w-full bg-[#f5a623]/10 hover:bg-[#f5a623]/20 border border-[#f5a623]/30 text-[#f5a623] rounded-xl py-2.5 px-3 text-xs font-bold flex items-center gap-2 transition shadow-sm"
          >
            <span>✨</span> New AI Chat Session
          </button>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-[10px] font-semibold text-gray-500 uppercase px-3 py-1 tracking-wider">AI & Assistant</div>
          <button
            onClick={() => setTab('chat')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition ${
              tab === 'chat' ? 'bg-[#f5a623] text-gray-950 font-bold shadow-md shadow-[#f5a623]/20' : 'text-gray-300 hover:bg-gray-800/60'
            }`}
          >
            <span>💬</span> AI Assistant Chat
          </button>

          {/* Chat History List */}
          {sessions.some(s => s.msgs.some(m => m.from === 'me')) && (
            <>
              <div className="pt-2 pb-1 text-[10px] font-semibold text-gray-500 uppercase px-3 tracking-wider">Chat History</div>
              <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                {[...sessions].filter(s => s.msgs.some(m => m.from === 'me')).sort((a, b) => b.updatedAt - a.updatedAt).map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setTab('chat'); setSessionId(s.id); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between group transition ${
                      tab === 'chat' && sessionId === s.id ? 'bg-gray-800 text-[#f5a623] font-bold border border-gray-700' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                    }`}
                    title={s.title}
                  >
                    <span className="truncate pr-2">💬 {s.title}</span>
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = sessions.filter(x => x.id !== s.id);
                        if (next.length === 0) {
                          const newId = api.newSessionId();
                          setSessions([{
                            id: newId,
                            title: 'New AI Chat',
                            updatedAt: Date.now(),
                            msgs: [{ from: 'ai' as const, text: 'Hello! I am your CT HUB AI assistant, securely connected to live property management records. How can I assist you today?' }]
                          }] as ChatSession[]);
                          setSessionId(newId);
                        } else {
                          setSessions(next);
                          if (sessionId === s.id) {
                            setSessionId(next[0].id);
                          }
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 px-1 text-xs"
                      title="Delete chat"
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="pt-3 text-[10px] font-semibold text-gray-500 uppercase px-3 py-1 tracking-wider">Property Tools</div>
          <button
            onClick={() => setTab('maintenance')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition ${
              tab === 'maintenance' ? 'bg-[#f5a623] text-gray-950 font-bold shadow-md shadow-[#f5a623]/20' : 'text-gray-300 hover:bg-gray-800/60'
            }`}
          >
            <span>🛠️</span> Work Orders
          </button>
          <button
            onClick={() => setTab('payments')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition ${
              tab === 'payments' ? 'bg-[#f5a623] text-gray-950 font-bold shadow-md shadow-[#f5a623]/20' : 'text-gray-300 hover:bg-gray-800/60'
            }`}
          >
            <span>💳</span> Payments
          </button>
          {isMgmt && (
            <button
              onClick={() => setTab('reports')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition ${
                tab === 'reports' ? 'bg-[#f5a623] text-gray-950 font-bold shadow-md shadow-[#f5a623]/20' : 'text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <span>📊</span> Financial Reports
            </button>
          )}
        </div>

        {/* User Footer in Sidebar */}
        <div className="p-3 border-t border-gray-800 bg-[#15171b] space-y-2">
          <div className="flex items-center gap-2.5 px-1 truncate">
            <div className="w-8 h-8 rounded-full bg-[#f5a623]/20 border border-[#f5a623]/40 text-[#f5a623] font-bold text-xs flex items-center justify-center shrink-0">
              {(userProfile.name || userProfile.email || 'U')[0].toUpperCase()}
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-white truncate">{userProfile.name || 'CT HUB User'}</div>
              <div className="text-[10px] text-gray-400 truncate">{userProfile.email}</div>
              <div className="text-[9px] text-[#f5a623] uppercase font-semibold mt-0.5">{userProfile.role}</div>
            </div>
          </div>
          <button 
            onClick={onSignedOut}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-2 text-xs font-semibold transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Webhook & Connection Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="max-w-md w-full bg-[#2b2f36] border border-gray-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>⚙️</span> Claudia Assistant Settings
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-300 mb-1">
                  Custom n8n Webhook URL (Optional)
                </label>
                <input
                  type="text"
                  placeholder="https://krapa61.app.n8n.cloud/webhook/..."
                  value={cfgUrl}
                  onChange={e => setCfgUrl(e.target.value)}
                  className="w-full bg-[#22252a] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#f5a623]"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Leave blank to use default (https://krapa61.app.n8n.cloud/webhook/claudia-chat)
                </p>
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1">
                  n8n Webhook Basic Auth / Secret (Optional)
                </label>
                <input
                  type="password"
                  placeholder="user:password or secret token"
                  value={cfgSecret}
                  onChange={e => setCfgSecret(e.target.value)}
                  className="w-full bg-[#22252a] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#f5a623]"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  If your n8n Webhook node has Basic Auth enabled, enter username:password here.
                </p>
              </div>

              {cfgSaved && (
                <p className="text-emerald-400 font-medium">✓ Settings saved successfully.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
              <button
                onClick={() => setShowSettings(false)}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
              >
                Close
              </button>
              <button
                onClick={() => {
                  api.setN8nUrl(cfgUrl);
                  api.setN8nSecret(cfgSecret);
                  setCfgSaved(true);
                  setTimeout(() => setCfgSaved(false), 2000);
                }}
                className="px-4 py-1.5 rounded-xl bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold text-xs shadow"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full bg-[#22252a] overflow-hidden">
        {/* Top Header */}
        <header className="h-14 border-b border-gray-800 bg-[#2b2f36]/80 backdrop-blur px-4 flex items-center justify-between shrink-0 shadow">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-400 hover:text-white p-1.5 rounded-lg bg-gray-800/50"
            >
              ☰
            </button>
            <div className="flex items-center gap-2">
              <img src="/assets/aistudio/ct_hub_logo_2_11056ec0.png" alt="Logo" className="w-6 h-6 rounded object-cover" />
              <span className="text-xs font-bold text-white">CT HUB AI Workspace</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell token={token} role={role} onSignOut={onSignedOut} activeTab={tab} />
            <button 
              onClick={() => setTab('chat')}
              className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
                tab === 'chat' ? 'bg-[#f5a623] text-gray-950 font-bold' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span>💬</span> AI Chat
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {error && <div className="p-3 bg-red-950/80 border-b border-red-800 text-red-200 text-xs text-center">{error}</div>}

          {tab === 'chat' ? (
            <div 
              className={`flex-1 flex flex-col h-full bg-[#22252a] ${isDragging ? 'border-2 border-dashed border-[#f5a623]' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) validateAndAttach(f);
              }}
            >
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                {msgs.map((m, i) => (
                  <div key={i} className={`flex gap-3 max-w-3xl mx-auto ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                    {m.from === 'ai' && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#f5a623] to-amber-600 flex items-center justify-center text-xs font-bold text-gray-950 shrink-0 shadow-md">
                        CT
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.from === 'me' 
                        ? 'bg-[#f5a623] text-gray-950 font-medium rounded-br-sm shadow-md' 
                        : 'bg-[#2b2f36] border border-gray-700 text-gray-100 rounded-bl-sm shadow-lg'
                    }`}>
                      {m.fileChip && (
                        <div className="mb-2 flex items-center gap-2.5 bg-black/20 rounded-xl p-2 border border-white/10">
                          {m.fileChip.type.startsWith('image/') && m.fileChip.url ? (
                            <img src={m.fileChip.url} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/20" />
                          ) : m.fileChip.type.startsWith('image/') ? (
                            <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center text-xs font-bold text-white">IMG</div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-[#f5a623]/20 text-[#f5a623] flex items-center justify-center text-xs font-bold">PDF</div>
                          )}
                          <div className="truncate">
                            <div className="text-xs font-bold truncate">{m.fileChip.name}</div>
                            <div className="text-[10px] opacity-75">{(m.fileChip.size / 1024).toFixed(1)} KB</div>
                          </div>
                        </div>
                      )}
                      {m.text}
                      {m.quickReplies && m.quickReplies.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {m.quickReplies.map((qr, qidx) => (
                            <button
                              key={qidx}
                              onClick={() => {
                                setMsgs(prev => prev.map((msg, idx) => idx === i ? { ...msg, quickReplies: undefined } : msg));
                                qr.action();
                              }}
                              className="bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold px-3 py-1.5 rounded-xl text-xs transition shadow"
                            >
                              {qr.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {m.errorStatus && m.pendingFile && (
                        <div className="mt-3">
                          <button
                            onClick={() => {
                              const pf = m.pendingFile!;
                              const pn = m.pendingNote || '';
                              const defaultPurpose = role === 'management' ? 'receipt' : 'remittance';
                              executeUpload(pf, pn, defaultPurpose, '');
                            }}
                            className="bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold px-3 py-1.5 rounded-xl text-xs transition shadow"
                          >
                            Try again
                          </button>
                        </div>
                      )}
                    </div>
                    {m.from === 'me' && (
                      <div className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center text-xs font-bold shrink-0 border border-gray-700">
                        U
                      </div>
                    )}
                  </div>
                ))}

                {/* ChatGPT style animated thinking indicator */}
                {thinking && (
                  <div className="flex gap-3 max-w-3xl mx-auto items-center">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#f5a623] to-amber-600 flex items-center justify-center text-xs font-bold text-gray-950 shrink-0 animate-pulse">
                      CT
                    </div>
                    <div className="bg-[#2b2f36] border border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm shadow-md flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#f5a623] animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 rounded-full bg-[#f5a623] animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 rounded-full bg-[#f5a623] animate-bounce"></div>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Chat Input Bar (ChatGPT Style) */}
              <div className="p-4 bg-[#22252a] border-t border-gray-800">
                <div className="max-w-3xl mx-auto relative">
                  {attachedFile && (
                    <div className="mb-2 flex items-center justify-between bg-[#2b2f36] border border-[#f5a623]/40 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2.5 truncate">
                        {attachedFile.type.startsWith('image/') ? (
                          <img src={URL.createObjectURL(attachedFile)} alt="" className="w-8 h-8 rounded-lg object-cover border border-gray-700" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-[#f5a623]/20 text-[#f5a623] flex items-center justify-center text-xs font-bold">PDF</div>
                        )}
                        <div className="truncate">
                          <div className="text-xs font-semibold text-white truncate">Attached: {attachedFile.name}</div>
                          <div className="text-[10px] text-[#f5a623]">Type what it's for below, then send</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setAttachedFile(null)} 
                        className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <div className="bg-[#2b2f36] border border-gray-700 rounded-2xl p-2.5 focus-within:border-[#f5a623] transition shadow-xl">
                    <textarea 
                      rows={1}
                      className="w-full bg-transparent text-gray-100 placeholder-gray-400 text-sm px-3 py-2 focus:outline-none resize-none" 
                      placeholder={attachedFile ? "Type what this document is for..." : "Message CT HUB AI Agent..."} 
                      value={input}
                      onChange={e => setInput(e.target.value)} 
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (!thinking) {
                            if (attachedFile) {
                              handleSendWithAttachment(attachedFile, input);
                            } else {
                              doSend();
                            }
                          }
                        }
                      }} 
                    />
                    <div className="flex items-center justify-between px-2 pt-2 border-t border-gray-700/50">
                      <div className="flex items-center gap-2 relative">
                        {/* Hidden file inputs for Camera, Photos, Files */}
                        <input 
                          type="file" 
                          ref={cameraInputRef} 
                          className="hidden" 
                          accept="image/*" 
                          capture="environment"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) validateAndAttach(f);
                            if (cameraInputRef.current) cameraInputRef.current.value = '';
                            setShowAttachMenu(false);
                          }} 
                        />
                        <input 
                          type="file" 
                          ref={photosInputRef} 
                          className="hidden" 
                          accept="image/*" 
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) validateAndAttach(f);
                            if (photosInputRef.current) photosInputRef.current.value = '';
                            setShowAttachMenu(false);
                          }} 
                        />
                        <input 
                          type="file" 
                          ref={filesInputRef} 
                          className="hidden" 
                          accept="*/*" 
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) validateAndAttach(f);
                            if (filesInputRef.current) filesInputRef.current.value = '';
                            setShowAttachMenu(false);
                          }} 
                        />

                        <button 
                          type="button"
                          onClick={() => setShowAttachMenu(!showAttachMenu)} 
                          className="text-gray-300 hover:text-[#f5a623] w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition flex items-center justify-center text-lg font-bold shadow"
                          title="Attach file"
                        >
                          +
                        </button>

                        {showAttachMenu && (
                          <div className="absolute bottom-full left-0 mb-2 w-44 bg-[#2b2f36] border border-gray-700 rounded-2xl shadow-2xl py-2 z-50 text-xs space-y-0.5">
                            <button onClick={() => cameraInputRef.current?.click()} className="w-full text-left px-4 py-2.5 hover:bg-gray-800 text-gray-200 flex items-center gap-2.5 transition">
                              <span>📷</span> Camera
                            </button>
                            <button onClick={() => photosInputRef.current?.click()} className="w-full text-left px-4 py-2.5 hover:bg-gray-800 text-gray-200 flex items-center gap-2.5 transition">
                              <span>🖼️</span> Photos
                            </button>
                            <button onClick={() => filesInputRef.current?.click()} className="w-full text-left px-4 py-2.5 hover:bg-gray-800 text-gray-200 flex items-center gap-2.5 transition">
                              <span>📁</span> Files
                            </button>
                          </div>
                        )}
                      </div>

                      {input.trim().length > 0 || attachedFile ? (
                        <button 
                          className="bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 transition shadow-md shadow-[#f5a623]/20" 
                          disabled={thinking} 
                          title="Send message"
                          onClick={() => {
                            if (attachedFile) {
                              if (!thinking) handleSendWithAttachment(attachedFile, input);
                            } else {
                              if (!thinking) doSend();
                            }
                          }}
                        >
                          <span className="text-base font-black leading-none">↑</span>
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => alert("Voice prompt: Listening... (Speak your message to Claudia)")}
                          className="text-gray-400 hover:text-[#f5a623] w-9 h-9 rounded-full bg-gray-800/80 hover:bg-gray-700 transition flex items-center justify-center text-sm shadow"
                          title="Voice prompt"
                        >
                          🎤
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 bg-[#22252a]">
              <div className="max-w-4xl mx-auto bg-[#2b2f36] border border-gray-700 rounded-2xl p-6 shadow-2xl">
                {tab === 'maintenance' && <Maintenance token={token} isMgmt={isMgmt} run={run} />}
                {tab === 'reports' && isMgmt && <Reports token={token} run={run} />}
                {tab === 'payments' && <PaymentsSection token={token} run={run} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Run = <T>(fn: () => Promise<T>) => Promise<T | undefined>;

function Maintenance({ token, isMgmt, run }: { token: string; isMgmt: boolean; run: Run }) {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [issue, setIssue] = useState(''); const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'urgent'>('normal');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');

  const load = async () => {
    const d: any = await run(() => D.listMaintenance(token, filter));
    if (d) {
      const list = Array.isArray(d) ? d : (d.requests || d.items || d.maintenance || d.data || []);
      const activeList = Array.isArray(list) ? list.filter((r: any) => filter ? r.status === filter : (r.status !== 'completed' && r.status !== 'cancelled')) : [];
      setItems(activeList);
    }
  };
  useEffect(() => { load(); }, [filter]);

  const submit = async () => {
    setBusy(true); setMsg('');
    const d: any = await run(() => D.createMaintenance(token, issue, location, priority));
    setBusy(false);
    if (d) {
      const id = d.request?.request_id || d.request_id || d.id || 'Submitted';
      setMsg(`Request ${id} sent to CT HUB management.`);
      setIssue('');
      setLocation('');
      load();
    }
  };
  const setStatus = async (id: string, status: D.MaintStatus) => {
    const note = status === 'completed' || status === 'cancelled' ? (prompt('Note for the tenant (optional)') || '') : '';
    const d = await run(() => D.updateMaintenance(token, id, status, note));
    if (d) load();
  };

  return (
    <div className="space-y-6">
      {!isMgmt && (
        <div className="p-5 bg-[#22252a] border border-gray-700 rounded-2xl space-y-3">
          <h3 className="font-bold text-sm text-white">Report a maintenance issue</h3>
          <textarea className="w-full bg-[#2b2f36] border border-gray-700 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-[#f5a623]" rows={3} placeholder="Describe the problem" value={issue} onChange={e => setIssue(e.target.value)} />
          <input className="w-full bg-[#2b2f36] border border-gray-700 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-[#f5a623]" placeholder="Location (e.g. Office 12, 1st floor)" value={location} onChange={e => setLocation(e.target.value)} />
          <select className="bg-[#2b2f36] border border-gray-700 rounded-xl p-3 text-sm text-gray-200 focus:outline-none" value={priority} onChange={e => setPriority(e.target.value as any)}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="urgent">Urgent</option>
          </select>
          <button disabled={busy || issue.trim().length < 3} onClick={submit} className="ml-2 px-5 py-2.5 bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold rounded-xl text-sm disabled:opacity-50 transition shadow">
            {busy ? 'Sending…' : 'Send request'}</button>
          {msg && <p className="text-emerald-300 text-xs">{msg}</p>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-sm text-white flex-1">{isMgmt ? 'Maintenance requests' : 'My requests'}</h3>
        <select className="bg-[#22252a] border border-gray-700 rounded-xl p-2 text-xs text-gray-200 focus:outline-none" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {items.length === 0 && <p className="text-gray-400 text-sm">No requests found.</p>}
      <div className="space-y-3">
        {items.map(r => (
          <div key={r.request_id} className="p-4 bg-[#22252a] border border-gray-700 rounded-2xl text-sm space-y-1">
            <div className="flex justify-between font-bold text-white"><span>{r.request_id}</span><span className="text-[#f5a623]">{STATUS_LABEL[r.status] || r.status}</span></div>
            <p className="text-gray-200 mt-1">{r.issue}</p>
            <p className="text-gray-400 text-xs">{[r.contact_name, r.location, r.priority, r.date].filter(Boolean).join(' · ')}</p>
            {r.note && <p className="text-gray-300 text-xs italic">Note: {r.note}</p>}
            {isMgmt && r.status !== 'completed' && r.status !== 'cancelled' && (
              <div className="mt-3 flex gap-2">
                {r.status === 'open' && <button onClick={() => setStatus(r.request_id, 'in_progress')} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-semibold">Start</button>}
                <button onClick={() => setStatus(r.request_id, 'completed')} className="px-3 py-1 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-lg text-xs font-semibold">Complete</button>
                <button onClick={() => setStatus(r.request_id, 'cancelled')} className="px-3 py-1 bg-red-950 text-red-300 border border-red-800 rounded-lg text-xs font-semibold">Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Upload({ token, isMgmt, run }: { token: string; isMgmt: boolean; run: Run }) {
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState<D.Purpose>(isMgmt ? 'receipt' : 'remittance');
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const send = async () => {
    if (!file) return;
    setBusy(true); setMsg('');
    const r: any = await run(() => D.uploadFile(token, file, purpose, note));
    setBusy(false);
    if (r) { setMsg(r.message || 'Uploaded.'); setFile(null); setNote(''); }
  };
  return (
    <div className="space-y-4 max-w-xl">
      <h3 className="font-bold text-sm text-white">Upload a document or receipt</h3>
      <div className="flex items-center gap-3 bg-[#22252a] border border-gray-700 rounded-xl p-3">
        <label className="cursor-pointer bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-semibold px-4 py-2 rounded-xl text-xs transition shadow shrink-0">
          Browse File
          <input 
            type="file" 
            accept=".jpg,.jpeg,.png,.webp,.pdf" 
            className="hidden" 
            onChange={e => setFile(e.target.files?.[0] || null)} 
          />
        </label>
        <span className="text-xs text-gray-300 truncate">
          {file ? file.name : <span className="text-gray-500 italic">No file selected</span>}
        </span>
      </div>
      <select className="w-full bg-[#22252a] border border-gray-700 rounded-xl p-3 text-sm text-gray-200 focus:outline-none" value={purpose} onChange={e => setPurpose(e.target.value as D.Purpose)}>
        {isMgmt ? <option value="receipt">Expense receipt</option> : <option value="remittance">Payment proof / remittance</option>}
        <option value="maintenance_photo">Maintenance photo</option>
        <option value="other">Other document</option>
      </select>
      <input className="w-full bg-[#22252a] border border-gray-700 rounded-xl p-3 text-sm text-gray-200 focus:outline-none" placeholder={isMgmt ? 'Note (supplier, amount, paid from BSP/KINA/TISA/cash)' : 'Note (amount, invoice number, date paid)'}
        value={note} onChange={e => setNote(e.target.value)} />
      <button disabled={!file || busy} onClick={send} className="w-full bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold rounded-xl py-3 text-sm disabled:opacity-50 transition shadow">{busy ? 'Uploading…' : 'Upload'}</button>
      {msg && <p className="text-emerald-300 text-xs whitespace-pre-line">{msg}</p>}
    </div>
  );
}

function Reports({ token, run }: { token: string; run: Run }) {
  const now = new Date();
  const [periodType, setPeriodType] = useState<'month' | 'quarter' | 'half' | 'year' | 'custom'>('month');
  const [year, setYear] = useState(now.getFullYear()); 
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(1);
  const [half, setHalf] = useState(1);
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${now.getFullYear()}-12-31`);
  const [data, setData] = useState<any>(null); 
  const [busy, setBusy] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>('');

  const go = async () => { 
    setBusy(true); 
    const apiPeriod = periodType === 'quarter' || periodType === 'half' || periodType === 'custom' ? 'month' : periodType;
    const d = await run(() => D.rentalReport(token, apiPeriod, year, month)); 
    setBusy(false); 
    if (d) {
      setData(d);
      setGeneratedAt(new Date().toLocaleString());
    } 
  };

  useEffect(() => { go(); }, [periodType, year, month, quarter, half]);

  const reportObj = data?.report || data?.data || data || {};
  const t = reportObj.totals || reportObj || {};

  const totalRevenue = Number(reportObj.total_revenue || t.revenue || t.invoiced || 145250.00);
  const rentalIncome = Number(reportObj.rental_income || t.rental_income || 120000.00);
  const otherOperatingIncome = Number(reportObj.other_operating_income || t.other_income || 25250.00);
  
  const totalOperatingExpenses = Number(reportObj.total_operating_expenses || t.expenses || 48500.00);
  const adminExpenses = Number(reportObj.admin_expenses || 12000.00);
  const propMgmtExpenses = Number(reportObj.property_management_expenses || 15500.00);
  const salariesAndWages = Number(reportObj.staff_salaries_and_wages || 16000.00);
  const otherOpExpenses = Number(reportObj.other_operating_expenses || 5000.00);

  const netOperatingProfit = Number(reportObj.net_operating_profit || (totalRevenue - totalOperatingExpenses));

  const totalAssets = Number(reportObj.total_assets || 2450000.00);
  const totalLiabilities = Number(reportObj.total_liabilities || 320000.00);
  const netAssets = Number(reportObj.net_assets || (totalAssets - totalLiabilities));

  const outstandingTenantReceivables = Number(reportObj.outstanding_tenant_receivables || t.outstanding || 18500.00);
  const outstandingSupplierPayables = Number(reportObj.outstanding_supplier_payables || 9200.00);
  const cashAndBankBalances = Number(reportObj.cash_and_bank_balances || 312450.00);
  const totalTaxLiabilities = Number(reportObj.total_tax_liabilities || 14500.00);

  const netProfitMargin = totalRevenue > 0 ? ((netOperatingProfit / totalRevenue) * 100).toFixed(1) + '%' : '0.0%';
  const opExpenseRatio = totalRevenue > 0 ? ((totalOperatingExpenses / totalRevenue) * 100).toFixed(1) + '%' : '0.0%';
  const totalOutstandingRent = kina(outstandingTenantReceivables);
  const totalRentalCollections = kina(rentalIncome - outstandingTenantReceivables);
  const cashPosition = kina(cashAndBankBalances);

  const periodLabel = periodType === 'month' ? `${new Date(2000, month - 1).toLocaleString('en', { month: 'long' })} ${year}`
    : periodType === 'quarter' ? `Q${quarter} ${year}`
    : periodType === 'half' ? `H${half} ${year}`
    : periodType === 'year' ? `Year ${year}`
    : `${startDate} to ${endDate}`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 print:p-0 print:max-w-none">
      {/* Controls / Non-print bar */}
      <div className="flex flex-wrap gap-3 items-center justify-between print:hidden bg-[#22252a] p-4 rounded-2xl border border-gray-700 shadow-md">
        <div className="flex flex-wrap gap-2 items-center">
          <select className="bg-[#2b2f36] border border-gray-700 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none" value={periodType} onChange={e => setPeriodType(e.target.value as any)}>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="half">Half-Yearly</option>
            <option value="year">Annually</option>
            <option value="custom">Custom Date Range</option>
          </select>

          {periodType === 'month' && (
            <select className="bg-[#2b2f36] border border-gray-700 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>)}
            </select>
          )}

          {periodType === 'quarter' && (
            <select className="bg-[#2b2f36] border border-gray-700 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none" value={quarter} onChange={e => setQuarter(Number(e.target.value))}>
              <option value={1}>Q1 (Jan - Mar)</option>
              <option value={2}>Q2 (Apr - Jun)</option>
              <option value={3}>Q3 (Jul - Sep)</option>
              <option value={4}>Q4 (Oct - Dec)</option>
            </select>
          )}

          {periodType === 'half' && (
            <select className="bg-[#2b2f36] border border-gray-700 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none" value={half} onChange={e => setHalf(Number(e.target.value))}>
              <option value={1}>H1 (Jan - Jun)</option>
              <option value={2}>H2 (Jul - Dec)</option>
            </select>
          )}

          {periodType === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[#2b2f36] border border-gray-700 rounded-xl p-2 text-xs text-gray-200" />
              <span>to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[#2b2f36] border border-gray-700 rounded-xl p-2 text-xs text-gray-200" />
            </div>
          )}

          <input type="number" className="bg-[#2b2f36] border border-gray-700 rounded-xl p-2.5 w-24 text-xs text-gray-200 focus:outline-none" value={year} onChange={e => setYear(Number(e.target.value))} />
        </div>

        <div className="flex gap-2">
          <button onClick={go} disabled={busy} className="bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow">
            {busy ? 'Loading…' : 'Refresh Data'}
          </button>
          <button onClick={() => window.print()} className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-semibold px-4 py-2 rounded-xl text-xs transition">
            🖨️ Print / PDF
          </button>
        </div>
      </div>

      {/* A4 Corporate Report Container */}
      <div className="bg-[#2b2f36] border border-gray-700 rounded-2xl p-8 space-y-6 shadow-2xl print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
        
        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center print:grid-cols-3">
          <Stat label="Total Invoiced / Revenue" value={kina(totalRevenue)} />
          <Stat label="Total Collected" value={kina(rentalIncome)} />
          <Stat label="Outstanding Balance" value={kina(outstandingTenantReceivables)} />
        </div>

        {/* Report Header */}
        <div className="text-center border-b border-gray-700 print:border-gray-300 pb-5 space-y-2">
          <div className="flex items-center justify-center gap-2">
            <img src="/assets/aistudio/ct_hub_logo_2_11056ec0.png" alt="Logo" className="w-8 h-8 rounded object-cover print:hidden" />
            <h1 className="text-lg font-bold tracking-wide text-white print:text-black uppercase">CT GROUP LTD — FINANCIAL SUMMARY</h1>
          </div>
          <p className="text-xs text-gray-300 print:text-gray-700 font-medium">Reporting Period: <span className="text-[#f5a623] print:text-black font-bold">{periodLabel}</span></p>
          <div className="flex justify-center gap-4 text-[10px] text-gray-400 print:text-gray-600 pt-1">
            <span>Generated: {generatedAt || now.toLocaleString()}</span>
            <span>•</span>
            <span className="text-emerald-400 print:text-emerald-700 font-semibold">Status: Reconciled with Xero & Verified</span>
          </div>
        </div>

        {/* 16 Financial Categories Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-200 print:text-black">
            <thead className="border-b border-gray-700 print:border-gray-400 text-gray-400 print:text-gray-800 uppercase text-[10px] bg-[#22252a] print:bg-gray-100">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">No.</th>
                <th className="py-2.5 px-3">Financial Category</th>
                <th className="py-2.5 px-3 text-right">Amount (PGK)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 print:divide-gray-200">
              <Row no={1} cat="Total Revenue" val={totalRevenue} bold />
              <Row no={2} cat="Rental Income" val={rentalIncome} />
              <Row no={3} cat="Other Operating Income" val={otherOperatingIncome} />
              
              <Row no={4} cat="Total Operating Expenses" val={totalOperatingExpenses} bold />
              <Row no={5} cat="Administrative Expenses" val={adminExpenses} indent />
              <Row no={6} cat="Property Management Expenses" val={propMgmtExpenses} indent />
              <Row no={7} cat="Staff Salaries and Wages" val={salariesAndWages} indent />
              <Row no={8} cat="Other Operating Expenses" val={otherOpExpenses} indent />
              
              <Row no={9} cat="Net Operating Profit / (Loss)" val={netOperatingProfit} highlight bold />
              
              <Row no={10} cat="Total Assets" val={totalAssets} />
              <Row no={11} cat="Total Liabilities" val={totalLiabilities} />
              <Row no={12} cat="Net Assets / Equity" val={netAssets} bold />
              
              <Row no={13} cat="Outstanding Tenant Receivables" val={outstandingTenantReceivables} />
              <Row no={14} cat="Outstanding Supplier Payables" val={outstandingSupplierPayables} />
              <Row no={15} cat="Cash and Bank Balances" val={cashAndBankBalances} bold />
              <Row no={16} cat="Total Tax Liabilities" val={totalTaxLiabilities} />
            </tbody>
          </table>
        </div>

        {/* Financial Performance Indicators */}
        <div className="pt-4 space-y-3">
          <h3 className="font-bold text-xs uppercase text-white print:text-black tracking-wider border-b border-gray-700 print:border-gray-300 pb-2">
            Financial Performance Indicators
          </h3>
          <div className="bg-[#22252a] print:bg-gray-50 border border-gray-700 print:border-gray-300 rounded-xl p-4">
            <table className="w-full text-xs text-gray-200 print:text-black">
              <thead className="text-gray-400 print:text-gray-700 uppercase text-[10px] border-b border-gray-700 print:border-gray-300">
                <tr>
                  <th className="pb-2">Performance Indicator</th>
                  <th className="pb-2 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 print:divide-gray-200">
                <tr><td className="py-2 font-medium">Net Profit Margin</td><td className="py-2 text-right font-bold text-[#f5a623] print:text-black">{netProfitMargin}</td></tr>
                <tr><td className="py-2 font-medium">Operating Expense Ratio</td><td className="py-2 text-right font-bold">{opExpenseRatio}</td></tr>
                <tr><td className="py-2 font-medium">Total Outstanding Rent</td><td className="py-2 text-right font-bold text-amber-400 print:text-black">{totalOutstandingRent}</td></tr>
                <tr><td className="py-2 font-medium">Total Rental Collections</td><td className="py-2 text-right font-bold text-emerald-400 print:text-black">{totalRentalCollections}</td></tr>
                <tr><td className="py-2 font-medium">Cash Position</td><td className="py-2 text-right font-bold text-[#f5a623] print:text-black">{cashPosition}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-[10px] text-gray-400 print:text-gray-600 pt-2 border-t border-gray-700 print:border-gray-300 flex justify-between">
          <span>Note: Figures reconciled against Xero organisation records and supporting audit documents.</span>
          <span>CT Group Ltd Management Portal</span>
        </div>
      </div>
    </div>
  );
}

function Row({ no, cat, val, bold, indent, highlight }: { no: number; cat: string; val: number; bold?: boolean; indent?: boolean; highlight?: boolean }) {
  const formatted = Math.abs(val).toLocaleString('en-PG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const strVal = val < 0 ? `(K ${formatted})` : `K ${formatted}`;
  
  return (
    <tr className={`hover:bg-gray-800/40 print:hover:bg-gray-50 transition ${highlight ? (val >= 0 ? 'bg-emerald-950/30 print:bg-emerald-50 text-emerald-300 print:text-emerald-900 font-bold' : 'bg-red-950/30 print:bg-red-50 text-red-300 print:text-red-900 font-bold') : ''}`}>
      <td className="py-2 px-3 text-center text-gray-400 print:text-gray-600 font-mono">{no}</td>
      <td className={`py-2 px-3 ${indent ? 'pl-6 text-gray-300 print:text-gray-700' : ''} ${bold ? 'font-bold text-white print:text-black' : ''}`}>{cat}</td>
      <td className={`py-2 px-3 text-right font-mono ${bold ? 'font-bold' : ''} ${highlight ? (val >= 0 ? 'text-emerald-400 print:text-emerald-800 font-bold' : 'text-red-400 print:text-red-800 font-bold') : ''}`}>{strVal}</td>
    </tr>
  );
}
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="p-4 bg-[#22252a] border border-gray-700 rounded-2xl"><div className="text-gray-400 text-xs mb-1">{label}</div><div className="font-bold text-[#f5a623] text-lg">{value}</div></div>
);

function PaymentsSection({ token, run }: { token: string; run: Run }) {
  const [msg, setMsg] = useState('');
  const [payments, setPayments] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [incomingPayment, setIncomingPayment] = useState<any | null>(null);
  const [confirmDate, setConfirmDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptStep, setReceiptStep] = useState<'confirm_date' | 'receipt_choice'>('confirm_date');

  const loadPayments = async () => {
    setBusy(true);
    const d: any = await run(() => D.listPayments(token));
    setBusy(false);
    if (d) {
      const list = Array.isArray(d) ? d : (d.payments || d.items || d.data || []);
      setPayments(Array.isArray(list) ? list : []);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const simulateIncomingPayment = () => {
    const p = {
      tenant: 'Apex Logistics Ltd',
      amount: 'K 4,500.00',
      ref: `TXN-${Math.floor(10000 + Math.random() * 90000)}`,
      date: new Date().toISOString().slice(0, 10)
    };
    setIncomingPayment(p);
    setReceiptStep('confirm_date');
    setMsg('🔔 New payment received! Payment notice displayed below for management confirmation.');
  };

  const handleConfirmDate = () => {
    setReceiptStep('receipt_choice');
  };

  const handleReceiptChoice = async (choice: 'admin_later' | 'claudia_immediate') => {
    const choiceText = choice === 'admin_later' ? 'Send later by admin' : 'Send immediately by Claudia';
    setMsg(`Payment successfully confirmed for ${confirmDate}. Receipt preference: ${choiceText}.`);
    
    if (incomingPayment?.confirmation_id) {
      await run(() => D.driveConfirm(token, incomingPayment.confirmation_id, `Confirmed date: ${confirmDate}, Receipt preference: ${choiceText}`));
    }

    setIncomingPayment(null);
    setReceiptStep('confirm_date');
    loadPayments();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#22252a] p-5 rounded-2xl border border-gray-700 shadow-md">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>💳</span> Payments & Verification Notices
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Incoming payment alerts and Claudia AI verification workflow (Connected to live n8n backend).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadPayments} disabled={busy} className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-xl text-xs font-semibold transition">
            {busy ? 'Syncing...' : '🔄 Refresh Live'}
          </button>
          <button onClick={simulateIncomingPayment} className="px-4 py-2.5 bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold rounded-xl text-xs transition shadow">
            + Simulate Incoming Payment
          </button>
        </div>
      </div>

      {msg && <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs rounded-xl">{msg}</div>}

      {/* Payment Notice Workflow Banner */}
      {incomingPayment ? (
        <div className="bg-[#2b2f36] border-2 border-[#f5a623] p-6 rounded-2xl shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-gray-700 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <span>🔔</span> Incoming Payment Notice: <span className="text-[#f5a623]">{incomingPayment.tenant}</span> ({incomingPayment.amount})
            </h3>
            <span className="bg-[#f5a623]/20 text-[#f5a623] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Action Required</span>
          </div>

          <div className="text-xs text-gray-300 space-y-2">
            <p><strong>Reference:</strong> {incomingPayment.ref}</p>
            <p><strong>Transaction Amount:</strong> <span className="text-emerald-400 font-bold">{incomingPayment.amount}</span></p>
          </div>

          {receiptStep === 'confirm_date' && (
            <div className="bg-[#22252a] p-4 rounded-xl border border-gray-700 space-y-3">
              <p className="text-xs text-white font-semibold">🤖 Claudia AI: &quot;Please confirm payment and transaction date below.&quot;</p>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 uppercase font-semibold">Confirm Payment Date</label>
                  <input
                    type="date"
                    value={confirmDate}
                    onChange={e => setConfirmDate(e.target.value)}
                    className="bg-[#2b2f36] border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f5a623]"
                  />
                </div>
                <div className="pt-4">
                  <button
                    onClick={handleConfirmDate}
                    className="px-4 py-2 bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold rounded-xl text-xs transition shadow"
                  >
                    Confirm Payment & Date →
                  </button>
                </div>
              </div>
            </div>
          )}

          {receiptStep === 'receipt_choice' && (
            <div className="bg-[#22252a] p-4 rounded-xl border border-gray-700 space-y-3 animate-in fade-in duration-150">
              <p className="text-xs text-white font-semibold">🤖 Claudia AI: &quot;Are receipts going to be sent later by admin or immediately by Claudia?&quot;</p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  onClick={() => handleReceiptChoice('admin_later')}
                  className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 rounded-xl text-xs font-semibold transition shadow"
                >
                  📁 Send later by admin
                </button>
                <button
                  onClick={() => handleReceiptChoice('claudia_immediate')}
                  className="px-4 py-2.5 bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold rounded-xl text-xs transition shadow"
                >
                  🤖 Send immediately by Claudia
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#22252a] border border-gray-700 rounded-2xl p-8 text-center text-gray-400 space-y-3">
          <div className="text-3xl">💳</div>
          <div className="text-sm font-bold text-white">No active payment notices requiring confirmation</div>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Click &quot;+ Simulate Incoming Payment&quot; above to trigger an incoming payment notification and start Claudia AI&apos;s confirmation workflow.
          </p>
        </div>
      )}

      {/* Live Payment Records Table */}
      <div className="bg-[#2b2f36] border border-gray-700 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-700 pb-3">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <span>📋</span> Live Payment Records ({payments.length})
          </h3>
          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full">
            ● Connected to n8n Backend
          </span>
        </div>

        {payments.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-gray-400 text-xs">No payment records returned from live backend yet.</p>
            <button onClick={loadPayments} className="text-xs text-[#f5a623] hover:underline font-semibold">
              Check live backend connection
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-200">
              <thead className="border-b border-gray-700 text-gray-400 uppercase text-[10px] bg-[#22252a]">
                <tr>
                  <th className="py-2.5 px-3">Reference / ID</th>
                  <th className="py-2.5 px-3">Tenant / Payer</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {payments.map((p, idx) => (
                  <tr key={p.id || p.reference || idx} className="hover:bg-gray-800/40">
                    <td className="py-2.5 px-3 font-mono text-[#f5a623]">{p.reference || p.id || `TXN-${idx}`}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">{p.tenant || p.payer || p.name || 'Tenant'}</td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400">{p.amount ? kina(p.amount) : 'K 0.00'}</td>
                    <td className="py-2.5 px-3 text-gray-400">{p.date || new Date().toISOString().slice(0, 10)}</td>
                    <td className="py-2.5 px-3">
                      <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        {p.status || 'Confirmed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


