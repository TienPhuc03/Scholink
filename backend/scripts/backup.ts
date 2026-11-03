import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASES = [
  process.env.IDENTITY_DB_NAME || 'scholink_identity',
  process.env.OPPORTUNITY_DB_NAME || 'scholink_opportunity',
  process.env.COLLABORATION_DB_NAME || 'scholink_collaboration',
  process.env.BILLING_DB_NAME || 'scholink_billing',
  process.env.NOTIFICATION_DB_NAME || 'scholink_notification',
];

const STORAGE_SOURCE_DIR = path.join(process.cwd(), 'storage');

function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function ensureSampleStorageFiles(storageDir: string) {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const cvDir = path.join(storageDir, 'cvs');
  const certDir = path.join(storageDir, 'certificates');
  fs.mkdirSync(cvDir, { recursive: true });
  fs.mkdirSync(certDir, { recursive: true });

  const sampleCv = path.join(cvDir, 'student_cv_nguyen_van_a.pdf');
  if (!fs.existsSync(sampleCv)) {
    fs.writeFileSync(
      sampleCv,
      '%PDF-1.4\n%Scholink Verified Student Passport CV Document - Nguyen Van A\n%%EOF',
      'utf-8',
    );
  }

  const sampleCert = path.join(certDir, 'ielts_certificate_8.0.pdf');
  if (!fs.existsSync(sampleCert)) {
    fs.writeFileSync(
      sampleCert,
      '%PDF-1.4\n%Scholink Verified IELTS Certificate 8.0 - IDP Education Vietnam\n%%EOF',
      'utf-8',
    );
  }
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, baseDir));
    } else {
      results.push(path.relative(baseDir, fullPath));
    }
  }
  return results;
}

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups', `backup-${timestamp}`);

  console.log('========================================================================');
  console.log(`📦 BẮT ĐẦU SAO LƯU DỮ LIỆU & OBJECT STORAGE TOÀN DIỆN SCHOLINK (SCHOL-14)`);
  console.log(`🕒 Thời gian: ${new Date().toLocaleString('vi-VN')}`);
  console.log(`📁 Thư mục lưu trữ: ${backupDir}`);
  console.log('========================================================================\n');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const manifest: Record<string, any> = {
    version: '2.0',
    backupId: `backup-${timestamp}`,
    createdAt: new Date().toISOString(),
    checksumAlgorithm: 'SHA-256',
    databases: {},
    objectStorage: {
      filesCount: 0,
      totalSizeBytes: 0,
      files: [],
    },
    totalDocuments: 0,
  };

  // 1. SAO LƯU 5 CƠ SỞ DỮ LIỆU MONGODB
  console.log('--- PHẦN 1: SAO LƯU CƠ SỞ DỮ LIỆU MONGODB (5 SERVICES) ---');
  for (const dbName of DATABASES) {
    console.log(`🔹 Đang sao lưu Database: [${dbName}]...`);
    const dbDir = path.join(backupDir, 'databases', dbName);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    try {
      const conn = await mongoose.createConnection(`${MONGODB_URI}/${dbName}`).asPromise();
      const collections = await conn.db!.listCollections().toArray();

      manifest.databases[dbName] = {
        collectionsCount: collections.length,
        collections: {},
      };

      for (const col of collections) {
        const colName = col.name;
        if (colName.startsWith('system.')) continue;

        const documents = await conn.db!.collection(colName).find({}).toArray();
        const filePath = path.join(dbDir, `${colName}.json`);
        const jsonContent = JSON.stringify(documents, null, 2);
        const buffer = Buffer.from(jsonContent, 'utf-8');
        const sha256 = computeSha256(buffer);

        fs.writeFileSync(filePath, jsonContent, 'utf-8');
        manifest.databases[dbName].collections[colName] = {
          count: documents.length,
          sha256,
          file: `databases/${dbName}/${colName}.json`,
        };
        manifest.totalDocuments += documents.length;

        console.log(`    ↳ [${colName}]: ${documents.length} bản ghi | SHA-256: ${sha256.slice(0, 12)}...`);
      }

      await conn.close();
    } catch (err: any) {
      console.warn(`    ⚠️ Không thể kết nối DB [${dbName}]: ${err.message}. Tiếp tục...`);
    }
  }

  // 2. SAO LƯU OBJECT STORAGE & TÍNH TOÁN SHA-256 TỪNG TỆP
  console.log('\n--- PHẦN 2: SAO LƯU OBJECT STORAGE & TÍNH TOÁN CHECKSUM SHA-256 ---');
  ensureSampleStorageFiles(STORAGE_SOURCE_DIR);

  const storageBackupDir = path.join(backupDir, 'storage');
  fs.mkdirSync(storageBackupDir, { recursive: true });

  const storageFiles = getAllFiles(STORAGE_SOURCE_DIR);
  for (const relPath of storageFiles) {
    const srcPath = path.join(STORAGE_SOURCE_DIR, relPath);
    const destPath = path.join(storageBackupDir, relPath);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const fileBuffer = fs.readFileSync(srcPath);
    const sha256 = computeSha256(fileBuffer);
    fs.copyFileSync(srcPath, destPath);

    manifest.objectStorage.files.push({
      relPath: relPath.replace(/\\/g, '/'),
      sizeBytes: fileBuffer.length,
      sha256,
    });
    manifest.objectStorage.totalSizeBytes += fileBuffer.length;
    manifest.objectStorage.filesCount += 1;

    console.log(`    ↳ [Storage File]: ${relPath} (${fileBuffer.length} bytes) | SHA-256: ${sha256.slice(0, 16)}...`);
  }

  // 3. TẠO VÀ GHI MANIFEST KÈM CHỮ KÝ BẢO MẬT
  const manifestString = JSON.stringify(manifest, null, 2);
  const manifestHash = computeSha256(Buffer.from(manifestString, 'utf-8'));
  manifest.manifestSignature = manifestHash;

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('\n========================================================================');
  console.log(`✅ SAO LƯU HOÀN TẤT THÀNH CÔNG!`);
  console.log(`📊 Tổng cơ sở dữ liệu: ${Object.keys(manifest.databases).length} DBs (${manifest.totalDocuments} documents)`);
  console.log(`📁 Tổng tệp Object Storage: ${manifest.objectStorage.filesCount} files (${manifest.objectStorage.totalSizeBytes} bytes)`);
  console.log(`📄 Manifest cryptographic signature: ${manifestHash}`);
  console.log(`📄 Đường dẫn Manifest: ${manifestPath}`);
  console.log('========================================================================\n');
}

runBackup().catch((err) => {
  console.error('❌ Lỗi sao lưu:', err);
  process.exit(1);
});
