import 'dotenv/config';
import { initDb, closeDb } from './db/index';
import { syncExchangeRates } from './services/currency';
import { createServer } from './server';

// Check for master password configuration
if (!process.env.AUTH_PASSWORD && !process.env.APP_PASSWORD) {
  console.warn(
    '[SECURITY WARNING] Neither AUTH_PASSWORD nor APP_PASSWORD is configured in environment. Authentication may reject all attempts.'
  );
}

// Initialize SQLite database
const db = initDb();

// Create configured Express app
const app = createServer(db);

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = app.listen(PORT, () => {
  console.log(`[SERVER] Debt Management server running on http://localhost:${PORT}`);
});

// Non-blocking initial exchange rates sync
syncExchangeRates(db).catch((err) => {
  console.error('[CURRENCY] Initial background exchange rates sync failed:', err);
});

// Graceful shutdown handling
function shutdown(signal: string): void {
  console.log(`[SERVER] Received ${signal}, closing server gracefully...`);

  server.close(() => {
    console.log('[SERVER] HTTP server closed.');
    try {
      closeDb();
      console.log('[DATABASE] SQLite database connection closed.');
    } catch (err) {
      console.error('[DATABASE] Error while closing SQLite database:', err);
    }
    process.exit(0);
  });

  // Force close after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('[SERVER] Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { server, app };
