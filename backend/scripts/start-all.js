const { spawn } = require('child_process');
const path = require('path');

const apps = [
  { name: 'Identity', file: 'dist/apps/identity-service/apps/identity-service/src/main.js', color: '\x1b[34m' },
  { name: 'Opportunity', file: 'dist/apps/opportunity-service/apps/opportunity-service/src/main.js', color: '\x1b[32m' },
  { name: 'Collaboration', file: 'dist/apps/collaboration-service/apps/collaboration-service/src/main.js', color: '\x1b[35m' },
  { name: 'Billing', file: 'dist/apps/billing-service/apps/billing-service/src/main.js', color: '\x1b[33m' },
  { name: 'Notification', file: 'dist/apps/notification-service/apps/notification-service/src/main.js', color: '\x1b[36m' },
  { name: 'Gateway', file: 'dist/apps/gateway/apps/gateway/src/main.js', color: '\x1b[31m' },
];

const RESET = '\x1b[0m';
const children = [];

console.log('🚀 Khởi động toàn bộ cụm Scholink Microservices & API Gateway...\n');

apps.forEach(({ name, file, color }) => {
  const child = spawn('node', [file], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach((l) => {
      if (l.trim()) {
        console.log(`${color}[${name}]${RESET} ${l}`);
      }
    });
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach((l) => {
      if (l.trim()) {
        console.error(`${color}[${name} ERR]${RESET} ${l}`);
      }
    });
  });

  child.on('exit', (code) => {
    console.log(`${color}[${name}]${RESET} đã dừng (code: ${code})`);
  });

  children.push(child);
});

function cleanup() {
  console.log('\n🛑 Đang dừng toàn bộ các microservices...');
  children.forEach((c) => c.kill('SIGINT'));
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
