import { createApp } from './app.js';
import { config } from './config.js';
import { seedDatabaseIfEmpty } from './db/seed.js';

// Initialize SQLite database and seed knowledge & demo conversations
seedDatabaseIfEmpty();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Pancake demo backend listening on http://localhost:${config.port}`);
  console.log(`Database connected (SQLite WAL) with active knowledge base and seed conversations`);
});
