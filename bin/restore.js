#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { sha256 } = require('../src/utils/crypto');

function verifyAndRestore(backupFilePath, targetRestoredPath) {
  if (!backupFilePath) {
    throw new Error('Cần cung cấp đường dẫn file backup (.db).');
  }

  const resolvedBackup = path.resolve(backupFilePath);
  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`File backup không tồn tại: ${resolvedBackup}`);
  }

  // Default target path in restore_test/ to NEVER overwrite live production DB accidentally
  const defaultTarget = path.join(process.cwd(), 'restore_test', `restored_${Date.now()}.db`);
  const resolvedTarget = path.resolve(targetRestoredPath || defaultTarget);

  console.log(`[Restore & Verify] Đọc file backup: ${resolvedBackup}`);
  console.log(`[Restore & Verify] Khôi phục sang đường dẫn kiểm tra: ${resolvedTarget}`);

  const targetDir = path.dirname(resolvedTarget);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. Verify Checksum if metadata file exists
  const metaPath = `${resolvedBackup}.meta.json`;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const currentChecksum = sha256(fs.readFileSync(resolvedBackup));
      if (meta.sha256_checksum && meta.sha256_checksum !== currentChecksum) {
        throw new Error(`Sai lệch Checksum! Kỳ vọng: ${meta.sha256_checksum}, Thực tế: ${currentChecksum}`);
      }
      console.log(`✓ Checksum SHA-256 khớp hoàn toàn với metadata.`);
    } catch (e) {
      if (e.message.includes('Sai lệch Checksum')) throw e;
      console.warn(`[Lưu ý]: Không thể đọc hoặc parse metadata: ${e.message}`);
    }
  }

  // 2. Copy backup file to isolated target path
  fs.copyFileSync(resolvedBackup, resolvedTarget);

  // 3. Open restored DB and perform integrity check
  const restoredDb = new DatabaseSync(resolvedTarget);
  try {
    const integrityRow = restoredDb.prepare('PRAGMA integrity_check;').get();
    const integrityResult = integrityRow ? Object.values(integrityRow)[0] : null;
    if (integrityResult !== 'ok') {
      throw new Error(`Kiểm tra toàn vẹn (integrity_check) thất bại: ${integrityResult}`);
    }
    console.log(`✓ PRAGMA integrity_check: OK`);

    // 4. Check active knowledge version
    const state = restoredDb.prepare('SELECT active_version_id, revision FROM knowledge_state WHERE id = 1').get();
    console.log(`✓ Phiên bản Active trong bản khôi phục: ${state?.active_version_id || 'None'} (Revision ${state?.revision || 1})`);

    // 5. Check record counts
    const counts = {
      generations: restoredDb.prepare('SELECT count(*) as c FROM generations').get().c,
      feedback: restoredDb.prepare('SELECT count(*) as c FROM feedback').get().c,
      jobs: restoredDb.prepare('SELECT count(*) as c FROM jobs').get().c,
      knowledge_versions: restoredDb.prepare('SELECT count(*) as c FROM knowledge_versions').get().c,
      knowledge_items: restoredDb.prepare('SELECT count(*) as c FROM knowledge_items').get().c
    };
    console.log(`✓ Thống kê số lượng bản ghi sau khôi phục:`, counts);

    // 6. Test sample query execution
    const sampleItem = restoredDb.prepare('SELECT item_id, type FROM knowledge_items LIMIT 1').get();
    if (sampleItem) {
      console.log(`✓ Thử nghiệm truy vấn dữ liệu mẫu thành công (${sampleItem.type}:${sampleItem.item_id}).`);
    }

    console.log(`\n✓ Khôi phục và kiểm thử toàn vẹn bản backup HOÀN TẤT THÀNH CÔNG!`);
    return {
      success: true,
      restored_path: resolvedTarget,
      active_version_id: state?.active_version_id,
      record_counts: counts
    };
  } finally {
    restoredDb.close();
  }
}

if (require.main === module) {
  try {
    const backupFile = process.argv[2];
    const targetFile = process.argv[3];
    verifyAndRestore(backupFile, targetFile);
  } catch (err) {
    console.error(`[Restore Thất Bại]:`, err.message);
    process.exit(1);
  }
}

module.exports = { verifyAndRestore };
