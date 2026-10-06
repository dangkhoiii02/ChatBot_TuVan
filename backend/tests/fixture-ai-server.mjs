// A deterministic AI transport for the isolated UI fixture runner. It exercises
// the normal suggestion/review transactions without real keys or AI requests.
if (process.env.NODE_ENV !== 'test' || !process.env.BACKEND_DATABASE_PATH) {
  throw new Error('Fixture AI requires NODE_ENV=test and an isolated SQLite path.');
}
const {getDatabase}=await import('../dist/db/index.js');
globalThis.fetch = async (input,init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if(url.startsWith('https://fixture-pancake.invalid/api/')) {
    const parsed=new URL(url);const path=parsed.pathname;const db=getDatabase();
    const messageMatch=path.match(/\/pages\/([^/]+)\/conversations\/([^/]+)\/messages$/);
    if(messageMatch) {
      const [,pageId,conversationId]=messageMatch;const offset=Number(parsed.searchParams.get('current_count')||0);
      const rows=db.prepare(`SELECT message_id AS id,sender,sender_name,text,created_at AS inserted_at FROM conversation_message_cache
        WHERE page_id=? AND conversation_id=? ORDER BY created_at DESC,message_id DESC LIMIT 30 OFFSET ?`).all(pageId,decodeURIComponent(conversationId),offset);
      return json({success:true,messages:rows.map(row=>({...row,sender_type:row.sender==='staff'?'page':'user',page_id:pageId,from:{id:row.sender==='staff'?pageId:'customer',name:row.sender_name},type:'INBOX'}))});
    }
    const conversationMatch=path.match(/\/pages\/([^/]+)\/conversations$/);
    if(conversationMatch) {
      const all=db.prepare('SELECT * FROM conversations WHERE page_id=? ORDER BY updated_at DESC,id DESC').all(conversationMatch[1]);
      const cursor=parsed.searchParams.get('last_conversation_id');const start=cursor?all.findIndex(row=>row.id===cursor)+1:0;
      return json({conversations:all.slice(start,start+60).map(row=>({id:row.id,from:{id:row.customer_id,name:row.customer_name},snippet:row.last_message,updated_at:row.updated_at,type:'INBOX'}))});
    }
    throw new Error('Unsupported fixture Pancake read endpoint.');
  }
  if (url !== 'https://fixture-ai.invalid/v1/chat/completions') {
    throw new Error('External requests are disabled in the UI fixture server.');
  }
  const result = { intent: 'assignment_feedback', sensitivity: 'xanh', analysis: 'UI fixture response; no real AI was called.',
    replies: [
      { tone: 'Nhẹ nhàng', content: 'Em tập chậm lại theo nhận xét của thầy nhé.' },
      { tone: 'Rõ ràng', content: 'Em kiểm tra nhịp và tập chậm như thầy đã hướng dẫn nhé.' },
      { tone: 'Khích lệ', content: 'Em cứ tập từng bước theo hướng dẫn rồi gửi bài để thầy xem tiếp nhé.' }
    ], proposals: [] };
  const requestBody=typeof init?.body==='string'?JSON.parse(init.body):{};
  const system=requestBody.messages?.[0]?.content||'';
  const prompt=requestBody.messages?.[1]?.content||'';
  if(system.includes('chỉ ĐỀ XUẤT')) {
    const match=prompt.match(/ID=manual-preference \|[^\n]*: (.*)/);
    if(match)result.proposals=[{kind:'preference',payload:{content:'Hãy gọi em là Phương.'},sourceMessageId:'manual-preference',sourceText:'Hãy gọi em là Phương.',confidence:1},
      {kind:'learning_note',payload:{content:'Em thích được hướng dẫn từng bước.'},sourceMessageId:'manual-preference',sourceText:'Em thích được hướng dẫn từng bước.',confidence:1}];
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
await import('../dist/server.js');

function json(data){return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});}
