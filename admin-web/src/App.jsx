import { useEffect, useState } from 'react';
import {
  GraduationCap, LayoutDashboard, Building2, ClipboardCheck, Radar, Briefcase, KanbanSquare,
  Search, ChevronDown, LogOut, Activity,
} from 'lucide-react';
import { api, login, session, setOnExpired, get } from './api.js';
import { initials, navigate, readRoute, useToast } from './ui.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import OrganizerDashboard from './pages/OrganizerDashboard.jsx';
import Organizations from './pages/Organizations.jsx';
import ReviewQueue from './pages/ReviewQueue.jsx';
import Crawler from './pages/Crawler.jsx';
import Opportunities from './pages/Opportunities.jsx';
import Kanban from './pages/Kanban.jsx';

const NAV = {
  ADMIN: [
    ['dashboard', 'Tổng quan', LayoutDashboard],
    ['organizations', 'Đơn vị tổ chức', Building2],
    ['review', 'Kiểm duyệt cơ hội', ClipboardCheck],
    ['opportunities', 'Danh mục cơ hội', Briefcase],
    ['kanban', 'Kanban hồ sơ', KanbanSquare],
    ['crawler', 'Nguồn Crawler', Radar],
  ],
  ORGANIZER: [
    ['dashboard', 'Tổng quan', LayoutDashboard],
    ['opportunities', 'Cơ hội của tôi', Briefcase],
    ['kanban', 'Kanban hồ sơ', KanbanSquare],
  ],
};
const ROLE_LABEL = { ADMIN: 'Super Admin', ORGANIZER: 'Lead Organizer' };

export default function App() {
  const [sess, setSess] = useState(session.get);
  useEffect(() => setOnExpired(() => setSess(null)), []);
  if (!sess?.user) return <Login onLogin={setSess} />;
  return <Shell sess={sess} onLogout={() => { session.clear(); setSess(null); }} />;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await login(email.trim(), password);
      if (!['ADMIN', 'ORGANIZER'].includes(data.user?.role)) throw new Error('Cổng này chỉ dành cho Ban tổ chức và Quản trị viên.');
      const s = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user };
      session.set(s);
      onLogin(s);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-icon"><GraduationCap size={20} /></span>
          <div>
            <div className="brand-title">Scholink Portal</div>
            <div className="brand-role">Organizer & Super Admin</div>
          </div>
        </div>
        <div>
          <h1 className="page-title" style={{ fontSize: 22 }}>Đăng nhập</h1>
          <p className="page-sub">Dùng tài khoản Ban tổ chức hoặc Quản trị viên.</p>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pw">Mật khẩu</label>
          <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="error-box">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Đăng nhập'}</button>
      </form>
    </div>
  );
}

function Shell({ sess, onLogout }) {
  const { user } = sess;
  const toast = useToast();
  const [route, setRoute] = useState(readRoute);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [org, setOrg] = useState(null);
  const [healthy, setHealthy] = useState(null);
  const nav = NAV[user.role] || [];

  useEffect(() => {
    const on = () => { setRoute(readRoute()); setQ(''); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    if (user.organizationId) get(`/api/v1/admin/organizations/${user.organizationId}`).then((d) => setOrg(d.org)).catch(() => {});
    const ping = () => fetch('/health').then((r) => setHealthy(r.ok)).catch(() => setHealthy(false));
    ping();
    const t = setInterval(ping, 30000);
    return () => clearInterval(t);
  }, [user.organizationId]);

  const logout = async () => {
    try { await api('/api/v1/auth/logout', { method: 'POST' }); } catch { /* phiên có thể đã hết hạn */ }
    toast('Đã đăng xuất');
    onLogout();
  };

  const page = nav.some(([k]) => k === route.page) ? route.page : 'dashboard';
  const props = { user, q, params: route.params };
  const PAGES = {
    dashboard: user.role === 'ADMIN' ? AdminDashboard : OrganizerDashboard,
    organizations: Organizations,
    review: ReviewQueue,
    crawler: Crawler,
    opportunities: Opportunities,
    kanban: Kanban,
  };
  const Page = PAGES[page];

  return (
    <div className="shell">
      <aside className="aside">
        <div className="brand">
          <span className="brand-icon"><GraduationCap size={20} /></span>
          <div>
            <div className="brand-title">Scholink</div>
            <div className="brand-role">{user.role === 'ADMIN' ? 'Super Admin' : 'Organizer Portal'}</div>
          </div>
        </div>
        {user.role === 'ORGANIZER' && (
          <div className="org-card">
            <div className="overline">Đơn vị chủ quản</div>
            <div style={{ fontWeight: 600, marginTop: 6 }}>{org?.name || '—'}</div>
            <div className="mono faint" style={{ marginTop: 2 }}>#{user.organizationId}</div>
          </div>
        )}
        <nav className="nav" aria-label="Điều hướng chính">
          {nav.map(([key, label, Icon]) => (
            <button key={key} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => navigate(key)} aria-current={page === key ? 'page' : undefined}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
        <div className="aside-foot">
          <div className="row between">
            <strong>{user.role === 'ADMIN' ? 'Root Engine v2.4.8' : 'Enterprise Verified v2.4'}</strong>
            <Activity size={14} color={healthy === false ? 'var(--error)' : 'var(--success)'} />
          </div>
          <div className="muted" style={{ marginTop: 4 }}>{healthy === false ? 'Gateway mất kết nối' : 'Gateway hoạt động ổn định'}</div>
          <div className="telemetry"><span style={{ width: healthy === false ? '20%' : '100%', background: healthy === false ? 'var(--error)' : undefined }} /></div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Tìm kiếm trong trang..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm kiếm" />
          </div>
          <span className={`pill ${healthy === false ? 'error' : 'success'}`}>{healthy === false ? 'OFFLINE' : 'LIVE'}</span>
          <div className="spacer" />
          <div className="profile">
            <button className="profile-btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              <span className="avatar">{initials(user.fullName)}</span>
              <span className="stack" style={{ textAlign: 'left', gap: 0 }}>
                <strong style={{ fontSize: 13 }}>{user.fullName}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{ROLE_LABEL[user.role]}</span>
              </span>
              <ChevronDown size={16} className="faint" />
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600 }}>{user.email}</div>
                  <div className="mono faint">{user.id}</div>
                </div>
                <button onClick={logout}><LogOut size={16} /> Đăng xuất</button>
              </div>
            )}
          </div>
        </header>
        <main className="content">
          <Page key={page} {...props} />
        </main>
      </div>
    </div>
  );
}
