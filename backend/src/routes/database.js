import { Router } from 'express';
import { requireAuth, isAdmin } from '../middleware.js';
import {
  testPostgresConnection,
  runPostgresMigrations,
  syncSqliteToPostgres,
  getPostgresConfig,
  savePostgresUrl,
  getSavedPostgresUrl,
} from '../pg.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();
router.use(requireAuth);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(__dirname, '..', 'db', 'schema.postgres.sql');

router.get('/status', async (req, res) => {
  const config = getPostgresConfig();
  const savedUrl = getSavedPostgresUrl();
  const test = await testPostgresConnection();
  res.json({
    hasConfig: !!config,
    savedUrl: savedUrl ? (savedUrl.replace(/:[^:@]+@/, ':****@')) : '',
    config: config ? {
      host: config.host || 'connection string configured',
      database: config.database || 'default',
      user: config.user || 'configured',
      ssl: !!config.ssl,
    } : null,
    connection: test,
  });
});

router.post('/save-config', async (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Admin permission required' });
  }
  const { connectionString } = req.body || {};
  if (!connectionString) {
    return res.status(400).json({ error: 'Connection string is required' });
  }

  savePostgresUrl(connectionString);
  const test = await testPostgresConnection();
  res.json({ ok: true, connection: test });
});

router.post('/test', async (req, res) => {
  const { connectionString, host, port, user, password, database, ssl } = req.body || {};
  let customConfig = null;
  if (connectionString) {
    const isDisable = connectionString.includes('sslmode=disable');
    customConfig = {
      connectionString,
      ssl: isDisable ? false : (ssl ? { rejectUnauthorized: false } : false),
    };
  } else if (host) {
    customConfig = {
      host,
      port: Number(port) || 5432,
      user,
      password,
      database,
      ssl: ssl ? { rejectUnauthorized: false } : false,
    };
  }

  const result = await testPostgresConnection(customConfig);
  res.json(result);
});

router.post('/migrate', async (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const { connectionString } = req.body || {};
  const customConfig = connectionString ? { connectionString, ssl: { rejectUnauthorized: false } } : null;

  try {
    const result = await runPostgresMigrations(customConfig);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Migration failed' });
  }
});

router.post('/sync', async (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Admin permission required' });
  }

  const { connectionString } = req.body || {};
  const customConfig = connectionString ? { connectionString, ssl: { rejectUnauthorized: false } } : null;

  try {
    const result = await syncSqliteToPostgres(customConfig);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

router.get('/export-schema', (req, res) => {
  try {
    const sql = fs.readFileSync(SCHEMA_FILE, 'utf-8');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="pdcl_taskflow_postgres_schema.sql"');
    res.send(sql);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/download-bat', (req, res) => {
  try {
    const candidates = [
      path.resolve(process.cwd(), 'start.bat'),
      path.join(__dirname, '..', '..', '..', 'start.bat'),
      path.join(__dirname, '..', '..', 'start.bat'),
    ];
    const batPath = candidates.find((p) => fs.existsSync(p));
    if (batPath) {
      res.setHeader('Content-Type', 'application/x-bat');
      res.setHeader('Content-Disposition', 'attachment; filename="start.bat"');
      const content = fs.readFileSync(batPath, 'utf-8');
      res.send(content);
    } else {
      res.status(404).json({ error: 'start.bat file not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
