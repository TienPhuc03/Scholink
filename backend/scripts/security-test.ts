/**
 * SCHOLINK OWASP API SECURITY & PENETRATION TEST SUITE
 * Kiểm tra các lỗ hổng bảo mật: BOLA/IDOR, NoSQL Injection, Token Replay,
 * Privilege Escalation, Malicious File Upload & Spam Cooldown.
 */

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:3000/api/v1';

async function req(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(url, { ...options, headers });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runSecurityTests() {
  console.log('\n===================================================================');
  console.log('🛡️  BẮT ĐẦU KIỂM THỬ AN NINH BẢO MẬT & LỖ HỔNG (OWASP API SECURITY)...');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('===================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, failureDetails?: any) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(` [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (failureDetails) console.error('  Chi tiết lỗi:', failureDetails);
    }
  }

  // 1. Kiểm tra Gateway Alive
  const health = await req('/health');
  if (!health.ok) {
    console.error('Không thể kết nối API Gateway. Vui lòng chạy: pnpm run start:gateway');
    process.exit(1);
  }

  const suffix = Date.now().toString().slice(-6);
  const attackerEmail = `attacker_${suffix}@scholink.edu.vn`;
  const victimEmail = `victim_${suffix}@scholink.edu.vn`;

  // Test 1: Privilege Escalation Prevention (Chống tự leo quyền ADMIN/ORGANIZER khi đăng ký)
  const regAttacker = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: attackerEmail,
      password: 'AttackerPassword@2026',
      fullName: 'Attacker User',
      role: 'ADMIN', // Thử tự gán quyền ADMIN
    }),
  });
  assert(
    regAttacker.status === 201 && regAttacker.data.role === 'STUDENT',
    '1. [Privilege Escalation] Server phải chặn hoặc bỏ qua client gán role=ADMIN, ép về role=STUDENT',
    regAttacker.data,
  );

  const regVictim = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: victimEmail,
      password: 'VictimPassword@2026',
      fullName: 'Victim User',
    }),
  });
  assert(regVictim.status === 201, '2. Đăng ký tài khoản người dùng mục tiêu (Victim) thành công');

  // Đăng nhập 2 tài khoản
  const loginAttacker = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: attackerEmail, password: 'AttackerPassword@2026' }),
  });
  const loginVictim = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: victimEmail, password: 'VictimPassword@2026' }),
  });

  const attackerToken = loginAttacker.data.accessToken;
  const victimToken = loginVictim.data.accessToken;

  // Test 3: NoSQL Injection via Object Payload in Email field
  const noSqlInjectionRes = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: { $gt: '' }, // NoSQL operator bypass attempt
      password: 'AnyPassword@2026',
    }),
  });
  assert(
    noSqlInjectionRes.status === 400,
    '3. [NoSQL Injection] Chặn payload chứa ký tự $ hoặc Object trong chuỗi email (HTTP 400)',
    noSqlInjectionRes.status,
  );

  // Test 4: Forged / Tampered JWT Signature
  const forgedToken = attackerToken.slice(0, -10) + 'invalidhash';
  const forgedAuthRes = await req('/profiles/me', {
    headers: { Authorization: `Bearer ${forgedToken}` },
  });
  assert(
    forgedAuthRes.status === 401,
    '4. [Broken Authentication] Chặn JWT bị sửa đổi chữ ký số bằng HTTP 401 Unauthorized',
    forgedAuthRes.status,
  );

  // Test 5: Replay Attack on Refresh Token
  const victimRefreshToken = loginVictim.data.refreshToken;
  const firstRefresh = await req('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: victimRefreshToken }),
  });
  assert(firstRefresh.status === 200, '5a. Refresh token quay vòng (Token Rotation) hợp lệ lần đầu');

  const replayRefresh = await req('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: victimRefreshToken }),
  });
  assert(
    replayRefresh.status === 401,
    '5b. [Token Replay Attack] Sử dụng lại refresh token cũ bị chặn 401 và thu hồi phiên',
    replayRefresh.status,
  );

  // Test 6: BOLA / IDOR - Attacker tries to attach Victim's MediaAsset
  const uploadVictimAsset = await req('/media/upload-url', {
    method: 'POST',
    headers: { Authorization: `Bearer ${victimToken}` },
    body: JSON.stringify({
      category: 'CV',
      fileName: 'victim-cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 150000,
    }),
  });

  if (uploadVictimAsset.ok) {
    const victimAssetId = uploadVictimAsset.data.assetId;
    await req(`/media/${victimAssetId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${victimToken}` },
      body: JSON.stringify({
        fileHeaderHex: '255044462d312e37',
        actualSizeBytes: 150000,
      }),
    });

    // Attacker cố tình gán assetId của victim vào Passport của mình
    const attackerTheftRes = await req('/profiles/me', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${attackerToken}` },
      body: JSON.stringify({ cvAssetId: victimAssetId }),
    });

    assert(
      attackerTheftRes.status === 403,
      '6. [BOLA / IDOR Protection] Chặn tài khoản Attacker gắn trộm MediaAsset của Victim (HTTP 403)',
      attackerTheftRes.status,
    );
  }

  // Test 7: Malicious Executable File Upload Blocked
  const exeUploadRes = await req('/media/upload-url', {
    method: 'POST',
    headers: { Authorization: `Bearer ${attackerToken}` },
    body: JSON.stringify({
      category: 'CV',
      fileName: 'trojan_payload.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 50000,
    }),
  });
  assert(
    exeUploadRes.status === 400,
    '7. [Malicious File Upload] Chặn upload file thực thi .exe và sai MIME whitelist (HTTP 400)',
    exeUploadRes.status,
  );

  // Test 8: Spam Rate Cooldown on Send OTP (Chống brute-force / spam tài nguyên SMS/Email)
  await req('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email: attackerEmail, purpose: 'VERIFY_EMAIL' }),
  });
  const spamOtpRes = await req('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email: attackerEmail, purpose: 'VERIFY_EMAIL' }),
  });
  assert(
    spamOtpRes.status === 429,
    '8. [Spam / Rate Cooldown] Chặn spam yêu cầu OTP trong thời gian 60 giây (HTTP 429)',
    spamOtpRes.status,
  );

  console.log('\n===================================================================');
  console.log(`🏁 TỔNG KẾT BẢO MẬT: ${passedTests}/${totalTests} BÀI KIỂM THỬ THÀNH CÔNG (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  if (passedTests === totalTests) {
    console.log(' TẤT CẢ CÁC RÀO CHẮN AN NINH VÀ KIỂM SOÁT QUYỀN HẠN ĐỀU VỮNG VÀNG!');
  } else {
    console.warn('⚠️  CÓ BÀI THI BẢO MẬT BỊ THẤT BẠI. CẦN KIỂM TRA LẠI CÁC GUARDS!');
  }
  console.log('===================================================================\n');
}

runSecurityTests().catch((err) => {
  console.error('Lỗi khi chạy Security Suite:', err);
  process.exit(1);
});
