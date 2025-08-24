import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function ensureDb() {
  const sql = `
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT,
    expires_at TIMESTAMPTZ,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, provider)
  );`;
  await pool.query(sql);
}

export async function upsertToken({ userId, provider, accessToken, refreshToken, scope, expiresAt, email }) {
  const sql = `
  INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, scope, expires_at, email)
  VALUES ($1,$2,$3,$4,$5,$6,$7)
  ON CONFLICT (user_id, provider)
  DO UPDATE SET
    access_token = EXCLUDED.access_token,
    refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
    scope = EXCLUDED.scope,
    expires_at = EXCLUDED.expires_at,
    email = COALESCE(EXCLUDED.email, oauth_tokens.email),
    updated_at = NOW()
  RETURNING *;`;
  const values = [userId, provider, accessToken, refreshToken, scope, expiresAt, email];
  const { rows } = await pool.query(sql, values);
  return rows[0];
}

export async function getToken(userId, provider) {
  const { rows } = await pool.query('SELECT * FROM oauth_tokens WHERE user_id=$1 AND provider=$2', [userId, provider]);
  return rows[0];
}
