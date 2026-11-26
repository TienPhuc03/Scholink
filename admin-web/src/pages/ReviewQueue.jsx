import { useState } from 'react';
import { ClipboardCheck, Check, X, GitMerge, Eye, Ban, RefreshCw, Inbox } from 'lucide-react';
import { get, post } from '../api.js';
import { Loader, Modal, Pager, Pill, ReasonModal, TYPE_LABEL, fmtDate, fmtDateTime, useAsync, useToast } from '../ui.jsx';

const BASE = '/api/v1/admin/opportunities';
const REJECT_CHIPS = ['Thiếu điều lệ', 'Trùng đề tài', 'Score thấp', 'Nguồn không xác thực', 'Hết hạn đăng ký'];

export default function ReviewQueue({ user, q }) {
  const toast = useToast();
  const [type, setType] = useState('');
  const [fuzzyOnly, setFuzzyOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [rejecting, setRejecting] = useState(null); // opp | 'BULK'
  const [merging, setMerging] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);

  const state = useAsync(() => {
    const p = new URLSearchParams({ page, limit: 10 });
    if (type) p.set('type', type);
    if (q) p.set('search', q);
    if (fuzzyOnly) p.set('fuzzyOnly', 'true');
    return get(`${BASE}/review-queue?${p}`);
  }, [page, type, q, fuzzyOnly]);

  const items = state.data?.items || [];
  const refresh = () => { setSelected(new Set()); state.reload(); };
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = items.length > 0 && items.every((o) => selected.has(o.id));

  const [approving, setApproving] = useState(null);

  const bulk = async (fn, label) => {
    setBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map(fn));
    const failed = results.filter((r) => r.status === 'rejected');
    toast(`${label} ${ids.length - failed.length}/${ids.length} cơ hội${failed.length ? ` · lỗi: ${failed[0].reason.message}` : ''}`, failed.length ? 'error' : 'success');
    setBusy(false);
    refresh();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Kiểm duyệt cơ hội</h1>
          <p className="page-sub">Hàng chờ <span className="mono">PENDING_REVIEW</span> từ crawler — duyệt, từ chối hoặc gộp bản trùng.</p>
        </div>
        <button className="btn btn-neutral" onClick={refresh} disabled={state.loading}><RefreshCw size={16} /> Làm mới</button>
      </div>

      <section className="card">
        <div className="filters">
          <div className="segmented">
            {[['', 'Tất cả'], ['SCHOLARSHIP', 'Học bổng'], ['COMPETITION', 'Cuộc thi']].map(([k, l]) => (
              <button key={k} className={type === k ? 'active' : ''} onClick={() => { setType(k); setPage(1); }}>{l}</button>
            ))}
          </div>
          <label className="row" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>
            <input type="checkbox" checked={fuzzyOnly} onChange={(e) => { setFuzzyOnly(e.target.checked); setPage(1); }} /> Chỉ hiện nghi trùng
          </label>
          <span className="spacer" style={{ flex: 1 }} />
          <span className="muted num">{state.data?.total ?? 0} đang chờ</span>
        </div>
        <Loader state={state}>
          {(data) => (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}><input type="checkbox" aria-label="Chọn tất cả" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((o) => o.id)))} /></th>
                      <th>Cơ hội</th><th>Loại</th><th>Hạn đăng ký</th><th>Độ tin cậy</th><th>Nghi trùng</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((o) => (
                      <tr key={o.id}>
                        <td><input type="checkbox" aria-label={`Chọn ${o.title}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} /></td>
                        <td style={{ maxWidth: 380 }}>
                          <div className="entity-name">{o.title}</div>
                          <div className="entity-sub">{o.organizerName} · <span className="mono">{o.id}</span></div>
                        </td>
                        <td><span className="chip">{TYPE_LABEL[o.type] || o.type}</span></td>
                        <td className="num">{fmtDate(o.registerDeadline)}</td>
                        <td className="num">{o.confidenceScore != null ? <Pill tone={o.confidenceScore >= 0.8 ? 'success' : o.confidenceScore >= 0.5 ? 'warning' : 'error'}>{Math.round(o.confidenceScore * 100)}%</Pill> : '—'}</td>
                        <td>{o.candidateMergeIds?.length ? <Pill tone="warning">{o.candidateMergeIds.length} bản</Pill> : <span className="faint">—</span>}</td>
                        <td className="actions">
                          <button className="icon-btn" title="Xem dữ liệu" aria-label="Xem dữ liệu" onClick={() => setViewing(o)}><Eye size={16} /></button>
                          <button className="icon-btn" title="Gộp" aria-label="Gộp" onClick={() => setMerging(o)}><GitMerge size={16} /></button>
                          <button className="btn btn-sm btn-danger-soft" onClick={() => setRejecting(o)}><X size={14} /> Từ chối</button>{' '}
                          <button className="btn btn-sm btn-success-soft" onClick={() => setApproving(o)}><Check size={14} /> Duyệt</button>
                        </td>
                      </tr>
                    ))}
                    {!items.length && <tr><td colSpan={7}><div className="empty"><Inbox size={28} /> Hàng chờ trống — không có cơ hội cần kiểm duyệt.</div></td></tr>}
                  </tbody>
                </table>
              </div>
              <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
            </>
          )}
        </Loader>
      </section>

      {selected.size > 0 && (
        <div className="bulkbar" role="toolbar" aria-label="Thao tác hàng loạt">
          <strong className="num">{selected.size} đã chọn</strong>
          <button className="btn btn-sm btn-neutral" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => setRejecting('BULK')}><Ban size={14} /> Từ chối</button>
          <button className="btn btn-sm btn-primary" disabled={busy}
            onClick={() => bulk((id) => post(`${BASE}/${id}/approve`, { actorId: user.id, reason: 'Duyệt hàng loạt từ Portal' }), 'Đã duyệt')}>
            <Check size={14} /> Duyệt tất cả
          </button>
        </div>
      )}

      {rejecting && (
        <ReasonModal
          title={rejecting === 'BULK' ? `Từ chối ${selected.size} cơ hội` : 'Từ chối cơ hội'}
          icon={<Ban size={20} color="var(--error)" />}
          entityName={rejecting === 'BULK' ? `${selected.size} cơ hội đã chọn` : rejecting.title}
          entityId={rejecting === 'BULK' ? null : rejecting.id}
          label="Lý do từ chối"
          chips={REJECT_CHIPS}
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            if (rejecting === 'BULK') return bulk((id) => post(`${BASE}/${id}/reject`, { actorId: user.id, reason }), 'Đã từ chối');
            await post(`${BASE}/${rejecting.id}/reject`, { actorId: user.id, reason });
            toast(`Đã từ chối: ${rejecting.title}`);
            refresh();
          }}
        />
      )}
      {approving && <ApproveModal opp={approving} user={user} onClose={() => setApproving(null)} onDone={() => { toast(`Đã công bố: ${approving.title}`); refresh(); }} />}
      {merging && <MergeModal opp={merging} user={user} onClose={() => setMerging(null)} onDone={refresh} />}
      {viewing && <DiffModal opp={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

const toLocalInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};

/** Duyệt công bố: cho admin bổ sung các trường schema bắt buộc trước khi publish (gửi kèm updateFields). */
function ApproveModal({ opp, user, onClose, onDone }) {
  const [f, setF] = useState({
    organizerName: opp.organizerName || '',
    registerDeadline: toLocalInput(opp.registerDeadline),
    timezone: opp.timezone || 'Asia/Ho_Chi_Minh',
    sourceUrl: opp.sourceUrl || '',
    fundingLevel: opp.fundingLevel || '',
    competitionMode: opp.competitionMode || '',
    minTeamSize: opp.minTeamSize ?? 1,
    maxTeamSize: opp.maxTeamSize ?? 1,
  });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true); setError('');
    const updateFields = {
      organizerName: f.organizerName.trim(),
      registerDeadline: f.registerDeadline ? new Date(f.registerDeadline).toISOString() : undefined,
      timezone: f.timezone.trim(),
    };
    if (f.sourceUrl.trim()) updateFields.sourceUrl = f.sourceUrl.trim();
    if (opp.type === 'SCHOLARSHIP') updateFields.fundingLevel = f.fundingLevel || undefined;
    else Object.assign(updateFields, { competitionMode: f.competitionMode || undefined, minTeamSize: Number(f.minTeamSize), maxTeamSize: Number(f.maxTeamSize) });
    try {
      await post(`${BASE}/${opp.id}/approve`, { actorId: user.id, reason: reason.trim() || 'Admin duyệt công bố từ Portal', expectedVersion: opp.version, updateFields });
      onDone(); onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal title="Duyệt & công bố" icon={<Check size={20} color="var(--success)" />} onClose={onClose}
      footer={<><button className="btn btn-neutral" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={submit} disabled={busy}><Check size={16} /> Công bố</button></>}>
      <div className="entity-strip"><strong>{opp.title}</strong><span className="mono muted">{opp.id}</span></div>
      <div className="form-grid">
        <label className="field full"><span className="field-label">Đơn vị tổ chức <span className="req">*</span></span><input className="input" value={f.organizerName} onChange={set('organizerName')} /></label>
        <label className="field"><span className="field-label">Hạn đăng ký <span className="req">*</span></span><input className="input" type="datetime-local" value={f.registerDeadline} onChange={set('registerDeadline')} /></label>
        <label className="field"><span className="field-label">Múi giờ <span className="req">*</span></span><input className="input mono" value={f.timezone} onChange={set('timezone')} /></label>
        {opp.type === 'SCHOLARSHIP' ? (
          <label className="field full">
            <span className="field-label">Mức tài trợ <span className="req">*</span></span>
            <select className="select" value={f.fundingLevel} onChange={set('fundingLevel')}>
              <option value="">— Chọn —</option><option value="FULL">Toàn phần</option><option value="PARTIAL">Bán phần</option><option value="OTHER">Khác</option>
            </select>
          </label>
        ) : (
          <>
            <label className="field full">
              <span className="field-label">Hình thức thi <span className="req">*</span></span>
              <select className="select" value={f.competitionMode} onChange={set('competitionMode')}>
                <option value="">— Chọn —</option><option value="INDIVIDUAL">Cá nhân</option><option value="TEAM">Theo đội</option>
              </select>
            </label>
            <label className="field"><span className="field-label">Thành viên tối thiểu</span><input className="input num" type="number" min="1" value={f.minTeamSize} onChange={set('minTeamSize')} /></label>
            <label className="field"><span className="field-label">Thành viên tối đa</span><input className="input num" type="number" min="1" value={f.maxTeamSize} onChange={set('maxTeamSize')} /></label>
          </>
        )}
        {opp.applyMode === 'EXTERNAL' && <label className="field full"><span className="field-label">URL nguồn <span className="req">*</span></span><input className="input" type="url" value={f.sourceUrl} onChange={set('sourceUrl')} /></label>}
        <label className="field full"><span className="field-label">Ghi chú duyệt</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Admin duyệt công bố từ Portal" /></label>
      </div>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

function DiffModal({ opp, onClose }) {
  const state = useAsync(() => get(`${BASE}/${opp.id}/diff`), [opp.id]);
  return (
    <Modal wide title="Dữ liệu crawler" icon={<Eye size={20} color="var(--primary)" />} onClose={onClose}>
      <Loader state={state}>
        {(d) => (
          <>
            <div className="entity-strip"><strong>{d.title}</strong><span className="mono muted">{d.id}</span></div>
            <FieldTable fields={d.currentParsed} />
            {d.confidenceBreakdown && (
              <div>
                <div className="overline" style={{ marginBottom: 6 }}>Phân rã độ tin cậy</div>
                <div className="row wrap">{Object.entries(d.confidenceBreakdown).map(([k, v]) => <span key={k} className="chip mono">{k}: {String(v)}</span>)}</div>
              </div>
            )}
            {d.rawOriginalPayload && (
              <div>
                <div className="overline" style={{ marginBottom: 6 }}>Payload gốc</div>
                <pre className="hash-box" style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>{JSON.stringify(d.rawOriginalPayload, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </Loader>
    </Modal>
  );
}

function MergeModal({ opp, user, onClose, onDone }) {
  const toast = useToast();
  const [targetId, setTargetId] = useState(opp.candidateMergeIds?.[0] || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const diff = useAsync(() => (targetId.trim() ? get(`${BASE}/${opp.id}/diff?targetId=${encodeURIComponent(targetId.trim())}`) : Promise.resolve(null)), [targetId]);

  const submit = async () => {
    setBusy(true);
    try {
      await post(`${BASE}/${opp.id}/merge`, { targetOpportunityId: targetId.trim(), actorId: user.id, reason: reason.trim() || undefined });
      toast(`Đã gộp vào ${targetId.trim()}`);
      onDone(); onClose();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };

  return (
    <Modal wide title="Gộp cơ hội trùng" icon={<GitMerge size={20} color="var(--primary)" />} onClose={onClose}
      footer={<><button className="btn btn-neutral" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={submit} disabled={busy || !diff.data?.mergeTarget}><GitMerge size={16} /> Gộp vào bản chuẩn</button></>}>
      <div className="entity-strip"><strong>{opp.title}</strong><span className="mono muted">{opp.id}</span></div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Cơ hội đích (bản chuẩn) <span className="req">*</span></span>
          {opp.candidateMergeIds?.length ? (
            <select className="select mono" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {opp.candidateMergeIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          ) : (
            <input className="input mono" placeholder="opp_..." value={targetId} onChange={(e) => setTargetId(e.target.value)} />
          )}
        </label>
        <label className="field"><span className="field-label">Lý do</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Gộp theo BR14" /></label>
      </div>
      {diff.error && <div className="error-box">{diff.error.message}</div>}
      {diff.data?.mergeTarget && (
        <div className="form-grid">
          <div><div className="overline" style={{ marginBottom: 6 }}>Bản crawler</div><FieldTable fields={pick(diff.data.currentParsed)} /></div>
          <div><div className="overline" style={{ marginBottom: 6 }}>Bản chuẩn</div><FieldTable fields={pick(diff.data.mergeTarget)} /></div>
        </div>
      )}
    </Modal>
  );
}

const pick = (o) => ({ title: o.title, organizerName: o.organizerName, registerDeadline: o.registerDeadline, timezone: o.timezone, fundingLevel: o.fundingLevel, competitionMode: o.competitionMode });

function FieldTable({ fields }) {
  const fmt = (k, v) => (v == null || v === '' ? '—' : /Deadline/.test(k) ? fmtDateTime(v) : Array.isArray(v) ? v.join(', ') : String(v));
  return (
    <div className="card">
      <table>
        <tbody>
          {Object.entries(fields || {}).map(([k, v]) => (
            <tr key={k}><td className="mono muted" style={{ width: 160, padding: '10px 14px' }}>{k}</td><td style={{ padding: '10px 14px', wordBreak: 'break-word' }}>{fmt(k, v)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
