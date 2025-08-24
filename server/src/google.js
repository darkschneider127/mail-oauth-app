import axios from 'axios';
import { upsertToken, getToken } from './db.js';
import express from 'express';

const GOOGLE_AUTHZ_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BASE_URL = process.env.OAUTH_CALLBACK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const REDIRECT_URI = `${BASE_URL}/auth/google/callback`;
const SCOPE = process.env.GOOGLE_SCOPE || 'https://www.googleapis.com/auth/gmail.readonly';

const router = express.Router();

router.get('/auth/google', (req, res) => {
  const state = encodeURIComponent(JSON.stringify({ userId: req.query.userId || 'demo-user' }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    scope: SCOPE,
    include_granted_scopes: 'true',
    prompt: 'consent',
    state
  }).toString();
  res.redirect(`${GOOGLE_AUTHZ_URL}?${params}`);
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const parsed = state ? JSON.parse(decodeURIComponent(state)) : {};
    const userId = parsed.userId || 'demo-user';
    const body = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    }).toString();
    const { data } = await axios.post(GOOGLE_TOKEN_URL, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((now + (data.expires_in || 3600)) * 1000);

    const meResp = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` }
    });

    await upsertToken({
      userId,
      provider: 'google',
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      scope: SCOPE,
      expiresAt,
      email: meResp?.data?.email || null
    });

    res.send('Google account connected. You can close this window.');
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).send('Google OAuth failed.');
  }
});

export async function refreshGoogleToken(userId) {
  const rec = await getToken(userId, 'google');
  if (!rec?.refresh_token) return null;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: rec.refresh_token
  }).toString();
  const { data } = await axios.post(GOOGLE_TOKEN_URL, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((now + (data.expires_in || 3600)) * 1000);
  const updated = await upsertToken({
    userId,
    provider: 'google',
    accessToken: data.access_token,
    refreshToken: rec.refresh_token,
    scope: rec.scope,
    expiresAt,
    email: rec.email
  });
  return updated;
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  return Buffer.from(s, 'base64').toString('utf8');
}

function findPart(payload, mimeType) {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body?.data) return payload.body.data;
  const parts = payload.parts || [];
  for (const p of parts) {
    if (p.mimeType === mimeType && p.body?.data) return p.body.data;
    const nested = findPart(p, mimeType);
    if (nested) return nested;
  }
  return null;
}

export async function fetchLatestEmails(userId, limit = 10) {
  let rec = await getToken(userId, 'google');
  if (!rec) throw new Error('No token for user');
  if (!rec.expires_at || new Date(rec.expires_at).getTime() < Date.now() + 60_000) {
    rec = await refreshGoogleToken(userId) || rec;
  }

  const list = await axios.get(`${GMAIL_API}/users/me/messages`, {
    headers: { Authorization: `Bearer ${rec.access_token}` },
    params: { maxResults: limit }
  });
  const messages = list.data.messages || [];

  const full = await Promise.all(messages.map(async (m) => {
    const msg = await axios.get(`${GMAIL_API}/users/me/messages/${m.id}`, {
      headers: { Authorization: `Bearer ${rec.access_token}` },
      params: { format: 'full' }
    });
    const payload = msg.data.payload || {};
    const headers = payload.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    let body = findPart(payload, 'text/plain');
    if (!body) body = findPart(payload, 'text/html');
    const decodedBody = body ? base64UrlDecode(body) : '';

    return { id: m.id, subject, from, date, body: decodedBody };
  }));

  return full;
}

export default router;
