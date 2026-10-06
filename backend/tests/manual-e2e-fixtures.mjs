// Local synthetic accounts for the repeatable UI walkthrough. Never seed live DBs.
export const MANUAL_E2E = {
  pageId:'page-test',
  anh:{conversationId:'manual-anh',studentId:'manual-student-anh',name:'[TEST] Anh Võ'},
  phuong:{conversationId:'manual-phuong',studentId:'manual-student-phuong',name:'[TEST] DanPhuong Tran'},
  lien:{conversationId:'manual-lien',studentId:'manual-student-lien',name:'[TEST] Vũ Thị Hương Liên'}
};
export function seedManualE2E(db) {
  const created='2026-09-01T00:00:00.000Z';
  for(const account of [MANUAL_E2E.anh,MANUAL_E2E.phuong,MANUAL_E2E.lien]) {
    db.prepare(`INSERT OR IGNORE INTO students(id,page_id,name,created_at,updated_at) VALUES (?,?,?,?,?)`).run(account.studentId,MANUAL_E2E.pageId,account.name,created,created);
    db.prepare(`INSERT OR IGNORE INTO conversations(id,page_id,page_name,customer_id,customer_name,last_message,updated_at)
      VALUES (?,?,'Môi trường kiểm thử',?,?,?,?)`).run(account.conversationId,MANUAL_E2E.pageId,`customer-${account.conversationId}`,account.name,'Dữ liệu tổng hợp phục vụ kiểm thử','2026-10-06T00:00:00.000Z');
    db.prepare(`INSERT OR IGNORE INTO student_conversation_links(page_id,conversation_id,student_id,linked_by,linked_at) VALUES (?,?,?,'staff-test',?)`).run(MANUAL_E2E.pageId,account.conversationId,account.studentId,created);
    db.prepare(`INSERT OR IGNORE INTO student_conversation_link_history(id,page_id,customer_id,conversation_id,student_id,valid_from,source,confirmed_by)
      VALUES (?,?,?,?,?,?,'fixture','staff-test')`).run(`history-${account.conversationId}`,MANUAL_E2E.pageId,`customer-${account.conversationId}`,account.conversationId,account.studentId,created);
  }
  const message=(conversation,id,sender,text,date)=>{
    const name=sender==='staff'?'Giáo viên Test':Object.values(MANUAL_E2E).find(value=>value.conversationId===conversation)?.name||'[TEST] Học viên';
    db.prepare(`INSERT OR IGNORE INTO messages(id,conversation_id,sender,sender_name,text,attachments_json,created_at) VALUES (?,?,?,?,?,'[]',?)`).run(id,conversation,sender,name,text,date);
    db.prepare(`INSERT OR IGNORE INTO conversation_message_cache(page_id,conversation_id,message_id,sender,sender_name,text,attachments_json,created_at) VALUES (?,?,?,?,?,?,'[]',?)`).run(MANUAL_E2E.pageId,conversation,id,sender,name,text,date);
  };
  for(let i=0;i<75;i++)message(MANUAL_E2E.anh.conversationId,`manual-old-${i}`,i%2?'staff':'student',`TIN CŨ ${String(i+1).padStart(2,'0')} — nội dung luyện đàn thử nghiệm.`,new Date(Date.UTC(2026,8,1,0,i)).toISOString());
  const rows=[
    ['manual-anh','manual-submit-1','student','MỐC 01 — Em gửi bài Minuet đoạn ô nhịp 16. Em đang bị kẹt đoạn này.','2026-10-01T08:00:00.000Z'],
    ['manual-anh','manual-teacher-1','staff','MỐC 01 — Em sai nhịp và cổ tay thấp ở ô nhịp 16. Tập chậm với metronome tempo 50.','2026-10-01T09:00:00.000Z'],
    ['manual-anh','manual-self-2','student','MỐC 02 — Em vẫn sai nhịp ở ô nhịp 16 khi tập Minuet.','2026-10-02T08:00:00.000Z'],
    ['manual-anh','manual-teacher-3','staff','MỐC 03 — Em sai nhịp, cổ tay thấp và ngón 2 trượt phím ở Minuet. Tập riêng ngón 2, giữ cổ tay thả lỏng.','2026-10-03T09:00:00.000Z'],
    ['manual-anh','manual-evidence-extra','staff','MỐC 03 BỔ SUNG — Cổ tay thấp trong cùng lần tập vừa nhận xét.','2026-10-03T09:01:00.000Z'],
    ['manual-anh','manual-resolution','staff','MỐC 04 — Em đã sửa lỗi sai nhịp và vượt đoạn ô nhịp 16 của Minuet.','2026-10-04T09:00:00.000Z'],
    ['manual-anh','manual-recur','staff','MỐC 05 — Em lại sai nhịp khi tập đoạn mới của Minuet.','2026-10-05T09:00:00.000Z'],
    ['manual-phuong','manual-preference','student','Hãy gọi em là Phương. Em thích được hướng dẫn từng bước.','2026-10-05T08:00:00.000Z'],
    ['manual-phuong','manual-event','student','Cuối tuần em biểu diễn piano nên muốn luyện bài chậm hơn.','2026-10-05T08:02:00.000Z'],
    ['manual-phuong','manual-private','student','Chuyện gia đình này là riêng tư, chỉ lưu cho nhân viên.','2026-10-05T08:03:00.000Z'],
    ['manual-lien','manual-lien-submit','student','Em gửi bài luyện âm giai. Em muốn được gọi là Liên.','2026-10-05T08:00:00.000Z'],
    ['manual-lien','manual-lien-teacher','staff','Liên cần giữ nhịp đều khi luyện âm giai, tập metronome tempo 40.','2026-10-05T09:00:00.000Z']
  ];for(const row of rows)message(...row);
  message('manual-lien','manual-lien-self-resolved','student','Em nghĩ em đã giữ nhịp đều rồi.','2026-10-06T08:00:00.000Z');
  message('manual-lien','manual-lien-resolved','staff','Giáo viên xác nhận Liên đã giữ nhịp đều khi luyện âm giai.','2026-10-06T09:00:00.000Z');
  for(const [id,kind,payload,source,text,date] of [
    ['manual-proposal-issue','issue',{title:'[E2E] Giữ nhịp đều',summary:'Lỗi có nhận xét giáo viên.'},'manual-lien-teacher','Liên cần giữ nhịp đều khi luyện âm giai, tập metronome tempo 40.','2026-10-05T09:00:00.000Z'],
    ['manual-proposal-practice','practice_action',{issueTitle:'[E2E] Giữ nhịp đều',content:'tập metronome tempo 40.'},'manual-lien-teacher','Liên cần giữ nhịp đều khi luyện âm giai, tập metronome tempo 40.','2026-10-05T09:00:00.000Z'],
    ['manual-proposal-self-resolution','resolution',{issueTitle:'[E2E] Giữ nhịp đều',evidence:'Em nghĩ em đã giữ nhịp đều rồi.'},'manual-lien-self-resolved','Em nghĩ em đã giữ nhịp đều rồi.','2026-10-06T08:00:00.000Z'],
    ['manual-proposal-resolution','resolution',{issueTitle:'[E2E] Giữ nhịp đều',evidence:'Giáo viên xác nhận Liên đã giữ nhịp đều khi luyện âm giai.'},'manual-lien-resolved','Giáo viên xác nhận Liên đã giữ nhịp đều khi luyện âm giai.','2026-10-06T09:00:00.000Z']
  ])db.prepare(`INSERT OR IGNORE INTO student_proposals(id,student_id,kind,payload_json,source_message_id,source_conversation_id,source_text,source_occurred_at,confidence,prompt_version,status,created_at)
    VALUES (?,?,?,?,?,'manual-lien',?,?,1,'manual-e2e-fixture','pending','2026-10-06T00:00:00.000Z')`).run(id,MANUAL_E2E.lien.studentId,kind,JSON.stringify(payload),source,text,date);
  db.prepare(`INSERT OR IGNORE INTO student_facts(id,student_id,kind,content,status,sensitivity,verification_status,conflict_status,use_in_suggestions,use_requested,created_by,created_at,updated_at)
    VALUES ('manual-legacy-note',?,'learning_note','Ghi chú cũ chưa xác nhận — thích học buổi tối.','active','normal','legacy_unverified','none',0,1,'fixture',?,?)`).run(MANUAL_E2E.phuong.studentId,created,created);
  db.prepare(`UPDATE students SET name='[TEST] An' WHERE id='student-a'`).run();
  db.prepare(`UPDATE students SET name='[TEST] Bình' WHERE id='student-b'`).run();
  db.prepare(`UPDATE conversations SET customer_name='[TEST] Gia đình An Bình',page_name='Môi trường kiểm thử' WHERE customer_id='customer-test'`).run();
  for(const [id,text] of [['conversation-shared','[TEST] Tài khoản dùng chung hai con An và Bình'],['conversation-teacher','[TEST] Nguồn nhận xét giáo viên của Bình'],['conversation-a','[TEST] Hồ sơ riêng của An']])
    db.prepare('UPDATE conversations SET last_message=? WHERE id=?').run(text,id);
  db.prepare("UPDATE conversations SET updated_at='2026-10-06T00:00:00.000Z' WHERE id='conversation-shared'").run();
  // Keep a source outside the first list page to exercise evidence navigation.
  for(let i=0;i<61;i++)db.prepare(`INSERT OR IGNORE INTO conversations(id,page_id,customer_id,customer_name,last_message,updated_at)
    VALUES (?, ?, ?, ?, 'Hội thoại thử để kiểm tra phân trang', ?)`).run(`manual-filler-${i}`,MANUAL_E2E.pageId,`manual-customer-${i}`,`[TEST] Hội thoại phân trang ${i+1}`,'2026-09-30T00:00:00.000Z');
}
