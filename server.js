// ═══════════════════════════════════════════════════════════
//  BACKEND MUSCU — Node.js + Express + PostgreSQL (Railway)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

// ─── INIT BDD ────────────────────────────────────────────────
async function initDB() {
  // Table séances
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seances (
      id         SERIAL PRIMARY KEY,
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

  // Migration : ajoute la colonne poids si la table existait déjà
  await pool.query(`
    ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS poids NUMERIC(5,2) DEFAULT NULL;
  `);

  console.log('✓ Tables prêtes');
}

// ─── ROUTES SÉANCES ──────────────────────────────────────────

app.get('/seances', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM seances ORDER BY date DESC, created_at DESC');
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

app.post('/seances', async (req, res) => {
  const { date, nom, exercices = [], notes = '' } = req.body;
  if (!date || !nom) return res.status(400).json({ error: 'date et nom requis' });
  try {
    const r = await pool.query(
      `INSERT INTO seances (date, nom, exercices, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [date, nom, JSON.stringify(exercices), notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

app.delete('/seances/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM seances WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

// ─── ROUTES NUTRITION ────────────────────────────────────────

app.get('/nutrition', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM nutrition ORDER BY date DESC, created_at DESC');
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

app.post('/nutrition', async (req, res) => {
  const { date, calories=0, proteines=0, glucides=0, lipides=0,
          poids=null, cardio=[], depense_totale=0, net=0, notes='' } = req.body;
  if (!date) return res.status(400).json({ error: 'date requise' });
  try {
    const r = await pool.query(
      `INSERT INTO nutrition (date, calories, proteines, glucides, lipides, poids, cardio, depense_totale, net, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [date, calories, proteines, glucides, lipides, poids, JSON.stringify(cardio), depense_totale, net, notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }); }
});

app.delete('/nutrition/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM nutrition WHERE id=$1', [req.params.id]);
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