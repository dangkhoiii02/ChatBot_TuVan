import { createApp } from './app.js';
import { config } from './config.js';
import { startHistoryBackfillWorker } from './services/historyBackfillService.js';
import { startProposalExtractionWorker } from './services/studentProposalService.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Pancake backend listening on http://localhost:${config.port}`);
  startHistoryBackfillWorker();
  startProposalExtractionWorker();
});
