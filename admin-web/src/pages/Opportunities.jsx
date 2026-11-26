import { useState } from 'react';
import { Briefcase, Plus, KanbanSquare, CalendarClock, ExternalLink, RefreshCw } from 'lucide-react';
import { get, post } from '../api.js';
import { Loader, Modal, OppStatus, Pager, Pill, TYPE_LABEL, fmtDate, hoursLeft, matches, navigate, useAsync, usePaged, useToast } from '../ui.jsx';

export default function Opportunities({ user, q }) {
  const toast = useToast();
  const isAdmin = user.role === 'ADMIN';
  const state = useAsync(() => get('/api/v1/opportunities/organizer/my-opportunities'));
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [creating, setCreating] = useState(false);
  const [extending, setExtending] = useState(null);

  const list = (state.data || [])
    .filter((o) => (!status || o.status === status) && (!type || o.type === type) && matches(q, o.title, o.organizerName, o.id, ...(o.tags || [])))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const { rows, pager } = usePaged(list, 10);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{isAdmin ? 'Danh mục cơ hội' : 'Cơ hội của tôi'}</h1>
          <p className="page-sub">{isAdmin ? 'Toàn bộ học bổng & cuộc thi trên nền tảng.' : 'Học bổng & cuộc thi do đơn vị của bạn đăng tải.'}</p>
        </div>
        <div className="row">
          <button className="btn btn-neutral" onClick={state.reload} disabled={state.loading}><RefreshCw size={16} /> Làm mới</button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Đăng cơ hội</button>
        </div>
      </div>

      <section className="card">
        <div className="filters">
          <div className="segmented">
            {[['', 'Tất cả'], ['PUBLISHED', 'Đã công bố'], ['PENDING_REVIEW', 'Chờ duyệt'], ['CLOSED', 'Đã đóng'], ['REJECTED', 'Từ chối']].map(([k, l]) => (
              <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>
            ))}
          </div>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Loại">
            <option value="">Mọi loại</option><option value="SCHOLARSHIP">Học bổng</option><option value="COMPETITION">Cuộc thi</option>
          </select>
        </div>
        <Loader state={state}>
          {() => (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Cơ hội</th><th>Loại</th><th>Trạng thái</th><th>Hạn đăng ký</th><th>Hình thức</th><th /></tr></thead>
                  <tbody>
                    {rows.map((o) => {
                      const h = hoursLeft(o.registerDeadline);
                      return (
                        <tr key={o.id}>
                          <td style={{ maxWidth: 420 }}>
                            <div className="entity-name">{o.title}</div>
                            <div className="entity-sub">{o.organizerName} · <span className="mono">{o.id}</span></div>
                          </td>
                          <td><span className="chip">{TYPE_LABEL[o.type]}{o.competitionMode === 'TEAM' ? ' · Đội' : ''}</span></td>
                          <td><OppStatus status={o.status} /></td>
                          <td className="num">
                            <div>{fmtDate(o.registerDeadline)}</div>
                            {h < 0 ? <Pill tone="neutral">Đã hết hạn</Pill> : h < 48 ? <Pill tone="warning">Còn {Math.ceil(h)}h</Pill> : null}
                          </td>
                          <td>{o.applyMode === 'EXTERNAL' ? <a href={o.sourceUrl} target="_blank" rel="noreferrer" className="row"><ExternalLink size={14} /> Bên ngoài</a> : <span className="chip">Trong ứng dụng</span>}</td>
                          <td className="actions">
                            {isAdmin && <button className="icon-btn" title="Gia hạn" aria-label="Gia hạn" onClick={() => setExtending(o)}><CalendarClock size={16} /></button>}
                            {o.applyMode !== 'EXTERNAL' && (
                              <button className="btn btn-sm btn-tint" onClick={() => navigate('kanban', { opp: o.id })}><KanbanSquare size={14} /> Hồ sơ</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!rows.length && <tr><td colSpan={6}><div className="empty"><Briefcase size={28} /> Chưa có cơ hội nào.</div></td></tr>}
                  </tbody>
                </table>
              </div>
              <Pager {...pager} />
            </>
          )}
        </Loader>
      </section>

      {creating && <CreateOpportunityModal user={user} onClose={() => setCreating(false)} onDone={() => { toast('Đã đăng cơ hội mới'); state.reload(); }} />}
      {extending && <ExtendModal opp={extending} user={user} onClose={() => setExtending(null)} onDone={() => { toast('Đã gia hạn cơ hội'); state.reload(); }} />}
    </>
  );
}

const toLocalInput = (d) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};

function CreateOpportunityModal({ user, onClose, onDone }) {
  const [f, setF] = useState({
    type: 'SCHOLARSHIP', title: '', description: '', organizerName: '', applyMode: 'IN_APP', sourceUrl: '',
    registerDeadline: toLocalInput(Date.now() + 30 * 864e5), submitDeadline: '', fundingLevel: 'PARTIAL',
    minGpa: '', requiredIelts: '', competitionMode: 'INDIVIDUAL', minTeamSize: 2, maxTeamSize: 4, tags: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true); setError('');
    const body = {
      type: f.type,
      title: f.title.trim(),
      description: f.description.trim(),
      organizerName: f.organizerName.trim(),
      applyMode: f.applyMode,
      registerDeadline: new Date(f.registerDeadline).toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (user.organizationId) body.organizationId = user.organizationId;
    if (f.sourceUrl.trim()) body.sourceUrl = f.sourceUrl.trim();
    if (f.submitDeadline) body.submitDeadline = new Date(f.submitDeadline).toISOString();
    if (f.type === 'SCHOLARSHIP') {
      body.fundingLevel = f.fundingLevel;
      if (f.minGpa !== '') body.minGpa = Number(f.minGpa);
      if (f.requiredIelts !== '') body.requiredIelts = Number(f.requiredIelts);
    } else {
      body.competitionMode = f.competitionMode;
      if (f.competitionMode === 'TEAM') { body.minTeamSize = Number(f.minTeamSize); body.maxTeamSize = Number(f.maxTeamSize); }
    }
    try { await post('/api/v1/opportunities', body); onDone(); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal wide title="Đăng cơ hội mới" icon={<Briefcase size={20} color="var(--primary)" />} onClose={onClose}
      footer={<><button className="btn btn-neutral" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={submit} disabled={busy}>Đăng cơ hội</button></>}>
      <div className="form-grid">
        <div className="field">
          <span className="field-label">Loại</span>
          <div className="segmented">
            {[['SCHOLARSHIP', 'Học bổng'], ['COMPETITION', 'Cuộc thi']].map(([k, l]) => <button type="button" key={k} className={f.type === k ? 'active' : ''} onClick={() => setF({ ...f, type: k })}>{l}</button>)}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Hình thức nộp</span>
          <select className="select" value={f.applyMode} onChange={set('applyMode')}><option value="IN_APP">Trong ứng dụng</option><option value="EXTERNAL">Đăng ký bên ngoài</option></select>
        </label>
        <label className="field full"><span className="field-label">Tiêu đề <span className="req">*</span></span><input className="input" value={f.title} onChange={set('title')} maxLength={200} /><span className="hint">10–200 ký tự</span></label>
        <label className="field full"><span className="field-label">Mô tả <span className="req">*</span></span><textarea className="textarea" value={f.description} onChange={set('description')} maxLength={5000} /><span className="hint">Tối thiểu 20 ký tự</span></label>
        <label className="field"><span className="field-label">Đơn vị tổ chức hiển thị <span className="req">*</span></span><input className="input" value={f.organizerName} onChange={set('organizerName')} /></label>
        <label className="field"><span className="field-label">URL nguồn {f.applyMode === 'EXTERNAL' && <span className="req">*</span>}</span><input className="input" type="url" placeholder="https://" value={f.sourceUrl} onChange={set('sourceUrl')} /></label>
        <label className="field"><span className="field-label">Hạn đăng ký <span className="req">*</span></span><input className="input" type="datetime-local" value={f.registerDeadline} onChange={set('registerDeadline')} /></label>
        <label className="field"><span className="field-label">Hạn nộp bài</span><input className="input" type="datetime-local" value={f.submitDeadline} onChange={set('submitDeadline')} /></label>
        {f.type === 'SCHOLARSHIP' ? (
          <>
            <label className="field">
              <span className="field-label">Mức tài trợ</span>
              <select className="select" value={f.fundingLevel} onChange={set('fundingLevel')}>
                <option value="FULL">Toàn phần</option><option value="PARTIAL">Bán phần</option><option value="OTHER">Khác</option>
              </select>
            </label>
            <div className="row">
              <label className="field" style={{ flex: 1 }}><span className="field-label">GPA tối thiểu</span><input className="input num" type="number" min="0" max="4" step="0.1" value={f.minGpa} onChange={set('minGpa')} /></label>
              <label className="field" style={{ flex: 1 }}><span className="field-label">IELTS</span><input className="input num" type="number" min="0" max="9" step="0.5" value={f.requiredIelts} onChange={set('requiredIelts')} /></label>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Hình thức thi</span>
              <select className="select" value={f.competitionMode} onChange={set('competitionMode')}><option value="INDIVIDUAL">Cá nhân</option><option value="TEAM">Theo đội</option></select>
            </label>
            {f.competitionMode === 'TEAM' && (
              <div className="row">
                <label className="field" style={{ flex: 1 }}><span className="field-label">Tối thiểu</span><input className="input num" type="number" min="2" value={f.minTeamSize} onChange={set('minTeamSize')} /></label>
                <label className="field" style={{ flex: 1 }}><span className="field-label">Tối đa</span><input className="input num" type="number" min="2" value={f.maxTeamSize} onChange={set('maxTeamSize')} /></label>
              </div>
            )}
          </>
        )}
        <label className="field full"><span className="field-label">Thẻ (phân cách bằng dấu phẩy)</span><input className="input" placeholder="AI, Công nghệ" value={f.tags} onChange={set('tags')} /></label>
      </div>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

function ExtendModal({ opp, user, onClose, onDone }) {
  const [deadline, setDeadline] = useState(toLocalInput(Math.max(Date.now(), new Date(opp.registerDeadline)) + 7 * 864e5));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await post(`/api/v1/admin/opportunities/${opp.id}/extend`, { newDeadline: new Date(deadline).toISOString(), reason: reason.trim() || undefined, actorId: user.id });
      onDone(); onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal title="Gia hạn đăng ký" icon={<CalendarClock size={20} color="var(--primary)" />} onClose={onClose}
      footer={<><button className="btn btn-neutral" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={submit} disabled={busy}>Gia hạn</button></>}>
      <div className="entity-strip"><strong>{opp.title}</strong><span className="mono muted">{opp.id}</span></div>
      <div className="muted">Hạn hiện tại: <span className="num">{new Date(opp.registerDeadline).toLocaleString('vi-VN')}</span></div>
      <label className="field"><span className="field-label">Hạn mới <span className="req">*</span></span><input className="input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      <label className="field"><span className="field-label">Lý do</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Theo đề nghị của đơn vị" /></label>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}
