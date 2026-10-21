import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASES = [
  process.env.IDENTITY_DB_NAME || 'scholink_identity',
  process.env.OPPORTUNITY_DB_NAME || 'scholink_opportunity',
  process.env.COLLABORATION_DB_NAME || 'scholink_collaboration',
  process.env.BILLING_DB_NAME || 'scholink_billing',
  process.env.NOTIFICATION_DB_NAME || 'scholink_notification',
];

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups', `backup-${timestamp}`);

  console.log('====================================================');
  console.log(`📦 BẮT ĐẦU SAO LƯU DỮ LIỆU TOÀN DIỆN SCHOLINK (F42)`);
  console.log(`🕒 Thời gian: ${new Date().toLocaleString('vi-VN')}`);
  console.log(`📁 Thư mục lưu trữ: ${backupDir}`);
  console.log('====================================================\n');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const manifest: Record<string, any> = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    databases: {},
    totalDocuments: 0,
  };

  for (const dbName of DATABASES) {
    console.log(`🔹 Đang sao lưu Database: [${dbName}]...`);
    const dbDir = path.join(backupDir, dbName);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const conn = await mongoose.createConnection(`${MONGODB_URI}/${dbName}`).asPromise();
    const collections = await conn.db!.listCollections().toArray();

    manifest.databases[dbName] = {
      collectionsCount: collections.length,
      collections: {},
    };

    for (const col of collections) {
      const colName = col.name;
      // Skip system collections
      if (colName.startsWith('system.')) continue;

      const documents = await conn.db!.collection(colName).find({}).toArray();
      const filePath = path.join(dbDir, `${colName}.json`);

      fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), 'utf-8');
      manifest.databases[dbName].collections[colName] = documents.length;
      manifest.totalDocuments += documents.length;

      console.log(`    ↳ [${colName}]: ${documents.length} bản ghi -> ${colName}.json`);
    }

    await conn.close();
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('\n====================================================');
  console.log(`✅ SAO LƯU HOÀN TẤT THÀNH CÔNG!`);
  console.log(`📊 Tổng cộng: ${DATABASES.length} databases, ${manifest.totalDocuments} documents.`);
  console.log(`📄 Manifest lưu tại: ${manifestPath}`);
  console.log('====================================================\n');
}

runBackup().catch((err) => {
  console.error('❌ Lỗi sao lưu:', err);
  process.exit(1);
});
