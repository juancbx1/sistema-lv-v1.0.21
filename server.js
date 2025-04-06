import express from 'express';
import usuariosRouter from './api/usuarios.js'; 
import cortesHandler from './api/cortes.js'; // Importa o handler de cortes

const app = express();

app.use(express.json()); // Para parsear corpos JSON

// Monta o roteador para /api/usuarios
app.use('/api', usuariosRouter);

// Adiciona as rotas para /api/cortes (GET, POST, PUT, DELETE)
app.get('/api/cortes', cortesHandler);
app.post('/api/cortes', cortesHandler);
app.put('/api/cortes/:id', cortesHandler); // Já incluso
app.delete('/api/cortes/:id', cortesHandler); // Adiciona a rota DELETE

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

export default app; // Para Vercel ou outro ambiente serverless