// api/login.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import express from 'express';

// 1. Cria um novo Roteador do Express
const router = express.Router();

// 2. Configura a conexão com o banco de dados
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const SECRET_KEY = process.env.JWT_SECRET;

// 3. Define a rota POST para a raiz do roteador ('/')
//    Quando o api/index.js fizer app.use('/login', loginRouter),
//    esta rota responderá a POST /api/login
router.post('/', async (req, res) => {
  const { nomeUsuario, senha } = req.body;

  if (!nomeUsuario || !senha) {
    return res.status(400).json({ error: 'Nome de usuário e senha são obrigatórios.' });
  }

  let clienteDb;
  try {
    clienteDb = await pool.connect();
    const result = await clienteDb.query('SELECT id, nome, nome_usuario, email, senha, tipos, permissoes, nivel FROM usuarios WHERE nome_usuario = $1', [nomeUsuario]);
    const usuario = result.rows[0];

    if (!usuario) {
      // Usar uma mensagem genérica em produção é mais seguro
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // O payload do token contém as informações essenciais para identificar o usuário
    const payload = {
      id: usuario.id,
      nome_usuario: usuario.nome_usuario,
      nome: usuario.nome,
      tipos: usuario.tipos || [],
    };

    const token = jwt.sign(
      payload,
      SECRET_KEY,
      { expiresIn: '24h' }
    );

    // O frontend agora é responsável por pegar este token e fazer uma
    // chamada subsequente para /api/usuarios/me para obter os detalhes completos.
    res.status(200).json({ token });

  } catch (error) {
    console.error('[API /login] Erro durante o processo de login:', error);
    res.status(500).json({ error: 'Erro interno no servidor durante o login.' });
  } finally {
    if (clienteDb) {
      clienteDb.release();
    }
  }
});

// 4. Exporta o roteador para ser usado pelo api/index.js
export default router;