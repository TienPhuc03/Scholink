import { Briefcase, CheckCircle2, FileStack, AlarmClock, KanbanSquare, RefreshCw } from 'lucide-react';
import { get } from '../api.js';
import { Kpi, Loader, OppStatus, Pill, TYPE_LABEL, fmtDate, fmtNum, hoursLeft, matches, navigate, useAsync } from '../ui.jsx';

export default function OrganizerDashboard({ q }) {
  const state = useAsync(async () => {
    const opps = await get('/api/v1/opportunities/organizer/my-opportunities');
    // Đếm hồ sơ theo từng cơ hội nộp trong ứng dụng (mỗi cơ hội 1 request Kanban).
    const boards = await Promise.all(
      opps.filter((o) => o.applyMode !== 'EXTERNAL').map((o) =>
        get(`/api/v1/applications/organizer/kanban/${o.id}`).catch(() => null)),
    );
    const counts = Object.fromEntries(boards.filter(Boolean).map((b) => [b.opportunityId, b]));
    return { opps, counts };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tổng quan đơn vị</h1>
          <p className="page-sub">Tình hình tiếp nhận hồ sơ của các cơ hội đang quản lý.</p>
        </div>
        <button className="btn btn-neutral" onClick={state.reload} disabled={state.loading}><RefreshCw size={16} /> Làm mới</button>
      </div>
      <Loader state={state}>
        {({ opps, counts }) => {
          const total = Object.values(counts).reduce((s, b) => s + b.totalApplications, 0);
          const pending = Object.values(counts).reduce((s, b) => s + (b.columns.APPLIED?.length || 0) + (b.columns.REVIEWING?.length || 0), 0);
          const open = opps.filter((o) => o.status === 'PUBLISHED' && hoursLeft(o.registerDeadline) > 0);
          const expiring = open.filter((o) => hoursLeft(o.registerDeadline) < 48);
          const rows = opps.filter((o) => matches(q, o.title, o.id));
          return (
            <>
              <div className="grid-kpi">
                <Kpi label="Cơ hội quản lý" value={fmtNum(opps.length)} icon={<Briefcase size={16} />} />
                <Kpi label="Đang mở tiếp nhận" value={fmtNum(open.length)} icon={<CheckCircle2 size={16} />} tone="success" />
                <Kpi label="Tổng hồ sơ" value={fmtNum(total)} icon={<FileStack size={16} />} foot={<span className="muted num">{fmtNum(pending)} chờ xử lý</span>} />
                <Kpi label="Sắp hết hạn < 48h" value={fmtNum(expiring.length)} icon={<AlarmClock size={16} />} tone="warning" />
              </div>
              <section className="card">
                <div className="card-head"><div className="card-title">Cơ hội & hồ sơ</div></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Cơ hội</th><th>Loại</th><th>Trạng thái</th><th>Hạn đăng ký</th><th>Hồ sơ</th><th>Chờ xử lý</th><th /></tr></thead>
                    <tbody>
                      {rows.map((o) => {
                        const b = counts[o.id];
                        const h = hoursLeft(o.registerDeadline);
                        return (
                          <tr key={o.id}>
                            <td style={{ maxWidth: 380 }}><div className="entity-name">{o.title}</div><div className="mono faint">{o.id}</div></td>
                            <td><span className="chip">{TYPE_LABEL[o.type]}</span></td>
                            <td>{o.status === 'PUBLISHED' && h > 0 ? <Pill tone="success">ĐANG MỞ TIẾP NHẬN</Pill> : <OppStatus status={o.status} />}</td>
                            <td className="num">{fmtDate(o.registerDeadline)} {h > 0 && h < 48 && <Pill tone="warning">{Math.ceil(h)}h</Pill>}</td>
                            <td className="num">{b ? fmtNum(b.totalApplications) : <span className="faint">Ngoài app</span>}</td>
                            <td className="num">{b ? fmtNum((b.columns.APPLIED?.length || 0) + (b.columns.REVIEWING?.length || 0)) : '—'}</td>
                            <td className="actions">{b && <button className="btn btn-sm btn-tint" onClick={() => navigate('kanban', { opp: o.id })}><KanbanSquare size={14} /> Kanban</button>}</td>
                          </tr>
                        );
                      })}
                      {!rows.length && <tr><td colSpan={7}><div className="empty">Chưa có cơ hội.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          );
        }}
      </Loader>
    </>
  );
}
