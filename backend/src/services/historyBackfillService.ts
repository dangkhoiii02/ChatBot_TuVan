import { getDatabase } from '../db/index.js';
import { hasPancakePageAccess, pancakeClient } from './pancakeClient.js';
import { normalizeMessage } from './pancakeNormalizer.js';
import { getConversationForPage, rememberMessages } from './studentIdentityService.js';

const MAX_ATTEMPTS=5;
const now=()=>new Date().toISOString();
let workerRunning=false;

export function enqueueHistoryBackfill(pageId:string,conversationId:string,priority=0) {
  const timestamp=now();
  getDatabase().prepare(`INSERT INTO conversation_backfill_jobs(page_id,conversation_id,status,priority,attempts,next_run_at,last_error,created_at,updated_at)
    VALUES (?,?,'queued',?,0,?,NULL,?,?) ON CONFLICT(page_id,conversation_id) DO UPDATE SET
      status=CASE WHEN conversation_backfill_jobs.status='complete' THEN 'complete' ELSE 'queued' END,
      priority=MAX(conversation_backfill_jobs.priority,excluded.priority),attempts=CASE WHEN conversation_backfill_jobs.status='complete' THEN conversation_backfill_jobs.attempts ELSE 0 END,
      next_run_at=CASE WHEN conversation_backfill_jobs.status='complete' THEN conversation_backfill_jobs.next_run_at ELSE excluded.next_run_at END,
      last_error=CASE WHEN conversation_backfill_jobs.status='complete' THEN conversation_backfill_jobs.last_error ELSE NULL END,updated_at=excluded.updated_at`)
    .run(pageId,conversationId,priority,timestamp,timestamp,timestamp);
  return {pageId,conversationId,status:'queued'};
}

export async function processHistoryBackfillPage(input:{pageId:string;conversationId:string;fetchPage?:(before?:string)=>Promise<unknown>}) {
  const db=getDatabase();
  const state=db.prepare(`SELECT oldest_cursor AS cursor,complete FROM conversation_sync_state WHERE page_id=? AND conversation_id=?`)
    .get(input.pageId,input.conversationId) as {cursor:string|null;complete:number}|undefined;
  if(state?.complete===1) {
    db.prepare(`UPDATE conversation_backfill_jobs SET status='complete',last_error=NULL,updated_at=? WHERE page_id=? AND conversation_id=?`)
      .run(now(),input.pageId,input.conversationId);
    return {status:'complete',synced:0};
  }
  try {
    const raw=await (input.fetchPage||((before)=>pancakeClient.listMessages({pageId:input.pageId,conversationId:input.conversationId,limit:50,before:before||undefined})))(state?.cursor||undefined);
    const items=extractItems(raw).filter(hasMessageId).map((item)=>normalizeMessage(item,input.conversationId))
      .filter((item)=>item.id&&Number.isFinite(Date.parse(item.createdAt)))
      .sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
    const pagination=assessHistoryPagination(raw);
    const complete=pagination.complete;
    const nextCursor=pagination.nextCursor;
    const advanced=Boolean(nextCursor)&&nextCursor!==state?.cursor;
    if(!complete&&(pagination.invalid||!items.length||!nextCursor||!advanced)) {
      const reason=pagination.reason||(!items.length?'Pancake returned an empty page without a terminal pagination marker.':
        'Pancake pagination cursor is missing or did not advance.');
      rememberMessages(input.pageId,input.conversationId,items,{before:state?.cursor||undefined,error:reason,preserveCursor:true,historyProgress:true});
      db.prepare(`UPDATE conversation_sync_state SET complete=0,error=? WHERE page_id=? AND conversation_id=?`).run(reason,input.pageId,input.conversationId);
      db.prepare(`UPDATE conversation_backfill_jobs SET status='blocked',last_error=?,updated_at=? WHERE page_id=? AND conversation_id=?`)
        .run(reason,now(),input.pageId,input.conversationId);
      return {status:'blocked',synced:items.length,error:reason};
    }
    rememberMessages(input.pageId,input.conversationId,items,{before:state?.cursor||undefined,nextCursor,complete,historyProgress:true});
    const timestamp=now();
    db.prepare(`UPDATE conversation_backfill_jobs SET status=?,last_error=NULL,next_run_at=?,updated_at=? WHERE page_id=? AND conversation_id=?`)
      .run(complete?'complete':'queued',new Date(Date.now()+1000).toISOString(),timestamp,input.pageId,input.conversationId);
    return {status:complete?'complete':'queued',synced:items.length,nextCursor};
  } catch(error) {
    const attemptsRow=db.prepare(`SELECT attempts FROM conversation_backfill_jobs WHERE page_id=? AND conversation_id=?`)
      .get(input.pageId,input.conversationId) as {attempts:number}|undefined;
    const attempts=Number(attemptsRow?.attempts||0)+1;
    const message=error instanceof Error?error.message:'Backfill page request failed.';
    const status=attempts>=MAX_ATTEMPTS?'blocked':'queued';
    const delay=Math.min(60_000,1000*2**attempts);
    const timestamp=now();
    db.prepare(`INSERT INTO conversation_sync_state(page_id,conversation_id,last_synced_at,error) VALUES (?,?,?,?)
      ON CONFLICT(page_id,conversation_id) DO UPDATE SET last_synced_at=excluded.last_synced_at,error=excluded.error,complete=0`)
      .run(input.pageId,input.conversationId,timestamp,message);
    db.prepare(`UPDATE conversation_backfill_jobs SET status=?,attempts=?,last_error=?,next_run_at=?,updated_at=? WHERE page_id=? AND conversation_id=?`)
      .run(status,attempts,message,new Date(Date.now()+delay).toISOString(),timestamp,input.pageId,input.conversationId);
    return {status,synced:0,error:message,attempts};
  }
}

export async function runHistoryBackfillBatch() {
  if(workerRunning) return {status:'busy'};
  workerRunning=true;
  try {
    const db=getDatabase();
    const staleBefore=new Date(Date.now()-120_000).toISOString();
    db.prepare(`UPDATE conversation_backfill_jobs SET status='queued',next_run_at=?,last_error='Recovered stale worker claim',updated_at=?
      WHERE status='running' AND updated_at<?`).run(now(),now(),staleBefore);
    const job=db.prepare(`SELECT page_id AS pageId,conversation_id AS conversationId FROM conversation_backfill_jobs
      WHERE status='queued' AND next_run_at<=? ORDER BY priority DESC,created_at LIMIT 1`).get(now()) as
      {pageId:string;conversationId:string}|undefined;
    if(!job) return {status:'idle'};
    if(!hasPancakePageAccess(job.pageId)) {
      db.prepare(`UPDATE conversation_backfill_jobs SET status='blocked',last_error='Pancake page access unavailable',updated_at=? WHERE page_id=? AND conversation_id=?`)
        .run(now(),job.pageId,job.conversationId);
      return {status:'blocked',error:'Pancake page access unavailable'};
    }
    try { getConversationForPage(job.pageId,job.conversationId); }
    catch { db.prepare(`UPDATE conversation_backfill_jobs SET status='blocked',last_error='Conversation is unavailable on this page',updated_at=? WHERE page_id=? AND conversation_id=?`)
      .run(now(),job.pageId,job.conversationId); return {status:'blocked',error:'Conversation unavailable'}; }
    const claim=db.prepare(`UPDATE conversation_backfill_jobs SET status='running',updated_at=?
      WHERE page_id=? AND conversation_id=? AND status='queued'`).run(now(),job.pageId,job.conversationId);
    if(Number(claim.changes)!==1) return {status:'busy'};
    return await processHistoryBackfillPage(job);
  } finally { workerRunning=false; }
}

export function startHistoryBackfillWorker(intervalMs=5000) {
  const timer=setInterval(()=>{ void runHistoryBackfillBatch().catch((error)=>console.error('History backfill worker failed:',error)); },intervalMs);
  timer.unref();
  return timer;
}

function extractItems(raw:unknown):unknown[] {
  if(Array.isArray(raw)) return raw;
  if(!raw||typeof raw!=='object') return [];
  const record=raw as Record<string,unknown>;
  for(const key of ['messages','data','items']) if(Array.isArray(record[key])) return record[key] as unknown[];
  return [];
}

function hasMessageId(value:unknown) {
  if(!value||typeof value!=='object') return false;
  const record=value as Record<string,unknown>;
  return (typeof record.id==='string'&&record.id.trim().length>0)||(typeof record.message_id==='string'&&record.message_id.trim().length>0);
}

export function assessHistoryPagination(raw:unknown):{complete:boolean;nextCursor?:string;invalid:boolean;reason?:string} {
  if(!raw||typeof raw!=='object') return {complete:false,invalid:true,reason:'Pancake pagination metadata is missing.'};
  const record=raw as Record<string,unknown>;
  const nested=record.pagination&&typeof record.pagination==='object'?record.pagination as Record<string,unknown>:{};
  const records=[record,nested];
  const flags=records.flatMap((item)=>['has_more','hasMore'].filter((key)=>Object.hasOwn(item,key)).map((key)=>item[key]));
  const cursors=records.flatMap((item)=>['next_before','nextBefore','before_cursor']
    .filter((key)=>Object.hasOwn(item,key)).map((key)=>item[key]));
  const invalid= (reason:string)=>({complete:false,invalid:true,reason});
  if(flags.some((flag)=>typeof flag!=='boolean')||new Set(flags).size>1)
    return invalid('Pancake returned contradictory history availability flags.');
  if(cursors.some((cursor)=>cursor!==null&&(typeof cursor!=='string'||!cursor.trim())))
    return invalid('Pancake returned an invalid pagination cursor.');
  const nextCursors=[...new Set(cursors.filter((cursor):cursor is string=>typeof cursor==='string').map((cursor)=>cursor.trim()))];
  if(nextCursors.length>1||(cursors.includes(null)&&nextCursors.length>0))
    return invalid('Pancake returned contradictory pagination cursors.');
  const nextCursor=nextCursors[0];
  if(flags[0]===false) {
    if(nextCursor) return invalid('Pancake reported complete history but provided another cursor.');
    return {complete:true,invalid:false};
  }
  if(!nextCursor) return invalid(flags[0]===true?
    'Pancake reported more history without a usable cursor.':'Pancake did not confirm that history is complete.');
  return {complete:false,nextCursor,invalid:false};
}
