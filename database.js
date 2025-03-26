
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.log('Erro:', err);
  } else {
    console.log('Conectado! Hora atual:', res.rows[0]);
  }
});

module.exports = pool;