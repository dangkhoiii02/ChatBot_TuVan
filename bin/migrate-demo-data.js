const fs = require('node:fs');
const path = require('node:path');

function migrateLegacyData(sourceDir = path.join(__dirname, '..', 'data'), targetDir = path.join(__dirname, '..', 'data', 'demo_knowledge_batch')) {
  console.log(`[Migrate Demo Data] Đọc dữ liệu từ ${sourceDir} -> Tạo gói chuẩn tại ${targetDir}`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const nowIso = new Date().toISOString();
  const summary = {
    persona: false,
    policies: 0,
    safety_rules: 0,
    conversations: 0,
    faq: 0
  };

  // 1. Persona
  const personaPath = path.join(sourceDir, 'persona.md');
  if (fs.existsSync(personaPath)) {
    fs.copyFileSync(personaPath, path.join(targetDir, 'persona.md'));
    summary.persona = true;
  }

  // 2. Policies
  const policies = [
    {
      id: 'policy-duration-001',
      source_ref: 'data/policy.md#sec-1',
      collected_at: nowIso,
      permission_status: 'confirmed',
      anonymized: true,
      review_status: 'approved',
      approved_by: 'thay_minh',
      approved_at: nowIso,
      title: 'Quy mô khóa học tiêu chuẩn 20 tuần',
      policy_key: 'course_duration_weeks',
      scope: 'course-standard',
      value: 20,
      unit: 'week',
      rule_text: 'Khóa học kéo dài 20 tuần theo lộ trình chuẩn.',
      conditions: [],
      exceptions: [],
      effective_from: '2026-01-01T00:00:00+07:00',
      effective_to: null,
      supersedes_id: null
    },
    {
      id: 'policy-reservation-001',
      source_ref: 'data/policy.md#sec-1',
      collected_at: nowIso,
      permission_status: 'confirmed',
      anonymized: true,
      review_status: 'approved',
      approved_by: 'thay_minh',
      approved_at: nowIso,
      title: 'Quyền lợi bảo lưu tối đa 90 ngày',
      policy_key: 'reservation_max_days',
      scope: 'course-standard',
      value: 90,
      unit: 'day',
      rule_text: 'Mỗi học viên có tổng cộng tối đa 90 ngày bảo lưu trong suốt khóa 20 tuần. Báo trước từ 7 ngày để kích hoạt.',
      conditions: ['Học viên báo trước từ 7 ngày'],
      exceptions: [],
      effective_from: '2026-01-01T00:00:00+07:00',
      effective_to: null,
      supersedes_id: null
    },
    {
      id: 'policy-refund-001',
      source_ref: 'data/policy.md#sec-2',
      collected_at: nowIso,
      permission_status: 'confirmed',
      anonymized: true,
      review_status: 'approved',
      approved_by: 'thay_minh',
      approved_at: nowIso,
      title: 'Chính sách hoàn tiền ca bất khả kháng',
      policy_key: 'refund_hardship',
      scope: 'course-standard',
      value: 2800000,
      unit: 'VND',
      rule_text: 'Trường hợp bất khả kháng / bệnh hiểm nghèo / khủng hoảng sức khỏe: Thầy Minh sẵn sàng hỗ trợ hủy khóa và hoàn học phí (mức hoàn 2.800.000đ đối với khóa mới đăng ký) để học viên an tâm dưỡng bệnh.',
      conditions: ['Bất khả kháng hoặc bệnh hiểm nghèo', 'Cung cấp STK'],
      exceptions: [],
      effective_from: '2026-01-01T00:00:00+07:00',
      effective_to: null,
      supersedes_id: null
    }
  ];

  fs.writeFileSync(
    path.join(targetDir, 'policies.jsonl'),
    policies.map(p => JSON.stringify(p)).join('\n') + '\n',
    'utf-8'
  );
  summary.policies = policies.length;

  // 3. Red flags -> safety_rules.jsonl
  const redFlagsPath = path.join(sourceDir, 'red_flags.json');
  const safetyRules = [];
  if (fs.existsSync(redFlagsPath)) {
    const raw = JSON.parse(fs.readFileSync(redFlagsPath, 'utf-8'));
    let idx = 1;
    for (const [key, cat] of Object.entries(raw.categories || {})) {
      safetyRules.push({
        id: `safety-${key.replace(/_/g, '-')}-${String(idx).padStart(3, '0')}`,
        source_ref: 'data/red_flags.json',
        collected_at: nowIso,
        permission_status: 'confirmed',
        anonymized: true,
        review_status: 'approved',
        approved_by: 'thay_minh',
        approved_at: nowIso,
        category: cat.name,
        keywords: cat.keywords,
        instruction: cat.instruction,
        safe_reply_template: `Thầy đã nhận được tin nhắn của em rồi nè. Sức khỏe và an yên của em lúc này là quan trọng nhất, chuyện bài vở em cứ hoàn toàn gác lại nhen. Thầy và đội ngũ luôn sẵn sàng hỗ trợ em tốt nhất. Thầy gửi lời thăm và chúc em/gia đình sớm vượt qua khó khăn nhé!`,
        requires_human_review: true
      });
      idx++;
    }
  }

  fs.writeFileSync(
    path.join(targetDir, 'safety_rules.jsonl'),
    safetyRules.map(s => JSON.stringify(s)).join('\n') + '\n',
    'utf-8'
  );
  summary.safety_rules = safetyRules.length;

  // 4. Few shots -> conversations.jsonl
  const fewShotsPath = path.join(sourceDir, 'few_shots.json');
  const conversations = [];
  if (fs.existsSync(fewShotsPath)) {
    const raw = JSON.parse(fs.readFileSync(fewShotsPath, 'utf-8'));
    let convIdx = 1;
    for (const sample of raw) {
      conversations.push({
        id: `conv-seed-${String(convIdx).padStart(3, '0')}`,
        source_ref: 'data/few_shots.json',
        collected_at: nowIso,
        permission_status: 'confirmed',
        anonymized: true,
        review_status: 'approved',
        approved_by: 'thay_minh',
        approved_at: nowIso,
        student_ref: `HOC_VIEN_${String(convIdx).padStart(3, '0')}`,
        topic: sample.context?.topic || sample.title || 'Học đàn piano',
        context: sample.context || {},
        messages: [
          { role: 'student', text: sample.input_message }
        ],
        approved_reply: Array.isArray(sample.model_replies) ? sample.model_replies[0] : null,
        model_replies: sample.model_replies || [],
        sensitivity: sample.sensitivity || 'xanh',
        label_reason: sample.flag_reason || 'Mẫu dữ liệu thực tế Thầy Minh',
        policy_ids: sample.sensitivity === 'do' ? ['policy-refund-001'] : (sample.input_message.includes('bảo lưu') ? ['policy-reservation-001'] : []),
        must_avoid: sample.sensitivity === 'do' ? 'Không níu kéo học viên tiếp tục đóng tiền hoặc trả bài' : '',
        split: convIdx === 6 ? 'eval' : 'train' // Conv 6 is eval, others are train
      });
      convIdx++;
    }
  }

  fs.writeFileSync(
    path.join(targetDir, 'conversations.jsonl'),
    conversations.map(c => JSON.stringify(c)).join('\n') + '\n',
    'utf-8'
  );
  summary.conversations = conversations.length;

  // 5. FAQ
  const faqs = [
    {
      id: 'faq-reservation-001',
      source_ref: 'data/policy.md',
      collected_at: nowIso,
      permission_status: 'confirmed',
      anonymized: true,
      review_status: 'approved',
      approved_by: 'thay_minh',
      approved_at: nowIso,
      question: 'Thời gian bảo lưu khóa học là bao lâu?',
      answer: 'Mỗi học viên có tối đa 90 ngày bảo lưu trong suốt khóa học 20 tuần.',
      topic: 'bảo lưu',
      policy_ids: ['policy-reservation-001']
    },
    {
      id: 'faq-refund-001',
      source_ref: 'data/policy.md',
      collected_at: nowIso,
      permission_status: 'confirmed',
      anonymized: true,
      review_status: 'approved',
      approved_by: 'thay_minh',
      approved_at: nowIso,
      question: 'Khi gặp sự cố sức khỏe nan y có được hoàn phí không?',
      answer: 'Thầy hỗ trợ hoàn học phí (mức 2.800.000đ đối với khóa mới) để học viên an tâm điều trị.',
      topic: 'hoàn tiền',
      policy_ids: ['policy-refund-001']
    }
  ];

  fs.writeFileSync(
    path.join(targetDir, 'faq.jsonl'),
    faqs.map(f => JSON.stringify(f)).join('\n') + '\n',
    'utf-8'
  );
  summary.faq = faqs.length;

  // 6. Manifest
  const manifest = {
    schema_version: '1.0',
    batch_id: 'batch-seed-001',
    submitted_at: nowIso,
    collected_by: 'MIGRATION_TOOL',
    mode: 'full',
    files: [
      'persona.md',
      'policies.jsonl',
      'safety_rules.jsonl',
      'conversations.jsonl',
      'faq.jsonl'
    ],
    deleted_item_ids: []
  };

  fs.writeFileSync(
    path.join(targetDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  console.log('✓ Hoàn tất chuyển đổi dữ liệu demo cũ sang gói chuẩn 1.0:');
  console.log('  - persona.md:', summary.persona);
  console.log('  - policies.jsonl:', summary.policies);
  console.log('  - safety_rules.jsonl:', summary.safety_rules);
  console.log('  - conversations.jsonl:', summary.conversations);
  console.log('  - faq.jsonl:', summary.faq);
  console.log(`  - Thư mục đầu ra: ${targetDir}`);
  return summary;
}

if (require.main === module) {
  migrateLegacyData();
}

module.exports = { migrateLegacyData };
