import { Pool, QueryResult, QueryResultRow } from 'pg';
declare const pool: Pool;
/**
 * Execute a parameterised SQL query against the connection pool.
 *
 * @param text   - SQL query string with $1, $2, … placeholders
 * @param params - Optional array of parameter values
 */
export declare function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
export { pool };
