// ═══════════════════════════════════════════════════════════
//  BACKEND MUSCU — Node.js + Express + PostgreSQL (Railway)
//  Déploiement : Railway (nouveau service Node)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CONNEXION POSTGRESQL ────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ─── MIDDLEWARES ─────────────────────────────────────────────
app.use(cors());                      // autorise ton front à appeler l'API
app.use(express.json());

// ─── INIT BASE DE DONNÉES ────────────────────────────────────
// Crée la table si elle n'existe pas encore
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seances (
      id         SERIAL PRIMARY KEY,
      date       DATE        NOT NULL,
      nom        VARCHAR(200) NOT NULL,
      exercices  JSONB        DEFAULT '[]',
      notes      TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table seances prête');
}

// ─── ROUTES ──────────────────────────────────────────────────

// GET /seances  → liste toutes les séances (plus récentes en premier)
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

// POST /seances  → enregistre une nouvelle séance
// Body: { date, nom, exercices: [{nom, series, reps, poids}], notes }
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

// DELETE /seances/:id  → supprime une séance
app.delete('/seances/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM seances WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'muscu-api' }));

// ─── DÉMARRAGE ───────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 API lancée sur le port ${PORT}`));
});