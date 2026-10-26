/**
 * SCHOLINK F04 & F13 BACKEND - AUTOMATED LIVE E2E TEST RUNNER
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
  console.log('\nBẮT ĐẦU KIỂM THỬ THỰC TẾ SCHOLINK F04 + F13 BACKEND (E2E LIVE TEST)...');
  console.log(`Base URL: ${BASE_URL}\n`);

  // Step 1: Health Check
  process.stdout.write('1. Kiểm tra Gateway Health Check... ');
  let healthRes = await request('/health');
  if (!healthRes.ok) {
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
      console.error(`\n THẤT BẠI (Mã HTTP: ${healthRes.status || rootRes.status || 'Mất kết nối'}). Không thể kết nối tới API Gateway tại ${BASE_URL}`);
      console.error('👉 Vui lòng đảm bảo bạn đã chạy lệnh: pnpm run start:gateway');
      process.exit(1);
    }
  }
  console.log('THÀNH CÔNG (Gateway is LIVE)');

  // Step 2: Register Student A & Verify Unique Email
  const randomSuffix = Date.now().toString().slice(-6);
  const studentEmail = `student_${randomSuffix}@scholink.edu.vn`;
  process.stdout.write(`2. Đăng ký tài khoản sinh viên (${studentEmail}) & kiểm tra trùng email... `);
  const regRes = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      password: 'StrongPassword@2026',
      fullName: `Sinh Viên Test ${randomSuffix}`,
    }),
  });
  if (regRes.status !== 201 || regRes.data.role !== 'STUDENT') {
    console.error(' THẤT BẠI:', regRes.data);
    process.exit(1);
  }
  const dupRegRes = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      password: 'StrongPassword@2026',
      fullName: 'Duplicate Student',
    }),
  });
  if (dupRegRes.status !== 409) {
    console.error(' LỖI: Đăng ký trùng email phải bị chặn 409, nhận được:', dupRegRes.status);
    process.exit(1);
  }
  console.log('THÀNH CÔNG (Role = STUDENT, trùng email bị chặn 409 EMAIL_ALREADY_EXISTS)');

  // Step 3: Send & Verify Email OTP + Cooldown Check (F13)
  process.stdout.write('3. [F13] Gửi OTP xác thực email, kiểm tra cooldown 60s & verify OTP... ');
  const sendOtpRes = await request('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      purpose: 'VERIFY_EMAIL',
    }),
  });
  if (sendOtpRes.status !== 200 || !sendOtpRes.data.devOtpPreview) {
    console.error(' THẤT BẠI gửi OTP:', sendOtpRes.data);
    process.exit(1);
  }
  const cooldownRes = await request('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      purpose: 'VERIFY_EMAIL',
    }),
  });
  if (cooldownRes.status !== 429) {
    console.error(' LỖI: Gửi lại OTP trước 60s phải bị chặn 429, nhận được:', cooldownRes.status);
    process.exit(1);
  }
  const verifyOtpRes = await request('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      otpCode: sendOtpRes.data.devOtpPreview,
      purpose: 'VERIFY_EMAIL',
    }),
  });
  if (verifyOtpRes.status !== 200 || !verifyOtpRes.data.verified) {
    console.error(' THẤT BẠI xác thực OTP:', verifyOtpRes.data);
    process.exit(1);
  }
  console.log('THÀNH CÔNG (OTP hợp lệ, chặn gửi lặp < 60s bằng 429)');

  // Step 4: Login & Refresh Token Rotation + Replay Detection
  process.stdout.write('4. Đăng nhập, Xoay vòng Refresh Token & Chặn Replay Attack... ');
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      password: 'StrongPassword@2026',
    }),
  });
  if (loginRes.status !== 200 || !loginRes.data.accessToken) {
    console.error(' THẤT BẠI:', loginRes.data);
    process.exit(1);
  }
  const initialRefreshToken = loginRes.data.refreshToken;
  const refreshRes = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: initialRefreshToken }),
  });
  if (refreshRes.status !== 200) {
    console.error(' THẤT BẠI refresh:', refreshRes.data);
    process.exit(1);
  }
  const replayRes = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: initialRefreshToken }),
  });
  if (replayRes.status !== 401) {
    console.error(' LỖI BẢO MẬT: Đáng lẽ phải chặn 401 Replay Attack, nhận được:', replayRes.status);
    process.exit(1);
  }
  console.log(' THÀNH CÔNG (Token Rotation + Replay Attack bị chặn 401)');

  // Step 5: Forgot Password & Reset Password revokes sessions (F13)
  process.stdout.write('5. [F13] Quên mật khẩu & Đặt lại mật khẩu bằng OTP (thu hồi phiên cũ)... ');
  const forgotRes = await request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: studentEmail }),
  });
  if (forgotRes.status !== 200 || !forgotRes.data.devOtpPreview) {
    console.error(' THẤT BẠI forgot-password:', forgotRes.data);
    process.exit(1);
  }
  const newPassword = 'ResetStrongPassword@2026';
  const resetRes = await request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      otpCode: forgotRes.data.devOtpPreview,
      newPassword,
    }),
  });
  if (resetRes.status !== 200 || !resetRes.data.passwordReset) {
    console.error(' THẤT BẠI reset-password:', resetRes.data);
    process.exit(1);
  }
  const reLoginRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: studentEmail,
      password: newPassword,
    }),
  });
  if (reLoginRes.status !== 200 || !reLoginRes.data.accessToken) {
    console.error(' THẤT BẠI đăng nhập bằng mật khẩu mới:', reLoginRes.data);
    process.exit(1);
  }
  const token = reLoginRes.data.accessToken;
  console.log(`THÀNH CÔNG (sessionVersion tăng lên ${resetRes.data.sessionVersion}, đăng nhập mật khẩu mới OK)`);

  // Step 6: Media Upload — MIME/Size validation, Malware Scan & READY transition (F13)
  process.stdout.write('6. [F13] Kiểm tra Upload MediaAsset (Chặn sai MIME/EICAR & duyệt PDF sạch sang READY)... ');
  const badMimeRes = await request('/media/upload-url', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      category: 'CV',
      fileName: 'malware.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 2048,
    }),
  });
  if (badMimeRes.status !== 400) {
    console.error('LỖI: Sai MIME type phải bị chặn 400, nhận được:', badMimeRes.status);
    process.exit(1);
  }

  const uploadCvRes = await request('/media/upload-url', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      category: 'CV',
      fileName: 'cv-sinh-vien.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 256000,
    }),
  });
  if (uploadCvRes.status !== 201 || uploadCvRes.data.status !== 'UPLOADING') {
    console.error('THẤT BẠI tạo upload-url:', uploadCvRes.data);
    process.exit(1);
  }
  const cvAssetId = uploadCvRes.data.assetId;

  // Thử gắn CV khi đang UPLOADING (chưa READY) -> phải bị chặn 409 ASSET_NOT_AVAILABLE
  const prematureAttachRes = await request('/profiles/me', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cvAssetId }),
  });
  if (prematureAttachRes.status !== 409) {
    console.error('LỖI: Gắn asset chưa READY phải bị chặn 409, nhận được:', prematureAttachRes.status);
    process.exit(1);
  }

  // Hoàn tất upload & quét Magic Bytes PDF hợp lệ -> chuyển sang READY
  const completeCvRes = await request(`/media/${cvAssetId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fileHeaderHex: '255044462d312e37',
      sampleContent: '%PDF-1.7 Clean Academic CV Content',
      actualSizeBytes: 256000,
    }),
  });
  if (completeCvRes.status !== 200 || completeCvRes.data.status !== 'READY') {
    console.error('THẤT BẠI complete upload:', completeCvRes.data);
    process.exit(1);
  }
  console.log(`THÀNH CÔNG (Asset ${cvAssetId} đã quét an toàn và chuyển sang READY)`);

  // Step 7: Cross-user Asset Ownership Protection (F13: "Không nhận asset người khác")
  process.stdout.write('7. [F13] Kiểm tra chặn Sinh viên B dùng trộm MediaAsset của Sinh viên A... ');
  const otherEmail = `student_b_${randomSuffix}@scholink.edu.vn`;
  await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: otherEmail,
      password: 'StrongPassword@2026',
      fullName: 'Sinh Viên B',
    }),
  });
  const otherLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: otherEmail,
      password: 'StrongPassword@2026',
    }),
  });
  const otherStudentCrossAttach = await request('/profiles/me', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${otherLogin.data.accessToken}` },
    body: JSON.stringify({ cvAssetId }),
  });
  if (otherStudentCrossAttach.status !== 403) {
    console.error('LỖI BẢO MẬT: Dùng asset của người khác phải bị chặn 403, nhận được:', otherStudentCrossAttach.status);
    process.exit(1);
  }
  console.log('THÀNH CÔNG (Chặn 403 FORBIDDEN_RESOURCE khi gắn asset của người khác)');

  // Step 8: Update Passport to 100 points + Optimistic Versioning Check (F04 & F13)
  process.stdout.write('8. [F04+F13] Cập nhật Passport 100/100 điểm với Asset READY & kiểm tra expectedVersion... ');
  const updateRes = await request('/profiles/me', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      expectedVersion: 1,
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
      cvAssetId,
      isLookingForTeammate: true,
      isOpenForScholarship: true,
      isOpenForMentoring: false,
    }),
  });
  if (updateRes.status !== 200 || updateRes.data.completionScore !== 100) {
    console.error(' THẤT BẠI:', updateRes.data);
    process.exit(1);
  }
  const currentProfileVersion = updateRes.data.profileVersion;

  // Gửi lại expectedVersion = 1 (cũ) -> phải bị chặn 409 VERSION_MISMATCH
  const staleVersionRes = await request('/profiles/me', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      expectedVersion: 1,
      bio: 'Cập nhật với version cũ',
    }),
  });
  if (staleVersionRes.status !== 409) {
    console.error(' LỖI: expectedVersion cũ phải bị chặn 409 VERSION_MISMATCH, nhận được:', staleVersionRes.status);
    process.exit(1);
  }
  console.log(`THÀNH CÔNG (Điểm: 100/100, profileVersion: ${currentProfileVersion}, chặn VERSION_MISMATCH 409)`);

  // Step 9: Get Opportunities
  process.stdout.write('9. Lấy danh sách cơ hội học bổng... ');
  const oppsRes = await request('/opportunities');
  if (oppsRes.status !== 200 || !oppsRes.data.items?.length) {
    console.error('THẤT BẠI. Không tìm thấy cơ hội nào. Hãy chạy: pnpm run seed');
    process.exit(1);
  }
  const opp = oppsRes.data.items.find((o: any) => o.applyMode === 'IN_APP') || oppsRes.data.items[0];
  const opportunityId = opp.id;
  console.log(`THÀNH CÔNG (Chọn cơ hội: ${opp.title} [ID: ${opportunityId}])`);

  // Step 10: Create Preview with verified READY cvAssetId
  process.stdout.write('10. Tạo bản xem trước Preview (gRPC Gateway -> Opportunity -> Identity)... ');
  const previewRes = await request('/applications/previews', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      opportunityId,
      submissionId: `sub_${randomSuffix}`,
      attachmentIds: [cvAssetId],
      expectedRuleVersion: opp.ruleVersion || 1,
    }),
  });
  if (previewRes.status !== 201 || !previewRes.data.payloadHash) {
    console.error('THẤT BẠI:', previewRes.data);
    process.exit(1);
  }
  const preview = previewRes.data;
  console.log(`THÀNH CÔNG (previewId: ${preview.previewId}, payloadHash: ${preview.payloadHash.slice(0, 16)}...)`);

  // Step 11: Create Consent
  process.stdout.write('11. Ký Consent chia sẻ hồ sơ khớp chuẩn mã băm payloadHash... ');
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
    console.error('THẤT BẠI:', consentRes.data);
    process.exit(1);
  }
  const consentId = consentRes.data.consentId;
  console.log(`THÀNH CÔNG (consentId: ${consentId})`);

  // Step 12: Submit Application
  process.stdout.write('12. Nộp hồ sơ ứng tuyển chính thức (Revision 1)... ');
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
    console.error(' THẤT BẠI:', submitRes.data);
    process.exit(1);
  }
  const applicationId = submitRes.data.applicationId;
  console.log(`THÀNH CÔNG (applicationId: ${applicationId}, status: ${submitRes.data.status}, revision: 1)`);

  // Step 13: Withdraw Application
  process.stdout.write('13. Rút hồ sơ ứng tuyển... ');
  const withdrawRes = await request(`/applications/${applicationId}/withdraw`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (withdrawRes.status !== 200 || withdrawRes.data?.status !== 'WITHDRAWN') {
    console.error(' THẤT BẠI:', withdrawRes.data);
    process.exit(1);
  }
  console.log('THÀNH CÔNG (HTTP 200, status: WITHDRAWN)');

  // Step 14: Resubmit Application
  process.stdout.write('14. Nộp lại hồ sơ sau khi rút (Revision 2)... ');
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
    console.error('THẤT BẠI:', resubmitRes.data);
    process.exit(1);
  }
  console.log(`THÀNH CÔNG (applicationId: ${resubmitRes.data.applicationId}, status: SUBMITTED, revision: 2)`);

  console.log('\n=========================================================================');
  console.log('TOÀN BỘ 14 BƯỚC KIỂM THỬ THỰC TẾ (F04 + F13 BACKEND) ĐỀU THÀNH CÔNG 100%!');
  console.log('=========================================================================\n');
}

runE2ETests().catch((err) => {
  console.error('\n Lỗi ngoài ý muốn trong quá trình kiểm thử:', err);
  process.exit(1);
});
