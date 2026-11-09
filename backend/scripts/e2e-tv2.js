/* Run from backend/: node scripts/e2e-tv2.js  (stack + seed must be running; see docs/TV2_BAO_CAO_F29_F38_F44_UAT.md)
 * TV2 end-to-end check through the real gateway (localhost:3000) with Mongo + Redis + BullMQ.
 * Roles: guest, student, admin. Reminder jobs are promoted in BullMQ so the worker runs now
 * instead of 7/3/1 days before the deadline. Prints one line per check and a JSON summary. */
const { Queue } = require('bullmq');

const GW = 'http://localhost:3000/api/v1';
const NOTI = 'http://localhost:3005/api/v1/notifications'; // internal (service-to-service) port
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(id, title, ok, detail = '') {
  results.push({ id, title, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${title}${detail ? '  — ' + detail : ''}`);
}

async function call(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  }).catch((e) => {
    throw new Error(`${method} ${url} -> ${e.name}: ${e.message}`);
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

const unwrap = (d) => (d && d.data && !Array.isArray(d) && d.accessToken === undefined ? d.data : d);

async function login(email, password) {
  const r = await call('POST', `${GW}/auth/login`, { body: { email, password } });
  const d = unwrap(r.data) || {};
  return { status: r.status, token: d.accessToken, userId: d.user?.id || d.user?.userId };
}

async function main() {
  // ------------------------------------------------------------------ guest
  const g1 = await call('GET', `${GW}/opportunities?limit=5`);
  check('G1', 'Khách xem catalog không cần đăng nhập', g1.status === 200 && g1.data.items.length > 0, `${g1.data?.items?.length} mục`);
  const anyId = g1.data.items[0].id;
  const g2 = await call('POST', `${GW}/opportunities/${anyId}/bookmark`, { body: { bookmarked: true } });
  check('G2', 'Khách lưu cơ hội bị từ chối (401)', g2.status === 401, `HTTP ${g2.status}`);
  const g3 = await call('GET', `${GW}/notifications/reminders?userId=x`);
  check('G3', 'Endpoint nội bộ /notifications/reminders bị chặn ở gateway', g3.status === 404, `HTTP ${g3.status}`);
  const g4 = await call('POST', `${GW}/notifications/transactional`, {
    body: { userId: 'victim', businessKey: 'x', type: 'SYSTEM', title: 'spam', body: 'spam' },
  });
  check('G4', 'Không tạo được thông báo cho người khác qua gateway', g4.status === 404, `HTTP ${g4.status}`);

  // ------------------------------------------------------------------ catalog
  const seen = new Set();
  let cursor = null;
  let pages = 0;
  let dup = false;
  let closed = 0;
  do {
    const r = await call('GET', `${GW}/opportunities?limit=7${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    for (const it of r.data.items) {
      if (seen.has(it.id)) dup = true;
      seen.add(it.id);
      if (new Date(it.registerDeadline).getTime() <= Date.now()) closed++;
    }
    cursor = r.data.hasMore ? r.data.nextCursor : null;
    pages++;
  } while (cursor && pages < 20);
  check('C1', 'Phân trang cursor đi hết catalog, không lặp', !dup && seen.size >= 30 && pages > 1, `${seen.size} cơ hội / ${pages} trang`);
  check('C2', 'Catalog mặc định không có cơ hội đã đóng', closed === 0, `${closed} đã đóng`);
  const comp = await call('GET', `${GW}/opportunities?type=COMPETITION&limit=50`);
  check('C3', 'Lọc COMPETITION không lẫn học bổng', comp.data.items.every((o) => o.type === 'COMPETITION') && comp.data.items.length > 0, `${comp.data.items.length} cuộc thi`);
  const kw = await call('GET', `${GW}/opportunities?keyword=VinAI&limit=50`);
  check('C4', 'Tìm theo từ khóa (tên/đơn vị/tag)', kw.status === 200 && kw.data.items.length > 0, `${kw.data.items.length} kết quả "VinAI"`);
  const ruleOpp = [...seen][0];
  const det = await call('GET', `${GW}/opportunities/${ruleOpp}`);
  check('C5', 'Chi tiết qua gateway có updatedAt và mảng eligibilityRules', det.status === 200 && Boolean(det.data.updatedAt) && Array.isArray(det.data.eligibilityRules), `updatedAt=${det.data.updatedAt}`);

  // ------------------------------------------------------------------ student
  const st = await login(process.env.E2E_STUDENT || 'student@scholink.edu.vn', 'Student@2026');
  check('S1', 'Sinh viên đăng nhập', Boolean(st.token && st.userId), `HTTP ${st.status}`);
  const all = (await call('GET', `${GW}/opportunities?limit=100`)).data.items;
  // Re-runnable: only use opportunities this student never had reminders for.
  const far = [];
  for (const o of all.filter((x) => new Date(x.registerDeadline).getTime() - Date.now() > 10 * 86400000)) {
    const prior = (await call('GET', `${NOTI}/reminders?userId=${st.userId}&opportunityId=${o.id}`)).data || [];
    if (prior.length === 0) far.push(o);
    if (far.length >= 2) break;
  }
  if (far.length < 2) throw new Error('Không còn cơ hội "sạch" cho sinh viên này: seed lại hoặc dùng E2E_STUDENT khác');
  const target = far[0];
  const second = far[1];
  const external = all.find((o) => o.applyMode === 'EXTERNAL');
  const inApp = all.find((o) => o.applyMode === 'IN_APP');

  const b1 = await call('POST', `${GW}/opportunities/${target.id}/bookmark`, { token: st.token, body: { bookmarked: true } });
  const b2 = await call('POST', `${GW}/opportunities/${target.id}/bookmark`, { token: st.token, body: { bookmarked: true } });
  check('S2', 'Lưu cơ hội qua gateway, gửi lại không đảo trạng thái', b1.data?.bookmarked === true && b2.data?.bookmarked === true && b2.data?.changed === false, `lần1 changed=${b1.data?.changed}, lần2 changed=${b2.data?.changed}`);
  await call('POST', `${GW}/opportunities/${second.id}/bookmark`, { token: st.token, body: { bookmarked: true } });
  const mine = await call('GET', `${GW}/opportunities/bookmarks/me`, { token: st.token });
  check('S3', 'Danh sách đã lưu đồng bộ từ server', mine.data?.opportunityIds?.includes(target.id) && mine.data?.opportunityIds?.includes(second.id), `${mine.data?.opportunityIds?.length} mục`);

  await sleep(500);
  const rem = (await call('GET', `${NOTI}/reminders?userId=${st.userId}&opportunityId=${target.id}`)).data || [];
  const quietOk = rem.every((r) => {
    const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: r.timezone || 'Asia/Ho_Chi_Minh' }).format(new Date(r.plannedSendAt)));
    return h >= 7 && h < 22;
  });
  check('S4', 'Lưu cơ hội tạo nhắc 7d/3d/1d, ngoài giờ yên lặng', rem.length === 3 && quietOk, rem.map((r) => `${r.offset}@${r.plannedSendAt}`).join(', '));

  // Fast-forward: run the delayed reminder jobs of this user/opportunity now.
  const queue = new Queue('reminder-queue', { connection: { host: 'localhost', port: 6379 } });
  const delayed = (await queue.getJobs(['delayed'])).filter((j) => String(j.id).startsWith(`rem_${st.userId}_${target.id}_`));
  for (const j of delayed) await j.promote();
  let inbox = [];
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    inbox = ((await call('GET', `${GW}/notifications`, { token: st.token })).data || []).filter((n) => n.refUrl === `/opportunities/${target.id}`);
    if (inbox.length >= delayed.length) break;
  }
  check('S5', 'Worker gửi đủ mỗi mốc 1 thông báo vào Hộp thư (không trùng)', delayed.length === 3 && inbox.length === 3 && new Set(inbox.map((n) => n.body)).size === 3 && new Set(inbox.map((n) => n.id)).size === 3, `${delayed.length} job → ${inbox.length} thông báo: ${inbox.map((n) => n.body).join(' | ')}`);
  const sent = (await call('GET', `${NOTI}/reminders?userId=${st.userId}&opportunityId=${target.id}`)).data || [];
  check('S6', 'Nhắc chuyển SENT, push ghi kết quả riêng', sent.every((r) => r.status === 'SENT') && sent.every((r) => ['SENT', 'SKIPPED', 'PENDING'].includes(r.pushStatus)), sent.map((r) => `${r.offset}:${r.status}/${r.pushStatus}`).join(', '));
  for (const j of delayed) await j.promote().catch(() => undefined); // re-run attempt: must not duplicate
  await sleep(1500);
  const again = ((await call('GET', `${GW}/notifications`, { token: st.token })).data || []).filter((n) => n.refUrl === `/opportunities/${target.id}`);
  check('S7', 'Chạy lại job không tạo thông báo trùng', again.length === 3, `${again.length} thông báo`);

  const read = await call('POST', `${GW}/notifications/${inbox[0]?.id}/read`, { token: st.token });
  check('S8', 'Đánh dấu đã đọc', read.status < 300 && read.data?.isRead === true, `HTTP ${read.status}`);

  const p0 = await call('GET', `${GW}/notifications/preferences`, { token: st.token });
  const p1 = await call('PUT', `${GW}/notifications/preferences`, { token: st.token, body: { timezone: 'Europe/London', pushEnabled: false } });
  const p2 = await call('PUT', `${GW}/notifications/preferences`, { token: st.token, body: { timezone: 'Mars/Base' } });
  check('S9', 'Cài đặt kênh/múi giờ: đọc, lưu, lập lại nhắc chưa gửi; múi giờ sai bị từ chối', p0.status === 200 && p1.data?.timezone === 'Europe/London' && p1.data?.pushEnabled === false && p1.data?.rescheduledReminders >= 1 && p2.status === 400, `version=${p1.data?.preferenceVersion}, lập lại=${p1.data?.rescheduledReminders}, sai tz → HTTP ${p2.status}`);
  await call('PUT', `${GW}/notifications/preferences`, { token: st.token, body: { timezone: 'Asia/Ho_Chi_Minh', pushEnabled: true } });

  const ex1 = await call('POST', `${GW}/opportunities/${external.id}/external-mark`, { token: st.token, body: { marked: true } });
  const ex2 = await call('POST', `${GW}/opportunities/${inApp.id}/external-mark`, { token: st.token, body: { marked: true } });
  check('S10', 'Tự đánh dấu nộp tại nguồn chỉ cho EXTERNAL, không tạo Application', ex1.data?.isExternalMarked === true && ex2.status === 409, `EXTERNAL→${ex1.status}, IN_APP→${ex2.status}`);

  await call('POST', `${GW}/opportunities/${second.id}/bookmark`, { token: st.token, body: { bookmarked: false } });
  await sleep(500);
  const cancelled = (await call('GET', `${NOTI}/reminders?userId=${st.userId}&opportunityId=${second.id}`)).data || [];
  const queuedLeft = (await queue.getJobs(['delayed'])).filter((j) => String(j.id).startsWith(`rem_${st.userId}_${second.id}_`)).length;
  check('S11', 'Bỏ lưu: nhắc CANCELLED và job trong hàng đợi bị gỡ', cancelled.length > 0 && cancelled.every((r) => r.status === 'CANCELLED') && queuedLeft === 0, `${cancelled.length} nhắc, còn ${queuedLeft} job`);

  // ------------------------------------------------------------------ admin
  const ad = await login('admin@scholink.edu.vn', 'ScholinkAdmin@2026');
  check('A1', 'Admin đăng nhập', Boolean(ad.token), `HTTP ${ad.status}`);
  const stud403 = await call('POST', `${GW}/admin/opportunities/ingest`, { token: st.token, body: { type: 'SCHOLARSHIP', items: [] } });
  check('A2', 'Sinh viên không gọi được API quản trị', stud403.status === 403, `HTTP ${stud403.status}`);

  const title = `Học bổng E2E không ghi hạn ${Date.now()}`;
  const ing = await call('POST', `${GW}/admin/opportunities/ingest`, {
    token: ad.token,
    body: { type: 'SCHOLARSHIP', items: [{ title, link: `https://example.edu.vn/e2e-${Date.now()}`, description: 'Bài crawl thử, nguồn không ghi hạn đăng ký.', pubDate: new Date().toUTCString() }] },
  });
  const newId = ing.data?.ingestedIds?.[0];
  const queueList = await call('GET', `${GW}/admin/opportunities/review-queue`, { token: ad.token });
  const pendingItem = (queueList.data?.items || queueList.data || []).find?.((o) => o.id === newId);
  check('A3', 'Crawl thiếu hạn: vào hàng chờ, KHÔNG tự đoán hạn (pubDate không phải hạn)', Boolean(newId) && pendingItem && !pendingItem.registerDeadline && /không tự đoán/.test(pendingItem.reviewReason || ''), `id=${newId}, registerDeadline=${pendingItem?.registerDeadline}`);
  const ap1 = await call('POST', `${GW}/admin/opportunities/${newId}/approve`, { token: ad.token, body: {} });
  check('A4', 'Không công bố khi thiếu hạn', ap1.status === 400, `HTTP ${ap1.status}: ${JSON.stringify(ap1.data?.message || ap1.data).slice(0, 90)}`);
  const deadline = new Date(Date.now() + 30 * 86400000).toISOString();
  await call('PUT', `${GW}/admin/opportunities/${newId}`, { token: ad.token, body: { registerDeadline: deadline, fundingLevel: 'FULL' } });
  const ap2 = await call('POST', `${GW}/admin/opportunities/${newId}/approve`, { token: ad.token, body: {} });
  const found = await call('GET', `${GW}/opportunities?keyword=${encodeURIComponent('E2E không ghi hạn')}&limit=10`);
  check('A5', 'Nhập hạn rồi duyệt: công bố và hiện trong catalog', ap2.status < 300 && found.data.items.some((o) => o.id === newId), `HTTP ${ap2.status}`);

  const newDeadline = new Date(new Date(target.registerDeadline).getTime() + 15 * 86400000).toISOString();
  const ext = await call('POST', `${GW}/admin/opportunities/${target.id}/extend`, { token: ad.token, body: { newDeadline, reason: 'E2E gia hạn' } });
  await sleep(800);
  const afterExt = (await call('GET', `${NOTI}/reminders?userId=${st.userId}&opportunityId=${target.id}`)).data || [];
  const newVer = ext.data?.version;
  check('A6', 'Gia hạn: lập nhắc theo version mới cho người đã lưu', ext.status < 300 && afterExt.some((r) => r.deadlineVersion === newVer && r.status === 'SCHEDULED'), `version mới v${newVer}: ${afterExt.filter((r) => r.deadlineVersion === newVer).length} nhắc`);

  const dash = await call('GET', `${GW}/admin/opportunities/analytics/bo-dashboard`, { token: ad.token });
  check('A7', 'Admin xem thống kê demo (ADM-03)', dash.status === 200, `HTTP ${dash.status}`);

  await queue.close();
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nSUMMARY ${results.length - fail}/${results.length} PASS`);
  require('fs').writeFileSync(process.cwd() + '/e2e-tv2-results.json', JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(2);
});
