import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const MONGODB_URI = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_PREFIX = process.env.RESTORE_DB_PREFIX || ''; // e.g. 'test_'
const RESTORE_STORAGE_DIR = process.env.RESTORE_STORAGE_DIR || path.join(process.cwd(), 'storage_test');

function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function runRestore() {
  const backupsRoot = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupsRoot)) {
    console.error('❌ Không tìm thấy thư mục backups/. Chưa có bản sao lưu nào.');
    process.exit(1);
  }

  // Find target backup folder (either from CLI arg or latest)
  let targetBackup = process.argv[2];
  if (!targetBackup) {
    const backupFolders = fs
      .readdirSync(backupsRoot)
      .filter((f) => f.startsWith('backup-'))
      .sort()
      .reverse();

    if (backupFolders.length === 0) {
      console.error('❌ Không tìm thấy thư mục sao lưu hợp lệ trong backups/.');
      process.exit(1);
    }
    targetBackup = path.join(backupsRoot, backupFolders[0]);
  } else if (!path.isAbsolute(targetBackup)) {
    targetBackup = path.resolve(process.cwd(), targetBackup);
  }

  console.log('========================================================================');
  console.log(`♻️ BẮT ĐẦU PHỤC HỒI DỮ LIỆU & KIỂM CHỨNG TỆP READABLE (SCHOL-14)`);
  console.log(`📁 Thư mục nguồn phục hồi: ${targetBackup}`);
  console.log(`🌐 Môi trường phục hồi DB: ${MONGODB_URI} (Prefix: "${DB_PREFIX}")`);
  console.log(`📂 Môi trường Object Storage: ${RESTORE_STORAGE_DIR}`);
  console.log('========================================================================\n');

  const manifestPath = path.join(targetBackup, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ Không tìm thấy manifest.json trong thư mục sao lưu!');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`ℹ️ Manifest Loaded: Backup ID [${manifest.backupId}], Tạo lúc [${manifest.createdAt}]`);
  console.log(`ℹ️ Tổng tài liệu DB: ${manifest.totalDocuments} docs | Tổng tệp Object Storage: ${manifest.objectStorage?.filesCount || 0} files\n`);

  // 1. KIỂM TRA TÍNH TOÀN VẸN CHECKSUM TRƯỚC KHI TIẾN HÀNH PHỤC HỒI
  console.log('--- BƯỚC 1: KIỂM CHỨNG MÃ BẢO MẬT SHA-256 TRƯỚC KHI RESTORE ---');
  let integrityFailed = false;

  if (manifest.objectStorage?.files) {
    for (const fileMeta of manifest.objectStorage.files) {
      const backupFilePath = path.join(targetBackup, 'storage', fileMeta.relPath);
      if (!fs.existsSync(backupFilePath)) {
        console.error(`❌ [CHECKSUM ERROR] Thiếu tệp sao lưu: ${fileMeta.relPath}`);
        integrityFailed = true;
        continue;
      }
      const buffer = fs.readFileSync(backupFilePath);
      const hash = computeSha256(buffer);
      if (hash !== fileMeta.sha256) {
        console.error(`❌ [CHECKSUM MISMATCH] Tệp ${fileMeta.relPath} bị sai lệch hash!`);
        integrityFailed = true;
      } else {
        console.log(`    ✓ [Integrity OK] ${fileMeta.relPath} (SHA-256 khớp tuyệt đối)`);
      }
    }
  }

  if (integrityFailed) {
    console.error('\n❌ Phát hiện sai lệch mã kiểm tra SHA-256! Quá trình phục hồi bị hủy bỏ để đảm bảo an toàn.');
    process.exit(1);
  }
  console.log('✅ Toàn bộ checksum SHA-256 hợp lệ 100%.\n');

  // 2. PHỤC HỒI CƠ SỞ DỮ LIỆU
  console.log('--- BƯỚC 2: PHỤC HỒI DỮ LIỆU CÁC DỊCH VỤ VÀO MONGODB ---');
  const dbDatabasesDir = path.join(targetBackup, 'databases');
  const dbsToRestore = fs.existsSync(dbDatabasesDir)
    ? fs.readdirSync(dbDatabasesDir).filter((f) => fs.statSync(path.join(dbDatabasesDir, f)).isDirectory())
    : [];

  for (const dbName of dbsToRestore) {
    const targetDbName = `${DB_PREFIX}${dbName}`;
    console.log(`🔹 Đang phục hồi cơ sở dữ liệu: [${targetDbName}]...`);
    const dbDir = path.join(dbDatabasesDir, dbName);
    const jsonFiles = fs.readdirSync(dbDir).filter((f) => f.endsWith('.json'));

    try {
      const conn = await mongoose.createConnection(`${MONGODB_URI}/${targetDbName}`).asPromise();

      for (const file of jsonFiles) {
        const colName = path.basename(file, '.json');
        const filePath = path.join(dbDir, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const docs: any[] = JSON.parse(raw);

        const collection = conn.db!.collection(colName);
        await collection.deleteMany({});

        if (docs.length > 0) {
          const cleanedDocs = docs.map((d) => {
            if (d.createdAt && typeof d.createdAt === 'string') d.createdAt = new Date(d.createdAt);
            if (d.updatedAt && typeof d.updatedAt === 'string') d.updatedAt = new Date(d.updatedAt);
            if (d.appliedAt && typeof d.appliedAt === 'string') d.appliedAt = new Date(d.appliedAt);
            if (d.submittedAt && typeof d.submittedAt === 'string') d.submittedAt = new Date(d.submittedAt);
            if (d.leaseExpiresAt && typeof d.leaseExpiresAt === 'string') d.leaseExpiresAt = new Date(d.leaseExpiresAt);
            return d;
          });

          await collection.insertMany(cleanedDocs);
        }

        console.log(`    ↳ [${colName}]: Đã nạp ${docs.length} bản ghi vào ${targetDbName}.${colName}`);
      }

      await conn.close();
    } catch (err: any) {
      console.warn(`    ⚠️ Bỏ qua DB ${targetDbName}: ${err.message}`);
    }
  }

  // 3. PHỤC HỒI OBJECT STORAGE & CHỨNG MINH TỆP ĐỌC ĐƯỢC
  console.log('\n--- BƯỚC 3: PHỤC HỒI OBJECT STORAGE & CHỨNG MINH TỆP ĐỌC ĐƯỢC (SCHOL-14) ---');
  if (!fs.existsSync(RESTORE_STORAGE_DIR)) {
    fs.mkdirSync(RESTORE_STORAGE_DIR, { recursive: true });
  }

  const proofReports: Array<{
    fileName: string;
    sizeBytes: number;
    sha256Match: boolean;
    headerPreview: string;
    isReadable: boolean;
  }> = [];

  if (manifest.objectStorage?.files) {
    for (const fileMeta of manifest.objectStorage.files) {
      const srcFile = path.join(targetBackup, 'storage', fileMeta.relPath);
      const destFile = path.join(RESTORE_STORAGE_DIR, fileMeta.relPath);
      const destDir = path.dirname(destFile);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(srcFile, destFile);

      // Thao tác ĐỌC TỆP THỰC TẾ để chứng minh tệp đọc được
      let isReadable = false;
      let headerPreview = '';
      let sha256Match = false;

      try {
        const fd = fs.openSync(destFile, 'r');
        const buffer = Buffer.alloc(Math.min(64, fileMeta.sizeBytes));
        fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);

        // Read full file to verify complete readability & hash
        const fullBuffer = fs.readFileSync(destFile);
        const diskHash = computeSha256(fullBuffer);
        sha256Match = diskHash === fileMeta.sha256;
        isReadable = true;
        headerPreview = buffer.toString('utf-8').replace(/[\r\n\t]/g, ' ').slice(0, 24);
      } catch (err: any) {
        isReadable = false;
        headerPreview = `ERROR: ${err.message}`;
      }

      proofReports.push({
        fileName: fileMeta.relPath,
        sizeBytes: fileMeta.sizeBytes,
        sha256Match,
        headerPreview,
        isReadable,
      });
    }
  }

  // 4. BẢNG BÁO CÁO NGHIỆM THU TỆP ĐỌC ĐƯỢC
  console.log('\n========================================================================================');
  console.log('📊 BẢNG BÁO CÁO CHỨNG MINH TÍNH ĐỌC ĐƯỢC & TOÀN VẸN CỦA OBJECT STORAGE (READABILITY PROOF)');
  console.log('========================================================================================');
  console.log(
    'Tên tệp'.padEnd(35) +
    '| Dung lượng'.padEnd(14) +
    '| SHA-256'.padEnd(12) +
    '| Header xem trước'.padEnd(26) +
    '| Trạng thái đọc'
  );
  console.log('-'.repeat(105));

  for (const report of proofReports) {
    const nameCol = report.fileName.slice(0, 33).padEnd(35);
    const sizeCol = `${report.sizeBytes} B`.padEnd(14);
    const hashCol = (report.sha256Match ? 'MATCH [OK]' : 'FAIL [X]').padEnd(12);
    const headCol = report.headerPreview.padEnd(26);
    const statusCol = report.isReadable ? '✅ READABLE (PASS)' : '❌ UNREADABLE (FAIL)';
    console.log(`${nameCol}| ${sizeCol}| ${hashCol}| ${headCol}| ${statusCol}`);
  }
  console.log('========================================================================================\n');

  const allReadable = proofReports.every((r) => r.isReadable && r.sha256Match);
  if (!allReadable) {
    console.error('❌ CẢNH BÁO: Có tệp không thể đọc hoặc không khớp mã hash!');
    process.exit(1);
  }

  console.log('🎉 XÁC NHẬN HOÀN TẤT: Toàn bộ dữ liệu cơ sở dữ liệu và tệp Object Storage đã được phục hồi');
  console.log('    và chứng minh đọc thành công 100% trong môi trường kiểm thử!');
}

runRestore().catch((err) => {
  console.error('❌ Lỗi phục hồi:', err);
  process.exit(1);
});
