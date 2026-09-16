const fs = require('node:fs');
const path = require('node:path');
const { validateBatchDirectory } = require('./validator');
const { sha256 } = require('../utils/crypto');

function computeBatchChecksum(dirPath, manifest) {
  const fileHashes = [];
  const files = [...(manifest.files || [])].sort();

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      fileHashes.push(`${file}:${sha256(content)}`);
    }
  }

  const manifestStr = JSON.stringify({
    schema_version: manifest.schema_version,
    batch_id: manifest.batch_id,
    mode: manifest.mode,
    files: manifest.files,
    deleted_item_ids: manifest.deleted_item_ids || []
  });

  return sha256(manifestStr + '||' + fileHashes.join(';'));
}

function importKnowledgeBatch(db, dirPath, options = {}) {
  // 1. Validate batch
  const validation = validateBatchDirectory(dirPath);
  const manifest = validation.manifest;

  if (!validation.valid) {
    if (manifest?.batch_id) {
      const batchChecksum = manifest ? computeBatchChecksum(dirPath, manifest) : 'invalid';
      db.prepare(`
        INSERT OR REPLACE INTO import_batches (id, checksum, status, errors_json, candidate_version_id, created_at)
        VALUES (?, ?, 'rejected', ?, NULL, datetime('now'))
      `).run(manifest.batch_id, batchChecksum, JSON.stringify(validation.errors));
    }
    return {
      success: false,
      errors: validation.errors
    };
  }

  const batchChecksum = computeBatchChecksum(dirPath, manifest);

  // 2. Check existing batch_id in database
  const existingBatch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(manifest.batch_id);
  if (existingBatch) {
    if (existingBatch.checksum === batchChecksum && existingBatch.status === 'imported') {
      return {
        success: true,
        idempotent: true,
        batch_id: manifest.batch_id,
        candidate_version_id: existingBatch.candidate_version_id,
        message: 'Lô dữ liệu đã được nhập trước đó với cùng nội dung (idempotent).'
      };
    } else if (existingBatch.checksum !== batchChecksum) {
      throw new Error(`Xung đột batch_id: '${manifest.batch_id}' đã tồn tại trong DB với nội dung khác (checksum không khớp).`);
    }
  }

  // 3. Determine parent version
  let parentVersionId = options.parentVersionId;
  if (!parentVersionId) {
    const stateRow = db.prepare('SELECT active_version_id FROM knowledge_state WHERE id = 1').get();
    parentVersionId = stateRow?.active_version_id || null;
  }

  // 4. Construct snapshot items
  const itemMap = new Map(); // key: `${type}:::${item_id}` -> item

  if (manifest.mode === 'delta' && parentVersionId) {
    const parentItems = db.prepare('SELECT * FROM knowledge_items WHERE version_id = ?').all(parentVersionId);
    for (const pItem of parentItems) {
      itemMap.set(pItem.item_id, {
        type: pItem.type,
        item_id: pItem.item_id,
        source_ref: pItem.source_ref,
        content: JSON.parse(pItem.content_json)
      });
    }
  }

  // Apply deletes
  for (const del of validation.deletedItemIds) {
    itemMap.delete(del.id);
  }

  // Apply additions and updates from current batch
  for (const item of validation.items) {
    itemMap.set(item.item_id, item);
  }

  const snapshotItems = Array.from(itemMap.values());

  // 5. Post-merge validation: check reference integrity
  // All FAQ policy_ids must point to existing policies in the snapshot
  const policyIdsInSnapshot = new Set(
    snapshotItems.filter(i => i.type === 'policy').map(i => i.item_id)
  );

  const referenceErrors = [];
  for (const item of snapshotItems) {
    if (item.type === 'faq' && Array.isArray(item.content.policy_ids)) {
      for (const pId of item.content.policy_ids) {
        if (!policyIdsInSnapshot.has(pId)) {
          referenceErrors.push({
            file: 'faq.jsonl',
            line: 0,
            field: 'policy_ids',
            message: `FAQ '${item.item_id}' tham chiếu đến policy_id không tồn tại trong snapshot sau hợp nhất: '${pId}'`
          });
        }
      }
    }
  }

  if (referenceErrors.length > 0) {
    db.prepare(`
      INSERT OR REPLACE INTO import_batches (id, checksum, status, errors_json, candidate_version_id, created_at)
      VALUES (?, ?, 'rejected', ?, NULL, datetime('now'))
    `).run(manifest.batch_id, batchChecksum, JSON.stringify(referenceErrors));

    return {
      success: false,
      errors: referenceErrors
    };
  }

  // 6. Persist draft version and items in transaction
  const candidateVersionId = `v_${manifest.batch_id}_${Date.now()}`;
  const versionChecksum = sha256(JSON.stringify(snapshotItems.map(i => ({ id: i.item_id, h: sha256(i.content) }))));

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      INSERT INTO knowledge_versions (id, parent_id, status, checksum, approved_by_label, approved_at, published_at, created_at)
      VALUES (?, ?, 'draft', ?, NULL, NULL, NULL, datetime('now'))
    `).run(candidateVersionId, parentVersionId, versionChecksum);

    const insertItemStmt = db.prepare(`
      INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const item of snapshotItems) {
      const contentJson = JSON.stringify(item.content);
      const contentHash = sha256(contentJson);
      insertItemStmt.run(
        candidateVersionId,
        item.item_id,
        item.type,
        contentJson,
        item.source_ref || manifest.batch_id,
        contentHash
      );
    }

    db.prepare(`
      INSERT OR REPLACE INTO import_batches (id, checksum, status, errors_json, candidate_version_id, created_at)
      VALUES (?, ?, 'imported', NULL, ?, datetime('now'))
    `).run(manifest.batch_id, batchChecksum, candidateVersionId);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    success: true,
    batch_id: manifest.batch_id,
    candidate_version_id: candidateVersionId,
    parent_version_id: parentVersionId,
    item_count: snapshotItems.length,
    items_by_type: snapshotItems.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {})
  };
}

module.exports = {
  computeBatchChecksum,
  importKnowledgeBatch
};
