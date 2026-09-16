const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const config = require('../config');
const { createJob, getJobDetails } = require('../jobs/queue');
const { verifyJobToken } = require('../utils/crypto');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function parseRequestBody(req, maxBytes = config.MAX_REQUEST_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytesReceived = 0;
    let rejected = false;

    req.on('data', chunk => {
      if (rejected) return;
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        rejected = true;
        const err = new Error(`Kích thước yêu cầu vượt quá giới hạn cho phép (${maxBytes} bytes).`);
        err.status = 413;
        reject(err);
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      if (rejected) return;
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        const jsonErr = new Error(`Định dạng JSON không hợp lệ: ${err.message}`);
        jsonErr.status = 400;
        reject(jsonErr);
      }
    });

    req.on('error', (err) => {
      if (!rejected) reject(err);
    });
  });
}

function sendJSON(res, statusCode, data, headers = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    ...headers
  });
  res.end(payload);
}

function serveStatic(res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Path traversal protection
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    filePath = path.join(resolved, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self';"
  });

  fs.createReadStream(filePath).pipe(res);
}

function createHttpServer(db) {
  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = reqUrl.pathname;
    const method = req.method;

    // 1. CORS Preflight & Headers
    const origin = req.headers.origin;
    const isAllowedOrigin = !origin || config.ALLOWED_ORIGINS.length === 0 || config.ALLOWED_ORIGINS.includes(origin);

    const corsHeaders = {};
    if (isAllowedOrigin && origin) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
      corsHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Idempotency-Key, X-Job-Token';
    }

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400'
      });
      return res.end();
    }

    // Set CORS on response
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.setHeader(k, v);
    }

    try {
      // 2. Reject retired demo endpoints with 410 Gone
      if (pathname.startsWith('/api/documents') || pathname.startsWith('/api/history') || pathname.startsWith('/api/samples') || pathname === '/api/generate') {
        return sendJSON(res, 410, {
          error: {
            code: 'ENDPOINT_RETIRED',
            message: 'Endpoint demo cũ đã được thay thế hoàn toàn bởi chuẩn API v1 (/api/v1/generate, /api/v1/jobs/:id).'
          }
        });
      }

      // 3. Health Check Endpoints
      if (pathname === '/api/v1/health/live' && method === 'GET') {
        return sendJSON(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        });
      }

      if (pathname === '/api/v1/health/ready' && method === 'GET') {
        try {
          // Check DB queryable
          const state = db.prepare('SELECT active_version_id, revision FROM knowledge_state WHERE id = 1').get();
          if (!state || !state.active_version_id) {
            return sendJSON(res, 503, {
              status: 'not_ready',
              error: 'Chưa có phiên bản tri thức active trong cơ sở dữ liệu.'
            });
          }

          return sendJSON(res, 200, {
            status: 'ready',
            active_version_id: state.active_version_id,
            revision: state.revision,
            provider: config.PROVIDER
          });
        } catch (dbErr) {
          return sendJSON(res, 503, {
            status: 'not_ready',
            error: `Lỗi kết nối cơ sở dữ liệu SQLite: ${dbErr.message}`
          });
        }
      }

      // 4. POST /api/v1/generate
      if (pathname === '/api/v1/generate' && method === 'POST') {
        const idempotencyKey = req.headers['idempotency-key'] || null;
        const jobToken = req.headers['x-job-token'] || null;

        if (!jobToken) {
          return sendJSON(res, 400, {
            error: {
              code: 'MISSING_JOB_TOKEN',
              message: 'Yêu cầu header X-Job-Token được tạo từ client để bảo vệ kết quả.'
            }
          });
        }

        const body = await parseRequestBody(req);
        const { message, context, model } = body;

        const jobResult = createJob(db, {
          message,
          context,
          idempotencyKey,
          jobToken,
          model
        });

        const status = jobResult.idempotent ? 200 : 202;
        return sendJSON(res, status, {
          job_id: jobResult.job_id,
          state: jobResult.state,
          idempotent: jobResult.idempotent
        });
      }

      // 5. GET /api/v1/jobs/:id
      const jobMatch = pathname.match(/^\/api\/v1\/jobs\/([a-zA-Z0-9_-]+)$/);
      if (jobMatch && method === 'GET') {
        const jobId = jobMatch[1];
        const jobToken = req.headers['x-job-token'];

        if (!jobToken) {
          return sendJSON(res, 403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Yêu cầu header X-Job-Token để đọc thông tin công việc.'
            }
          });
        }

        const details = getJobDetails(db, jobId, jobToken);
        return sendJSON(res, 200, details);
      }

      // 6. POST /api/v1/jobs/:id/feedback
      const feedbackMatch = pathname.match(/^\/api\/v1\/jobs\/([a-zA-Z0-9_-]+)\/feedback$/);
      if (feedbackMatch && method === 'POST') {
        const jobId = feedbackMatch[1];
        const jobToken = req.headers['x-job-token'];

        if (!jobToken) {
          return sendJSON(res, 403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Yêu cầu header X-Job-Token để lưu phản hồi.'
            }
          });
        }

        const job = db.prepare('SELECT result_id, access_token_hash FROM jobs WHERE id = ?').get(jobId);
        if (!job) {
          return sendJSON(res, 404, {
            error: { code: 'NOT_FOUND', message: 'Không tìm thấy job.' }
          });
        }

        if (!verifyJobToken(jobToken, job.access_token_hash)) {
          return sendJSON(res, 403, {
            error: { code: 'FORBIDDEN', message: 'Mã truy cập X-Job-Token không chính xác.' }
          });
        }

        if (!job.result_id) {
          return sendJSON(res, 400, {
            error: { code: 'JOB_NOT_READY', message: 'Công việc chưa hoàn thành, chưa có kết quả để gửi phản hồi.' }
          });
        }

        const body = await parseRequestBody(req);
        const { selected_reply, edited_reply } = body;

        // Anti-duplicate check
        const existing = db.prepare('SELECT id FROM feedback WHERE generation_id = ?').get(job.result_id);
        if (existing) {
          return sendJSON(res, 200, {
            success: true,
            message: 'Phản hồi cho kết quả này đã được ghi nhận trước đó.',
            feedback_id: existing.id
          });
        }

        const feedbackId = 'fb_' + crypto.randomBytes(16).toString('hex');
        db.prepare(`
          INSERT INTO feedback (id, generation_id, selected_reply, edited_reply, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(feedbackId, job.result_id, selected_reply || '', edited_reply || '');

        return sendJSON(res, 201, {
          success: true,
          message: 'Đã lưu phản hồi thành công.',
          feedback_id: feedbackId
        });
      }

      // 7. Static Web Serving
      if (method === 'GET') {
        return serveStatic(res, pathname);
      }

      // 8. 404 Fallback
      return sendJSON(res, 404, {
        error: { code: 'NOT_FOUND', message: `Đường dẫn không tồn tại: ${pathname}` }
      });
    } catch (err) {
      const statusCode = err.status || 500;
      if (statusCode >= 500) {
        console.error('[API Error]:', err);
      }
      return sendJSON(res, statusCode, {
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message || 'Lỗi xử lý máy chủ.'
        }
      });
    }
  });
}

module.exports = {
  createHttpServer
};
