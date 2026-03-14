import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Shield, Zap, Trophy, Plus, ShieldCheck,
  CheckCircle, ArrowUpRight, Copy, LogOut, AlertTriangle, X, Send
} from 'lucide-react';
import { bech32 } from 'bech32';
import { QRCodeSVG } from 'qrcode.react';
import { STREAKPAY_ADDRESS, STREAKPAY_ABI, USDT_ADDRESS } from './contract';
import previewImage from './assets/dashboard_preview.png';
import './App.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://streaksave-production.up.railway.app/api").replace('http://', 'https://');

const ErrorMessage = ({ message }) => (
  <motion.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: 'auto' }}
    exit={{ opacity: 0, height: 0 }}
    className="auth-error-box"
  >
    <AlertTriangle size={18} />
    <p>{message}</p>
  </motion.div>
);

const GlobalNotification = ({ notification, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`global-notification ${notification.type}`}
    >
      {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
      <span>{notification.message}</span>
      <button onClick={onClose} className="ml-auto opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </motion.div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [streak, setStreak] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  // Auth States
  const [authStep, setAuthStep] = useState('LANDING'); // LANDING, VERIFY_OTP, SETUP_PROFILE, BACKUP_SEED, DASHBOARD
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [mnemonic, setMnemonic] = useState(null);

  const [streaks, setStreaks] = useState([]);
  const [activeStreakForWithdraw, setActiveStreakForWithdraw] = useState(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [withdrawTab, setWithdrawTab] = useState('send'); // 'send' or 'exit'
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendToken, setSendToken] = useState('0x0000000000000000000000000000000000000000');

  const [balances, setBalances] = useState({ inj: '0', usdt: '0' });
  const [amount, setAmount] = useState('0.1');
  const [targetAmount, setTargetAmount] = useState('1.0');
  const [purpose, setPurpose] = useState('');
  const [duration, setDuration] = useState('4');
  const [selectedToken, setSelectedToken] = useState('0x0000000000000000000000000000000000000000');
  const [globalStats, setGlobalStats] = useState({ usdt_tvl: 0, inj_tvl: 0, active_savers: 0, total_deposits: 0 });
  const [authError, setAuthError] = useState('');
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', message: '' }

  const ethToInj = (ethAddr) => {
    if (!ethAddr || typeof ethAddr !== 'string') return ethAddr;
    try {
      const address = ethAddr.startsWith('0x') ? ethAddr.slice(2) : ethAddr;
      const data = new Uint8Array(address.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const words = bech32.toWords(data);
      return bech32.encode('inj', words);
    } catch (e) {
      console.error("Conversion error:", e);
      return ethAddr;
    }
  };

  const fetchBalances = async (addr) => {
    try {
      const res = await fetch(`${API_BASE}/wallet/balance/${addr}`);
      const data = await res.json();
      if (!data.error) setBalances(data);
    } catch (err) {
      console.error("Balance fetch error:", err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      if (!data.error) setGlobalStats(data);
    } catch (err) {
      console.error("Stats fetch error:", err);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
  };

  const handleStartManualStreak = async () => {
    if (!amount || Number(amount) <= 0) {
      showNotification('error', "Please enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      const calculatedDuration = Math.ceil(Number(targetAmount) / Number(amount));
      const res = await fetch(`${API_BASE}/streak/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          amount: amount,
          duration: calculatedDuration,
          token: selectedToken,
          purpose: purpose || "Savings Goal"
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showNotification('success', "Saving streak started! Happy saving. 🔥");
      setShowStreakModal(false);
      // Reset form
      setPurpose('');
      setAmount('0.1');
      setTargetAmount('1.0');
      fetchData(user.deposit_address);
      fetchBalances(user.deposit_address);
    } catch (err) {
      showNotification('error', "Failed to start streak: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimReward = async (streakId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/streak/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, streakId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showNotification('success', "Reward claimed! Tx: " + data.txHash.slice(0, 10) + "...");
      fetchData(user.deposit_address);
      fetchBalances(user.deposit_address);
    } catch (err) {
      showNotification('error', "Failed to claim reward: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencyWithdraw = async (streakId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/streak/withdraw/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, streakId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showNotification('success', "Withdrawal successful! 💸");
      setShowWithdrawModal(false);
      fetchData(user.deposit_address);
      fetchBalances(user.deposit_address);
    } catch (err) {
      showNotification('error', "Withdrawal failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleSendFunds = async () => {
    if (!sendRecipient || !sendAmount) {
      showNotification('error', "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/wallet/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          recipient: sendRecipient,
          amount: sendAmount,
          token: sendToken
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showNotification('success', "Transfer successful! Sent to " + sendRecipient.slice(0, 8) + "...");
      setShowWithdrawModal(false);
      setSendRecipient('');
      setSendAmount('');
      fetchBalances(user.deposit_address);
    } catch (err) {
      showNotification('error', "Transfer failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const apiFetch = async (endpoint, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const changeAuthStep = (step) => {
    setAuthError('');
    setAuthStep(step);
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    const normalizedEmail = emailInput ? emailInput.trim().toLowerCase() : '';
    if (!normalizedEmail) {
      setAuthError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setAuthError('');
    try {
      await apiFetch('/auth/request-otp', { method: 'POST', body: JSON.stringify({ email: normalizedEmail }) });
      setEmailInput(normalizedEmail);
      changeAuthStep('VERIFY_OTP');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otpInput) {
      setAuthError("Please enter the 6-digit code.");
      return;
    }
    setLoading(true);
    setAuthError('');
    try {
      const data = await apiFetch('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: emailInput, otp: otpInput })
      });
      setToken(data.token);
      localStorage.setItem('streakpay_token', data.token);

      if (data.user && data.user.wallet_address) {
        setUser(data.user);
        localStorage.setItem('streakpay_user', JSON.stringify(data.user));
        changeAuthStep('DASHBOARD');
      } else {
        changeAuthStep('SETUP_PROFILE');
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupWallet = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      const data = await apiFetch('/auth/setup-wallet', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('streakpay_user', JSON.stringify(data.user));
      localStorage.setItem('streakpay_token', data.token);
      changeAuthStep('DASHBOARD');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setStreak(null);
    setStreaks([]);
    setMnemonic(null);
    changeAuthStep('LANDING');
    setShowStreakModal(false);
    localStorage.removeItem('streakpay_user');
    localStorage.removeItem('streakpay_token');
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('streakpay_user');
    const savedToken = localStorage.getItem('streakpay_token');
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      setToken(savedToken);
      changeAuthStep('DASHBOARD');
    }
  }, []);

  const getContract = async () => {
    const INJECTIVE_RPC = "https://k8s.testnet.json-rpc.injective.network/";
    const networkInfo = { name: 'injective-testnet', chainId: 1439 };
    const staticProvider = new ethers.JsonRpcProvider(INJECTIVE_RPC, networkInfo, { staticNetwork: true });
    return new ethers.Contract(STREAKPAY_ADDRESS, STREAKPAY_ABI, staticProvider);
  };

  const fetchData = async (addr) => {
    try {
      const lbRes = await fetch(`${API_BASE}/leaderboard`);
      const lbData = await lbRes.json();
      setLeaderboard(lbData);

      const contract = await getContract();
      const count = await contract.userStreakCount(addr);
      const loadedStreaks = [];

      for (let i = 0; i < Number(count); i++) {
        const s = await contract.userStreaks(addr, i);
        if (s.isActive || s.weeksCompleted > 0) {
          const decimals = s.token === '0x0000000000000000000000000000000000000000' ? 18 : 6;
          const symbol = s.token === '0x0000000000000000000000000000000000000000' ? 'INJ' : 'USDT';
          loadedStreaks.push({
            streakId: i,
            weeklyAmount: ethers.formatUnits(s.weeklyAmount, decimals),
            totalWeeks: Number(s.totalCommittedWeeks),
            weeksCompleted: Number(s.weeksCompleted),
            totalSaved: ethers.formatUnits(s.totalSaved, decimals),
            purpose: s.description || "Savings Goal",
            isActive: s.isActive,
            isClaimed: s.isClaimed,
            startTime: Number(s.startTime),
            symbol
          });
        }
      }
      setStreaks(loadedStreaks);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    fetchStats();
    const statsInterval = setInterval(fetchStats, 30000);
    if (user) {
      fetchData(user.deposit_address);
      fetchBalances(user.deposit_address);
      const interval = setInterval(() => {
        fetchData(user.deposit_address);
        fetchBalances(user.deposit_address);
      }, 15000);
      return () => { clearInterval(interval); clearInterval(statsInterval); };
    }
    return () => clearInterval(statsInterval);
  }, [user]);

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    showNotification('success', `${label} copied to clipboard!`);
  };

  return (
    <div className={authStep === 'LANDING' ? '' : 'app-container'}>
      {authStep !== 'LANDING' && (
        <header>
          <div className="logo">StreakPay</div>
          {user ? (
            <div className="flex items-center gap-4">
              <div className="user-pill">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--primary-glow)]" />
                <span className="text-white text-sm font-bold">@{user.username}</span>
              </div>
              <button onClick={logout} className="p-2 text-dim hover:text-primary transition-colors hover:bg-white/5 rounded-xl">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-dim text-sm">
              <Shield size={16} className="text-primary" />
              <span>Secure savings portal</span>
            </div>
          )}
        </header>
      )}

      <AnimatePresence>
        {notification && (
          <GlobalNotification
            notification={notification}
            onClose={() => setNotification(null)}
          />
        )}
      </AnimatePresence>

      {/* Streak Start Modal */}
      <AnimatePresence>
        {showStreakModal && (
          <motion.div
            className="auth-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="glass-card w-full p-8 relative"
              style={{ maxWidth: '480px', margin: 'auto' }}
            >
              <button
                className="absolute top-5 right-5 text-dim hover:text-white transition-colors w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10"
                onClick={() => setShowStreakModal(false)}
              >
                <X size={20} />
              </button>

              <div className="auth-step-indicator">
                <div className="auth-step-dot active" />
                <div className="auth-step-dot" />
              </div>

              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Flame size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Create Saving Plan</h2>
                  <p className="text-dim text-xs">Commit to weekly savings. Earn 5% bonus on completion.</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Asset Selector */}
                <div>
                  <label className="text-xs uppercase tracking-widest text-dim mb-3 block">Choose Asset</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedToken('0x0000000000000000000000000000000000000000')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${selectedToken === '0x0000000000000000000000000000000000000000'
                        ? 'border-primary bg-primary/15 shadow-[0_0_20px_var(--primary-glow)]'
                        : 'border-white/8 bg-white/4 hover:border-white/20'
                        }`}
                    >
                      <span className="text-2xl">⚡</span>
                      <span className="font-bold text-sm">INJ</span>
                      <span className="text-dim text-xs">Native Token</span>
                      {selectedToken === '0x0000000000000000000000000000000000000000' && (
                        <span className="text-[10px] text-primary font-bold bg-primary/20 px-2 py-0.5 rounded-full">SELECTED</span>
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedToken("0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1")}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${selectedToken !== '0x0000000000000000000000000000000000000000'
                        ? 'border-primary bg-primary/15 shadow-[0_0_20px_var(--primary-glow)]'
                        : 'border-white/8 bg-white/4 hover:border-white/20'
                        }`}
                    >
                      <span className="text-2xl">💵</span>
                      <span className="font-bold text-sm">USDT</span>
                      <span className="text-dim text-xs">Stablecoin</span>
                      {selectedToken !== '0x0000000000000000000000000000000000000000' && (
                        <span className="text-[10px] text-primary font-bold bg-primary/20 px-2 py-0.5 rounded-full">SELECTED</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Purpose */}
                <div>
                  <label className="text-xs uppercase tracking-widest text-dim mb-2 block">What are you saving for?</label>
                  <input
                    type="text"
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    placeholder="e.g. New iPhone, Vacation, Emergency Fund"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white focus:border-primary transition-all"
                    required
                  />
                </div>

                {/* targetAmount and calculated duration */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-widest text-dim mb-2 block">Target Goal</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={targetAmount}
                        onChange={e => setTargetAmount(e.target.value)}
                        min="1"
                        step="1"
                        style={{ paddingRight: '60px' }}
                        required
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-primary">
                        {selectedToken === '0x0000000000000000000000000000000000000000' ? 'INJ' : 'USDT'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-dim mb-2 block">Weekly Savings</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        min="0.01"
                        step="0.01"
                        style={{ paddingRight: '60px' }}
                        required
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-primary">
                        {selectedToken === '0x0000000000000000000000000000000000000000' ? 'INJ' : 'USDT'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Auto-calculated Duration */}
                <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-dim uppercase tracking-widest">Auto-Calculated Duration</span>
                    <span className="text-primary font-black">{Math.ceil(Number(targetAmount) / Number(amount))} Weeks</span>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: '100%' }} />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-primary/8 p-4 rounded-xl border border-primary/15 text-sm flex items-center gap-3">
                  <Zap size={16} className="text-primary shrink-0" />
                  <p className="text-dim leading-relaxed">
                    Save <strong className="text-white">{amount} {selectedToken === '0x0000000000000000000000000000000000000000' ? 'INJ' : 'USDT'}</strong> weekly for <strong className="text-white">{Math.ceil(Number(targetAmount) / Number(amount))} weeks</strong> to reach your <strong className="text-white">{targetAmount} {selectedToken === '0x0000000000000000000000000000000000000000' ? 'INJ' : 'USDT'}</strong> goal.
                  </p>
                </div>

                <button
                  className="btn-primary w-full py-4 text-base font-bold"
                  onClick={handleStartManualStreak}
                  disabled={loading || !purpose || !targetAmount || !amount}
                >
                  {loading ? "Initializing..." : `💎 Create Saving Plan`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {authStep === 'ENTER_EMAIL' && (
        <div className="auth-overlay">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-card w-full p-8 relative"
            style={{ maxWidth: '400px', margin: 'auto' }}
          >
            <button
              className="absolute top-6 right-6 text-dim hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full"
              onClick={() => changeAuthStep('LANDING')}
            >
              <X size={20} />
            </button>

            <div className="auth-step-indicator">
              <div className="auth-step-dot active" />
              <div className="auth-step-dot" />
            </div>

            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 border border-primary/20">
                <Shield size={24} className="text-primary" />
              </div>
              <h2 className="text-2xl font-black text-white">Welcome back</h2>
              <p className="text-dim text-sm mt-1">Enter your email to access your secure savings portal.</p>
            </div>

            <AnimatePresence mode="wait">
              {authError && <ErrorMessage message={authError} />}
            </AnimatePresence>

            <form onSubmit={handleRequestOTP} className="space-y-5">
              <div className="form-group">
                <label className="text-xs uppercase tracking-widest text-dim font-bold mb-3 block">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="name@domain.com"
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white focus:border-primary transition-all pr-12"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dim pointer-events-none">
                    <Send size={18} />
                  </div>
                </div>
              </div>
              <button type="submit" className="btn-primary w-full py-4 text-base tracking-widest font-black" disabled={loading}>
                {loading ? "PREPARING SESSION..." : "CONTINUE"}
              </button>
            </form>

            <div className="secure-badge">
              <ShieldCheck size={14} className="text-primary" />
              <span>Enterprise-grade security</span>
            </div>
          </motion.div>
        </div>
      )}

      {authStep === 'VERIFY_OTP' && (
        <div className="auth-overlay">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-card w-full p-8 relative"
            style={{ maxWidth: '400px', margin: 'auto' }}
          >
            <button
              className="absolute top-6 right-6 text-dim hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full"
              onClick={() => changeAuthStep('LANDING')}
            >
              <X size={20} />
            </button>

            <div className="auth-step-indicator">
              <div className="auth-step-dot active" />
              <div className="auth-step-dot active" />
            </div>

            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 border border-primary/20">
                <Zap size={24} className="text-primary" />
              </div>
              <h2 className="text-2xl font-black text-white">Verify Identity</h2>
              <p className="text-dim text-sm mt-1">Enter the 6-digit code sent to your inbox.</p>
            </div>

            <AnimatePresence mode="wait">
              {authError && <ErrorMessage message={authError} />}
            </AnimatePresence>

            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div className="form-group">
                <label className="text-xs uppercase tracking-widest text-dim font-bold mb-3 block italic">{emailInput}</label>
                <input
                  type="text"
                  maxLength="6"
                  value={otpInput}
                  onChange={e => setOtpInput(e.target.value)}
                  placeholder="000 000"
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white text-center text-3xl font-black tracking-[0.4em] focus:border-primary transition-all"
                />
              </div>
              <button type="submit" className="btn-primary w-full py-4 text-base tracking-widest font-black" disabled={loading}>
                {loading ? "AUTHORIZING..." : "CONFIRM & LOGIN"}
              </button>
            </form>

            <div className="secure-badge">
              <ShieldCheck size={14} className="text-primary" />
              <span>Secured by Injective network</span>
            </div>
            <button
              type="button"
              onClick={handleRequestOTP}
              className="w-full text-sm text-dim hover:text-white transition-colors underline underline-offset-4 mt-6"
              disabled={loading}
            >
              Didn't get the code? Resend
            </button>
          </motion.div>
        </div>
      )}

      {authStep === 'SETUP_PROFILE' && (
        <div className="auth-overlay">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-card w-full p-8 relative overflow-hidden"
            style={{ maxWidth: '400px', margin: 'auto' }}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
            <button
              onClick={() => changeAuthStep('LANDING')}
              className="absolute top-4 right-4 text-dim hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full"
            >
              <X size={20} />
            </button>

            <div className="auth-step-indicator">
              <div className="auth-step-dot"></div>
              <div className="auth-step-dot"></div>
              <div className="auth-step-dot active"></div>
            </div>

            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 border border-primary/20">
                <ShieldCheck size={24} className="text-primary" />
              </div>
              <h2 className="text-2xl font-black text-white">Confirm Identity</h2>
              <p className="text-dim text-sm mt-1">Finalize your managed wallet account linked to:</p>
              <div className="mt-3 py-2 px-4 bg-white/5 rounded-full border border-white/10 text-primary text-sm font-bold">
                {emailInput}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {authError && <ErrorMessage message={authError} />}
            </AnimatePresence>

            <form onSubmit={handleSetupWallet} className="space-y-6">

              <button type="submit" className="btn-primary w-full py-4 text-base tracking-widest font-black" disabled={loading}>
                {loading ? "GENERATING..." : "GENERATE WALLET"}
              </button>
            </form>

            <div className="secure-badge mt-8">
              <ShieldCheck size={14} className="text-primary" />
              <span>Deterministic Protection</span>
            </div>
          </motion.div>
        </div>
      )}

      <div className="content-wrapper">
        {authStep === 'LANDING' || !user ? (
          <div className="landing-page">
            <nav className="floating-nav">
              <div className="logo">StreakPay</div>
              <div className="nav-actions">
                <button className="btn-primary" onClick={() => changeAuthStep('ENTER_EMAIL')}>Get Started</button>
              </div>
            </nav>

            <div className="hero-section">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                <div className="injective-badge">
                  <div className="dot" />
                  Built on Injective
                </div>
                <h1 className="hero-title">
                  NO <span className="highlight-box">COMPLEXITY</span> <br />
                  JUST SECURE <span className="text-primary">SAVINGS</span><br />
                  <span className="text-primary">GATEWAY</span> FOR<br />
                  WEB3
                </h1>

                <p className="hero-description">
                  StreakPay provides gamers and savers with a secure, automated savings gateway to power their financial future on Injective. Build streaks, earn bonuses, and secure your assets with enterprise-grade stability.
                </p>

                <div className="hero-ctas">
                  <button className="btn-primary" onClick={() => changeAuthStep('ENTER_EMAIL')}>Get Started</button>
                  <button className="btn-secondary">View Leaderboard</button>
                </div>
              </motion.div>
            </div>
          </div>
        ) : (
          <>
            <section className="hero">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Welcome back
              </motion.h1>
              <p>Your managed wallet is ready. Send INJ or USDT to start your streak.</p>
            </section>

            <div className="main-grid">
              <div className="streak-tracker">
                {/* Managed Wallet Card */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="glass-card mb-6 border-primary/20 bg-primary/5 hover:bg-primary/[0.08]"
                >
                  <div className="flex flex-col sm:flex-row items-center gap-8">
                    <div className="bg-white p-3 rounded-2xl shrink-0 shadow-2xl">
                      <QRCodeSVG value={user.deposit_address} size={140} />
                    </div>
                    <div className="flex-1 w-full">
                      <div className="flex justify-between items-start mb-6">
                        <h4 className="text-sm text-dim uppercase tracking-wider">Your Managed Wallet</h4>
                        <div className="flex gap-2">
                          <div className="bg-white/5 px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-2 transition-all hover:bg-white/10">
                            <span className="text-[10px] text-dim font-black tracking-widest uppercase">INJ</span>
                            <span className="text-sm font-black text-white">{Number(balances.inj).toFixed(4)}</span>
                          </div>
                          <div className="bg-primary/20 px-4 py-1.5 rounded-full border border-primary/30 flex items-center gap-2 transition-all hover:bg-primary/30">
                            <span className="text-[10px] text-primary font-black tracking-widest uppercase">USDT</span>
                            <span className="text-sm font-black text-primary">{Number(balances.usdt).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mb-5">
                        <span className="text-[10px] text-primary uppercase font-black tracking-widest block mb-1 opacity-70">Injective Native</span>
                        <div className="flex items-center gap-3 bg-black/40 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all group">
                          <code className="text-xs break-all flex-1 text-primary font-mono opacity-80 group-hover:opacity-100">{ethToInj(user.deposit_address)}</code>
                          <button onClick={() => copyAddress(ethToInj(user.deposit_address), "Native address")} className="text-dim hover:text-primary transition-colors">
                            <Copy size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="mb-6">
                        <span className="text-[10px] text-dim uppercase font-black tracking-widest block mb-1 opacity-70">EVM Format</span>
                        <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-all group">
                          <code className="text-[10px] break-all flex-1 text-dim font-mono">{user.deposit_address}</code>
                          <button onClick={() => copyAddress(user.deposit_address, "EVM address")} className="text-dim hover:text-white transition-colors">
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-3 mb-4">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`btn-primary flex-1 flex items-center justify-center gap-2 py-3 ${(Number(balances.usdt) <= 0 && Number(balances.inj) < 0.1) ? 'opacity-50 grayscale' : ''}`}
                          onClick={() => setShowStreakModal(true)}
                          disabled={loading || (Number(balances.usdt) <= 0 && Number(balances.inj) < 0.1)}
                        >
                          <Flame size={20} className="fire-icon" />
                          <span className="tracking-tight">{loading ? "Starting..." : "Create Saving Plan"}</span>
                        </motion.button>

                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="bg-white/5 text-white rounded-full flex-1 flex items-center justify-center gap-2 py-3 hover:bg-white/10 transition-all border border-white/5 hover:border-white/20 font-bold"
                          onClick={() => {
                            setWithdrawTab('send');
                            setShowWithdrawModal(true);
                          }}
                          disabled={loading}
                        >
                          <Send size={18} />
                          <span className="tracking-tight uppercase tracking-widest text-xs">Withdraw</span>
                        </motion.button>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-primary text-xs">
                          <CheckCircle size={14} />
                          <span>Portal active. Commit to a streak to start your journey.</span>
                        </div>
                        <div className="flex items-center gap-2 text-dim text-[10px] bg-white/5 w-fit px-2 py-1 rounded-md border border-white/5">
                          <Zap size={10} className="text-primary" />
                          <span>Gas subsidized: Relayer automatically funds 0.1 INJ for gas.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <div className="flex flex-col gap-6">
                  {streaks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {streaks.map((s, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: idx * 0.1 }}
                          className="glass-card streak-card border-primary/30"
                        >
                          <div className="streak-badge">
                            {s.isActive ? '🔥' : '💎'}
                          </div>
                          <h3 className="text-xl font-black uppercase tracking-widest mb-1">{s.purpose}</h3>
                          <div className="text-dim text-[10px] uppercase tracking-widest mb-4">Savings Goal</div>

                          <div className="flex justify-between items-end mt-4">
                            <span className="text-5xl font-black text-white tracking-tighter">{s.weeksCompleted}</span>
                            <span className="text-dim font-bold pb-2">/ {s.totalWeeks} Weeks</span>
                          </div>

                          <div className="streak-visual">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(s.weeksCompleted / s.totalWeeks) * 100}%` }}
                              className="streak-progress"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4 mt-8">
                            <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                              <span className="text-[10px] text-dim uppercase font-black tracking-widest block mb-2">Weekly Goal</span>
                              <span className="text-xl font-black text-white">{s.weeklyAmount} <span className="text-xs text-dim">{s.symbol}</span></span>
                            </div>
                            <div className="bg-primary/5 p-4 rounded-3xl border border-primary/20">
                              <span className="text-[10px] text-primary uppercase font-black tracking-widest block mb-2">Total Saved</span>
                              <span className="text-xl font-black text-primary">{s.totalSaved} <span className="text-xs text-primary/60">{s.symbol}</span></span>
                            </div>
                          </div>

                          <div className="mt-8 space-y-4">
                            {s.isActive ? (
                              <div className="user-pill w-full justify-center bg-primary/20 border-primary/30 py-3">
                                <Zap size={16} className="text-primary animate-pulse" />
                                <span className="text-primary font-bold">Autopilot Active</span>
                              </div>
                            ) : (
                              <button
                                className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                                onClick={() => handleClaimReward(s.streakId)}
                                disabled={loading || s.isClaimed}
                              >
                                <Trophy size={18} />
                                {s.isClaimed ? "Already Claimed" : "Claim Principal + Bonus"}
                              </button>
                            )}

                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                        <Plus size={32} className="text-dim" />
                      </div>
                      <h3 className="text-xl font-bold">No Active Saving Plans</h3>
                      <p className="text-dim mt-2 max-w-xs">Create your first goal above to start earning protocol rewards.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Global Dashboard (Replacing How it Works) */}
              <div className="streak-tracker">
                <div className="glass-card mb-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Zap size={20} className="text-primary" />
                      <h2>Global Dashboard</h2>
                    </div>
                    <div className="bg-primary/20 px-3 py-1 rounded-full text-[10px] font-bold text-primary">LIVE</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="glass-card p-4 border-white/5">
                      <span className="text-dim text-[10px] uppercase block mb-1">INJ Saved</span>
                      <span className="text-xl font-bold">{Number(globalStats.inj_tvl).toFixed(2)} <span className="text-xs text-dim">INJ</span></span>
                    </div>
                    <div className="glass-card p-4 border-white/5">
                      <span className="text-dim text-[10px] uppercase block mb-1">Active Savers</span>
                      <span className="text-xl font-bold">{globalStats.active_savers || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <Trophy size={18} className="text-streak-gold" />
                    <h3 className="text-sm uppercase tracking-widest text-dim">Hall of Fame</h3>
                  </div>

                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>User</th>
                        <th>Plan</th>
                        <th>Weeks</th>
                        <th>Savings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((item, idx) => (
                        <tr key={idx} className={item.username === user.username ? 'bg-primary/10' : ''}>
                          <td className="text-primary font-bold">#{idx + 1}</td>
                          <td>@{item.username || 'anonymous'}</td>
                          <td className="max-w-[120px] truncate opacity-80">{item.goal_description}</td>
                          <td>🔥 {item.weeks || 0}</td>
                          <td>{Number(item.total_savings).toLocaleString()} <span className="text-[10px] text-dim">{item.token_symbol}</span></td>
                        </tr>
                      ))}
                      {leaderboard.length === 0 && (
                        <tr>
                          <td colSpan="3" className="text-center p-8 text-dim">Waiting for the first savers...</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="glass-card bg-primary/5 border-primary/20">
                  <div className="flex items-start gap-3">
                    <Shield size={20} className="text-primary shrink-0 mt-1" />
                    <div>
                      <h4 className="font-bold text-sm mb-1">Managed Wallet Security</h4>
                      <p className="text-xs text-dim leading-relaxed">Your funds are locked in the StreakPay smart contract. Our relayer only automates the deposits on your behalf using your encrypted master key, and automatically funds your account with 0.1 INJ for gas fees.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Unified Withdrawal Modal */}
      <AnimatePresence>
        {showWithdrawModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="auth-overlay"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="glass-card w-full p-8 relative"
              style={{ maxWidth: '480px', margin: 'auto' }}
            >
              <button
                className="absolute top-5 right-5 text-dim hover:text-white transition-colors w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10"
                onClick={() => setShowWithdrawModal(false)}
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Send size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Withdraw Funds</h2>
                  <p className="text-dim text-xs">Transfer your assets securely.</p>
                </div>
              </div>


              <div className="space-y-5">
                <p className="text-dim text-sm mb-2">
                  Transfer funds from your managed StreakPay wallet to your primary address (e.g., MetaMask or Keplr).
                </p>

                {streaks.some(s => s.isActive) && (
                  <div className="bg-streak-gold/10 border border-streak-gold/30 p-4 rounded-2xl flex items-start gap-3">
                    <AlertTriangle size={18} className="text-streak-gold shrink-0 mt-0.5" />
                    <p className="text-xs text-streak-gold leading-relaxed">
                      Note: Your locked streak funds are not available for external transfer. Exit a streak to unlock them.
                    </p>
                  </div>
                )}

                <div className="form-group">
                  <label className="text-xs uppercase tracking-widest text-dim font-bold mb-3 block">Recipient Address</label>
                  <input
                    type="text"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white focus:border-primary transition-all"
                    placeholder="inj1... or 0x..."
                    value={sendRecipient}
                    onChange={(e) => setSendRecipient(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="text-xs uppercase tracking-widest text-dim font-bold mb-3 block">Asset</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className={`py-4 rounded-2xl border-2 transition-all font-bold ${sendToken === '0x0000000000000000000000000000000000000000' ? 'bg-primary/15 border-primary shadow-[0_0_20px_var(--primary-glow)] text-white' : 'bg-white/4 border-white/8 text-dim hover:border-white/20'}`}
                      onClick={() => setSendToken('0x0000000000000000000000000000000000000000')}
                    >
                      INJ
                    </button>
                    <button
                      className={`py-4 rounded-2xl border-2 transition-all font-bold ${sendToken !== '0x0000000000000000000000000000000000000000' ? 'bg-primary/15 border-primary shadow-[0_0_20px_var(--primary-glow)] text-white' : 'bg-white/4 border-white/8 text-dim hover:border-white/20'}`}
                      onClick={() => setSendToken(USDT_ADDRESS)}
                    >
                      USDT
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <div className="flex justify-between items-end mb-3">
                    <label className="text-xs uppercase tracking-widest text-dim font-bold mb-0 block">Amount</label>
                    <div className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-1 rounded-md">
                      Max: {sendToken === '0x0000000000000000000000000000000000000000' ? balances.inj : balances.usdt}
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white focus:border-primary transition-all pr-16"
                      placeholder="0.00"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      required
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-primary">
                      {sendToken === '0x0000000000000000000000000000000000000000' ? 'INJ' : 'USDT'}
                    </span>
                  </div>
                </div>

                <button
                  className="btn-primary w-full py-4 text-base font-bold flex items-center justify-center gap-2 mt-2"
                  onClick={handleSendFunds}
                  disabled={loading || !sendRecipient || !sendAmount}
                >
                  {loading ? "Processing..." : "Confirm Withdrawal"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
