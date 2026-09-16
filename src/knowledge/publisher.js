function publishVersion(db, versionId, options = {}) {
  const { approvedBy, expectedRevision } = options;

  if (!approvedBy || typeof approvedBy !== 'string') {
    throw new Error('Cần cung cấp thông tin người phê duyệt (approvedBy) trước khi xuất bản.');
  }

  const version = db.prepare('SELECT * FROM knowledge_versions WHERE id = ?').get(versionId);
  if (!version) {
    throw new Error(`Không tìm thấy phiên bản tri thức: '${versionId}'`);
  }

  if (version.status !== 'draft' && version.status !== 'published') {
    throw new Error(`Phiên bản '${versionId}' đang ở trạng thái '${version.status}', không thể xuất bản.`);
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const state = db.prepare('SELECT active_version_id, revision FROM knowledge_state WHERE id = 1').get();
    
    if (expectedRevision !== undefined && expectedRevision !== null) {
      if (state.revision !== Number(expectedRevision)) {
        throw new Error(`Xung đột phiên bản (Concurrency Conflict): revision kỳ vọng là ${expectedRevision}, nhưng hiện tại là ${state.revision}.`);
      }
    }

    const newRevision = state.revision + 1;

    // Update version metadata
    db.prepare(`
      UPDATE knowledge_versions
      SET status = 'published',
          approved_by_label = ?,
          approved_at = coalesce(approved_at, datetime('now')),
          published_at = datetime('now')
      WHERE id = ?
    `).run(approvedBy, versionId);

    // Update active pointer
    db.prepare(`
      UPDATE knowledge_state
      SET active_version_id = ?,
          revision = ?,
          updated_at = datetime('now')
      WHERE id = 1
    `).run(versionId, newRevision);

    db.exec('COMMIT;');

    return {
      success: true,
      active_version_id: versionId,
      previous_version_id: state.active_version_id,
      revision: newRevision,
      approved_by: approvedBy
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function rollbackVersion(db, targetVersionId, options = {}) {
  const { approvedBy = 'admin_rollback', expectedRevision } = options;

  const target = db.prepare('SELECT * FROM knowledge_versions WHERE id = ?').get(targetVersionId);
  if (!target) {
    throw new Error(`Không tìm thấy phiên bản đích để rollback: '${targetVersionId}'`);
  }

  if (target.status !== 'published') {
    throw new Error(`Chỉ có thể rollback về phiên bản đã từng published. Phiên bản '${targetVersionId}' có trạng thái '${target.status}'.`);
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const state = db.prepare('SELECT active_version_id, revision FROM knowledge_state WHERE id = 1').get();

    if (state.active_version_id === targetVersionId) {
      throw new Error(`Phiên bản '${targetVersionId}' hiện tại đã là phiên bản active.`);
    }

    if (expectedRevision !== undefined && expectedRevision !== null) {
      if (state.revision !== Number(expectedRevision)) {
        throw new Error(`Xung đột phiên bản (Concurrency Conflict): revision kỳ vọng là ${expectedRevision}, nhưng hiện tại là ${state.revision}.`);
      }
    }

    const newRevision = state.revision + 1;

    db.prepare(`
      UPDATE knowledge_state
      SET active_version_id = ?,
          revision = ?,
          updated_at = datetime('now')
      WHERE id = 1
    `).run(targetVersionId, newRevision);

    db.exec('COMMIT;');

    return {
      success: true,
      active_version_id: targetVersionId,
      previous_version_id: state.active_version_id,
      revision: newRevision,
      rolled_back_by: approvedBy
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function getDiff(db, versionAId, versionBId) {
  // If versionBId is not provided, compare with current active version
  if (!versionBId) {
    const state = db.prepare('SELECT active_version_id FROM knowledge_state WHERE id = 1').get();
    versionBId = state?.active_version_id;
  }

  const itemsA = db.prepare('SELECT item_id, type, content_hash FROM knowledge_items WHERE version_id = ?').all(versionAId);
  const itemsB = versionBId 
    ? db.prepare('SELECT item_id, type, content_hash FROM knowledge_items WHERE version_id = ?').all(versionBId)
    : [];

  const mapA = new Map(itemsA.map(i => [i.item_id, i]));
  const mapB = new Map(itemsB.map(i => [i.item_id, i]));

  const added = [];
  const modified = [];
  const removed = [];

  for (const [id, itemA] of mapA) {
    if (!mapB.has(id)) {
      added.push({ item_id: id, type: itemA.type });
    } else if (mapB.get(id).content_hash !== itemA.content_hash) {
      modified.push({ item_id: id, type: itemA.type });
    }
  }

  for (const [id, itemB] of mapB) {
    if (!mapA.has(id)) {
      removed.push({ item_id: id, type: itemB.type });
    }
  }

  return {
    version_a: versionAId,
    version_b: versionBId,
    added,
    modified,
    removed
  };
}

function listVersions(db) {
  const state = db.prepare('SELECT active_version_id, revision FROM knowledge_state WHERE id = 1').get();
  const versions = db.prepare('SELECT * FROM knowledge_versions ORDER BY created_at DESC').all();

  const countStmt = db.prepare('SELECT type, count(*) as count FROM knowledge_items WHERE version_id = ? GROUP BY type');

  return {
    active_version_id: state?.active_version_id || null,
    revision: state?.revision || 1,
    versions: versions.map(v => {
      const counts = countStmt.all(v.id);
      const itemsByType = counts.reduce((acc, c) => {
        acc[c.type] = c.count;
        return acc;
      }, {});
      return {
        ...v,
        is_active: v.id === state?.active_version_id,
        items_by_type: itemsByType
      };
    })
  };
}

module.exports = {
  publishVersion,
  rollbackVersion,
  getDiff,
  listVersions
};
