/**
 * SCHOLINK BACKEND HIGH-LOAD STRESS & CONCURRENCY BENCHMARK RUNNER
 * Đo lường CCU, thông lượng RPS và các phân vị độ trễ (p50, p90, p95, p99)
 */

interface LoadTestOptions {
  url: string;
  totalRequests: number;
  concurrency: number;
}

interface RequestStats {
  durationMs: number;
  statusCode: number;
  success: boolean;
}

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000/api/v1';

async function executeSingleRequest(url: string, index: number): Promise<RequestStats> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-correlation-id': `load-test-${index}-${Date.now()}`,
      },
    });
    const durationMs = performance.now() - start;
    return {
      durationMs,
      statusCode: res.status,
      success: res.ok,
    };
  } catch (err: any) {
    const durationMs = performance.now() - start;
    return {
      durationMs,
      statusCode: 0,
      success: false,
    };
  }
}

async function runLoadBenchmark(name: string, options: LoadTestOptions) {
  console.log(`\n===============================================================`);
  console.log(`🚀 BẮT ĐẦU KIỂM THỬ TẢI: ${name}`);
  console.log(`Target: ${options.url}`);
  console.log(`Tổng số request: ${options.totalRequests} | Concurrency (CCU): ${options.concurrency}`);
  console.log(`===============================================================`);

  const results: RequestStats[] = [];
  const startTime = performance.now();

  let activeRequests = 0;
  let dispatched = 0;

  await new Promise<void>((resolve) => {
    function next() {
      if (dispatched >= options.totalRequests && activeRequests === 0) {
        return resolve();
      }

      while (activeRequests < options.concurrency && dispatched < options.totalRequests) {
        const currentIndex = ++dispatched;
        activeRequests++;
        executeSingleRequest(options.url, currentIndex).then((stat) => {
          results.push(stat);
          activeRequests--;
          next();
        });
      }
    }

    next();
  });

  const totalTimeSec = (performance.now() - startTime) / 1000;
  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.length - successCount;
  const rps = (results.length / totalTimeSec).toFixed(2);

  const p50 = durations[Math.floor(durations.length * 0.5)].toFixed(2);
  const p90 = durations[Math.floor(durations.length * 0.9)].toFixed(2);
  const p95 = durations[Math.floor(durations.length * 0.95)].toFixed(2);
  const p99 = durations[Math.floor(durations.length * 0.99)].toFixed(2);
  const min = durations[0].toFixed(2);
  const max = durations[durations.length - 1].toFixed(2);
  const avg = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2);

  console.log(`\n📊 KẾT QUẢ ĐO LƯỜNG HIỆU NĂNG CHO: [${name}]`);
  console.log(`- Thời gian chạy:      ${totalTimeSec.toFixed(2)}s`);
  console.log(`- Thành công:           ${successCount} / ${results.length} (${((successCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`- Thất bại / Lỗi mạng:  ${failedCount}`);
  console.log(`- Thông lượng (RPS):    ⚡ ${rps} req/sec`);
  console.log(`- Độ trễ tối thiểu:     ${min} ms`);
  console.log(`- Độ trễ trung bình:    ${avg} ms`);
  console.log(`- Phân vị p50 (Median): 🟢 ${p50} ms`);
  console.log(`- Phân vị p90:          🟡 ${p90} ms`);
  console.log(`- Phân vị p95:          🟠 ${p95} ms`);
  console.log(`- Phân vị p99 (Peak):   🔴 ${p99} ms`);
  console.log(`- Độ trễ lớn nhất (Max): ${max} ms`);

  return { successCount, failedCount, rps, p95, p99 };
}

async function startAllLoadTests() {
  console.log('KIỂM TRA SỰ SẴN SÀNG CỦA HỆ THỐNG TRƯỚC KHI CHẠY BENCHMARK...');
  const healthCheck = await fetch(`${GATEWAY_URL}/health`).catch(() => null);
  if (!healthCheck || !healthCheck.ok) {
    console.error(`\n KHÔNG THỂ KẾT NỐI API GATEWAY TẠI: ${GATEWAY_URL}`);
    console.error('👉 Vui lòng khởi động hạ tầng và service: pnpm run start:gateway');
    process.exit(1);
  }

  // Kịch bản 1: Gateway Health Check Baseline
  await runLoadBenchmark('1. Gateway Health Check (Baseline Network Latency)', {
    url: `${GATEWAY_URL}/health`,
    totalRequests: 200,
    concurrency: 20,
  });

  // Kịch bản 2: Opportunity Catalog Browsing (Read-Heavy Cursor Query)
  await runLoadBenchmark('2. Opportunity Catalog Browsing (gRPC + MongoDB Index Query)', {
    url: `${GATEWAY_URL}/opportunities?limit=10`,
    totalRequests: 300,
    concurrency: 30,
  });

  console.log('\n===============================================================');
  console.log(' HOÀN TẤT BÁO CÁO KIỂM THỬ TẢI & CONCURRENCY CHO SCHOLINK!');
  console.log('===============================================================\n');
}

startAllLoadTests().catch((err) => {
  console.error('Lỗi khi chạy benchmark:', err);
  process.exit(1);
});
