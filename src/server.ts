import { Hono } from 'hono';
import { serve as honoServe } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createHmac } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema } from './core/db.js';
import {
  loadState,
  onboard,
  getOnboardSummary,
} from './commands/onboard.js';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app');

// --- Telegram initData validation ---

function validateInitData(initData: string, botToken: string): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  // Build data-check-string: sorted key=value pairs excluding hash
  params.delete('hash');
  const entries = Array.from(params.entries());
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  // HMAC: secret = HMAC_SHA256("WebAppData", bot_token)
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computed !== hash) return null;

  return Object.fromEntries(params.entries());
}

// --- Server factory ---

export function createApp(botToken?: string) {
  const app = new Hono();

  // Auth middleware for /api/* routes
  app.use('/api/*', async (c, next) => {
    // In dev mode (no bot token), skip auth
    if (!botToken) {
      return next();
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ ok: false, error: 'Missing Authorization header' }, 401);
    }

    const initData = authHeader.replace(/^tma\s+/i, '');
    const validated = validateInitData(initData, botToken);
    if (!validated) {
      return c.json({ ok: false, error: 'Invalid Telegram initData' }, 403);
    }

    return next();
  });

  // --- API Routes ---

  app.post('/api/onboard/start', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const language = body.language || null;
    const telegramUser = body.telegramUser;

    // Initialize a new session or resume existing
    const state = loadState(telegramUser?.id?.toString());

    // If language provided and state hasn't detected one yet, set it
    if (language && !state.language) {
      state.language = language;
    }

    // Generate first question by calling onboard with empty message
    const result = await onboard('', telegramUser?.id?.toString());

    if (!result.ok) {
      return c.json(result, 500);
    }

    const data = result.data as any;
    return c.json({
      sessionId: telegramUser?.id?.toString() || 'default',
      question: data.isComplete ? null : {
        text: data.message,
        area: data.currentArea,
        areaIndex: data.overallProgress?.completed?.length || 0,
        totalAreas: 7,
        options: (data.suggestedAnswers || []).map((text: string, i: number) => ({
          text,
          id: `opt_${i}`,
        })),
      },
      progress: {
        completedAreas: data.overallProgress?.completed?.length || 0,
        totalAreas: 7,
        factsExtracted: data.overallProgress?.totalFacts || 0,
      },
      isComplete: data.isComplete || false,
    });
  });

  app.post('/api/onboard/answer', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { sessionId, answer, optionId } = body;

    if (!answer && !optionId) {
      return c.json({ ok: false, error: 'Answer or optionId required' }, 400);
    }

    const answerText = answer || '';
    const result = await onboard(answerText, sessionId);

    if (!result.ok) {
      return c.json(result, 500);
    }

    const data = result.data as any;
    return c.json({
      question: data.isComplete ? null : {
        text: data.message,
        area: data.currentArea,
        areaIndex: data.overallProgress?.completed?.length || 0,
        totalAreas: 7,
        options: (data.suggestedAnswers || []).map((text: string, i: number) => ({
          text,
          id: `opt_${i}`,
        })),
      },
      followUp: false,
      factsJustExtracted: data.lastExtractedFacts?.length || 0,
      progress: {
        completedAreas: data.overallProgress?.completed?.length || 0,
        totalAreas: 7,
        factsExtracted: data.overallProgress?.totalFacts || 0,
      },
      isComplete: data.isComplete || false,
      summary: data.isComplete ? data.message : undefined,
    });
  });

  app.get('/api/onboard/status', async (c) => {
    const sessionId = c.req.query('sessionId');
    const result = await onboard('--status', sessionId);
    return c.json(result);
  });

  app.post('/api/onboard/reset', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const sessionId = body.sessionId;
    const result = await onboard('--reset', sessionId);
    return c.json(result);
  });

  app.get('/api/onboard/summary', async (c) => {
    const sessionId = c.req.query('sessionId');
    const summary = getOnboardSummary(sessionId);
    return c.json(summary);
  });

  // Serve static files from app/ (relative to project root)
  app.get('/*', serveStatic({ root: './app' }));

  return app;
}

// --- Bot menu button registration ---

async function registerWebAppMenuButton(botToken: string, webAppUrl: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/setChatMenuButton`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: 'Start Onboarding',
        web_app: { url: webAppUrl },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[server] Failed to register menu button: ${body}`);
  } else {
    console.error(`[server] Menu button registered → ${webAppUrl}`);
  }
}

// --- Start server ---

export async function startServer(opts: {
  port?: number;
  botToken?: string;
  webAppUrl?: string;
}) {
  const port = opts.port || 3847;

  // Init DB schema
  initSchema();

  const app = createApp(opts.botToken);

  console.error(`[server] Starting on http://localhost:${port}`);
  console.error(`[server] Serving Mini App from ${APP_DIR}`);

  if (opts.botToken && opts.webAppUrl) {
    await registerWebAppMenuButton(opts.botToken, opts.webAppUrl);
  }

  honoServe({ fetch: app.fetch, port }, () => {
    console.error(`[server] Ready at http://localhost:${port}`);
  });
}
