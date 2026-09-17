import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { getDatabase } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../../data');

export function seedDatabaseIfEmpty() {
  const db = getDatabase();

  // Check if knowledge is seeded
  const versionRow = db.prepare('SELECT id FROM knowledge_versions LIMIT 1').get() as { id: string } | undefined;

  if (!versionRow) {
    const versionId = 'kv_initial_v1';
    const checksum = crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO knowledge_versions (id, status, checksum, approved_by_label, created_at)
      VALUES (?, 'published', ?, 'system', ?)
    `).run(versionId, checksum, now);

    db.prepare('UPDATE knowledge_state SET active_version_id = ?, updated_at = ? WHERE id = 1').run(versionId, now);

    // Read persona.md
    const personaPath = path.join(dataDir, 'persona.md');
    if (fs.existsSync(personaPath)) {
      const markdown = fs.readFileSync(personaPath, 'utf8');
      const hash = crypto.createHash('sha256').update(markdown).digest('hex');
      db.prepare(`
        INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
        VALUES (?, 'persona_thay_minh', 'persona', ?, 'data/persona.md', ?)
      `).run(versionId, JSON.stringify({ markdown }), hash);
    }

    // Read policy.md
    const policyPath = path.join(dataDir, 'policy.md');
    if (fs.existsSync(policyPath)) {
      const policyContent = fs.readFileSync(policyPath, 'utf8');
      const hash = crypto.createHash('sha256').update(policyContent).digest('hex');
      db.prepare(`
        INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
        VALUES (?, 'policy_thay_minh', 'policy', ?, 'data/policy.md', ?)
      `).run(versionId, JSON.stringify({ markdown: policyContent }), hash);
    }

    // Read red_flags.json
    const redFlagsPath = path.join(dataDir, 'red_flags.json');
    if (fs.existsSync(redFlagsPath)) {
      const raw = fs.readFileSync(redFlagsPath, 'utf8');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      db.prepare(`
        INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
        VALUES (?, 'red_flags_rules', 'safety_rule', ?, 'data/red_flags.json', ?)
      `).run(versionId, raw, hash);
    }

    // Read few_shots.json
    const fewShotsPath = path.join(dataDir, 'few_shots.json');
    if (fs.existsSync(fewShotsPath)) {
      const raw = fs.readFileSync(fewShotsPath, 'utf8');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      db.prepare(`
        INSERT INTO knowledge_items (version_id, item_id, type, content_json, source_ref, content_hash)
        VALUES (?, 'few_shots_collection', 'conversation', ?, 'data/few_shots.json', ?)
      `).run(versionId, raw, hash);
    }
  }

  // Check if conversations are seeded
  const convCount = db.prepare('SELECT count(*) as count FROM conversations').get() as { count: number };
  if (convCount.count === 0) {
    seedConversations(db);
  }
}

function seedConversations(db: ReturnType<typeof getDatabase>) {
  const sampleConvs = [
    {
      id: 'conv-1',
      page_id: 'demo-page',
      page_name: 'Lớp Nhạc Thầy Minh',
      customer_id: 'cust-1',
      customer_name: 'Em Minh Quân',
      avatar_url: '',
      last_message: 'Dạ chỗ 0:35 đến 0:42 đó thầy, khúc đó ngón tay em đụng vô mấy phím đen cứ bị trợt với nặng tay sao á thầy.',
      intent: 'assignment_feedback',
      flag_reason: null,
      unread_count: 1,
      updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      messages: [
        {
          id: 'm-1-1',
          sender: 'staff',
          sender_name: 'Thầy Minh',
          text: 'Hi Minh Quân em! Bài Für Elise tuần rồi tập đến đoạn chuyển đoạn B chưa nè? Có vướng chỗ nào thì quay clip gửi thầy xem nghen ^^',
          created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        },
        {
          id: 'm-1-2',
          sender: 'student',
          sender_name: 'Em Minh Quân',
          text: 'Dạ thầy ơi, em vừa quay xong clip này ạ. Em tập tới ô nhịp 16 chỗ chuyển ngón mà cứ bị vấp hoài, tay gồng cứng ngắc luôn thầy xem giúp em với ạ!',
          created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString()
        },
        {
          id: 'm-1-3',
          sender: 'staff',
          sender_name: 'Thầy Minh',
          text: 'Thầy nhận được clip rồi nhen, để thầy mở lên soi kỹ ngón tay xem sao kk.',
          created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
        },
        {
          id: 'm-1-4',
          sender: 'student',
          sender_name: 'Em Minh Quân',
          text: 'Dạ chỗ 0:35 đến 0:42 đó thầy, khúc đó ngón tay em đụng vô mấy phím đen cứ bị trợt với nặng tay sao á thầy.',
          created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        }
      ]
    },
    {
      id: 'conv-2',
      page_id: 'demo-page',
      page_name: 'Lớp Nhạc Thầy Minh',
      customer_id: 'cust-2',
      customer_name: 'Chị Mai Lan',
      avatar_url: '',
      last_message: 'Dạ cảm ơn thầy động viên, chị vừa làm xong thủ tục nhập viện. Thầy kiểm tra giúp chị chính sách xem có rút lại học phí được chút nào để trang trải thuốc men không nhé thầy.',
      intent: 'sensitive',
      flag_reason: 'Bệnh hiểm nghèo (nhập viện mổ, hóa trị) - Cờ đỏ',
      unread_count: 1,
      updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      messages: [
        {
          id: 'm-2-1',
          sender: 'staff',
          sender_name: 'Thầy Minh',
          text: 'Dạ em chào chị Lan! Tuần này chị khỏe không ạ? Em thấy chị chưa nộp bài tập tuần 1 nè.',
          created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm-2-2',
          sender: 'student',
          sender_name: 'Chị Mai Lan',
          text: 'Chào em, mấy hôm nay chị đi khám thì bác sĩ báo phát hiện ung thư giai đoạn 2, phải nhập viện mổ gấp trong tuần này rồi chuyển sang hóa trị.',
          created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString()
        },
        {
          id: 'm-2-3',
          sender: 'staff',
          sender_name: 'Thầy Minh',
          text: 'Trời ơi em nghe tin mà thương chị quá! Chị giữ gìn sức khỏe nhé, chuyện bài vở chị gác qua một bên hoàn toàn giúp em.',
          created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString()
        },
        {
          id: 'm-2-4',
          sender: 'student',
          sender_name: 'Chị Mai Lan',
          text: 'Dạ cảm ơn thầy động viên, chị vừa làm xong thủ tục nhập viện. Thầy kiểm tra giúp chị chính sách xem có rút lại học phí được chút nào để trang trải thuốc men không nhé thầy.',
          created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
        }
      ]
    },
    {
      id: 'conv-3',
      page_id: 'demo-page',
      page_name: 'Lớp Nhạc Thầy Minh',
      customer_id: 'cust-3',
      customer_name: 'Anh Bảo Nam',
      avatar_url: '',
      last_message: 'Chào thầy, đợt này công ty em vào đợt kiểm toán cuối năm nên em đi làm từ sáng sớm tới 9-10h đêm mới về tới nhà, mệt nhoài người không chạm nổi vào đàn thầy ơi. Em sợ bỏ bê lâu quá bị mất ngón với quên sạch bài...',
      intent: 'check_in',
      flag_reason: null,
      unread_count: 0,
      updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      messages: [
        {
          id: 'm-3-1',
          sender: 'staff',
          sender_name: 'Thầy Minh',
          text: 'Hi anh Nam! Dạo này công việc cuối quý của mình còn căng thẳng nhiều ko anh ha? Thấy anh "im hơi lặng tiếng" gần 2 tuần rồi nè kk, ngón tay có nhớ phím đàn ko anh hengg?',
          created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString()
        },
        {
          id: 'm-3-2',
          sender: 'student',
          sender_name: 'Anh Bảo Nam',
          text: 'Chào thầy, đợt này công ty em vào đợt kiểm toán cuối năm nên em đi làm từ sáng sớm tới 9-10h đêm mới về tới nhà, mệt nhoài người không chạm nổi vào đàn thầy ơi. Em sợ bỏ bê lâu quá bị mất ngón với quên sạch bài...',
          created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
        }
      ]
    }
  ];

  const insertConv = db.prepare(`
    INSERT INTO conversations (id, page_id, page_name, customer_id, customer_name, avatar_url, last_message, intent, flag_reason, unread_count, updated_at)
    VALUES (@id, @page_id, @page_name, @customer_id, @customer_name, @avatar_url, @last_message, @intent, @flag_reason, @unread_count, @updated_at)
  `);

  const insertMsg = db.prepare(`
    INSERT INTO messages (id, conversation_id, sender, sender_name, text, attachments_json, created_at)
    VALUES (@id, @conversation_id, @sender, @sender_name, @text, @attachments_json, @created_at)
  `);

  for (const c of sampleConvs) {
    insertConv.run({
      id: c.id,
      page_id: c.page_id,
      page_name: c.page_name,
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      avatar_url: c.avatar_url,
      last_message: c.last_message,
      intent: c.intent,
      flag_reason: c.flag_reason,
      unread_count: c.unread_count,
      updated_at: c.updated_at
    });

    for (const m of c.messages) {
      insertMsg.run({
        id: m.id,
        conversation_id: c.id,
        sender: m.sender,
        sender_name: m.sender_name,
        text: m.text,
        attachments_json: '[]',
        created_at: m.created_at
      });
    }
  }
}
