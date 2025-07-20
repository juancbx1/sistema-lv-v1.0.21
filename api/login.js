// api/login.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  // Considere adicionar configurações de SSL se o NeonDB exigir e não estiver globalmente configurado
  // ssl: {
  //   rejectUnauthorized: false // Ou true, dependendo da configuração do NeonDB
  // }
});

const SECRET_KEY = process.env.JWT_SECRET;

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { nomeUsuario, senha } = req.body;

  if (!nomeUsuario || !senha) {
    return res.status(400).json({ error: 'Nome de usuário e senha são obrigatórios.' });
  }

  let clienteDb; // Variável para o cliente do pool

  try {
    clienteDb = await pool.connect(); // Pega uma conexão do pool
    const result = await clienteDb.query('SELECT id, nome, nome_usuario, email, senha, tipos, permissoes, nivel FROM usuarios WHERE nome_usuario = $1', [nomeUsuario]);
    const usuario = result.rows[0];

    if (!usuario) {
      console.log(`[api/login] Usuário não encontrado: ${nomeUsuario}`);
      return res.status(401).json({ error: 'Usuário não encontrado ou senha incorreta.' }); // Mensagem mais genérica por segurança
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Usuário não encontrado ou senha incorreta.' });
    }

    const payload = {
      id: usuario.id,
      nome_usuario: usuario.nome_usuario, // Mantido para compatibilidade, se usado em outro lugar
      nome: usuario.nome,
      tipos: usuario.tipos || [],

      permissoes_individuais: usuario.permissoes || [], // Renomeado para clareza, se você mantiver
    };

    const token = jwt.sign(
      payload,
      SECRET_KEY,
      { expiresIn: '24h' } // 24 horas de validade
    );

    // Não retornamos o objeto usuário completo aqui, apenas o token.
    // O frontend fará uma chamada a /api/usuarios/me para obter os detalhes do usuário
    // e lá as permissões completas serão calculadas e retornadas.
    res.status(200).json({ token });

  } catch (error) {
    console.error('[api/login] Erro durante o processo de login:', error.message, error.stack ? error.stack.substring(0, 300) : '');
    res.status(500).json({ error: 'Erro interno no servidor durante o login.' });
  } finally {
    if (clienteDb) {
      clienteDb.release(); // Libera a conexão de volta para o pool
      console.log('[api/login] Conexão com DB liberada.');
    }
  }
};