export function Header() {
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
      <span className="ai-badge">AI COPILOT</span>
    </header>
  );
}
