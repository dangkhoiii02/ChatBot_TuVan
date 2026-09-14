import React, { useMemo, useState } from 'react';
import type { PancakePage } from '../types';

export interface PageSelectorProps {
  pages: PancakePage[];
  selectedPageIds: string[];
  isLoading?: boolean;
  onChange: (pageIds: string[]) => void;
}

export const PageSelector: React.FC<PageSelectorProps> = ({
  pages,
  selectedPageIds,
  isLoading,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedPageIds), [selectedPageIds]);
  const selectedPages = pages.filter((page) => selectedSet.has(page.id));
  const label = getPageSelectorLabel(selectedPages, pages, isLoading);

  const handleTogglePage = (pageId: string) => {
    if (selectedSet.has(pageId)) {
      if (selectedPageIds.length <= 1) return;
      onChange(selectedPageIds.filter((id) => id !== pageId));
      return;
    }

    onChange([...selectedPageIds, pageId]);
  };

  const handleKeepOnePage = () => {
    const firstPageId = selectedPageIds[0] || pages[0]?.id;
    if (firstPageId) onChange([firstPageId]);
  };

  return (
    <div className="page-selector">
      <button
        type="button"
        className="page-selector-trigger"
        onClick={() => setIsOpen((current) => !current)}
        disabled={isLoading || pages.length === 0}
        title="Chọn một hoặc nhiều page Pancake"
      >
        <span className="page-selector-dot" />
        <span>{label}</span>
        <span className="page-selector-caret">▾</span>
      </button>

      {isOpen && (
        <div className="page-selector-menu">
          <div className="page-selector-menu-header">
            <span>Chọn page</span>
            <span>{selectedPageIds.length}/{pages.length}</span>
          </div>

          <div className="page-selector-actions">
            <button
              type="button"
              onClick={() => onChange(pages.map((page) => page.id))}
              disabled={selectedPageIds.length === pages.length}
            >
              Chọn tất cả
            </button>
            <button
              type="button"
              onClick={handleKeepOnePage}
              disabled={selectedPageIds.length <= 1}
            >
              Chỉ giữ 1
            </button>
          </div>

          <div className="page-selector-list">
            {pages.map((page) => (
              <label key={page.id} className="page-selector-option">
                <input
                  type="checkbox"
                  checked={selectedSet.has(page.id)}
                  onChange={() => handleTogglePage(page.id)}
                />
                <span className="page-selector-avatar">
                  {page.avatarUrl ? <img src={page.avatarUrl} alt="" /> : getInitials(page.name)}
                </span>
                <span className="page-selector-name">
                  {page.name}
                  {page.platform ? ` · ${page.platform}` : ''}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function getPageSelectorLabel(selectedPages: PancakePage[], pages: PancakePage[], isLoading?: boolean) {
  if (isLoading) return 'Đang tải page...';
  if (!pages.length) return 'Chưa có page';
  if (selectedPages.length === 1) return selectedPages[0].name;
  return `${selectedPages.length} page đã chọn`;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
