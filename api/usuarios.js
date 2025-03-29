import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

console.log('POSTGRES_URL:', process.env.POSTGRES_URL);

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
  try {
    const usuarioLogado = verificarToken(req);
    const urlPath = req.url.split('?')[0]; // Remove query params, se houver

    if (req.method === 'GET' && urlPath === '/api/usuarios/me') {
      const result = await pool.query(
        'SELECT id, nome, nome_usuario, email, tipos, nivel, permissoes FROM usuarios WHERE id = $1',
        [usuarioLogado.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }
      res.status(200).json(result.rows[0]);
    } else if (req.method === 'GET' && urlPath === '/api/usuarios') {
      const result = await pool.query('SELECT id, nome, nome_usuario, email, tipos, nivel, permissoes FROM usuarios');
      res.status(200).json(result.rows);
    } else if (req.method === 'POST' && urlPath === '/api/usuarios') {
      if (!usuarioLogado.permissoes.includes('acesso-cadastrar-usuarios')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
      const { nome, nomeUsuario, email, senha, tipos, nivel } = req.body;
      const senhaHash = await bcrypt.hash(senha, 10);
      const result = await pool.query(
        'INSERT INTO usuarios (nome, nome_usuario, email, senha, tipos, nivel, permissoes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [nome, nomeUsuario, email, senhaHash, tipos, nivel || null, []]
      );
      res.status(201).json(result.rows[0]);
    } else if (req.method === 'PUT' && urlPath === '/api/usuarios') {
      if (!usuarioLogado.permissoes.includes('editar-usuarios')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
      const { id, nomeUsuario, nivel } = req.body;
      const result = await pool.query(
        'UPDATE usuarios SET nome_usuario = $1, nivel = $2 WHERE id = $3 RETURNING *',
        [nomeUsuario, nivel || null, id]
      );
      res.status(200).json(result.rows[0]);
    } else if (req.method === 'PUT' && urlPath === '/api/usuarios/batch') {
      // Nova rota para atualizar permissões em lote
      if (!usuarioLogado.permissoes.includes('gerenciar-permissoes')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
      const usuarios = req.body; // Espera um array de { id, permissoes }
      if (!Array.isArray(usuarios) || usuarios.length === 0) {
        return res.status(400).json({ error: 'Corpo da requisição inválido: esperado um array de usuários' });
      }

      // Usar uma transação para garantir consistência
      await pool.query('BEGIN');
      try {
        for (const usuario of usuarios) {
          const { id, permissoes } = usuario;
          if (!id || !Array.isArray(permissoes)) {
            throw new Error('Formato inválido: id ou permissoes ausentes/inválidos');
          }
          await pool.query(
            'UPDATE usuarios SET permissoes = $1 WHERE id = $2',
            [permissoes, id]
          );
        }
        await pool.query('COMMIT');
        res.status(200).json({ message: 'Permissões atualizadas com sucesso' });
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[usuarios/batch] Erro ao atualizar permissões:', error);
        res.status(500).json({ error: 'Erro ao salvar permissões' });
      }
    } else if (req.method === 'DELETE' && urlPath === '/api/usuarios') {
      if (!usuarioLogado.permissoes.includes('excluir-usuarios')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
      const { id } = req.body;
      await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
      res.status(204).end();
    } else {
      res.status(405).json({ error: 'Método não permitido ou endpoint inválido' });
    }
  } catch (error) {
    console.error('[usuarios] Erro:', error);
    res.status(401).json({ error: 'Autenticação falhou ou erro no servidor' });
  }
};