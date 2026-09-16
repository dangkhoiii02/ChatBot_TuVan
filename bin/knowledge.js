#!/usr/bin/env node

const path = require('node:path');
const { getDb } = require('../src/db');
const { runMigrations } = require('../src/db/migrate');
const { validateBatchDirectory } = require('../src/knowledge/validator');
const { importKnowledgeBatch } = require('../src/knowledge/importer');
const { publishVersion, rollbackVersion, getDiff, listVersions } = require('../src/knowledge/publisher');

function parseArgs(args) {
  const parsed = {
    command: args[0],
    positional: [],
    flags: {}
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        parsed.flags[key] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('--')) {
          parsed.flags[key] = nextArg;
          i++;
        } else {
          parsed.flags[key] = true;
        }
      }
    } else {
      parsed.positional.push(arg);
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`
CLI Quản Lý Tri Thức Bot Thầy Minh Piano

CÚ PHÁP:
  node bin/knowledge.js <lệnh> [tham số] [tùy chọn]

CÁC LỆNH:
  validate <thư_mục>
    Kiểm tra tính hợp lệ của gói dữ liệu đối tác theo manifest/schema 1.0.

  import <thư_mục>
    Kiểm tra và nạp dữ liệu vào phiên bản nháp (draft version), hợp nhất delta nếu cần.

  diff <version_id> [compare_with_id]
    So sánh khác biệt (added, modified, removed) của phiên bản với bản active hoặc bản khác.

  publish <version_id> --approved-by="<tên_người_duyệt>" [--expected-revision=<số>]
    Xuất bản phiên bản tri thức thành active, gán nhãn người duyệt và tăng revision.

  rollback <target_version_id> --approved-by="<tên_người_duyệt>" [--expected-revision=<số>]
    Khôi phục active pointer về phiên bản đã published trước đó một cách an toàn.

  list | status
    Hiển thị danh sách các phiên bản, phiên bản active hiện tại và thống kê số mục.
  `);
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || flags.help) {
    printUsage();
    process.exit(0);
  }

  const db = getDb();
  runMigrations(db);

  try {
    switch (command) {
      case 'validate': {
        const dir = positional[0];
        if (!dir) {
          console.error('Lỗi: Cần cung cấp đường dẫn thư mục dữ liệu.');
          process.exit(1);
        }
        const resolvedPath = path.resolve(process.cwd(), dir);
        console.log(`[Validate] Đang kiểm tra thư mục: ${resolvedPath}`);
        const result = validateBatchDirectory(resolvedPath);
        if (result.valid) {
          console.log(`✓ Gói dữ liệu hợp lệ! Tổng cộng: ${result.items.length} mục.`);
          console.log(`  - Manifest: Batch ID: ${result.manifest.batch_id}, Mode: ${result.manifest.mode}`);
        } else {
          console.error(`✗ Phát hiện ${result.errors.length} lỗi trong gói dữ liệu:`);
          for (const err of result.errors) {
            console.error(`  - [${err.file}:${err.line || 0}] (${err.field}): ${err.message}`);
          }
          process.exit(1);
        }
        break;
      }

      case 'import': {
        const dir = positional[0];
        if (!dir) {
          console.error('Lỗi: Cần cung cấp đường dẫn thư mục dữ liệu.');
          process.exit(1);
        }
        const resolvedPath = path.resolve(process.cwd(), dir);
        console.log(`[Import] Bắt đầu nhập dữ liệu từ: ${resolvedPath}`);
        const result = importKnowledgeBatch(db, resolvedPath);
        if (result.success) {
          if (result.idempotent) {
            console.log(`✓ ${result.message}`);
            console.log(`  - Version candidate tương ứng: ${result.candidate_version_id}`);
          } else {
            console.log(`✓ Nhập thành công phiên bản nháp: ${result.candidate_version_id}`);
            console.log(`  - Batch ID: ${result.batch_id}`);
            console.log(`  - Tổng số mục sau snapshot: ${result.item_count}`);
            console.log(`  - Chi tiết theo loại:`, result.items_by_type);
            console.log(`\nĐể xuất bản phiên bản này, chạy:`);
            console.log(`  node bin/knowledge.js publish ${result.candidate_version_id} --approved-by="<tên_bạn>"`);
          }
        } else {
          console.error(`✗ Nhập thất bại với ${result.errors.length} lỗi:`);
          for (const err of result.errors) {
            console.error(`  - [${err.file}:${err.line || 0}] (${err.field}): ${err.message}`);
          }
          process.exit(1);
        }
        break;
      }

      case 'diff': {
        const verId = positional[0];
        if (!verId) {
          console.error('Lỗi: Cần cung cấp version_id để xem diff.');
          process.exit(1);
        }
        const compareWith = positional[1] || null;
        const diff = getDiff(db, verId, compareWith);
        console.log(`[Diff] So sánh '${diff.version_a}' với '${diff.version_b || 'None'}':`);
        console.log(`  - Thêm mới (+${diff.added.length}):`, diff.added.map(i => `${i.type}:${i.item_id}`));
        console.log(`  - Thay đổi (~${diff.modified.length}):`, diff.modified.map(i => `${i.type}:${i.item_id}`));
        console.log(`  - Đã xóa (-${diff.removed.length}):`, diff.removed.map(i => `${i.type}:${i.item_id}`));
        break;
      }

      case 'publish': {
        const verId = positional[0];
        if (!verId) {
          console.error('Lỗi: Cần cung cấp version_id để xuất bản.');
          process.exit(1);
        }
        const approvedBy = flags['approved-by'];
        if (!approvedBy) {
          console.error('Lỗi: Cần cờ --approved-by="<tên_người_duyệt>".');
          process.exit(1);
        }
        const expectedRev = flags['expected-revision'] ? Number(flags['expected-revision']) : undefined;
        const res = publishVersion(db, verId, { approvedBy, expectedRevision: expectedRev });
        console.log(`✓ Xuất bản thành công!`);
        console.log(`  - Phiên bản Active mới: ${res.active_version_id}`);
        console.log(`  - Phiên bản cũ: ${res.previous_version_id || 'Chưa có'}`);
        console.log(`  - Revision hiện tại: ${res.revision}`);
        console.log(`  - Người phê duyệt: ${res.approved_by}`);
        break;
      }

      case 'rollback': {
        const verId = positional[0];
        if (!verId) {
          console.error('Lỗi: Cần cung cấp target_version_id để rollback.');
          process.exit(1);
        }
        const approvedBy = flags['approved-by'] || 'operator_rollback';
        const expectedRev = flags['expected-revision'] ? Number(flags['expected-revision']) : undefined;
        const res = rollbackVersion(db, verId, { approvedBy, expectedRevision: expectedRev });
        console.log(`✓ Rollback thành công!`);
        console.log(`  - Phiên bản Active hiện tại: ${res.active_version_id}`);
        console.log(`  - Revision hiện tại: ${res.revision}`);
        console.log(`  - Thực hiện bởi: ${res.rolled_back_by}`);
        break;
      }

      case 'list':
      case 'status': {
        const status = listVersions(db);
        console.log(`================ KHOH TRI THỨC HIỆN TẠI ================`);
        console.log(`Active Version ID: ${status.active_version_id || 'CHƯA CÓ (Cần import và publish)'}`);
        console.log(`Database Revision: ${status.revision}`);
        console.log(`--------------------------------------------------------`);
        if (status.versions.length === 0) {
          console.log('Chưa có phiên bản nào trong database.');
        } else {
          for (const v of status.versions) {
            const marker = v.is_active ? '★ ACTIVE' : (v.status === 'published' ? '  PUBLISHED' : '  DRAFT');
            console.log(`[${marker}] ID: ${v.id} | Parent: ${v.parent_id || 'None'}`);
            console.log(`    Duyệt bởi: ${v.approved_by_label || 'Chưa duyệt'} | Xuất bản: ${v.published_at || 'Chưa'}`);
            console.log(`    Số mục:`, v.items_by_type);
          }
        }
        console.log(`========================================================`);
        break;
      }

      default:
        console.error(`Lệnh không hợp lệ: '${command}'.`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n[LỖI CLI]: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs
};
