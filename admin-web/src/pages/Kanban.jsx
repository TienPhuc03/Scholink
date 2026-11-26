import { useState } from 'react';
import { KanbanSquare, RefreshCw, Ban, Users, User, FileText, ShieldCheck, ArrowRight, Paperclip } from 'lucide-react';
import { get, patch } from '../api.js';
import { CopyBox, Loader, Modal, Pill, ReasonModal, fmtDateTime, matches, navigate, useAsync, useToast } from '../ui.jsx';

// Cột trả về từ API -> status dùng khi PATCH
const COLUMNS = [
  ['APPLIED', 'SUBMITTED', 'Mới nộp', 'info'],
  ['REVIEWING', 'REVIEWING', 'Đang duyệt', 'review'],
  ['SHORTLISTED', 'SHORTLISTED', 'Vòng trong', 'review'],
  ['INTERVIEW', 'INTERVIEW', 'Phỏng vấn', 'review'],
  ['ACCEPTED', 'ACCEPTED', 'Trúng tuyển', 'good'],
  ['REJECTED', 'REJECTED', 'Từ chối', 'bad'],
];
const STATUS_LABEL = Object.fromEntries(COLUMNS.map(([, s, l]) => [s, l]));
const REJECT_CHIPS = ['Thiếu giấy tờ', 'Không đủ điều kiện GPA', 'Score thấp', 'Trùng đề tài', 'Quá hạn nộp'];
const SCREENING = { ELIGIBLE: ['success', 'Đủ điều kiện'], INELIGIBLE: ['error', 'Không đủ ĐK'], NEEDS_REVIEW: ['warning', 'Cần xem xét'] };

export default function Kanban({ user, params, q }) {
  const opps = useAsync(() => get('/api/v1/opportunities/organizer/my-opportunities'));
  const inApp = (opps.data || []).filter((o) => o.applyMode !== 'EXTERNAL');
  const oppId = params.opp || inApp[0]?.id;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Kanban hồ sơ ứng tuyển</h1>
          <p className="page-sub">Kéo thả thẻ giữa các cột để chuyển trạng thái. Từ chối bắt buộc có lý do.</p>
        </div>
        <select className="select" style={{ width: 380 }} value={oppId || ''} onChange={(e) => navigate('kanban', { opp: e.target.value })} aria-label="Chọn cơ hội" disabled={!inApp.length}>
          {!inApp.length && <option>{opps.loading ? 'Đang tải...' : 'Chưa có cơ hội nộp trong ứng dụng'}</option>}
          {inApp.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
      </div>
      {opps.error && <div className="error-box">{opps.error.message}</div>}
      {oppId && <Board key={oppId} oppId={oppId} user={user} q={q} />}
      {!opps.loading && !inApp.length && <div className="card empty"><KanbanSquare size={28} /> Chưa có cơ hội nào để xét duyệt.</div>}
    </>
  );
}

function Board({ oppId, q }) {
  const toast = useToast();
  const state = useAsync(() => get(`/api/v1/applications/organizer/kanban/${oppId}`), [oppId]);
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [detail, setDetail] = useState(null);

  const all = Object.values(state.data?.columns || {}).flat();

  const move = async (app, status, note) => {
    try {
      await patch(`/api/v1/applications/${app.id}/status`, { status, expectedVersion: app.version, note: note || undefined });
      toast(`Đã chuyển hồ sơ sang "${STATUS_LABEL[status]}"`);
    } catch (e) {
      toast(e.message, 'error');
      if (note) throw e;
    } finally {
      state.reload();
    }
  };

  const requestMove = (app, status) => {
    if (!app || app.status === status) return;
    if (status === 'REJECTED') setRejecting(app);
    else move(app, status);
  };

  const onDrop = (status) => (e) => {
    e.preventDefault();
    setOver(null);
    requestMove(all.find((a) => a.id === (e.dataTransfer.getData('text/plain') || dragId)), status);
    setDragId(null);
  };

  return (
    <Loader state={state}>
      {(data) => (
        <>
          <div className="row between">
            <div className="row">
              <span className="overline">Tổng hồ sơ</span>
              <strong className="num">{data.totalApplications}</strong>
            </div>
            <button className="btn btn-neutral btn-sm" onClick={state.reload} disabled={state.loading}><RefreshCw size={14} /> Tải lại</button>
          </div>
          <div className="kanban">
            {COLUMNS.map(([key, status, label, accent]) => {
              const cards = (data.columns[key] || []).filter((a) => matches(q, a.studentId, a.id, a.teamId));
              return (
                <div
                  key={key}
                  className={`kcol ${over === key ? 'drop' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(key); }}
                  onDragLeave={() => setOver((o) => (o === key ? null : o))}
                  onDrop={onDrop(status)}
                  aria-label={`Cột ${label}`}
                >
                  <div className="kcol-head">
                    <span className="overline">{label}</span>
                    <span className="pill neutral nodot num">{cards.length}</span>
                  </div>
                  {cards.map((a) => {
                    const [tone, sLabel] = SCREENING[a.screening] || ['neutral', a.screening || '—'];
                    return (
                      <article
                        key={a.id}
                        className={`kcard accent-${accent}`}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', a.id); setDragId(a.id); }}
                        onClick={() => setDetail(a)}
                        onKeyDown={(e) => e.key === 'Enter' && setDetail(a)}
                        tabIndex={0}
                      >
                        <div className="row between" style={{ alignItems: 'flex-start' }}>
                          <div className="kcard-title">{a.submissionType === 'TEAM' ? `Đội ${a.teamId || ''}` : a.studentId}</div>
                          {a.submissionType === 'TEAM' ? <Users size={16} className="faint" /> : <User size={16} className="faint" />}
                        </div>
                        <div className="row wrap">
                          <Pill tone={tone}>{sLabel}</Pill>
                          {a.memberIds?.length > 0 && <span className="chip">{a.memberIds.length} thành viên</span>}
                        </div>
                        <div className="kcard-foot">
                          <span className="num">{fmtDateTime(a.submittedAt)}</span>
                          <select
                            className="select"
                            style={{ height: 28, width: 'auto', fontSize: 12, padding: '0 6px' }}
                            value=""
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => requestMove(a, e.target.value)}
                            aria-label="Chuyển trạng thái"
                          >
                            <option value="">Chuyển…</option>
                            {COLUMNS.filter(([, s]) => s !== a.status).map(([, s, l]) => <option key={s} value={s}>{l}</option>)}
                          </select>
                        </div>
                      </article>
                    );
                  })}
                  {!cards.length && <div className="faint" style={{ fontSize: 12, textAlign: 'center', padding: '24px 0' }}>Thả thẻ vào đây</div>}
                </div>
              );
            })}
          </div>

          {rejecting && (
            <ReasonModal
              title="Từ chối hồ sơ"
              icon={<Ban size={20} color="var(--error)" />}
              entityName={rejecting.submissionType === 'TEAM' ? `Đội ${rejecting.teamId}` : rejecting.studentId}
              entityId={`#${rejecting.id}`}
              label="Lý do từ chối"
              chips={REJECT_CHIPS}
              onClose={() => setRejecting(null)}
              onConfirm={(note) => move(rejecting, 'REJECTED', note)}
            />
          )}
          {detail && <ApplicationDetail app={detail} onClose={() => setDetail(null)} onMove={(s) => { setDetail(null); requestMove(detail, s); }} />}
        </>
      )}
    </Loader>
  );
}

function ApplicationDetail({ app, onClose, onMove }) {
  const state = useAsync(async () => {
    const [d, att] = await Promise.all([
      get(`/api/v1/applications/organizer/${app.id}`),
      get(`/api/v1/applications/organizer/${app.id}/attachments`).catch(() => null),
    ]);
    return { d, att };
  }, [app.id]);

  return (
    <Modal wide title="Chi tiết hồ sơ" icon={<FileText size={20} color="var(--primary)" />} onClose={onClose}
      footer={<>
        {COLUMNS.filter(([, s]) => s !== app.status).map(([, s, l]) => (
          <button key={s} className={`btn btn-sm ${s === 'REJECTED' ? 'btn-danger-soft' : s === 'ACCEPTED' ? 'btn-success-soft' : 'btn-neutral'}`} onClick={() => onMove(s)}>{l}</button>
        ))}
      </>}>
      <Loader state={state}>
        {({ d, att }) => (
          <>
            <div className="entity-strip"><strong>{d.opportunityTitle}</strong><span className="mono muted">#{d.id}</span></div>
            <div className="form-grid">
              <Info label="Ứng viên"><span className="mono">{d.studentId}</span></Info>
              <Info label="Trạng thái"><Pill tone="info">{STATUS_LABEL[d.status] || d.status}</Pill> <span className="mono faint">v{d.version}</span></Info>
              <Info label="Hình thức">{d.submissionType === 'TEAM' ? `Theo đội · ${d.teamId}` : 'Cá nhân'}</Info>
              <Info label="Nộp lúc"><span className="num">{fmtDateTime(d.submittedAt)}</span></Info>
              <Info label="Sàng lọc">{(SCREENING[d.screening] || [])[1] || d.screening}</Info>
              <Info label="Snapshot"><span className="mono">{d.snapshotId} · profile v{d.profileVersion}</span></Info>
            </div>
            {d.screeningReasons?.length > 0 && (
              <div className="row wrap">{d.screeningReasons.map((r, i) => <span key={i} className="chip">{r.message || r.code || String(r)}</span>)}</div>
            )}
            <div>
              <div className="overline row" style={{ marginBottom: 6 }}><ShieldCheck size={14} color="var(--success)" /> Payload SHA-256</div>
              <CopyBox value={d.payloadHash} />
            </div>
            <div>
              <div className="overline row" style={{ marginBottom: 6 }}><Paperclip size={14} /> Tệp đính kèm ({att?.attachments?.length || 0})</div>
              {att?.attachments?.length ? (
                <div className="row wrap">{att.attachments.map((f) => <span key={f.assetId} className="chip mono">{f.assetId} · {f.status}</span>)}</div>
              ) : <span className="faint">Không có tệp đính kèm.</span>}
            </div>
            <div>
              <div className="overline" style={{ marginBottom: 10 }}>Audit trail</div>
              <div className="timeline">
                {(d.history || []).map((h, i) => (
                  <div key={h.id || i} className="tl-item">
                    <span className={`tl-dot ${h.toStatus === 'REJECTED' ? 'error' : h.toStatus === 'ACCEPTED' ? 'success' : ''}`}><ArrowRight size={14} /></span>
                    <div className="stack" style={{ gap: 2 }}>
                      <span><strong>{STATUS_LABEL[h.fromStatus] || h.fromStatus || 'Khởi tạo'}</strong> → <strong>{STATUS_LABEL[h.toStatus] || h.toStatus}</strong></span>
                      <span className="muted" style={{ fontSize: 13 }}>{h.reason}</span>
                      <span className="faint mono">{h.actorId} · {fmtDateTime(h.createdAt)}</span>
                    </div>
                  </div>
                ))}
                {!d.history?.length && <span className="faint">Chưa có sự kiện.</span>}
              </div>
            </div>
          </>
        )}
      </Loader>
    </Modal>
  );
}

const Info = ({ label, children }) => <div className="stack"><span className="overline">{label}</span><span>{children}</span></div>;
