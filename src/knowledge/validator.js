const fs = require('node:fs');
const path = require('node:path');

// Allowed files in a knowledge batch
const ALLOWED_FILES = new Set([
  'persona.md',
  'policies.jsonl',
  'faq.jsonl',
  'conversations.jsonl',
  'safety_rules.jsonl'
]);

function isValidIsoDate(str) {
  if (!str || typeof str !== 'string') return false;
  const d = new Date(str);
  return !Number.isNaN(d.getTime()) && str.includes('T');
}

function validateCommonFields(record, type, prefix, file, line) {
  const errors = [];
  
  if (!record.id || typeof record.id !== 'string') {
    errors.push({ file, line, field: 'id', message: 'ID là bắt buộc và phải là chuỗi.' });
  } else if (prefix && !record.id.startsWith(prefix)) {
    errors.push({ file, line, field: 'id', message: `ID '${record.id}' phải có tiền tố '${prefix}'.` });
  }

  if (!record.source_ref || typeof record.source_ref !== 'string') {
    errors.push({ file, line, field: 'source_ref', message: 'source_ref là bắt buộc.' });
  }

  if (!isValidIsoDate(record.collected_at)) {
    errors.push({ file, line, field: 'collected_at', message: 'collected_at phải là định dạng ISO 8601 có ngày giờ.' });
  }

  if (!['confirmed', 'pending'].includes(record.permission_status)) {
    errors.push({ file, line, field: 'permission_status', message: "permission_status phải là 'confirmed' hoặc 'pending'." });
  }

  if (typeof record.anonymized !== 'boolean') {
    errors.push({ file, line, field: 'anonymized', message: 'anonymized phải là boolean (true/false).' });
  }

  if (!['draft', 'approved', 'rejected'].includes(record.review_status)) {
    errors.push({ file, line, field: 'review_status', message: "review_status phải là 'draft', 'approved' hoặc 'rejected'." });
  }

  if (record.review_status === 'approved') {
    if (!record.approved_by || typeof record.approved_by !== 'string') {
      errors.push({ file, line, field: 'approved_by', message: "Khi review_status='approved', approved_by là bắt buộc." });
    }
    if (!isValidIsoDate(record.approved_at)) {
      errors.push({ file, line, field: 'approved_at', message: "Khi review_status='approved', approved_at phải là ISO 8601 hợp lệ." });
    }
  }

  return errors;
}

function parseJsonLines(content, file) {
  const lines = content.split('\n');
  const records = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    try {
      const obj = JSON.parse(rawLine);
      records.push({ data: obj, line: i + 1 });
    } catch (err) {
      errors.push({
        file,
        line: i + 1,
        field: 'json_syntax',
        message: `Lỗi cú pháp JSON: ${err.message}`
      });
    }
  }

  return { records, errors };
}

function validateBatchDirectory(dirPath) {
  const errors = [];
  const items = [];
  const deletedItemIds = [];

  if (!fs.existsSync(dirPath)) {
    return {
      valid: false,
      errors: [{ file: '', line: 0, field: 'path', message: `Thư mục không tồn tại: ${dirPath}` }]
    };
  }

  // 1. Validate manifest.json
  const manifestPath = path.join(dirPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      valid: false,
      errors: [{ file: 'manifest.json', line: 0, field: 'file', message: 'Thiếu file manifest.json trong thư mục nhập.' }]
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return {
      valid: false,
      errors: [{ file: 'manifest.json', line: 0, field: 'json_syntax', message: `Lỗi cú pháp JSON trong manifest.json: ${err.message}` }]
    };
  }

  if (manifest.schema_version !== '1.0') {
    errors.push({ file: 'manifest.json', line: 0, field: 'schema_version', message: "schema_version phải là '1.0'." });
  }

  if (!manifest.batch_id || typeof manifest.batch_id !== 'string') {
    errors.push({ file: 'manifest.json', line: 0, field: 'batch_id', message: 'batch_id là bắt buộc.' });
  }

  if (!isValidIsoDate(manifest.submitted_at)) {
    errors.push({ file: 'manifest.json', line: 0, field: 'submitted_at', message: 'submitted_at phải theo chuẩn ISO 8601.' });
  }

  if (!['delta', 'full'].includes(manifest.mode)) {
    errors.push({ file: 'manifest.json', line: 0, field: 'mode', message: "mode phải là 'delta' hoặc 'full'." });
  }

  if (!Array.isArray(manifest.files)) {
    errors.push({ file: 'manifest.json', line: 0, field: 'files', message: 'files phải là mảng danh sách tên file.' });
  }

  if (manifest.deleted_item_ids) {
    if (!Array.isArray(manifest.deleted_item_ids)) {
      errors.push({ file: 'manifest.json', line: 0, field: 'deleted_item_ids', message: 'deleted_item_ids phải là mảng.' });
    } else {
      for (const item of manifest.deleted_item_ids) {
        const id = typeof item === 'string' ? item : item?.id;
        if (!id) {
          errors.push({ file: 'manifest.json', line: 0, field: 'deleted_item_ids', message: 'Mỗi phần tử xóa phải có id.' });
        } else {
          deletedItemIds.push({ id, reason: item?.reason || '' });
        }
      }
    }
  }

  const seenIdsInBatch = new Set();
  const policiesByKeyAndScope = new Map(); // to check date overlapping

  // 2. Validate declared files
  const fileList = manifest.files || [];
  for (const filename of fileList) {
    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      errors.push({
        file: filename,
        line: 0,
        field: 'filename',
        message: `Tên file không hợp lệ (nghi vấn path traversal): ${filename}`
      });
      continue;
    }

    if (!ALLOWED_FILES.has(filename)) {
      errors.push({
        file: filename,
        line: 0,
        field: 'filename',
        message: `Tên file không được hỗ trợ trong manifest: ${filename}`
      });
      continue;
    }

    const fullFilePath = path.join(dirPath, filename);
    if (!fs.existsSync(fullFilePath)) {
      errors.push({
        file: filename,
        line: 0,
        field: 'file',
        message: `File được khai báo trong manifest nhưng không tồn tại trên đĩa: ${filename}`
      });
      continue;
    }

    // Size limit check (max 5MB per file)
    const stats = fs.statSync(fullFilePath);
    if (stats.size > 5 * 1024 * 1024) {
      errors.push({
        file: filename,
        line: 0,
        field: 'size',
        message: `Kích thước file vượt quá giới hạn 5MB (${stats.size} bytes).`
      });
      continue;
    }

    const content = fs.readFileSync(fullFilePath, 'utf-8');

    if (filename === 'persona.md') {
      if (!content.trim()) {
        errors.push({ file: filename, line: 0, field: 'content', message: 'Nội dung persona.md không được rỗng.' });
      } else {
        items.push({
          type: 'persona',
          item_id: 'persona-main',
          source_ref: manifest.batch_id,
          content: { markdown: content },
          review_status: 'approved' // Persona in manifest has top-level review
        });
      }
      continue;
    }

    const { records, errors: jsonErrors } = parseJsonLines(content, filename);
    errors.push(...jsonErrors);

    for (const { data, line } of records) {
      // Check ID uniqueness within batch
      if (data.id) {
        if (seenIdsInBatch.has(data.id)) {
          errors.push({
            file: filename,
            line,
            field: 'id',
            message: `ID trùng lặp trong cùng một lô nhập: ${data.id}`
          });
        } else {
          seenIdsInBatch.add(data.id);
        }
      }

      if (filename === 'policies.jsonl') {
        errors.push(...validateCommonFields(data, 'policy', 'policy-', filename, line));
        if (!data.title) errors.push({ file: filename, line, field: 'title', message: 'Chính sách cần có title.' });
        if (!data.policy_key) errors.push({ file: filename, line, field: 'policy_key', message: 'Chính sách cần có policy_key.' });
        if (!data.rule_text) errors.push({ file: filename, line, field: 'rule_text', message: 'Chính sách cần có rule_text.' });

        if (data.effective_from && !isValidIsoDate(data.effective_from)) {
          errors.push({ file: filename, line, field: 'effective_from', message: 'effective_from phải là ISO 8601 hợp lệ.' });
        }
        if (data.effective_to && !isValidIsoDate(data.effective_to)) {
          errors.push({ file: filename, line, field: 'effective_to', message: 'effective_to phải là ISO 8601 hợp lệ.' });
        }
        if (data.effective_from && data.effective_to) {
          if (new Date(data.effective_from) >= new Date(data.effective_to)) {
            errors.push({ file: filename, line, field: 'effective_to', message: 'effective_to phải lớn hơn effective_from.' });
          }
        }

        // Check date overlap for same policy_key and scope
        if (data.policy_key && data.scope) {
          const key = `${data.policy_key}___${data.scope}`;
          if (!policiesByKeyAndScope.has(key)) {
            policiesByKeyAndScope.set(key, []);
          }
          const from = data.effective_from ? new Date(data.effective_from).getTime() : 0;
          const to = data.effective_to ? new Date(data.effective_to).getTime() : Infinity;

          for (const existing of policiesByKeyAndScope.get(key)) {
            const overlap = (from < existing.to) && (to > existing.from);
            if (overlap) {
              errors.push({
                file: filename,
                line,
                field: 'effective_from',
                message: `Khoảng hiệu lực chính sách trùng lặp với '${existing.id}' cho cùng key '${data.policy_key}' và scope '${data.scope}'.`
              });
            }
          }
          policiesByKeyAndScope.get(key).push({ id: data.id, from, to });
        }

        items.push({
          type: 'policy',
          item_id: data.id,
          source_ref: data.source_ref || '',
          content: data,
          review_status: data.review_status
        });
      } else if (filename === 'faq.jsonl') {
        errors.push(...validateCommonFields(data, 'faq', 'faq-', filename, line));
        if (!data.question) errors.push({ file: filename, line, field: 'question', message: 'FAQ cần có question.' });
        if (!data.answer) errors.push({ file: filename, line, field: 'answer', message: 'FAQ cần có answer.' });
        if (data.policy_ids && !Array.isArray(data.policy_ids)) {
          errors.push({ file: filename, line, field: 'policy_ids', message: 'policy_ids phải là mảng.' });
        }

        items.push({
          type: 'faq',
          item_id: data.id,
          source_ref: data.source_ref || '',
          content: data,
          review_status: data.review_status
        });
      } else if (filename === 'conversations.jsonl') {
        errors.push(...validateCommonFields(data, 'conversation', 'conv-', filename, line));
        if (!Array.isArray(data.messages) || data.messages.length === 0) {
          errors.push({ file: filename, line, field: 'messages', message: 'conversations cần có mảng messages không rỗng.' });
        }
        if (!['xanh', 'vang', 'do'].includes(data.sensitivity)) {
          errors.push({ file: filename, line, field: 'sensitivity', message: "sensitivity phải là 'xanh', 'vang' hoặc 'do'." });
        }
        if (!['train', 'eval'].includes(data.split)) {
          errors.push({ file: filename, line, field: 'split', message: "split phải là 'train' hoặc 'eval'." });
        }

        items.push({
          type: 'conversation',
          item_id: data.id,
          source_ref: data.source_ref || '',
          content: data,
          review_status: data.review_status
        });
      } else if (filename === 'safety_rules.jsonl') {
        errors.push(...validateCommonFields(data, 'safety_rule', 'safety-', filename, line));
        if (!data.category) errors.push({ file: filename, line, field: 'category', message: 'safety_rules cần có category.' });
        if (!Array.isArray(data.keywords) || data.keywords.length === 0) {
          errors.push({ file: filename, line, field: 'keywords', message: 'safety_rules cần có mảng keywords không rỗng.' });
        }
        if (!data.safe_reply_template) errors.push({ file: filename, line, field: 'safe_reply_template', message: 'safe_reply_template là bắt buộc.' });

        items.push({
          type: 'safety_rule',
          item_id: data.id,
          source_ref: data.source_ref || '',
          content: data,
          review_status: data.review_status
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    manifest,
    items,
    deletedItemIds
  };
}

module.exports = {
  validateBatchDirectory,
  ALLOWED_FILES
};
