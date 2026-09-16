const { containsKeyword, extractKeywords } = require('../utils/text');

function getPersona(db, versionId) {
  const row = db.prepare(`
    SELECT content_json FROM knowledge_items
    WHERE version_id = ? AND type = 'persona'
    LIMIT 1
  `).get(versionId);

  if (!row) return '';
  try {
    const data = JSON.parse(row.content_json);
    return data.markdown || '';
  } catch (e) {
    return '';
  }
}

function getSafetyRules(db, versionId) {
  const rows = db.prepare(`
    SELECT item_id, content_json FROM knowledge_items
    WHERE version_id = ? AND type = 'safety_rule'
  `).all(versionId);

  return rows.map(r => {
    try {
      return { item_id: r.item_id, ...JSON.parse(r.content_json) };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

function checkRedFlags(db, versionId, text) {
  if (!text) return { isRed: false };

  const rules = getSafetyRules(db, versionId);

  for (const rule of rules) {
    const keywords = rule.keywords || [];
    for (const kw of keywords) {
      if (containsKeyword(text, kw)) {
        return {
          isRed: true,
          rule_id: rule.item_id,
          category: rule.category || 'Nhạy cảm',
          keyword: kw,
          instruction: rule.instruction || '',
          safeReplyTemplate: rule.safe_reply_template || 'Chào bạn, hiện tại tình huống này cần thầy Minh trực tiếp trao đổi và hỗ trợ. Thầy sẽ liên hệ lại sớm nhất nhé!',
          reason: `Phát hiện dấu hiệu nhạy cảm [${kw}] thuộc nhóm "${rule.category}". Tuyệt đối không níu kéo hoặc thúc ép bài vở. Bắt buộc người thật xem xét.`
        };
      }
    }
  }

  return { isRed: false };
}

function getRelevantPolicies(db, versionId, options = {}) {
  const { text = '', now = new Date() } = options;
  const rows = db.prepare(`
    SELECT item_id, content_json FROM knowledge_items
    WHERE version_id = ? AND type = 'policy'
  `).all(versionId);

  const nowTime = now.getTime();
  const inputKeywords = extractKeywords(text);

  const activePolicies = [];

  for (const r of rows) {
    let p;
    try {
      p = JSON.parse(r.content_json);
    } catch (e) {
      continue;
    }

    // Check effective date range [effective_from, effective_to)
    if (p.effective_from) {
      const from = new Date(p.effective_from).getTime();
      if (nowTime < from) continue;
    }
    if (p.effective_to) {
      const to = new Date(p.effective_to).getTime();
      if (nowTime >= to) continue;
    }

    // Rank score based on keyword match
    let score = 0;
    const policyText = `${p.title || ''} ${p.rule_text || ''} ${p.policy_key || ''}`.toLowerCase();
    for (const kw of inputKeywords) {
      if (policyText.includes(kw)) score += 1;
    }

    activePolicies.push({ policy: p, score });
  }

  // Sort by score descending
  activePolicies.sort((a, b) => b.score - a.score);

  // Return top 5 relevant policies (or all active if fewer)
  return activePolicies.slice(0, 5).map(item => item.policy);
}

function getRelevantFewShots(db, versionId, options = {}) {
  const { text = '', limit = 3 } = options;
  const rows = db.prepare(`
    SELECT item_id, content_json FROM knowledge_items
    WHERE version_id = ? AND type = 'conversation'
  `).all(versionId);

  const inputKeywords = extractKeywords(text);
  const candidates = [];

  for (const r of rows) {
    let conv;
    try {
      conv = JSON.parse(r.content_json);
    } catch (e) {
      continue;
    }

    // STRICT ISOLATION: Never use 'eval' split for retrieval context!
    if (conv.split === 'eval') {
      continue;
    }

    // Must have approved reply or model replies
    if (!conv.approved_reply && (!conv.model_replies || conv.model_replies.length === 0)) {
      continue;
    }

    let score = 0;
    const messagesText = (conv.messages || []).map(m => m.text).join(' ').toLowerCase();
    for (const kw of inputKeywords) {
      if (messagesText.includes(kw)) score += 1;
    }

    candidates.push({ conv, score });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, limit).map(c => c.conv);
}

function getKnowledgeContext(db, versionId, message, context = {}) {
  const persona = getPersona(db, versionId);
  const redFlagCheck = checkRedFlags(db, versionId, message);
  const policies = getRelevantPolicies(db, versionId, { text: message });
  const fewShots = getRelevantFewShots(db, versionId, { text: message, limit: 3 });

  return {
    version_id: versionId,
    persona,
    redFlagCheck,
    policies,
    fewShots
  };
}

module.exports = {
  getPersona,
  getSafetyRules,
  checkRedFlags,
  getRelevantPolicies,
  getRelevantFewShots,
  getKnowledgeContext
};
