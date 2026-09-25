import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db as sqliteDb } from './db.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(__dirname, 'db', 'schema.postgres.sql');

let pgPool = null;

export function getSavedPostgresUrl() {
  try {
    const row = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'postgres_connection_url'").get();
    if (row && row.value) {
      return JSON.parse(row.value);
    }
  } catch {}
  return '';
}

export function savePostgresUrl(url) {
  sqliteDb.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('postgres_connection_url', ?, datetime('now','+6 hours'))")
    .run(JSON.stringify(url.trim()));
  pgPool = null; // Reset pool
}

export function getPostgresConfig() {
  let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || getSavedPostgresUrl() || '';

  if (connectionString) {
    const isDisableSsl = connectionString.includes('sslmode=disable') || process.env.PGSSLMODE === 'disable';
    return {
      connectionString,
      ssl: isDisableSsl ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    };
  }

  const host = process.env.PGHOST || process.env.SQL_HOST || '';
  const user = process.env.PGUSER || process.env.SQL_USER || 'postgres';
  const password = process.env.PGPASSWORD || process.env.SQL_PASSWORD || '';
  const database = process.env.PGDATABASE || process.env.SQL_DB_NAME || 'taskflow';
  const port = Number(process.env.PGPORT) || 5432;

  if (!host) {
    return null;
  }

  return {
    host,
    user,
    password,
    database,
    port,
    ssl: process.env.PGSSLMODE === 'disable' ? false : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
    connectionTimeoutMillis: 5000,
  };
}

export function getPostgresPool(customConfig = null) {
  if (customConfig) {
    return new Pool({ ...customConfig, connectionTimeoutMillis: 5000 });
  }
  if (!pgPool) {
    const config = getPostgresConfig();
    if (config) {
      pgPool = new Pool(config);
      pgPool.on('error', (err) => {
        console.error('PostgreSQL unexpected idle client error:', err.message);
      });
    }
  }
  return pgPool;
}

export async function testPostgresConnection(customConfig = null) {
  const poolConfig = customConfig ? { ...customConfig, connectionTimeoutMillis: 5000 } : getPostgresConfig();
  if (!poolConfig) {
    return {
      connected: false,
      error: 'No PostgreSQL connection string configured. Set DATABASE_URL or enter a connection string.',
    };
  }

  const isLocal = typeof poolConfig === 'object' &&
    ((poolConfig.host && (poolConfig.host === 'localhost' || poolConfig.host === '127.0.0.1')) ||
     (poolConfig.connectionString && (poolConfig.connectionString.includes('localhost') || poolConfig.connectionString.includes('127.0.0.1'))));

  const pool = new Pool(poolConfig);

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT version(), current_database(), current_user;');
    client.release();
    await pool.end();

    return {
      connected: true,
      database: result.rows[0]?.current_database,
      user: result.rows[0]?.current_user,
      version: result.rows[0]?.version,
    };
  } catch (err) {
    try { await pool.end(); } catch {}
    const errorMsg = err.message || 'Failed to connect to PostgreSQL';
    let diagnosis = null;

    if (isLocal) {
      diagnosis = 'Cloud-to-Local Network Barrier: This application is currently running inside Google Cloud Run. The cloud container cannot connect to "localhost" on your personal laptop because "localhost" points to the container itself. To connect your local database to this cloud app, either use a tunnel (e.g. ngrok tcp 5432) or a free cloud PostgreSQL (e.g. Neon or Supabase). If you run the code directly on your local computer, localhost:5432 will work.';
    } else if (err.code === 'ECONNREFUSED') {
      diagnosis = 'Connection refused by destination host. Ensure PostgreSQL is running and listening on all interfaces (listen_addresses = "*") and port 5432 is open.';
    } else if (err.code === 'ETIMEDOUT') {
      diagnosis = 'Connection timed out. The server address is unreachable over the internet. Verify hostname, port, and firewall rules.';
    } else if (err.code === '28P01') {
      diagnosis = 'Password authentication failed for user. Check your database username and password.';
    } else if (err.code === '3D000') {
      diagnosis = 'Database does not exist on the PostgreSQL server. Please run "CREATE DATABASE <name>;" first.';
    }

    return {
      connected: false,
      error: errorMsg,
      diagnosis,
      isLocalhostTarget: isLocal,
    };
  }
}

export async function runPostgresMigrations(customConfig = null) {
  const pool = customConfig ? new Pool({ ...customConfig, connectionTimeoutMillis: 5000 }) : getPostgresPool();
  if (!pool) {
    throw new Error('PostgreSQL connection not configured');
  }

  const sqlContent = fs.readFileSync(SCHEMA_FILE, 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sqlContent);
    await client.query('COMMIT');
    return { success: true, message: 'PostgreSQL schema created successfully' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    if (customConfig) await pool.end();
  }
}

export async function syncSqliteToPostgres(customConfig = null) {
  const pool = customConfig ? new Pool({ ...customConfig, connectionTimeoutMillis: 5000 }) : getPostgresPool();
  if (!pool) {
    throw new Error('PostgreSQL connection not configured');
  }

  // First ensure schema
  await runPostgresMigrations(customConfig);

  const client = await pool.connect();
  const results = {};

  const tables = [
    'settings',
    'role_groups',
    'teams',
    'departments',
    'users',
    'projects',
    'project_members',
    'tasks',
    'task_assignees',
    'task_comments',
    'task_checklist',
    'task_attachments',
    'task_history',
    'leave_applications',
    'leave_quotas',
    'notifications',
    'audit_logs',
    'chat_groups',
    'chat_group_members',
    'chat_messages',
    'chat_reads',
    'document_folders',
    'documents',
  ];

  try {
    await client.query('BEGIN');

    for (const table of tables) {
      try {
        const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
        if (!rows || rows.length === 0) {
          results[table] = 0;
          continue;
        }

        const cols = Object.keys(rows[0]);
        const colList = cols.map((c) => `"${c}"`).join(', ');

        for (const row of rows) {
          const values = cols.map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return null;
            // JSON string conversion for Postgres jsonb columns
            if (c === 'permissions' || c === 'weekend_days' || c === 'tags' || c === 'details' || c === 'value') {
              if (typeof v === 'string') {
                try {
                  JSON.parse(v);
                  return v;
                } catch {
                  return JSON.stringify(v);
                }
              }
              return JSON.stringify(v);
            }
            if (c === 'is_active' || c === 'password_must_change' || c === 'is_system' || c === 'is_priority' || c === 'is_recurring' || c === 'is_completed' || c === 'is_internal' || c === 'is_direct' || c === 'read') {
              return !!v;
            }
            return v;
          });

          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          const conflictCol = table === 'settings' ? 'key' : 'id';
          const updateSet = cols
            .filter((c) => c !== conflictCol)
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(', ');

          const upsertSql = updateSet
            ? `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateSet}`
            : `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO NOTHING`;

          await client.query(upsertSql, values);
        }

        // Reset serial sequences in PostgreSQL
        if (cols.includes('id')) {
          await client.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE(MAX(id), 1), true) FROM "${table}";`);
        }

        results[table] = rows.length;
      } catch (tableErr) {
        console.warn(`Table ${table} sync skipped or partial:`, tableErr.message);
        results[table] = `Error: ${tableErr.message}`;
      }
    }

    await client.query('COMMIT');
    return { success: true, synced: results };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    if (customConfig) await pool.end();
  }
}
