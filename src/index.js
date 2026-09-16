const config = require('./config');
const { getDb, closeDb } = require('./db');
const { runMigrations } = require('./db/migrate');
const { JobWorker } = require('./jobs/worker');
const { createHttpServer } = require('./api/server');

async function startServer() {
  console.log('====================================================');
  console.log('  Khởi động Bot Trợ Lý Thầy Minh Piano');
  console.log(`  Môi trường: ${config.NODE_ENV} | Provider: ${config.PROVIDER}`);
  console.log('====================================================');

  const db = getDb();

  // 1. Run migrations
  try {
    const applied = runMigrations(db);
    if (applied.length > 0) {
      console.log(`[Database] Đã áp dụng ${applied.length} bản migration.`);
    } else {
      console.log('[Database] Cơ sở dữ liệu đã ở phiên bản mới nhất.');
    }
  } catch (err) {
    console.error('[Database Lỗi Migration]:', err.message);
    process.exit(1);
  }

  // 2. Start Job Worker
  const worker = new JobWorker(db, {
    concurrencyLimit: config.CONCURRENCY_LIMIT
  });
  worker.start();
  console.log(`[Worker] Tiến trình nền đã chạy (Đồng thời tối đa: ${config.CONCURRENCY_LIMIT}).`);

  // 3. Start HTTP Server
  const server = createHttpServer(db);

  server.listen(config.PORT, config.HOST, () => {
    console.log(`[Server] Đang lắng nghe tại: http://${config.HOST}:${config.PORT}`);
    console.log(`[Server] Sẵn sàng phục vụ API v1 và Giao diện Web.`);
    console.log('====================================================');
  });

  // 4. Graceful Shutdown
  let isShuttingDown = false;
  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Hệ thống] Nhận tín hiệu ${signal}. Bắt đầu dừng an toàn...`);

    // Stop accepting new HTTP requests
    server.close(() => {
      console.log('[Server] Đã đóng cổng HTTP.');
    });

    // Wait for worker jobs
    try {
      await worker.stop(5000);
    } catch (e) {
      console.error('[Worker] Lỗi khi dừng worker:', e.message);
    }

    // Close SQLite
    try {
      closeDb();
      console.log('[Database] Đã đóng kết nối SQLite an toàn.');
    } catch (e) {}

    console.log('[Hệ thống] Tắt hoàn tất. Tạm biệt!');
    process.exit(0);
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  return { server, worker, db };
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('[Khởi động thất bại]:', err);
    process.exit(1);
  });
}

module.exports = {
  startServer
};
