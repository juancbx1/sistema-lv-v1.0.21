import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const SECRET_KEY = process.env.JWT_SECRET;

const verificarToken = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new Error('Token não fornecido');
  return jwt.verify(token, SECRET_KEY);
};

export default async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const usuarioLogado = verificarToken(req);

    const result = await pool.query(
      'SELECT id, nome, nome_usuario, email, tipos, nivel, permissoes FROM usuarios WHERE id = $1',
      [usuarioLogado.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('[usuarios/me] Erro:', error);
    res.status(401).json({ error: 'Autenticação falhou ou erro no servidor' });
  }
};