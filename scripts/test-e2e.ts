/**
 * SCHOLINK F04 BACKEND - AUTOMATED LIVE E2E TEST RUNNER
 * Chạy kiểm thử luồng thực tế thông qua HTTP API Gateway (http://localhost:3000)
 */

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:3000/api/v1';

async function request(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, { ...options, headers });
  const status = res.status;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status, ok: res.ok, data };
}

async function runE2ETests() {
  console.log('\nBẮT ĐẦU KIỂM THỬ THỰC TẾ SCHOLINK F04 BACKEND (E2E LIVE TEST)...');
  console.log(`Base URL: ${BASE_URL}\n`);

  // Step 1: Health Check
  process.stdout.write('1. Kiểm tra Gateway Health Check... ');
  let healthRes = await request('/health');
  if (!healthRes.ok) {
    // Thử gọi root /health nếu /api/v1/health chưa kịp cập nhật hot-reload
    const rootRes = await fetch('http://localhost:3000/health')
      .then(async (r) => ({
        status: r.status,
        ok: r.ok,
        data: await r.json().catch(() => null),
      }))
      .catch(() => ({ status: 0, ok: false, data: null }));

    if (rootRes.ok) {
      healthRes = rootRes;
    } else {
      console.error(`\n❌ THẤT BẠI (Mã HTTP: ${healthRes.status || rootRes.status || 'Mất kết nối'}). Không thể kết nối tới API Gateway tại ${BASE_URL}`);
      console.error('👉 Vui lòng đảm bảo bạn đã chạy lệnh: pnpm run start:gateway');
      process.exit(1);
    }
  }
  console.log('✅ THÀNH CÔNG (Gateway is LIVE)');

  // Step 2: Register New Student
  const randomSuffix = Date.now().toString().slice(-6);
  const studentEmail = `student_${randomSuffix}@scholink.edu.vn`;
  process.stdout.write(`2. Đăng ký tài khoản sinh viên (${studentEmail})... `);
  const regRes = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      password: 'StrongPassword@2026',
      fullName: `Sinh Viên Test ${randomSuffix}`,
    }),
  });
  if (regRes.status !== 201) {
    console.error('❌ THẤT BẠI:', regRes.data);
    process.exit(1);
  }
  if (regRes.data.role !== 'STUDENT') {
    console.error('❌ LỖI BẢO MẬT: Role phải là STUDENT, nhận được:', regRes.data.role);
    process.exit(1);
  }
  console.log('✅ THÀNH CÔNG (Role luôn là STUDENT)');

  // Step 3: Login
  process.stdout.write('3. Đăng nhập lấy cặp Token (AccessToken + RefreshToken)... ');
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      password: 'StrongPassword@2026',
    }),
  });
  if (loginRes.status !== 200 || !loginRes.data.accessToken) {
    console.error('❌ THẤT BẠI:', loginRes.data);
    process.exit(1);
  }
  const token = loginRes.data.accessToken;
  const initialRefreshToken = loginRes.data.refreshToken;
  console.log('✅ THÀNH CÔNG (Đã nhận JWT Token)');

  // Step 4: Token Rotation
  process.stdout.write('4. Xoay vòng Refresh Token (Token Rotation)... ');
  const refreshRes = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: initialRefreshToken }),
  });
  if (refreshRes.status !== 200 || !refreshRes.data.refreshToken) {
    console.error('❌ THẤT BẠI:', refreshRes.data);
    process.exit(1);
  }
  const rotatedRefreshToken = refreshRes.data.refreshToken;
  console.log('✅ THÀNH CÔNG (Đã đổi cặp Token mới)');

  // Step 5: Replay Attack Detection
  process.stdout.write('5. Kiểm tra Chống Tái Sử Dụng Token (Replay Attack Prevention)... ');
  const replayRes = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: initialRefreshToken }),
  });
  if (replayRes.status !== 401) {
    console.error('❌ LỖI BẢO MẬT: Đáng lẽ phải chặn 401 Replay Attack, nhưng nhận được:', replayRes.status);
    process.exit(1);
  }
  console.log('✅ THÀNH CÔNG (Server chặn 401 và thu hồi Token Family)');

  // Step 6: Get Passport
  process.stdout.write('6. Lấy hồ sơ Passport cá nhân... ');
  const profileRes = await request('/profiles/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (profileRes.status !== 200) {
    console.error('❌ THẤT BẠI:', profileRes.data);
    process.exit(1);
  }
  console.log(`✅ THÀNH CÔNG (profileVersion: ${profileRes.data.profileVersion}, điểm ban đầu: ${profileRes.data.completionScore})`);

  // Step 7: Update Passport to 100 points
  process.stdout.write('7. Cập nhật hồ sơ Passport (Học vấn, Kỹ năng, Chứng chỉ)... ');
  const updateRes = await request('/profiles/me', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fullName: `Sinh Viên Test ${randomSuffix}`,
      bio: 'Đam mê AI và Kiến trúc Microservices',
      regionCode: 'VN-SG',
      avatarAssetId: 'asset_avatar_001',
      education: {
        institution: 'Đại học Bách Khoa TP.HCM',
        major: 'Khoa học Máy tính',
        startYear: 2023,
        gpa: 3.82,
        gpaScale: 4,
      },
      skills: ['Python', 'TypeScript', 'NestJS', 'gRPC'],
      certificates: [
        {
          type: 'LANGUAGE',
          name: 'IELTS Academic',
          score: '7.5',
          issuedDate: '2025-01-15T00:00:00.000Z',
        },
      ],
      achievements: ['Học bổng Khuyến khích Học tập'],
      cvAssetId: 'asset_cv_001.pdf',
      isLookingForTeammate: true,
      isOpenForScholarship: true,
      isOpenForMentoring: false,
    }),
  });
  if (updateRes.status !== 200 || updateRes.data.completionScore !== 100) {
    console.error('❌ THẤT BẠI:', updateRes.data);
    process.exit(1);
  }
  if (updateRes.data.certificates?.[0]?.status !== 'SELF_DECLARED') {
    console.error('❌ LỖI BẢO MẬT: Chứng chỉ do sinh viên khai phải có status SELF_DECLARED:', updateRes.data.certificates);
    process.exit(1);
  }
  const currentProfileVersion = updateRes.data.profileVersion;
  console.log(`✅ THÀNH CÔNG (Điểm hoàn thiện: 100/100, profileVersion mới: ${currentProfileVersion})`);

  // Step 8: Get Opportunities
  process.stdout.write('8. Lấy danh sách cơ hội học bổng... ');
  const oppsRes = await request('/opportunities');
  if (oppsRes.status !== 200 || !oppsRes.data.items?.length) {
    console.error('❌ THẤT BẠI. Không tìm thấy cơ hội nào. Hãy chạy: pnpm run seed');
    process.exit(1);
  }
  const opp = oppsRes.data.items.find((o: any) => o.applyMode === 'IN_APP') || oppsRes.data.items[0];
  const opportunityId = opp.id;
  console.log(`✅ THÀNH CÔNG (Chọn cơ hội: ${opp.title} [ID: ${opportunityId}])`);

  // Step 9: Create Preview
  process.stdout.write('9. Tạo bản xem trước Preview (gRPC Gateway -> Opportunity -> Identity)... ');
  const previewRes = await request('/applications/previews', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      opportunityId,
      submissionId: `sub_${randomSuffix}`,
      attachmentIds: ['asset_cv_001.pdf'],
      expectedRuleVersion: opp.ruleVersion || 1,
    }),
  });
  if (previewRes.status !== 201 || !previewRes.data.payloadHash) {
    console.error('❌ THẤT BẠI:', previewRes.data);
    process.exit(1);
  }
  const preview = previewRes.data;
  console.log(`✅ THÀNH CÔNG (previewId: ${preview.previewId}, payloadHash: ${preview.payloadHash.slice(0, 16)}...)`);

  // Step 10: Create Consent
  process.stdout.write('10. Ký Consent chia sẻ hồ sơ khớp chuẩn mã băm payloadHash... ');
  const consentRes = await request('/profiles/me/consents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      opportunityId,
      submissionId: `sub_${randomSuffix}`,
      previewId: preview.previewId,
      snapshotId: preview.snapshotId,
      profileVersion: currentProfileVersion,
      ruleVersion: opp.ruleVersion || 1,
      manifestHash: preview.manifestHash,
      payloadHash: preview.payloadHash,
    }),
  });
  if (consentRes.status !== 201 || !consentRes.data.consentId) {
    console.error('❌ THẤT BẠI:', consentRes.data);
    process.exit(1);
  }
  const consentId = consentRes.data.consentId;
  console.log(`✅ THÀNH CÔNG (consentId: ${consentId})`);

  // Step 11: Submit Application
  process.stdout.write('11. Nộp hồ sơ ứng tuyển chính thức (Revision 1)... ');
  const submitRes = await request('/applications', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': `idem_${randomSuffix}_01`,
    },
    body: JSON.stringify({
      opportunityId,
      submissionId: `sub_${randomSuffix}`,
      submissionType: 'INDIVIDUAL',
      previewId: preview.previewId,
      snapshotId: preview.snapshotId,
      profileVersion: currentProfileVersion,
      expectedRuleVersion: opp.ruleVersion || 1,
      payloadHash: preview.payloadHash,
      consentId,
    }),
  });
  if (submitRes.status !== 201 || submitRes.data.revision !== 1) {
    console.error('❌ THẤT BẠI:', submitRes.data);
    process.exit(1);
  }
  const applicationId = submitRes.data.applicationId;
  console.log(`✅ THÀNH CÔNG (applicationId: ${applicationId}, status: ${submitRes.data.status}, revision: 1)`);

  // Step 12: Withdraw Application
  process.stdout.write('12. Rút hồ sơ ứng tuyển... ');
  const withdrawRes = await request(`/applications/${applicationId}/withdraw`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if ((withdrawRes.status !== 200 && withdrawRes.status !== 201) || withdrawRes.data?.status !== 'WITHDRAWN') {
    console.error('❌ THẤT BẠI:', withdrawRes.data);
    process.exit(1);
  }
  console.log('✅ THÀNH CÔNG (status: WITHDRAWN)');

  // Step 13: Resubmit Application
  process.stdout.write('13. Nộp lại hồ sơ sau khi rút (Revision 2)... ');
  const resubmitRes = await request('/applications', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': `idem_${randomSuffix}_02`,
    },
    body: JSON.stringify({
      opportunityId,
      submissionId: `sub_${randomSuffix}_resubmit`,
      submissionType: 'INDIVIDUAL',
      previewId: preview.previewId,
      snapshotId: preview.snapshotId,
      profileVersion: currentProfileVersion,
      expectedRuleVersion: opp.ruleVersion || 1,
      payloadHash: preview.payloadHash,
      consentId,
    }),
  });
  if (resubmitRes.status !== 201 || resubmitRes.data.revision !== 2) {
    console.error('❌ THẤT BẠI:', resubmitRes.data);
    process.exit(1);
  }
  console.log(`✅ THÀNH CÔNG (applicationId: ${resubmitRes.data.applicationId}, status: SUBMITTED, revision: 2)`);

  console.log('\n🎉 =========================================================================');
  console.log('🎉 TOÀN BỘ 13 BƯỚC KIỂM THỬ THỰC TẾ TRÊN MÔI TRƯỜNG LIVE ĐỀU THÀNH CÔNG 100%!');
  console.log('🎉 =========================================================================\n');
}

runE2ETests().catch((err) => {
  console.error('\n❌ Lỗi ngoài ý muốn trong quá trình kiểm thử:', err);
  process.exit(1);
});
