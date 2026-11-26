import { useState } from 'react';
import { Building2, Plus, Eye, Ban, ShieldCheck, UserPlus, UserMinus, CheckCircle2, PauseCircle } from 'lucide-react';
import { get, post } from '../api.js';
import {
  Kpi, Loader, Modal, Pager, Pill, ReasonModal, fmtDate, fmtNum, initials, matches, useAsync, usePaged, useToast,
} from '../ui.jsx';

const BASE = '/api/v1/admin/organizations';

export default function Organizations({ q }) {
  const toast = useToast();
  const state = useAsync(() => get(BASE));
  const [filter, setFilter] = useState('ALL');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);

  const list = state.data || [];
  const rows = list.filter((o) => (filter === 'ALL' || o.status === filter) && matches(q, o.name, o.id, o.email, o.taxCode));
  const { rows: pageRows, pager } = usePaged(rows, 10);

  const changeStatus = async (org, reason) => {
    const status = org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await post(`${BASE}/${org.id}/status`, { status, reason: reason || undefined });
    toast(status === 'SUSPENDED' ? `Đã tạm khóa ${org.name}` : `Đã kích hoạt lại ${org.name}`);
    state.reload();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Đơn vị tổ chức</h1>
          <p className="page-sub">Quản lý đối tác, trạng thái xác minh và quyền Organizer.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Thêm đơn vị</button>
      </div>

      <div className="grid-kpi">
        <Kpi label="Tổng đơn vị" value={fmtNum(list.length)} icon={<Building2 size={16} />} />
        <Kpi label="Đang hoạt động" value={fmtNum(list.filter((o) => o.status === 'ACTIVE').length)} icon={<CheckCircle2 size={16} />} tone="success" />
        <Kpi label="Tạm khóa" value={fmtNum(list.filter((o) => o.status === 'SUSPENDED').length)} icon={<PauseCircle size={16} />} tone="error" />
      </div>

      <section className="card">
        <div className="filters">
          <div className="segmented" role="tablist">
            {[['ALL', 'Tất cả'], ['ACTIVE', 'Đang hoạt động'], ['SUSPENDED', 'Tạm khóa']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <Loader state={state}>
          {() => (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Đơn vị</th><th>Mã định danh</th><th>Trạng thái</th><th>Xác minh</th><th>Tạo lúc</th><th /></tr></thead>
                  <tbody>
                    {pageRows.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div className="entity">
                            <span className="monogram">{initials(o.name)}</span>
                            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                              <span className="entity-name">{o.name}</span>
                              <span className="entity-sub">{o.email || o.website || 'Chưa có liên hệ'}</span>
                            </div>
                          </div>
                        </td>
                        <td><span className="id-pill">#{o.id}</span></td>
                        <td>{o.status === 'ACTIVE' ? <Pill tone="success">ACTIVE</Pill> : <Pill tone="error">SUSPENDED</Pill>}</td>
                        <td>{o.verifiedAt ? <span className="row"><ShieldCheck size={14} color="var(--success)" /> {fmtDate(o.verifiedAt)}</span> : <Pill tone="warning">Chờ xác minh</Pill>}</td>
                        <td className="num muted">{fmtDate(o.createdAt)}</td>
                        <td className="actions">
                          <button className="icon-btn" aria-label="Xem chi tiết" title="Chi tiết & thành viên" onClick={() => setDetailId(o.id)}><Eye size={16} /></button>
                          {o.status === 'ACTIVE'
                            ? <button className="icon-btn danger" aria-label="Tạm khóa" title="Tạm khóa" onClick={() => setStatusTarget(o)}><Ban size={16} /></button>
                            : <button className="icon-btn" aria-label="Kích hoạt" title="Kích hoạt lại" onClick={() => setStatusTarget(o)}><CheckCircle2 size={16} /></button>}
                        </td>
                      </tr>
                    ))}
                    {!pageRows.length && <tr><td colSpan={6}><div className="empty"><Building2 size={28} /> Không có đơn vị nào.</div></td></tr>}
                  </tbody>
                </table>
              </div>
              <Pager {...pager} />
            </>
          )}
        </Loader>
      </section>

      {creating && <CreateOrgModal onClose={() => setCreating(false)} onDone={() => { toast('Đã tạo đơn vị mới'); state.reload(); }} />}
      {detailId && <OrgDetailModal id={detailId} onClose={() => setDetailId(null)} />}
      {statusTarget && (
        <ReasonModal
          title={statusTarget.status === 'ACTIVE' ? 'Tạm khóa đơn vị' : 'Kích hoạt lại đơn vị'}
          icon={statusTarget.status === 'ACTIVE' ? <Ban size={20} color="var(--error)" /> : <CheckCircle2 size={20} color="var(--success)" />}
          entityName={statusTarget.name}
          entityId={`#${statusTarget.id}`}
          label={statusTarget.status === 'ACTIVE' ? 'Lý do tạm khóa' : 'Ghi chú'}
          required={statusTarget.status === 'ACTIVE'}
          danger={statusTarget.status === 'ACTIVE'}
          chips={statusTarget.status === 'ACTIVE' ? ['Thiếu giấy phép', 'Vi phạm điều khoản', 'Yêu cầu từ đơn vị'] : ['Đã bổ sung hồ sơ']}
          confirmText={statusTarget.status === 'ACTIVE' ? 'Xác nhận khóa' : 'Kích hoạt'}
          onClose={() => setStatusTarget(null)}
          onConfirm={(reason) => changeStatus(statusTarget, reason)}
        />
      )}
    </>
  );
}

function CreateOrgModal({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', taxCode: '', email: '', website: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    try { await post(BASE, body); onDone(); onClose(); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal title="Thêm đơn vị tổ chức" icon={<Building2 size={20} color="var(--primary)" />} onClose={onClose}
      footer={<><button className="btn btn-neutral" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={submit} disabled={busy || f.name.trim().length < 2}>Tạo đơn vị</button></>}>
      <form className="form-grid" onSubmit={submit}>
        <label className="field full"><span className="field-label">Tên đơn vị <span className="req">*</span></span><input className="input" value={f.name} onChange={set('name')} autoFocus maxLength={100} /></label>
        <label className="field"><span className="field-label">Mã số thuế</span><input className="input mono" value={f.taxCode} onChange={set('taxCode')} maxLength={20} /></label>
        <label className="field"><span className="field-label">Email liên hệ</span><input className="input" type="email" value={f.email} onChange={set('email')} /></label>
        <label className="field full"><span className="field-label">Website</span><input className="input" type="url" placeholder="https://" value={f.website} onChange={set('website')} /></label>
        <label className="field full"><span className="field-label">Mô tả</span><textarea className="textarea" value={f.description} onChange={set('description')} maxLength={500} /></label>
      </form>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

function OrgDetailModal({ id, onClose }) {
  const toast = useToast();
  const state = useAsync(() => get(`${BASE}/${id}`), [id]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ORGANIZER_MEMBER');
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(null);

  const assign = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`${BASE}/${id}/assign-organizer`, { userEmail: email.trim(), role });
      toast(`Đã cấp quyền Organizer cho ${email.trim()}`);
      setEmail('');
      state.reload();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  return (
    <Modal wide title="Chi tiết đơn vị" icon={<Building2 size={20} color="var(--primary)" />} onClose={onClose}>
      <Loader state={state}>
        {({ org, members = [] }) => (
          <>
            <div className="entity-strip"><strong>{org.name}</strong><span className="mono muted">#{org.id}</span></div>
            <div className="form-grid">
              <Info label="Trạng thái">{org.status === 'ACTIVE' ? <Pill tone="success">ACTIVE</Pill> : <Pill tone="error">SUSPENDED</Pill>}</Info>
              <Info label="Xác minh">{org.verifiedAt ? `${new Date(org.verifiedAt).toLocaleString('vi-VN')} · ${org.verifiedBy || ''}` : 'Chưa xác minh'}</Info>
              <Info label="Email">{org.email || '—'}</Info>
              <Info label="Website">{org.website ? <a href={org.website} target="_blank" rel="noreferrer">{org.website}</a> : '—'}</Info>
              {org.description && <div className="full"><Info label="Mô tả">{org.description}</Info></div>}
            </div>

            <div>
              <div className="overline" style={{ marginBottom: 8 }}>Thành viên Organizer ({members.length})</div>
              <div className="card">
                <table>
                  <thead><tr><th>Người dùng</th><th>Trạng thái</th><th>Cấp lúc</th><th /></tr></thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td><div className="stack" style={{ gap: 2 }}><span className="mono">{m.userId}</span>{m.role && <span className="entity-sub">{m.role}</span>}</div></td>
                        <td>{m.status === 'ACTIVE' ? <Pill tone="success">ACTIVE</Pill> : <Pill tone="neutral">{m.status}</Pill>}</td>
                        <td className="num muted">{fmtDate(m.grantedAt)}</td>
                        <td className="actions">
                          {m.status === 'ACTIVE' && <button className="btn btn-sm btn-danger-soft" onClick={() => setRevoking(m)}><UserMinus size={14} /> Thu hồi</button>}
                        </td>
                      </tr>
                    ))}
                    {!members.length && <tr><td colSpan={4}><div className="empty">Chưa có Organizer.</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <form className="row wrap" onSubmit={assign} style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: '1 1 240px' }}>
                <span className="field-label">Cấp quyền Organizer theo email</span>
                <input className="input" type="email" required placeholder="nguoidung@truong.edu.vn" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <select className="select" style={{ width: 200 }} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Vai trò">
                <option value="ORGANIZER_MEMBER">Thành viên</option>
                <option value="ORGANIZER_ADMIN">Quản trị đơn vị</option>
              </select>
              <button className="btn btn-primary" disabled={busy}><UserPlus size={16} /> Cấp quyền</button>
            </form>
          </>
        )}
      </Loader>
      {revoking && (
        <ReasonModal
          title="Thu hồi quyền Organizer"
          icon={<UserMinus size={20} color="var(--error)" />}
          entityName={revoking.userId}
          entityId={`#${id}`}
          label="Lý do thu hồi"
          required={false}
          chips={['Đã nghỉ việc', 'Chuyển đơn vị', 'Yêu cầu bảo mật']}
          confirmText="Thu hồi"
          onClose={() => setRevoking(null)}
          onConfirm={async (reason) => {
            await post(`${BASE}/${id}/revoke-organizer`, { userId: revoking.userId, reason: reason || undefined });
            toast('Đã thu hồi quyền Organizer');
            state.reload();
          }}
        />
      )}
    </Modal>
  );
}

const Info = ({ label, children }) => (
  <div className="stack"><span className="overline">{label}</span><span>{children}</span></div>
);
