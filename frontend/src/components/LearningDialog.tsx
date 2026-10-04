import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = { title: string; description?: string; busy?: boolean; error?: string; onClose: () => void; children: ReactNode };

export function LearningDialog({ title, description, busy, error, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  return <dialog ref={dialog} className="learning-dialog" aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="learning-dialog-heading">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="learning-dialog-close" aria-label="Đóng biểu mẫu" disabled={busy} onClick={onClose}>×</button>
    </div>
    {description && <p className="learning-dialog-description" id={descriptionId}>{description}</p>}
    {error && <div className="learning-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</div>}
    {children}
  </dialog>;
}
