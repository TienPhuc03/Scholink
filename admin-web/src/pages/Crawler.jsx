import { useState } from 'react';
import { Radar, Plus, RotateCw, Play, RefreshCw, CheckCircle2, AlertTriangle, PauseCircle, Database } from 'lucide-react';
import { get, post } from '../api.js';
import { Kpi, Loader, Modal, Pager, Pill, TYPE_LABEL, fmtDateTime, fmtNum, matches, useAsync, usePaged, useToast } from '../ui.jsx';

const BASE = '/api/v1/admin/opportunities/crawler';
const STATUS = { HEALTHY: ['success', 'HEALTHY'], DEGRADED: ['warning', 'DEGRADED'], PAUSED: ['neutral', 'PAUSED'], FAILED: ['error', 'FAILED'], ERROR: ['error', 'ERROR'] };

export default function Crawler({ q }) {
  const toast = useToast();
  const state = useAsync(() => get(`${BASE}/dashboard`));
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(null);

  const sources = (state.data?.sources || []).filter((s) => matches(q, s.name, s.url, s.id));
  const { rows, pager } = usePaged(sources, 10);
  const s = state.data?.summary || {};

  const act = async (src, path, body, msg) => {
    setPending(`${src.id}:${path}`);
    try { await post(`${BASE}/sources/${src.id}/${path}`, body); toast(msg); state.reload(); } catch (e) { toast(e.message, 'error'); }
    setPending(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Nguồn Crawler</h1>
          <p className="page-sub">Theo dõi sức khỏe nguồn dữ liệu, bật/tắt và chạy lại job thu thập.</p>
        </div>
        <div className="row">
          <button className="btn btn-neutral" onClick={state.reload} disabled={state.loading}><RefreshCw size={16} /> Làm mới</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Thêm nguồn</button>
        </div>
      </div>

      <div className="grid-kpi">
        <Kpi label="Tổng nguồn" value={fmtNum(s.totalSources)} icon={<Radar size={16} />} />
        <Kpi label="Khỏe" value={fmtNum(s.healthySources)} icon={<CheckCircle2 size={16} />} tone="success" />
        <Kpi label="Suy giảm" value={fmtNum(s.degradedSources)} icon={<AlertTriangle size={16} />} tone="warning" />
        <Kpi label="Tạm dừng" value={fmtNum(s.pausedSources)} icon={<PauseCircle size={16} />} tone="error" />
        <Kpi label="Đã thu thập" value={fmtNum(s.totalFetched)} icon={<Database size={16} />}
          foot={<span className="muted num">{fmtNum(s.totalPublished)} công bố · {fmtNum(s.totalErrors)} lỗi</span>} />
      </div>

      <section className="card">
        <Loader state={state}>
          {() => (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Nguồn</th><th>Loại</th><th>Tin cậy</th><th>Trạng thái</th><th>Thu thập / Công bố / Lỗi</th><th>Chạy gần nhất</th><th>Bật</th><th /></tr></thead>
                  <tbody>
                    {rows.map((src) => {
                      const [tone, label] = STATUS[src.status] || ['neutral', src.status];
                      return (
                        <tr key={src.id}>
                          <td style={{ maxWidth: 340 }}>
                            <div className="entity-name">{src.name}</div>
                            <div className="mono faint" style={{ wordBreak: 'break-all' }}>{src.url}</div>
                            {src.lastError && <div className="entity-sub" style={{ color: 'var(--error)' }}>{src.lastError}</div>}
                          </td>
                          <td><span className="chip">{TYPE_LABEL[src.type] || src.type}</span></td>
                          <td className="num">{Math.round((src.trustLevel ?? 0) * 100)}%</td>
                          <td><Pill tone={tone}>{label}</Pill></td>
                          <td className="num">{fmtNum(src.totalFetched)} / {fmtNum(src.totalPublished)} / <span style={{ color: src.totalErrors ? 'var(--error)' : undefined }}>{fmtNum(src.totalErrors)}</span></td>
                          <td className="num muted">{fmtDateTime(src.lastRunAt)}</td>
                          <td>
                            <button
                              className={`switch ${src.isActive ? 'on' : ''}`}
                              role="switch"
                              aria-checked={!!src.isActive}
                              aria-label={`Bật nguồn ${src.name}`}
                              disabled={pending === `${src.id}:toggle`}
                              onClick={() => act(src, 'toggle', { enabled: !src.isActive }, src.isActive ? `Đã tạm dừng ${src.name}` : `Đã bật ${src.name}`)}
                            />
                          </td>
                          <td className="actions">
                            <button className="icon-btn" title="Chạy job thu thập" aria-label="Chạy job" disabled={!!pending} onClick={() => act(src, 'run', {}, `Đã chạy job cho ${src.name}`)}><Play size={16} /></button>
                            <button className="icon-btn" title="Chạy lại (reset retry)" aria-label="Chạy lại" disabled={!!pending} onClick={() => act(src, 'rerun', {}, `Đã chạy lại ${src.name}`)}><RotateCw size={16} /></button>
                          </td>
                        </tr>
                      );
                    })}
                    {!rows.length && <tr><td colSpan={8}><div className="empty"><Radar size={28} /> Không có nguồn nào.</div></td></tr>}
                  </tbody>
                </table>
              </div>
              <Pager {...pager} />
            </>
          )}
        </Loader>
      </section>

      {adding && <AddSourceModal onClose={() => setAdding(false)} onDone={() => { toast('Đã đăng ký nguồn mới'); state.reload(); }} />}
    </>
  );
}

function AddSourceModal({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', url: '', type: 'SCHOLARSHIP', trustLevel: 0.8, defaultTimezone: 'Asia/Ho_Chi_Minh' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await post(`${BASE}/sources`, { ...f, name: f.name.trim(), url: f.url.trim(), trustLevel: Number(f.trustLevel) });
      onDone(); onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal title="Thêm nguồn crawler" icon={<Radar size={20} color="var(--primary)" />} onClose={onClose}
      footer={<><button className="btn btn-neutral" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={submit} disabled={busy || !f.name.trim() || !f.url.trim()}>Đăng ký nguồn</button></>}>
      <div className="form-grid">
        <label className="field full"><span className="field-label">Tên nguồn <span className="req">*</span></span><input className="input" value={f.name} onChange={set('name')} autoFocus /></label>
        <label className="field full"><span className="field-label">URL feed <span className="req">*</span></span><input className="input mono" type="url" placeholder="https://.../feed.xml" value={f.url} onChange={set('url')} /></label>
        <label className="field">
          <span className="field-label">Loại cơ hội</span>
          <select className="select" value={f.type} onChange={set('type')}><option value="SCHOLARSHIP">Học bổng</option><option value="COMPETITION">Cuộc thi</option></select>
        </label>
        <label className="field"><span className="field-label">Độ tin cậy (0–1)</span><input className="input num" type="number" min="0" max="1" step="0.05" value={f.trustLevel} onChange={set('trustLevel')} /></label>
        <label className="field full"><span className="field-label">Múi giờ mặc định</span><input className="input mono" value={f.defaultTimezone} onChange={set('defaultTimezone')} /></label>
      </div>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}
