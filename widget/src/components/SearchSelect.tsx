import { Children, isValidElement, useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes, type ChangeEvent, type CSSProperties } from 'react';

type Props = SelectHTMLAttributes<HTMLSelectElement> & { onCreate?: (name: string) => void; createLabel?: string };
type Option = { value: string; label: string; disabled?: boolean };
const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<{children?: ReactNode}>(child) ? text(child.props.children) : String(child ?? '')).join('');
const collect = (node: ReactNode): Option[] => Children.toArray(node).flatMap(child => {
  if (!isValidElement<{value?: string; children?: ReactNode; disabled?: boolean}>(child)) return [];
  return child.type === 'option' ? [{value: String(child.props.value ?? ''), label: text(child.props.children), disabled: child.props.disabled}] : collect(child.props.children);
});
const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();

export function SearchSelect({ children, value, onChange, onCreate, createLabel = 'Thêm mới', disabled, required, id, className, autoFocus, ...props }: Props) {
  const options = collect(children);
  const selected = options.find(option => option.value === String(value ?? ''));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [wrappingLabel, setWrappingLabel] = useState<string>();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const filtered = options.filter(option => !option.disabled && normalize(option.label).includes(normalize(query)));
  const canCreate = Boolean(onCreate && query.trim() && query.trim().length <= 200 && !options.some(option => normalize(option.label.split(' · ')[0].replace(/^(Bài mới|Học viên mới):\s*/, '')) === normalize(query)));
  const count = filtered.length + Number(canCreate);
  useLayoutEffect(() => {
    const label = root.current?.closest('label');
    if (label) setWrappingLabel(Array.from(label.childNodes).filter(node => node !== root.current).map(node => node.textContent || '').join('').trim());
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upward = below < 180 && above > below;
      setMenuStyle({ position: 'fixed', left: rect.left, width: rect.width, right: 'auto',
        top: upward ? 'auto' : rect.bottom + 5, bottom: upward ? window.innerHeight - rect.top + 5 : 'auto',
        maxHeight: Math.max(80, Math.min(240, upward ? above : below)) });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => { setOpen(false); setQuery(''); }, [value, disabled]);
  useEffect(() => { root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block: 'nearest'}); }, [active, query]);
  const choose = (index: number) => {
    if (index === filtered.length && canCreate) onCreate?.(query.trim());
    else if (filtered[index]) onChange?.({target: {value: filtered[index].value}} as ChangeEvent<HTMLSelectElement>);
    setOpen(false); setQuery(''); input.current?.focus();
  };
  return <div className={`search-select ${className || ''}`} ref={root}>
    <div className="search-select-control">
      <input ref={input} id={id} autoFocus={autoFocus} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && count ? `${listId}-${active}` : undefined} aria-label={props['aria-label'] || wrappingLabel} aria-labelledby={props['aria-labelledby']}
        aria-required={required} disabled={disabled} autoComplete="off" value={open ? query : selected?.label || ''}
        placeholder={selected?.label || 'Tìm và chọn…'}
        onFocus={() => { setOpen(true); setQuery(''); setActive(0); }}
        onClick={() => { if (!open) { setOpen(true); setQuery(''); setActive(0); } }}
        onBlur={event => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(current => !open ? 0 : count ? (current + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0); }
          if (event.key === 'Enter' && open) { event.preventDefault(); choose(active); }
          if (event.key === 'Tab') setOpen(false);
        }} />
      <span aria-hidden="true">⌄</span>
    </div>
    {open && !disabled && <div className="search-select-menu" style={menuStyle} id={listId} role="listbox">
      {filtered.map((option, index) => <div key={option.value} role="option" id={`${listId}-${index}`} aria-selected={active === index}
        className={`search-select-option ${option.value === String(value ?? '') ? 'is-current' : ''}`}
        onPointerDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={event => { event.preventDefault(); choose(index); }}>{option.label}<span aria-hidden="true">{option.value === String(value ?? '') ? '✓' : ''}</span></div>)}
      {canCreate && <div role="option" id={`${listId}-${filtered.length}`} aria-selected={active === filtered.length} className="search-select-option search-select-create"
        onPointerDown={event => event.preventDefault()} onMouseEnter={() => setActive(filtered.length)} onClick={event => { event.preventDefault(); choose(filtered.length); }}>＋ {createLabel}: “{query.trim()}”</div>}
      {!count && <div className="search-select-empty">Không tìm thấy kết quả.</div>}
    </div>}
  </div>;
}
