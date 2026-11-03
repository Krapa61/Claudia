import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import * as api from './services/claudiaApi';
import { getMe, Me } from './services/claudiaData';
import ClaudiaTools from './components/ClaudiaTools';
import * as D from './services/claudiaData';

type Screen = 'login' | 'code' | 'app';

export function ClaudiaApp() {
  const [screen, setScreen] = useState<Screen>(api.getToken() ? 'app' : 'login');
  const [email, setEmail] = useState('krapawid61@gmail.com');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('123456');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [userMe, setUserMe] = useState<Me | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    async function fetchUserProfile() {
      const token = api.getToken();
      if (token) {
        try {
          const m = await getMe(token);
          setUserMe(m);
        } catch {
          const u = api.getUser();
          if (u) setUserMe({ email: u.email, role: (u.role as any) || 'tenant', name: u.name || u.email });
        }
      }
    }
    fetchUserProfile();
  }, [screen]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); 
    setInfo('');
    try { 
      await fn(); 
    } finally { 
      setBusy(false); 
    }
  };

  const doLogin = () => run(async () => {
    if (!email) {
      setInfo('Please enter your email address.');
      return;
    }
    if (password.length < 8 || password.length > 12 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      setInfo('Password must be 8 - 12 characters and include letters and numbers.');
      return;
    }
    const r = await api.login(email, password);
    if (r.success) { 
      setPassword(''); 
      const token = api.getToken() || '';
      try {
        const m = await getMe(token);
        setUserMe(m);
      } catch {
        const u = api.getUser();
        if (u) setUserMe({ email: u.email, role: (u.role as any) || 'tenant', name: u.name || u.email });
      }
      setScreen('app'); 
    } else {
      setInfo(r.message);
    }
  });

  const doRequestCode = () => run(async () => {
    const targetEmail = email || 'krapawid61@gmail.com';
    setEmail(targetEmail);
    const r = await api.requestCode(targetEmail);
    setInfo(r.message || 'Verification code sent successfully to your email.');
    setCode('123456');
    setScreen('code');
  });

  const doVerify = () => run(async () => {
    if (password.length < 8 || password.length > 12 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      setInfo('Password must be 8 - 12 characters and include letters and numbers.');
      return;
    }
    const r = await api.verifyCode(email, code, password);
    if (r.success) { 
      setCode(''); 
      setPassword(''); 
      const token = api.getToken() || '';
      try {
        const m = await getMe(token);
        setUserMe(m);
      } catch {
        const u = api.getUser();
        if (u) setUserMe({ email: u.email, role: (u.role as any) || 'tenant', name: u.name || u.email });
      }
      setScreen('app'); 
    } else {
      setInfo(r.message);
    }
  });

  const doLogout = async () => {
    await api.logout();
    setUserMe(null);
    setScreen('login');
  };

  if (screen === 'login') return (
    <div className="min-h-screen bg-[#22252a] text-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#2b2f36] border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3.5 mb-6">
          <img 
            src="/assets/aistudio/ct_hub_logo_2_11056ec0.png" 
            alt="CT HUB Logo" 
            className="w-12 h-12 rounded-xl object-cover border border-[#f5a623]/40 shadow-md"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              CT HUB <span className="text-xs px-2 py-0.5 rounded-full bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/30 uppercase font-semibold">Portal</span>
            </h1>
            <p className="text-xs text-gray-400">Secure Property Management Portal</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Email Address</label>
            <input 
              className="w-full bg-[#22252a] border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-[#f5a623] transition" 
              type="email" 
              placeholder="name@example.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Password</label>
            <div className="relative">
              <input 
                className="w-full bg-[#22252a] border border-gray-700 rounded-xl px-4 py-3 pr-12 text-sm text-gray-100 focus:outline-none focus:border-[#f5a623] transition" 
                type={showPassword ? 'text' : 'password'}
                maxLength={12}
                placeholder="••••••••••••" 
                value={password}
                onChange={e => setPassword(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && doLogin()} 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 p-1"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <button 
            className="w-full bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold rounded-xl py-3 text-sm transition shadow-lg shadow-[#f5a623]/20 disabled:opacity-50" 
            disabled={busy} 
            onClick={doLogin}
          >
            {busy ? 'Authenticating...' : 'Sign In'}
          </button>

          <div className="text-center pt-2">
            <button 
              className="text-xs text-[#f5a623] hover:underline transition font-medium" 
              disabled={busy} 
              onClick={doRequestCode}
            >
              First time here, or forgot password? Send secure access code
            </button>
          </div>

          {info && (
            <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-xl">
              {info}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (screen === 'code') return (
    <div className="min-h-screen bg-[#22252a] text-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#2b2f36] border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-xl font-bold mb-2 text-white">Enter Security Code</h1>
        <p className="text-xs text-gray-400 mb-6">We sent a 6-digit verification code to <span className="text-[#f5a623] font-medium">{email}</span>. Valid for 10 minutes.</p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">6-Digit Code</label>
            <input 
              className="w-full bg-[#22252a] border border-gray-700 rounded-xl px-4 py-3 text-center tracking-widest text-lg font-mono text-gray-100 focus:outline-none focus:border-[#f5a623]" 
              inputMode="numeric" 
              maxLength={6} 
              placeholder="123456"
              value={code} 
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))} 
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">New Password (8-12 chars, letters & numbers)</label>
            <div className="relative">
              <input 
                className="w-full bg-[#22252a] border border-gray-700 rounded-xl px-4 py-3 pr-12 text-sm text-gray-100 focus:outline-none focus:border-[#f5a623]" 
                type={showPassword ? 'text' : 'password'} 
                maxLength={12}
                placeholder="8-12 chars with letters & numbers"
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 p-1"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            className="w-full bg-[#f5a623] hover:bg-[#e0951f] text-gray-950 font-bold rounded-xl py-3 text-sm transition shadow-lg shadow-[#f5a623]/20 disabled:opacity-50" 
            disabled={busy} 
            onClick={doVerify}
          >
            {busy ? 'Verifying...' : 'Set Password & Launch Portal'}
          </button>

          <div className="flex justify-between text-xs pt-2">
            <button className="text-[#f5a623] hover:underline font-medium" disabled={busy} onClick={doRequestCode}>Resend code</button>
            <button className="text-gray-400 hover:text-gray-200" onClick={() => { setScreen('login'); setInfo(''); }}>Back to sign in</button>
          </div>

          {info && (
            <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-xl">
              {info}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const token = api.getToken() || '';
  const savedUser = api.getUser();
  const role = (userMe?.role || savedUser?.role || 'tenant') as D.Role;

  return (
    <ClaudiaTools token={token} role={role} onSignedOut={doLogout} />
  );
}

export { ClaudiaApp as App };
export default ClaudiaApp;
