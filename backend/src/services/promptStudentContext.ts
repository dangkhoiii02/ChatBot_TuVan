import type { CreateSuggestionsInput } from './suggestionService.js';

type StudentContext = CreateSuggestionsInput['studentContext'];

export function formatStudentContext(context:StudentContext,teacherReview:boolean) {
  if(!context) return {text:'',facts:[] as NonNullable<StudentContext>['facts']};
  const header=[`Học viên: ${context.studentName}; revision hồ sơ ${context.revision}.`,
    `Bao phủ lịch sử: ${context.historyCoverage.status}${context.historyCoverage.oldestMessageAt?`; từ ${context.historyCoverage.oldestMessageAt}`:''}.`]
    .join('\n');
  let text=header.slice(0,5000);
  const append=(line:string)=>{
    if(text.length+1+line.length>5000) return false;
    text+=`\n${line}`;
    return true;
  };
  const facts:NonNullable<StudentContext>['facts']=[];
  if(teacherReview) {
    for(const issue of context.issueReferences.slice(0,8)) {
      const line=`Lỗi trước đây: ${issue.title} (${issue.status}; lần gần nhất ${issue.lastOccurredAt||'chưa rõ'}). Cách sửa cũ: ${issue.latestPracticeAction||'chưa có hướng dẫn đã lưu'}.`;
      if(!append(line)) break;
    }
  } else {
    const orderedFacts=[...context.facts.filter((fact)=>fact.kind==='preference'),
      ...context.facts.filter((fact)=>fact.kind==='event'),
      ...context.facts.filter((fact)=>fact.kind==='learning_note')];
    for(const fact of orderedFacts.slice(0,12)) {
      const line=`[${fact.id}; ${fact.kind}; nguồn ${fact.sourceMessageId||'nhân viên nhập'}; mốc ${fact.occurredAt||'chưa rõ'}] ${fact.content}`;
      if(!append(line)) break;
      facts.push(fact);
    }
  }
  return {text,facts};
}
