import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

async function runRestore() {
  const backupsRoot = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupsRoot)) {
    console.error('❌ Không tìm thấy thư mục backups/. Chưa có bản sao lưu nào.');
    process.exit(1);
  }

  // Find target backup folder (either from arg or latest)
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

  console.log('====================================================');
  console.log(`♻️ BẮT ĐẦU PHỤC HỒI DỮ LIỆU SCHOLINK (F42)`);
  console.log(`📁 Thư mục nguồn phục hồi: ${targetBackup}`);
  console.log('====================================================\n');

  const manifestPath = path.join(targetBackup, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`ℹ️ Thông tin bản sao lưu: Tạo lúc ${manifest.createdAt}, Tổng ${manifest.totalDocuments} bản ghi.\n`);
  }

  const dbFolders = fs.readdirSync(targetBackup).filter((f) => {
    return fs.statSync(path.join(targetBackup, f)).isDirectory();
  });

  for (const dbName of dbFolders) {
    console.log(`🔹 Đang phục hồi Database: [${dbName}]...`);
    const dbDir = path.join(targetBackup, dbName);
    const jsonFiles = fs.readdirSync(dbDir).filter((f) => f.endsWith('.json'));

    const conn = await mongoose.createConnection(`${MONGODB_URI}/${dbName}`).asPromise();

    for (const file of jsonFiles) {
      const colName = path.basename(file, '.json');
      const filePath = path.join(dbDir, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const docs: any[] = JSON.parse(raw);

      const collection = conn.db!.collection(colName);
      // Clean existing collection before restore
      await collection.deleteMany({});

      if (docs.length > 0) {
        // Fix dates if any
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

      console.log(`    ↳ [${colName}]: Phục hồi thành công ${docs.length} bản ghi.`);
    }

    await conn.close();
  }

  console.log('\n====================================================');
  console.log(`✅ PHỤC HỒI DỮ LIỆU HOÀN TẤT THÀNH CÔNG!`);
  console.log('====================================================\n');
}

runRestore().catch((err) => {
  console.error('❌ Lỗi phục hồi:', err);
  process.exit(1);
});
