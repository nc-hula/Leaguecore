/**
 * Integration tests — exercise the real Hono app via `app.request()` against a
 * Neon (serverless Postgres) database (design.md §"Integration Tests").
 *
 * These are skipped unless TEST_DATABASE_URL is set. It must point at a Neon
 * database: the app's db.ts uses @neondatabase/serverless, which targets Neon
 * (a bare local Postgres needs extra neonConfig proxy setup). A throwaway Neon
 * branch is the clean approach. Before running, apply the schema to that database:
 *
 *   DATABASE_URL=$TEST_DATABASE_URL npm run migrate --workspace=server
 *   TEST_DATABASE_URL=postgres://... npm test --workspace=server
 *
 * Google OAuth is not exercised here (it calls out to Google); instead we forge a
 * signed JWT session cookie — exactly what the OAuth callback issues — so the API
 * layer (membership, phases, scoring, reveal) is what's under test.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

const TEST_DB = process.env.TEST_DATABASE_URL;

// Configure the runtime BEFORE importing modules that read env at load time
// (db.ts builds its Pool from process.env.DATABASE_URL on import).
process.env.DATABASE_URL = TEST_DB ?? '';
process.env.SESSION_SECRET = 'integration-test-secret';
process.env.CLIENT_URL = 'http://localhost:5173';

// Loaded lazily in beforeAll so this file imports cleanly when skipped.
let app: typeof import('../app').default;
let query: typeof import('../db').query;
let pool: typeof import('../db').pool;
let sign: typeof import('hono/jwt').sign;

const describeIf = TEST_DB ? describe : describe.skip;

/** Create a user row and return a session cookie header forged for them. */
async function makeUser(name: string): Promise<{ id: string; cookie: string }> {
  const res = await query<{ id: string }>(
    `INSERT INTO users (google_id, display_name, email)
     VALUES ($1, $2, $3) RETURNING id`,
    [`g-${name}-${Math.random().toString(36).slice(2)}`, name, `${name}@test.dev`]
  );
  const id = res.rows[0].id;
  const token = await sign(
    { id, displayName: name, email: `${name}@test.dev`, exp: Math.floor(Date.now() / 1000) + 3600 },
    process.env.SESSION_SECRET!
  );
  return { id, cookie: `session=${token}` };
}

function req(path: string, cookie?: string, init?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return app.request(path, { ...init, headers: { ...headers, ...(init?.headers as object) } });
}

describeIf('API integration', () => {
  beforeAll(async () => {
    app = (await import('../app')).default;
    ({ query, pool } = await import('../db'));
    ({ sign } = await import('hono/jwt'));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean slate; CASCADE clears the dependent tables.
    await query(
      `TRUNCATE users, leagues, league_members, league_submission_sources,
       rounds, round_submission_source_overrides, entries, ballots, ballot_items,
       round_results, comments, identity_reveals RESTART IDENTITY CASCADE`
    );
  });

  it('returns 401 from /auth/me without a session', async () => {
    const res = await req('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the user from /auth/me with a valid session cookie', async () => {
    const alice = await makeUser('alice');
    const res = await req('/auth/me', alice.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ displayName: 'alice' });
  });

  it('creates a league with defaults and treats join as idempotent', async () => {
    const alice = await makeUser('alice');

    const created = await req('/api/leagues', alice.cookie, {
      method: 'POST',
      body: JSON.stringify({ name: 'Test League' }),
    });
    expect(created.status).toBe(201);
    const league = await created.json();
    expect(league.mediaTypeName).toBe('Potpourri');
    expect(league.submissionSources.sort()).toEqual(['spotify', 'youtube']);

    // Invite + second member joining twice (idempotent — Property 12).
    const invite = await (await req(`/api/leagues/${league.id}/invite`, alice.cookie)).json();
    const token = invite.inviteUrl.split('/join/')[1];

    const bob = await makeUser('bob');
    const first = await req(`/api/leagues/join/${token}`, bob.cookie, { method: 'POST' });
    expect(first.status).toBe(201);
    const second = await req(`/api/leagues/join/${token}`, bob.cookie, { method: 'POST' });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ alreadyMember: true });

    const members = await (await req(`/api/leagues/${league.id}/members`, alice.cookie)).json();
    expect(members).toHaveLength(2);
  });

  it('runs a full round lifecycle and computes results', async () => {
    // Mock oEmbed so entry submission doesn't hit the network.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ title: 'A Song', html: '<iframe src="x"></iframe>', thumbnail_url: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    try {
      const alice = await makeUser('alice');
      const league = await (
        await req('/api/leagues', alice.cookie, {
          method: 'POST',
          body: JSON.stringify({ name: 'L' }),
        })
      ).json();

      // Flexible single-member round, one required entry.
      const round = await (
        await req(`/api/leagues/${league.id}/rounds`, alice.cookie, {
          method: 'POST',
          body: JSON.stringify({
            theme: 'T',
            description: 'D',
            requiredEntryCount: 1,
            deadlineMode: 'flexible',
          }),
        })
      ).json();

      // Submit the one required entry — flexible mode advances to voting.
      const submitted = await req(`/api/rounds/${round.id}/entries`, alice.cookie, {
        method: 'POST',
        body: JSON.stringify({ url: 'https://open.spotify.com/track/abc' }),
      });
      expect(submitted.status).toBe(201);
      const entry = await submitted.json();
      // Identity must be concealed pre-reveal (Property 5).
      expect(entry.submitterDisplayName).toBeUndefined();

      const afterSubmit = await (await req(`/api/leagues/${league.id}/rounds/${round.id}`, alice.cookie)).json();
      expect(afterSubmit.phase).toBe('voting');

      // Vote — completeness required (Property 6), then flexible mode closes it.
      const ballot = await req(`/api/rounds/${round.id}/ballot`, alice.cookie, {
        method: 'PUT',
        body: JSON.stringify({ items: [{ entryId: entry.id, rankPosition: 0 }] }),
      });
      expect(ballot.status).toBe(201);

      const closed = await (await req(`/api/leagues/${league.id}/rounds/${round.id}`, alice.cookie)).json();
      expect(closed.phase).toBe('closed');

      const results = await (await req(`/api/leagues/${league.id}/rounds/${round.id}/results`, alice.cookie)).json();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ finalRank: 1, submitterDisplayName: 'alice' });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('rejects an incomplete ballot with 422', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ title: 'S', html: '<iframe src="x"></iframe>', thumbnail_url: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    try {
      const alice = await makeUser('alice');
      const league = await (
        await req('/api/leagues', alice.cookie, { method: 'POST', body: JSON.stringify({ name: 'L' }) })
      ).json();
      const round = await (
        await req(`/api/leagues/${league.id}/rounds`, alice.cookie, {
          method: 'POST',
          body: JSON.stringify({ theme: 'T', description: 'D', requiredEntryCount: 2, deadlineMode: 'flexible' }),
        })
      ).json();

      // Submit two entries (so the round has 2 non-bonus entries to rank).
      for (const slug of ['one', 'two']) {
        await req(`/api/rounds/${round.id}/entries`, alice.cookie, {
          method: 'POST',
          body: JSON.stringify({ url: `https://open.spotify.com/track/${slug}` }),
        });
      }
      const entries = await (await req(`/api/rounds/${round.id}/entries`, alice.cookie)).json();

      // Ballot ranks only one of the two → 422.
      const res = await req(`/api/rounds/${round.id}/ballot`, alice.cookie, {
        method: 'PUT',
        body: JSON.stringify({ items: [{ entryId: entries[0].id, rankPosition: 0 }] }),
      });
      expect(res.status).toBe(422);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
