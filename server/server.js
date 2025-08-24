import express from 'express';
import dotenv from 'dotenv';
import session from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import googleRouter, { fetchLatestEmails } from './src/google.js';
import { ensureDb } from './src/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'sess',
  secret: process.env.SESSION_SECRET || 'dev-secret',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
}));

// serve homepage
app.use(express.static(path.join(__dirname, '..')));

app.use(googleRouter);

app.get('/api/emails/latest', async (req, res) => {
  try {
    const { userId, limit = 10 } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const emails = await fetchLatestEmails(userId, Math.min(parseInt(limit, 10) || 10, 50));
    res.json({ provider: 'google', userId, emails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

(async () => {
  await ensureDb();
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
})();
