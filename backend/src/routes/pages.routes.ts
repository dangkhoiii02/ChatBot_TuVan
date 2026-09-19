import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const pagesRouter = Router();

/**
 * Multi-page list via user access_token removed.
 * Single-page mode: return the configured PANCAKE_PAGE_ID only.
 */
pagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pageId = req.staffAuth?.pageId?.trim();
    if (!pageId) throw new HttpError(401, 'Phiên đăng nhập không có page Pancake.', 'PAGE_ACCESS_DENIED');

    res.json({
      items: [
        {
          id: pageId,
          name: pageId,
          platform: 'facebook',
          source: 'pancake'
        }
      ],
      defaultSelectedPageIds: [pageId],
      mode: 'single_page'
    });
  })
);
