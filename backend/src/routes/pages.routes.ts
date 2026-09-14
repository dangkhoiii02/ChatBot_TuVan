import { Router } from 'express';
import { config } from '../config.js';
import { pancakeClient } from '../services/pancakeClient.js';
import { normalizePage } from '../services/pancakeNormalizer.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const pagesRouter = Router();

pagesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const raw = await pancakeClient.listPages();
    const items = extractItems(raw).map(normalizePage).filter((page) => page.id !== 'unknown-page');
    const configuredPageId = config.pancake.pageId;
    const defaultSelectedPageIds = configuredPageId && items.some((page) => page.id === configuredPageId)
      ? [configuredPageId]
      : items.slice(0, 1).map((page) => page.id);

    res.json({
      items,
      defaultSelectedPageIds
    });
  })
);

function extractItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const categorized = record.categorized as Record<string, unknown> | undefined;
    if (categorized && Array.isArray(categorized.activated)) {
      return categorized.activated;
    }

    const candidates = [record.pages, record.data, record.items];
    const matched = candidates.find(Array.isArray);
    if (matched) return matched;
  }

  return [];
}
