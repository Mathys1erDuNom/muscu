// ═══════════════════════════════════════════════════════════
//  BACKEND MUSCU — Node.js + Express + PostgreSQL (Railway)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CONNEXION POSTGRESQL ────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ─── MIDDLEWARES ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── INIT BASE DE DONNÉES ────────────────────────────────────
// DROP + CREATE pour forcer la nouvelle structure
// Format exercices: [{nom, series: [{reps, poids}]}]
async function initDB() {
  await pool.query(`
    DROP TABLE IF EXISTS seances;
    CREATE TABLE seances (
      id         SERIAL PRIMARY KEY,
      date       DATE         NOT NULL,
      nom        VARCHAR(200) NOT NULL,
      exercices  JSONB        NOT NULL DEFAULT '[]',
      notes      TEXT         DEFAULT '',
      created_at TIMESTAMPTZ  DEFAULT NOW()
    );
  `);
  console.log('✓ Table seances recréée');
}

// ─── ROUTES ──────────────────────────────────────────────────

// GET /seances
app.get('/seances', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM seances ORDER BY date DESC, created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// POST /seances
// Body: { date, nom, exercices: [{nom, series: [{reps, poids}]}], notes }
app.post('/seances', async (req, res) => {
  const { date, nom, exercices = [], notes = '' } = req.body;
  if (!date || !nom) {
    return res.status(400).json({ error: 'date et nom sont obligatoires' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO seances (date, nom, exercices, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [date, nom, JSON.stringify(exercices), notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// DELETE /seances/:id
app.delete('/seances/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM seances WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// Fichiers statiques + page principale
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── DÉMARRAGE ───────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 API lancée sur le port ${PORT}`));
});