"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    // Individual env vars (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) are
    // picked up automatically by the pg library when DATABASE_URL is not set.
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
});
exports.pool = pool;
/**
 * Execute a parameterised SQL query against the connection pool.
 *
 * @param text   - SQL query string with $1, $2, … placeholders
 * @param params - Optional array of parameter values
 */
async function query(text, params) {
    return pool.query(text, params);
}
//# sourceMappingURL=db.js.map