type HeaderProps = {
  onOpenAiSettings?: () => void;
  aiOverrideActive?: boolean;
  aiProviderLabel?: string;
};

export function Header({ onOpenAiSettings, aiOverrideActive, aiProviderLabel }: HeaderProps = {}) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="header-titles">
          <div className="header-title">Thầy Minh Piano</div>
          <div className="header-status">
            <span className="status-dot" />
            Online
          </div>
        </div>
      </div>
      <button
        type="button"
        className={`ai-badge ${aiOverrideActive ? 'ai-badge-override' : ''}`}
        onClick={onOpenAiSettings}
        title={aiOverrideActive ? `Cấu hình AI riêng: ${aiProviderLabel} (Bấm để cài đặt)` : 'Bấm để cấu hình AI / Custom Provider'}
        style={{ cursor: 'pointer', border: 'none' }}
      >
        {aiOverrideActive ? `⚙️ AI: ${aiProviderLabel}` : '⚙️ AI COPILOT'}
      </button>
    </header>
  );
}
