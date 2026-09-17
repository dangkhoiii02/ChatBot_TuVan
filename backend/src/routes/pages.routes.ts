import { Router } from 'express';
import { config } from '../config.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const pagesRouter = Router();

/**
 * Multi-page list via user access_token removed.
 * Single-page mode: return the configured PANCAKE_PAGE_ID only.
 */
pagesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const pageId = config.pancake.pageId.trim() || 'demo-page';
    const pageName = pageId === 'demo-page' ? 'Lớp Nhạc Thầy Minh (Demo)' : pageId;

    res.json({
      items: [
        {
          id: pageId,
          name: pageName,
          platform: 'facebook',
          source: 'pancake'
        }
      ],
      defaultSelectedPageIds: [pageId],
      mode: 'single_page'
    });
  })
);
