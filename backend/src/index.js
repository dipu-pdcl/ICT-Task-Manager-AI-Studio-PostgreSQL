import './env.js';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.js';
import { ensureSchema } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import teamRoutes from './routes/teams.js';
import deptRoutes from './routes/departments.js';
import taskRoutes from './routes/tasks.js';
import notifRoutes from './routes/notifications.js';
import auditRoutes from './routes/audit.js';
import settingsRoutes from './routes/settings.js';
import kpiRoutes from './routes/kpi.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import uploadRoutes from './routes/uploads.js';
import backupRoutes from './routes/backup.js';
import priorityTaskRoutes from './routes/priorityTasks.js';
import leaveRoutes from './routes/leaves.js';
import liveStatusRoutes from './routes/liveStatus.js';
import chatRoutes from './routes/chat.js';
import projectRoutes, { updateProjectProgressForTask } from './routes/projects.js';
import documentRoutes from './routes/documents.js';
import databaseRoutes from './routes/database.js';
import { startBackgroundIndexer } from './services/documentIndexer.js';
import { startCacheCleanup } from './services/cacheCleanup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await ensureSchema();
await seed();

const app = express();
app.set('trust proxy', 1);
app.use(cookieParser());
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginEmbedderError: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV !== 'production',
});
app.use('/api/auth/login', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/departments', deptRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/priority-tasks', priorityTaskRoutes);
app.use('/api/live-status', liveStatusRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/settings', backupRoutes);
app.use('/api/chat', chatRoutes); // Added chat routes
app.use('/api/projects', projectRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/database', databaseRoutes);

const frontendDir = path.join(__dirname, '..', '..', 'frontend');
const distDir = path.join(frontendDir, 'dist');
const hasDist = fs.existsSync(path.join(distDir, 'index.html'));
const isDev = process.env.NODE_ENV !== 'production';

let viteInstance = null;
if (isDev) {
  try {
    const { createServer: createViteServer } = await import('vite');
    viteInstance = await createViteServer({
      server: { middlewareMode: true, hmr: false, host: '0.0.0.0', allowedHosts: true },
      root: frontendDir,
      appType: 'custom',
    });
    app.use(viteInstance.middlewares);
  } catch (err) {
    console.warn('Vite middleware unavailable, falling back to static dist:', err?.message || err);
  }
}

if (hasDist && !viteInstance) {
  app.use(express.static(distDir));
}

// SPA fallback for all non-API GET routes
app.get(/^(?!\/api).*/, async (req, res, next) => {
  if (viteInstance) {
    try {
      const indexPath = path.join(frontendDir, 'index.html');
      let template = fs.readFileSync(indexPath, 'utf-8');
      template = await viteInstance.transformIndexHtml(req.originalUrl, template);
      return res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      return next(e);
    }
  }
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    return res.sendFile(path.join(distDir, 'index.html'));
  }
  return res.status(404).send('Frontend not built. Please run npm run build.');
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Upload failed' });
  }
  console.error('[ERROR]', err?.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDCL ICT running on http://0.0.0.0:${PORT}`);
  startBackgroundIndexer(10);
  startCacheCleanup(24);
});