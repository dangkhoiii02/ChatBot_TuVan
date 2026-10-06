import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pancake-native-paging-'));
Object.assign(process.env,{NODE_ENV:'test',BACKEND_DATABASE_PATH:path.join(directory,'test.sqlite'),APP_SESSION_SECRET:'paging-test-only',
 PANCAKE_PAGE_ID:'page-test',PANCAKE_PAGE_ACCESS_TOKEN:'fixture-page-token',AI_PROVIDER:'mock',ALLOW_DEMO_MODE:'0'});
const [{createApp},{issueAppSession},{getDatabase}]=await Promise.all([import('../dist/app.js'),import('../dist/services/sessionToken.js'),import('../dist/db/index.js')]);
test('native Pancake pagination exposes every conversation and message beyond the first page',async()=>{
 const db=getDatabase();const server=http.createServer(createApp());await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;const token=issueAppSession({userId:'staff-test',pageId:'page-test'});
 const realFetch=globalThis.fetch;const offsets=[];
 const conversations=Array.from({length:120},(_,i)=>({id:`conversation-${i}`,from:{id:`customer-${i}`,name:`Student ${i}`},updated_at:'2026-10-01T00:00:00.000Z'}));
 const messages=Array.from({length:80},(_,i)=>({id:`message-${i}`,from:{id:'customer-0',name:'Student 0'},page_id:'page-test',type:'INBOX',text:`Message ${i}`,inserted_at:new Date(Date.UTC(2026,9,1,0,80-i)).toISOString()}));
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.hostname!=='pages.fm')return realFetch(input,init);
  if(url.pathname.endsWith('/messages')) {const offset=Number(url.searchParams.get('current_count')||0);offsets.push(offset);return new Response(JSON.stringify({success:true,messages:messages.slice(offset,offset+30)}));}
  const cursor=url.searchParams.get('last_conversation_id');const start=cursor?conversations.findIndex(item=>item.id===cursor)+1:0;
  return new Response(JSON.stringify({conversations:conversations.slice(start,start+60)}));
 };
 try{
  const read=async url=>{const response=await fetch(origin+url,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);return response.json();};
  const first=await read('/api/conversations?pageIds=page-test&limit=50');assert.equal(first.items.length,60);
  const second=await read(`/api/conversations?pageIds=page-test&limit=50&cursors=${encodeURIComponent(JSON.stringify(first.nextCursors))}`);assert.equal(second.items[0].id,'conversation-60');
  assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,120);
  const loaded=[];let cursor;let more=true;
  while(more){const page=await read(`/api/conversations/conversation-0/messages?pageId=page-test&limit=50${cursor?'&before='+encodeURIComponent(cursor):''}`);loaded.push(...page.items);cursor=page.nextCursor;more=page.hasMore;}
  assert.deepEqual(offsets,[0,30,60]);assert.equal(new Set(loaded.map(item=>item.id)).size,80);
  assert.equal(db.prepare('SELECT complete FROM conversation_sync_state WHERE page_id=? AND conversation_id=?').get('page-test','conversation-0').complete,1);
 }finally{globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(directory,{recursive:true,force:true});}
});
