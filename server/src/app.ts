import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import authRouter from './auth/router';
import apiRouter from './api/router';
import { authSessionMiddleware, AppEnv } from './auth/middleware';

const app = new Hono<AppEnv>();

// Global middleware to map Cloudflare Worker environment variables to process.env dynamically.
// This allows us to keep using process.env.DATABASE_URL etc. in existing services.
app.use('*', async (c, next) => {
  if (typeof globalThis.process === 'undefined') {
    (globalThis as any).process = { env: {} };
  } else if (typeof globalThis.process.env === 'undefined') {
    globalThis.process.env = {};
  }
  // Inject environment bindings
  Object.assign(globalThis.process.env, c.env);
  await next();
});

// Session decoding middleware
app.use('*', authSessionMiddleware);

// CSP headers — allow Spotify and YouTube iframes, restrict everything else
app.use('*', async (c, next) => {
  c.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://i.ytimg.com https://i.scdn.co https://mosaic.scdn.co",
      "frame-src https://open.spotify.com https://www.youtube.com https://youtube.com",
      "connect-src 'self'",
    ].join('; ')
  );
  await next();
});

// Mount sub-routers
app.route('/auth', authRouter);
app.route('/api', apiRouter);

// 404 for unmatched routes — JSON, consistent with the rest of the API.
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Global error handler. Service-layer errors carry a numeric `status`; honour it.
// Everything else is an unexpected failure → 500 (details logged, not leaked).
app.onError((err, c) => {
  const status = (err as Error & { status?: number }).status;
  if (typeof status === 'number') {
    return c.json({ error: err.message }, status as ContentfulStatusCode);
  }
  console.error('[unhandled]', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
