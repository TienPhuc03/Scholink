import { Briefcase, Radar, Wallet, FileCheck2, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { get } from '../api.js';
import { Kpi, Loader, Pill, fmtNum, fmtVnd, fmtDateTime, useAsync, matches } from '../ui.jsx';

export default function AdminDashboard({ q }) {
  const state = useAsync(async () => {
    const [bo, alerts] = await Promise.all([
      get('/api/v1/admin/opportunities/analytics/bo-dashboard'),
      get('/api/v1/admin/opportunities/crawler/alerts?limit=8').catch(() => []),
    ]);
    return { bo, alerts };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tổng quan hệ thống</h1>
          <p className="page-sub">Chỉ số BO, crawler và giao dịch — không chứa dữ liệu cá nhân (FR-ADM-03).</p>
        </div>
        <button className="btn btn-neutral" onClick={state.reload} disabled={state.loading}><RefreshCw size={16} /> Làm mới</button>
      </div>
      <Loader state={state}>
        {({ bo, alerts }) => {
          const b = bo.breakdowns || {};
          const cat = b.verifiedDemoCatalog || {};
          const cr = bo.crawlerSummary || {};
          const pay = b.sandboxVsRealPayments || {};
          const apps = b.applicationsVsExternalMarks || {};
          const healthyPct = cr.totalSources ? Math.round((cr.healthySources / cr.totalSources) * 100) : 0;
          const metrics = (bo.boMetrics || []).filter((m) => matches(q, m.boCode, m.boTitle, m.metricName));
          return (
            <>
              <div className="grid-kpi">
                <Kpi label="Tổng cơ hội" value={fmtNum(cat.totalOpportunities)} icon={<Briefcase size={16} />}
                  foot={<span className="muted num">{fmtNum(cat.scholarshipsCount)} học bổng · {fmtNum(cat.competitionsCount)} cuộc thi</span>} />
                <Kpi label="Nguồn crawler khỏe" value={`${fmtNum(cr.healthySources)}/${fmtNum(cr.totalSources)}`} icon={<Radar size={16} />} tone="success"
                  foot={<div className="progress ok"><span style={{ width: `${healthyPct}%` }} /></div>} />
                <Kpi label="Hồ sơ nộp trực tiếp" value={fmtNum(apps.directApplicationsCount)} icon={<FileCheck2 size={16} />} tone="warning"
                  foot={<span className="muted num">{fmtNum(apps.externalMarksCount)} đánh dấu đăng ký ngoài</span>} />
                <Kpi label="Giao dịch sandbox" value={fmtNum(pay.sandboxTransactionsCount)} icon={<Wallet size={16} />}
                  foot={<span className="muted num">{fmtVnd(pay.sandboxVolumeVnd)} · thật: {fmtVnd(pay.realVolumeVnd)}</span>} />
              </div>

              <div className="grid-2">
                <section className="card">
                  <div className="card-head">
                    <div>
                      <div className="card-title">Chỉ số mục tiêu kinh doanh (BO)</div>
                      <div className="muted" style={{ fontSize: 12 }}>{bo.period} · cập nhật {fmtDateTime(bo.generatedAt)}</div>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Mã</th><th>Chỉ số</th><th>Tỷ lệ</th><th>Ngưỡng</th><th>Trạng thái</th></tr></thead>
                      <tbody>
                        {metrics.map((m) => (
                          <tr key={m.boCode}>
                            <td><span className="id-pill">{m.boCode}</span></td>
                            <td>
                              <div className="entity-name">{m.boTitle}</div>
                              <div className="entity-sub">{m.metricName} · <span className="num">{fmtNum(m.numeratorValue)}/{fmtNum(m.denominatorValue)}</span></div>
                            </td>
                            <td style={{ minWidth: 120 }}>
                              <div className="num" style={{ fontWeight: 700, marginBottom: 6 }}>{m.ratioPercentage}%</div>
                              <div className={`progress ${m.isCompliant ? 'ok' : 'bad'}`}><span style={{ width: `${Math.min(100, m.ratioPercentage)}%` }} /></div>
                            </td>
                            <td className="mono">{m.targetThreshold}</td>
                            <td>{m.isCompliant ? <Pill tone="success">Đạt</Pill> : <Pill tone="warning">Chưa đạt</Pill>}</td>
                          </tr>
                        ))}
                        {!metrics.length && <tr><td colSpan={5}><div className="empty">Không có chỉ số phù hợp.</div></td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="card">
                  <div className="card-head"><div className="card-title">Pipeline crawler</div></div>
                  <div className="card-pad stack" style={{ gap: 14 }}>
                    {[
                      ['Đã thu thập', cr.totalFetched],
                      ['Đã công bố', cr.totalPublished],
                      ['Đã gộp trùng', cr.totalMerged],
                      ['Bị loại', cr.totalRejected],
                      ['Lỗi', cr.totalErrors],
                    ].map(([label, v]) => (
                      <div key={label} className="row between"><span className="muted">{label}</span><strong className="num">{fmtNum(v)}</strong></div>
                    ))}
                    <div className="overline" style={{ marginTop: 6 }}>Cảnh báo gần đây</div>
                    {alerts.length === 0 && <div className="row muted"><CheckCircle2 size={16} color="var(--success)" /> Không có cảnh báo.</div>}
                    {alerts.map((a, i) => (
                      <div key={a.id || i} className="row" style={{ alignItems: 'flex-start' }}>
                        <AlertTriangle size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div className="stack" style={{ gap: 2 }}>
                          <span style={{ fontSize: 13 }}>{a.message || a.title || a.type}</span>
                          <span className="faint" style={{ fontSize: 12 }}>{a.sourceId} · {fmtDateTime(a.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          );
        }}
      </Loader>
    </>
  );
}
