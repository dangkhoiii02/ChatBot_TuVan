// A deterministic AI transport for the isolated UI fixture runner. It exercises
// the normal suggestion/review transactions without real keys or AI requests.
if (process.env.NODE_ENV !== 'test' || !process.env.BACKEND_DATABASE_PATH) {
  throw new Error('Fixture AI requires NODE_ENV=test and an isolated SQLite path.');
}
globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url !== 'https://fixture-ai.invalid/v1/chat/completions') {
    throw new Error('External requests are disabled in the UI fixture server.');
  }
  const result = { intent: 'assignment_feedback', sensitivity: 'xanh', analysis: 'UI fixture response; no real AI was called.',
    replies: [
      { tone: 'Nhẹ nhàng', content: 'Em tập chậm lại theo nhận xét của thầy nhé.' },
      { tone: 'Rõ ràng', content: 'Em kiểm tra nhịp và tập chậm như thầy đã hướng dẫn nhé.' },
      { tone: 'Khích lệ', content: 'Em cứ tập từng bước theo hướng dẫn rồi gửi bài để thầy xem tiếp nhé.' }
    ], proposals: [] };
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
await import('../dist/server.js');
