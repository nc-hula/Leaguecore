import app from './app';
import { runDeadlineChecks } from './scheduler';
import { pool } from './db';

export default {
  /**
   * Handle incoming HTTP requests by routing them through the Hono application.
   */
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // Ensure process.env is populated from Cloudflare environment bindings
    if (typeof globalThis.process === 'undefined') {
      (globalThis as any).process = { env: {} };
    } else if (typeof globalThis.process.env === 'undefined') {
      globalThis.process.env = {};
    }
    Object.assign(globalThis.process.env, env);

    return app.fetch(request, env, ctx);
  },

  /**
   * Handle Cloudflare Worker Cron Trigger ticks.
   * Runs the rigid-mode round deadline checks.
   */
  async scheduled(event: any, env: any, ctx: any): Promise<void> {
    // Ensure process.env is populated from Cloudflare environment bindings
    if (typeof globalThis.process === 'undefined') {
      (globalThis as any).process = { env: {} };
    } else if (typeof globalThis.process.env === 'undefined') {
      globalThis.process.env = {};
    }
    Object.assign(globalThis.process.env, env);

    ctx.waitUntil(runDeadlineChecks(pool));
  }
};
