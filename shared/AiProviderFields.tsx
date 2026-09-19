export function AiProviderFields({ provider, baseUrl, onProvider, onBaseUrl, allowMock = false }: {
  provider: string; baseUrl: string; onProvider: (value: string) => void; onBaseUrl: (value: string) => void; allowMock?: boolean;
}) {
  return <>
    <label className="settings-field ai-field-row" style={{ display: 'grid', gap: 6 }}>
      <span>Nhà cung cấp AI</span>
      <select className="minimal-select ai-model-select" value={provider} onChange={e => onProvider(e.target.value)}>
        <option value="auto">Tự nhận diện từ key / model</option>
        <option value="openai">OpenAI</option><option value="gemini">Google Gemini</option>
        <option value="anthropic">Anthropic Claude</option><option value="deepseek">DeepSeek</option>
        <option value="groq">Groq</option><option value="openrouter">OpenRouter</option>
        <option value="mistral">Mistral</option><option value="xai">xAI</option>
        <option value="custom">Khác — API tương thích OpenAI</option>
        {allowMock && <option value="mock">Dữ liệu mẫu (không gọi AI)</option>}
      </select>
    </label>
    {provider === 'custom' && <label className="settings-field ai-field-row" style={{ display: 'grid', gap: 6 }}>
      <span>Base URL</span>
      <input className="minimal-input ai-key-input" type="url" value={baseUrl} onChange={e => onBaseUrl(e.target.value)} placeholder="https://your-provider.example/v1" />
      <small>Endpoint phải được quản trị viên thêm vào AI_ALLOWED_BASE_URLS.</small>
    </label>}
    <small>Key có thể dùng nhiều model. Nhập đúng mã model được tài khoản cấp quyền; chọn nhà cung cấp nếu không thể tự nhận diện.</small>
  </>;
}
