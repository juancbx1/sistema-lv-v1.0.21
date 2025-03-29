import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

console.log('POSTGRES_URL:', process.env.POSTGRES_URL); // Adicionar log para debug

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const SECRET_KEY = process.env.JWT_SECRET;
console.log('[api/login] SECRET_KEY:', SECRET_KEY); // Adicionar log


export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { nomeUsuario, senha } = req.body;

  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE nome_usuario = $1', [nomeUsuario]);
    const usuario = result.rows[0];

    if (!usuario) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nomeUsuario: usuario.nome_usuario,
        tipos: usuario.tipos,
        permissoes: usuario.permissoes,
      },
      SECRET_KEY,
      { expiresIn: '24h' }
    );

    res.status(200).json({ token });
  } catch (error) {
    console.error('[login] Erro:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
};