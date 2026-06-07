import { Pool, QueryResult, QueryResultRow } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Individual env vars (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) are
  // picked up automatically by the pg library when DATABASE_URL is not set.
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

/**
 * Execute a parameterised SQL query against the connection pool.
 *
 * @param text   - SQL query string with $1, $2, … placeholders
 * @param params - Optional array of parameter values
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export { pool };
