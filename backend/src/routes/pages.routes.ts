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
    const pageId = config.pancake.pageId.trim();

    if (!pageId) {
      throw new HttpError(
        501,
        'Multi-page list removed. Set PANCAKE_PAGE_ID for single-page mode.',
        'SINGLE_PAGE_MODE'
      );
    }

    res.json({
      items: [
        {
          id: pageId,
          name: pageId
        }
      ],
      defaultSelectedPageIds: [pageId],
      mode: 'single_page'
    });
  })
);
