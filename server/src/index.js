import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate } from './migrate.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import testRoutes from './routes/tests.js';
import attemptRoutes from './routes/attempts.js';
import analyticsRoutes from './routes/analytics.js';
import communityRoutes from './routes/community.js';
import adminRoutes from './routes/admin.js';
import billingRoutes from './routes/billing.js';
import prepRoutes from './routes/prep.js';
import socialRoutes from './routes/social.js';
import marketRoutes from './routes/market.js';
import publicRoutes from './routes/public.js';
import formRoutes from './routes/forms.js';
import { ensurePlans } from './services/billing.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/prep', prepRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/forms', formRoutes);
app.use('/api', communityRoutes);

app.use((_req, res) => res.status(404).json({ error: 'পাওয়া যায়নি' }));
app.use((err, _req, res, _next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'সার্ভারে সমস্যা হয়েছে', code: err.status ? err.code : undefined });
});

const port = Number(process.env.PORT || 5000);
migrate()
  .then(ensurePlans)
  .then(() => app.listen(port, () => console.log(`✔ Arohon API running on http://localhost:${port}`)))
  .catch((e) => { console.error('Database migration failed:', e.message); process.exit(1); });
