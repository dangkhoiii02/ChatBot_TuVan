import type { TabId } from '../types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'suggestions', label: 'Gợi ý' },
  { id: 'student', label: 'Học viên' },
  { id: 'grading', label: 'Chấm bài' },
];

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tab-bar" role="tablist" aria-label="Tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`tab ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
