// server.js
import express from 'express';
import usuariosRouter from './api/usuarios.js'; // Ajuste o caminho conforme necessário

const app = express();

app.use(express.json()); // Para parsear corpos JSON
app.use('/api', usuariosRouter); // Monta o roteador em /api

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

export default app; // Para Vercel ou outro ambiente serverless