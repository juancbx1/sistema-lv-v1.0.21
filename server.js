const express = require('express');
const db = require('./database');
const app = express();

app.use(express.json());

app.post('/cadastrar', async (req, res) => {
  const { nome, senha } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO usuarios (nome, senha) VALUES ($1, $2) RETURNING *',
      [nome, senha]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Erro ao cadastrar: ' + err.message);
  }
});

app.post('/login', async (req, res) => {
  const { nome, senha } = req.body;
  try {
    const result = await db.query(
      'SELECT * FROM usuarios WHERE nome = $1 AND senha = $2',
      [nome, senha]
    );
    if (result.rows.length > 0) {
      res.json({ sucesso: true, usuario: result.rows[0] });
    } else {
      res.status(401).json({ sucesso: false, mensagem: 'Usuário ou senha inválidos' });
    }
  } catch (err) {
    res.status(500).send('Erro no login: ' + err.message);
  }
});

module.exports = app;