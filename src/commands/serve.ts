import { startServer } from '../server.js';

export async function serve(opts: {
  port?: number;
  botToken?: string;
  webAppUrl?: string;
}) {
  await startServer(opts);
  // Server keeps running — don't return
  return new Promise<never>(() => {});
}
