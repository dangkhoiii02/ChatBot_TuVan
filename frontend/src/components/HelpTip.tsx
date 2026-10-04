import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LearningDialog } from './LearningDialog';

export function HelpTip({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="help-tip-button" aria-label={`Hướng dẫn: ${title}`} aria-haspopup="dialog"
      onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}>?</button>
    {open && createPortal(<LearningDialog title={title} onClose={() => setOpen(false)}>
      <div className="help-tip-content">{children}</div>
      <button type="button" className="btn-primary-small" onClick={() => setOpen(false)}>Đã hiểu</button>
    </LearningDialog>, document.body)}
  </>;
}
