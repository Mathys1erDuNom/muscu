// ═══════════════════════════════════════════════════════════
//  BACKEND MUSCU — Node.js + Express + PostgreSQL (Railway)
//  v2 : multi-comptes avec authentification JWT
// ═══════════════════════════════════════════════════════════

const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'muscu_secret_change_me_in_prod';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

// ─── HELPERS ────────────────────────────────────────────────
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'muscu_salt').digest('hex');
}

function generateToken(userId, username) {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '30d' });
}

// ─── MIDDLEWARE AUTH ─────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId   = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// ─── INIT BDD ────────────────────────────────────────────────
async function initDB() {
  // Table utilisateurs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      username     VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(64) NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Table séances
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seances (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       DATE         NOT NULL,
      nom        VARCHAR(200) NOT NULL,
      exercices  JSONB        NOT NULL DEFAULT '[]',
      notes      TEXT         DEFAULT '',
      created_at TIMESTAMPTZ  DEFAULT NOW()
    );
  `);

  // Table nutrition
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date            DATE         NOT NULL,
      calories        INTEGER      DEFAULT 0,
      proteines       NUMERIC(6,1) DEFAULT 0,
      glucides        NUMERIC(6,1) DEFAULT 0,
      lipides         NUMERIC(6,1) DEFAULT 0,
      poids           NUMERIC(5,2) DEFAULT NULL,
      cardio          JSONB        DEFAULT '[]',
      depense_totale  INTEGER      DEFAULT 0,
      net             INTEGER      DEFAULT 0,
      notes           TEXT         DEFAULT '',
      created_at      TIMESTAMPTZ  DEFAULT NOW()
    );
  `);

  // Migrations pour tables existantes sans user_id
  await pool.query(`
    ALTER TABLE seances ADD COLUMN IF NOT EXISTS user_id INTEGER;
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS user_id INTEGER;
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS poids NUMERIC(5,2) DEFAULT NULL;
  `).catch(() => {});

  console.log('✓ Tables prêtes');
}

// ─── ROUTES AUTH ─────────────────────────────────────────────

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
  if (username.length < 2 || username.length > 50) return res.status(400).json({ error: 'Username : 2–50 caractères' });
  if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });

  try {
    const hash = hashPassword(password);
    const r = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username`,
      [username.trim(), hash]
    );
    const user = r.rows[0];
    const token = generateToken(user.id, user.username);
    res.status(201).json({ token, username: user.username });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' });

  try {
    const hash = hashPassword(password);
    const r = await pool.query(
      `SELECT id, username FROM users WHERE username=$1 AND password_hash=$2`,
      [username.trim(), hash]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = r.rows[0];
    const token = generateToken(user.id, user.username);
    res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ─── ROUTES SÉANCES ──────────────────────────────────────────

app.get('/seances', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM seances WHERE user_id=$1 ORDER BY date DESC, created_at DESC',
      [req.userId]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

app.post('/seances', requireAuth, async (req, res) => {
  const { date, nom, exercices = [], notes = '' } = req.body;
  if (!date || !nom) return res.status(400).json({ error: 'date et nom requis' });
  try {
    const r = await pool.query(
      `INSERT INTO seances (user_id, date, nom, exercices, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.userId, date, nom, JSON.stringify(exercices), notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

app.delete('/seances/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM seances WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

// ─── ROUTES NUTRITION ────────────────────────────────────────

app.get('/nutrition', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM nutrition WHERE user_id=$1 ORDER BY date DESC, created_at DESC',
      [req.userId]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

app.post('/nutrition', requireAuth, async (req, res) => {
  const { date, calories=0, proteines=0, glucides=0, lipides=0,
          poids=null, cardio=[], depense_totale=0, net=0, notes='' } = req.body;
  if (!date) return res.status(400).json({ error: 'date requise' });
  try {
    const r = await pool.query(
      `INSERT INTO nutrition (user_id, date, calories, proteines, glucides, lipides, poids, cardio, depense_totale, net, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.userId, date, calories, proteines, glucides, lipides, poids, JSON.stringify(cardio), depense_totale, net, notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

app.delete('/nutrition/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM nutrition WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

// ─── STATIC + PAGES ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── START ───────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 API sur le port ${PORT}`));
});