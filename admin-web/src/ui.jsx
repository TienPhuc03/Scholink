import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, X, Copy, Check } from 'lucide-react';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs, { id, message, type }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span style={{ flex: 1 }}>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Data loading ---------- */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await fnRef.current(), error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function Loader({ state, children }) {
  if (state.loading && !state.data) return <div className="loading"><div className="spinner" /></div>;
  if (state.error && !state.data) {
    return (
      <div className="card card-pad">
        <div className="error-box">{state.error.message}</div>
        <button className="btn btn-neutral" style={{ marginTop: 12 }} onClick={state.reload}>Thử lại</button>
      </div>
    );
  }
  return children(state.data);
}

/* ---------- Modal ---------- */
export function Modal({ title, icon, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    // Esc chỉ đóng modal trên cùng khi có modal lồng nhau
    const onKey = (e) => e.key === 'Escape' && ref.current === [...document.querySelectorAll('.scrim')].at(-1) && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div ref={ref} className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          {icon}
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Modal xác nhận có dải thông tin thực thể + lý do + chip gợi ý (theo design spec). */
export function ReasonModal({ title, icon, entityName, entityId, label = 'Lý do', required = true, chips = [], confirmText = 'Xác nhận', danger = true, onClose, onConfirm, children }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (required && !reason.trim()) { setError(`${label} là bắt buộc.`); return; }
    setBusy(true); setError('');
    try { await onConfirm(reason.trim()); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  };
  const addChip = (c) => setReason((r) => (r.trim() ? `${r.trim()}; ${c}` : c));
  return (
    <Modal
      title={title}
      icon={icon}
      onClose={onClose}
      footer={<>
        <button className="btn btn-neutral" onClick={onClose}>Hủy</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" /> : <Check size={16} />} {confirmText}
        </button>
      </>}
    >
      <div className="entity-strip">
        <strong>{entityName}</strong>
        {entityId && <span className="mono muted">{entityId}</span>}
      </div>
      {children}
      <div className="field">
        <label htmlFor="reason">{label} {required && <span className="req">*</span>}</label>
        <textarea id="reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập nội dung..." autoFocus />
      </div>
      {chips.length > 0 && (
        <div className="row wrap">
          {chips.map((c) => <button key={c} type="button" className="chip-btn" onClick={() => addChip(c)}>+ {c}</button>)}
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

/* ---------- Small pieces ---------- */
export function Kpi({ label, value, icon, tone = '', foot }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="overline">{label}</span>
        <span className={`kpi-icon ${tone}`}>{icon}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {foot}
    </div>
  );
}

export function Pill({ tone = 'neutral', children, dot = true }) {
  return <span className={`pill ${tone} ${dot ? '' : 'nodot'}`}>{children}</span>;
}

export function CopyBox({ value }) {
  const [done, setDone] = useState(false);
  if (!value) return <span className="faint">—</span>;
  return (
    <div className="hash-box">
      <span style={{ flex: 1 }}>{value}</span>
      <button
        className="icon-btn"
        aria-label="Sao chép"
        onClick={() => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      >
        {done ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

export function Pager({ page, totalPages, total, onPage }) {
  if (!totalPages || totalPages <= 1) return total !== undefined ? <div className="pager"><span>{total} bản ghi</span></div> : null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
  return (
    <div className="pager">
      <span className="num">{total} bản ghi · Trang {page}/{totalPages}</span>
      <div className="pages">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1}>Trước</button>
        {pages.map((p, i) => (
          <span key={p} className="row">
            {i > 0 && p - pages[i - 1] > 1 && <span className="faint">…</span>}
            <button className={p === page ? 'active' : ''} onClick={() => onPage(p)}>{p}</button>
          </span>
        ))}
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages}>Tiếp</button>
      </div>
    </div>
  );
}

/** Phân trang phía client cho danh sách đã tải đủ. */
export function usePaged(items, size = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const cur = Math.min(page, totalPages);
  return { rows: items.slice((cur - 1) * size, cur * size), pager: { page: cur, totalPages, total: items.length, onPage: setPage } };
}

/* ---------- Routing (hash: #/page?key=value) ---------- */
export function readRoute() {
  const [path, qs] = window.location.hash.replace(/^#\/?/, '').split('?');
  return { page: path || 'dashboard', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export function navigate(page, params) {
  window.location.hash = `/${page}${params ? `?${new URLSearchParams(params)}` : ''}`;
}

/* ---------- Formatters ---------- */
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtNum = (n) => (n ?? 0).toLocaleString('vi-VN');
export const fmtVnd = (n) => `${fmtNum(n)} ₫`;
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';
export const hoursLeft = (d) => (d ? (new Date(d) - Date.now()) / 36e5 : Infinity);
export const matches = (q, ...fields) => !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q.toLowerCase()));

export const OPP_STATUS = {
  PUBLISHED: ['success', 'Đã công bố'],
  PENDING_REVIEW: ['warning', 'Chờ duyệt'],
  DRAFT: ['neutral', 'Bản nháp'],
  REJECTED: ['error', 'Từ chối'],
  CLOSED: ['neutral', 'Đã đóng'],
  MERGED: ['info', 'Đã gộp'],
  CANCELLED: ['error', 'Đã hủy'],
};
export const OppStatus = ({ status }) => {
  const [tone, label] = OPP_STATUS[status] || ['neutral', status];
  return <Pill tone={tone}>{label}</Pill>;
};
export const TYPE_LABEL = { SCHOLARSHIP: 'Học bổng', COMPETITION: 'Cuộc thi' };
