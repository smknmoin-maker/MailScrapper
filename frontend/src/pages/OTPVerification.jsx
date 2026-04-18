import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API = 'http://localhost:5000/api';

export default function OTPVerification() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!token || !email) navigate('/login');
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) newOtp[i] = pasted[i];
    setOtp(newOtp);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleSubmit = async () => {
    const code = otp.join('');
    if (code.length !== 6) { setError('Please enter the full 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API}/auth/verify-otp`, { otp: code, token });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setSuccess('Verified! Redirecting...');
      setTimeout(() => navigate('/dashboard'), 1000);
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed.');
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    try {
      await axios.post(`${API}/auth/resend-otp`, { token });
      setResendCooldown(30);
      setSuccess('OTP resent! Check your email.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend.');
    }
  };

  return (
    <div className="otp-page">
      <div className="login-bg">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
      </div>
      <div className="otp-card">
        <div className="otp-icon">🔐</div>
        <h1 className="otp-title">Verify Your Identity</h1>
        <p className="otp-subtitle">We sent a 6-digit code to</p>
        <p className="otp-email">{email}</p>
        {error && <p className="otp-error">❌ {error}</p>}
        {success && <p className="otp-success">✅ {success}</p>}
        <div className="otp-inputs" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={el => inputRefs.current[i] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
            />
          ))}
        </div>
        <button className="otp-submit" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Verifying...' : 'Verify & Continue'}
        </button>
        <p className="otp-resend">
          Didn't receive the code?{' '}
          <button onClick={handleResend} disabled={resendCooldown > 0}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
          </button>
        </p>
      </div>
    </div>
  );
}
