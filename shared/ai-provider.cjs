const endpoints = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
};

function resolveAI(input = {}, env = process.env) {
  const userConfigured = ['apiKey', 'model', 'baseUrl'].some(k => input[k]?.trim()) || Boolean(input.provider && input.provider !== 'auto');
  let provider = ((userConfigured ? input.provider : env.AI_PROVIDER) || 'auto').trim().toLowerCase();
  if (provider === 'claude') provider = 'anthropic';
  let apiKey = ((userConfigured ? input.apiKey : env.AI_API_KEY) || '').trim();
  let model = ((userConfigured ? input.model : env.AI_MODEL) || '').trim();
  const baseUrl = ((userConfigured ? input.baseUrl : env.AI_BASE_URL) || '').trim();
  if (!userConfigured && !apiKey) {
    if (provider === 'gemini' || (provider === 'auto' && env.GEMINI_API_KEY)) {
      apiKey = env.GEMINI_API_KEY || ''; model ||= env.GEMINI_MODEL || '';
      provider = 'gemini';
    } else if (provider === 'anthropic') apiKey = env.ANTHROPIC_API_KEY || '';
    else if (provider === 'openai') apiKey = env.OPENAI_API_KEY || '';
  }
  if (provider === 'mock' || apiKey === 'demo') return { provider: 'mock', apiKey: '', model, baseUrl: '' };
  if (provider === 'auto') {
    // Unique key prefixes take precedence over model names. Never probe providers with a secret.
    if (baseUrl) provider = 'custom';
    else if (apiKey.startsWith('sk-ant-')) provider = 'anthropic';
    else if (apiKey.startsWith('AIza')) provider = 'gemini';
    else if (apiKey.startsWith('gsk_')) provider = 'groq';
    else if (apiKey.startsWith('sk-or-')) provider = 'openrouter';
    else if (apiKey.startsWith('xai-')) provider = 'xai';
    else if (/^gemini-/i.test(model)) provider = 'gemini';
    else if (/^claude-/i.test(model)) provider = 'anthropic';
    else if (/^(gpt-|chatgpt-|o[134](?:-|$))/i.test(model)) provider = 'openai';
    else if (/^deepseek-/i.test(model)) provider = 'deepseek';
    else if (/^grok-/i.test(model)) provider = 'xai';
    else if (!apiKey && !model) provider = 'mock';
    else throw new Error('Không xác định được nhà cung cấp. Hãy chọn nhà cung cấp hoặc nhập Base URL.');
  }
  if (!['mock', 'gemini', 'anthropic', 'custom', ...Object.keys(endpoints)].includes(provider)) throw new Error('Nhà cung cấp AI không được hỗ trợ.');
  if (provider !== 'mock' && !model) throw new Error('Vui lòng nhập mã model được cấp quyền cho API key.');
  if (provider !== 'mock' && !apiKey) throw new Error('Vui lòng nhập API key của nhà cung cấp đã chọn.');
  if (baseUrl && provider !== 'custom') throw new Error('Base URL chỉ dùng với nhà cung cấp custom.');
  if (provider === 'custom') {
    let url;
    try { url = new URL(baseUrl); } catch { throw new Error('Base URL không hợp lệ.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Base URL phải là HTTPS, không chứa tài khoản, query hoặc fragment.');
    // Custom destinations require deployment-owner authorization, preventing SSRF and key forwarding.
    const allowed = (env.AI_ALLOWED_BASE_URLS || '').split(',').map(v => v.trim().replace(/\/+$/, '')).filter(Boolean);
    if (!allowed.includes(baseUrl.replace(/\/+$/, ''))) throw new Error('Base URL chưa được quản trị viên cho phép trong AI_ALLOWED_BASE_URLS.');
  }
  return { provider, apiKey, model, baseUrl: baseUrl.replace(/\/+$/, '') };
}

async function requestAI(settings, system, prompt) {
  const { provider, apiKey, model } = settings;
  const headers = { 'Content-Type': 'application/json' };
  const instruction = system + '\nTrả JSON object gồm intent, sensitivity (xanh/vang/do), flag_reason, analysis và replies (mảng {tone, content}). Không dùng markdown.';
  let url, body;
  if (provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers['x-goog-api-key'] = apiKey;
    body = { systemInstruction: { parts: [{ text: instruction }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } };
  } else if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = { model, max_tokens: 4096, system: instruction, messages: [{ role: 'user', content: prompt }] };
  } else {
    url = `${settings.baseUrl || endpoints[provider]}/chat/completions`;
    headers.Authorization = `Bearer ${apiKey}`;
    body = { model, messages: [{ role: 'system', content: instruction }, { role: 'user', content: prompt }] };
  }
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(45000) });
  } catch { throw new Error(`${provider}: không kết nối được hoặc quá thời gian chờ.`); }
  // Do not forward upstream bodies: some gateways echo credentials or request context.
  if (!response.ok) throw new Error(`${provider}: API lỗi HTTP ${response.status}. Kiểm tra key, quyền model và hạn mức.`);
  const data = await response.json();
  const raw = provider === 'gemini' ? data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('')
    : provider === 'anthropic' ? data.content?.filter(p => p.type === 'text').map(p => p.text).join('')
    : data.choices?.[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`${provider}: phản hồi trống hoặc model không hỗ trợ chat văn bản.`);
  let parsed;
  try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error(`${provider}: phản hồi không phải JSON hợp lệ.`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.replies) || !parsed.replies.length) throw new Error(`${provider}: thiếu danh sách gợi ý hợp lệ.`);
  return parsed;
}
module.exports = { resolveAI, requestAI };
