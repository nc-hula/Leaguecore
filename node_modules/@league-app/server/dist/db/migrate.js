"use strict";
/**
 * Migration runner script.
 * Reads and executes SQL migration files against the configured database.
 *
 * Usage: ts-node src/db/migrate.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
});
async function runMigrations() {
    const migrationsDir = path_1.default.join(__dirname, 'migrations');
    const files = fs_1.default
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    const client = await pool.connect();
    try {
        // Ensure the migrations tracking table exists
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
        for (const file of files) {
            const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
            if (rows.length > 0) {
                console.log(`Skipping already-applied migration: ${file}`);
                continue;
            }
            console.log(`Applying migration: ${file}`);
            const sql = fs_1.default.readFileSync(path_1.default.join(migrationsDir, file), 'utf8');
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`Applied migration: ${file}`);
            }
            catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }
        console.log('All migrations complete.');
    }
    finally {
        client.release();
        await pool.end();
    }
}
runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map