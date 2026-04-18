import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = 'https://mailscrapper.onrender.com/api';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function extractName(from) {
  if (!from) return 'Unknown';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split('@')[0];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emailDetail, setEmailDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextPageToken, setNextPageToken] = useState(null);
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [activeNav, setActiveNav] = useState('inbox');
  const searchTimeout = useRef(null);
  const iframeRef = useRef(null);

  const authHeader = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    fetchEmails();
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchEmails = async (query = '', pageToken = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (pageToken) params.append('pageToken', pageToken);
      const res = await axios.get(`${API}/mail/list?${params}`, authHeader);
      if (pageToken) {
        setEmails(prev => [...prev, ...res.data.emails]);
      } else {
        setEmails(res.data.emails);
      }
      setNextPageToken(res.data.nextPageToken);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.clear(); navigate('/login');
      }
      showToast('Failed to load emails', 'error');
    } finally { setLoading(false); }
  };

  const handleSearch = (value) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchEmails(value), 500);
  };

  const openEmail = async (email) => {
    setSelectedEmail(email.id);
    setDetailLoading(true);
    setShowReply(false);
    setReplyBody('');
    try {
      const res = await axios.get(`${API}/mail/${email.id}`, authHeader);
      setEmailDetail(res.data);
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isUnread: false } : e));
    } catch (err) {
      showToast('Failed to load email', 'error');
    } finally { setDetailLoading(false); }
  };

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      await axios.post(`${API}/mail/reply/${emailDetail.id}`, { body: replyBody }, authHeader);
      showToast('Reply sent successfully!');
      setShowReply(false);
      setReplyBody('');
    } catch (err) {
      showToast('Failed to send reply', 'error');
    } finally { setSending(false); }
  };

  const handleCompose = async () => {
    if (!composeTo || !composeSubject || !composeBody) return;
    setSending(true);
    try {
      await axios.post(`${API}/mail/send`, { to: composeTo, subject: composeSubject, body: composeBody }, authHeader);
      showToast('Email sent successfully!');
      setShowCompose(false);
      setComposeTo(''); setComposeSubject(''); setComposeBody('');
    } catch (err) {
      showToast('Failed to send email', 'error');
    } finally { setSending(false); }
  };

  const handleLogout = () => { localStorage.clear(); navigate('/login'); };

  const handleNavClick = (nav) => {
    setActiveNav(nav);
    setSelectedEmail(null);
    setEmailDetail(null);
    const queries = { inbox: 'in:inbox', starred: 'is:starred', sent: 'in:sent', drafts: 'in:drafts', spam: 'in:spam' };
    fetchEmails(queries[nav] || '');
  };

  const renderEmailBody = () => {
    if (!emailDetail) return null;
    if (emailDetail.body.html) {
      return <iframe ref={iframeRef} title="email-body" srcDoc={emailDetail.body.html}
        style={{ width: '100%', border: 'none', minHeight: '400px', borderRadius: '8px', background: '#fff' }}
        onLoad={() => { if (iframeRef.current) { iframeRef.current.style.height = iframeRef.current.contentWindow.document.body.scrollHeight + 40 + 'px'; } }} />;
    }
    return <pre className="email-body-text">{emailDetail.body.text || 'No content'}</pre>;
  };

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand"><span>📧</span><span>MailScrapper</span></div>
        <nav className="sidebar-nav">
          <button className={activeNav === 'inbox' ? 'active' : ''} onClick={() => handleNavClick('inbox')}>📥 Inbox</button>
          <button className={activeNav === 'starred' ? 'active' : ''} onClick={() => handleNavClick('starred')}>⭐ Starred</button>
          <button className={activeNav === 'sent' ? 'active' : ''} onClick={() => handleNavClick('sent')}>📤 Sent</button>
          <button className={activeNav === 'drafts' ? 'active' : ''} onClick={() => handleNavClick('drafts')}>📝 Drafts</button>
          <button className={activeNav === 'spam' ? 'active' : ''} onClick={() => handleNavClick('spam')}>🚫 Spam</button>
          <button style={{ marginTop: '16px', color: 'var(--accent)' }} onClick={() => setShowCompose(true)}>✏️ Compose</button>
        </nav>
        <div className="sidebar-user">
          <img src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=667eea&color=fff`} alt="avatar" />
          <div className="sidebar-user-info">
            <div className="name">{user.name}</div>
            <div className="email">{user.email}</div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout} title="Logout">🚪</button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        {/* Email List */}
        <div className="email-list-panel">
          <div className="email-list-header">
            <h2>{activeNav.charAt(0).toUpperCase() + activeNav.slice(1)}</h2>
            <div className="search-bar">
              <span>🔍</span>
              <input placeholder="Search emails..." value={searchQuery} onChange={e => handleSearch(e.target.value)} />
            </div>
          </div>
          <div className="email-list">
            {loading && emails.length === 0 ? (
              <>{ [1,2,3,4,5].map(i => <div key={i} className="email-skeleton" />) }</>
            ) : emails.length === 0 ? (
              <div className="loading-state"><span>📭</span><span>No emails found</span></div>
            ) : (
              <>
                {emails.map((email, idx) => (
                  <div key={email.id} className={`email-item ${email.isUnread ? 'unread' : ''} ${selectedEmail === email.id ? 'active' : ''}`}
                    onClick={() => openEmail(email)} style={{ animationDelay: `${idx * 30}ms` }}>
                    <div className="email-item-header">
                      <span className="email-item-from">{extractName(email.from)}</span>
                      <span className="email-item-date">{formatDate(email.date)}</span>
                    </div>
                    <div className="email-item-subject">{email.subject || '(no subject)'}</div>
                    <div className="email-item-snippet">{email.snippet}</div>
                  </div>
                ))}
                {nextPageToken && (
                  <button className="load-more-btn" onClick={() => fetchEmails(searchQuery, nextPageToken)} disabled={loading}>
                    {loading ? 'Loading...' : 'Load More'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Email Detail */}
        <div className={`email-detail-panel ${emailDetail ? 'visible' : ''}`}>
          {!emailDetail && !detailLoading ? (
            <div className="email-detail-empty"><span>📬</span><span>Select an email to read</span></div>
          ) : detailLoading ? (
            <div className="loading-state"><div className="loading-spinner" /><span>Loading email...</span></div>
          ) : emailDetail ? (
            <>
              <div className="email-detail-header">
                <div className="email-detail-subject">{emailDetail.headers.subject || '(no subject)'}</div>
                <div className="email-detail-meta">
                  <span className="email-detail-from">From: {emailDetail.headers.from}</span>
                  <span className="email-detail-date">{formatDate(emailDetail.headers.date)}</span>
                </div>
              </div>
              <div className="email-detail-body">{renderEmailBody()}</div>
              <div className="reply-section">
                {!showReply ? (
                  <button className="reply-toggle" onClick={() => setShowReply(true)}>↩️ Reply to this email</button>
                ) : (
                  <div className="reply-form">
                    <textarea placeholder="Type your reply..." value={replyBody} onChange={e => setReplyBody(e.target.value)} autoFocus />
                    <div className="reply-actions">
                      <button className="reply-cancel-btn" onClick={() => { setShowReply(false); setReplyBody(''); }}>Cancel</button>
                      <button className="reply-send-btn" onClick={handleReply} disabled={sending || !replyBody.trim()}>
                        {sending ? 'Sending...' : '📤 Send Reply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="compose-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCompose(false); }}>
          <div className="compose-modal">
            <div className="compose-header">
              <h3>✏️ New Email</h3>
              <button className="compose-close" onClick={() => setShowCompose(false)}>✕</button>
            </div>
            <div className="compose-body">
              <input placeholder="To" value={composeTo} onChange={e => setComposeTo(e.target.value)} />
              <input placeholder="Subject" value={composeSubject} onChange={e => setComposeSubject(e.target.value)} />
              <textarea placeholder="Write your message..." value={composeBody} onChange={e => setComposeBody(e.target.value)} />
            </div>
            <div className="compose-footer">
              <button className="reply-send-btn" onClick={handleCompose} disabled={sending || !composeTo || !composeSubject}>
                {sending ? 'Sending...' : '📤 Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div>}
    </div>
  );
}
