import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import type { Server } from 'http';

const PORT = Number(process.env.PORT || 3000);

const app = express();

app.use(cors());

app.use(express.json());
/* app.use('/api/people'); */

app.get('/health', (_req, res) => res.json({ ok: true }));

let server: Server | null = null;

let shuttingDown = false;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function flushStdout(): Promise<void> {
  return new Promise<void>((resolve) => {
    process.stdout.write('', () => resolve());
  });
}

(async () => {
  try {
    await connectDatabase();
    server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to start server: ', msg);
    process.exit(1);
  }
})();

async function closeServer(httpServer: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.close((err?: Error) => (err ? reject(err) : resolve()));
  });
}

const gracefulShutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\nReceived ${signal}, shutting down...`);
  try {
    if (server) {
      await closeServer(server);
      console.log('HTTP server closed.');
    }

    await disconnectDatabase();
    console.log('Graceful shutdown complete.');

    process.exitCode = 0;
    await flushStdout();
    await wait(50);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error during DB disconnect: ', msg);
    process.exitCode = 1;
    await flushStdout();
    await wait(50);
  }
};

//Signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

//process-level guards
process.on('exit', (code) => {
  console.log(`Process exiting with code ${code}`);
});

process.on('uncaughtException', (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('Uncaught Exception: ', msg);
  void gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at: ', promise, 'reason: ', reason);
  void gracefulShutdown('unhandledRejection');
});
