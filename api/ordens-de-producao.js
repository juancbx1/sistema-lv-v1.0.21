import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  timezone: 'UTC',
});

const SECRET_KEY = process.env.JWT_SECRET;

const verificarToken = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new Error('Token não fornecido');
  return jwt.verify(token, SECRET_KEY);
};

export default async function handler(req, res) {
  const { method, query } = req;

  try {
    const usuarioLogado = verificarToken(req);

    if (method === 'GET') {
      const fetchAll = query.all === 'true'; // Verifica se o parâmetro all=true foi passado
      if (fetchAll) {
        // Retorna todas as OPs sem paginação
        const result = await pool.query('SELECT * FROM ordens_de_producao ORDER BY numero DESC');
        res.status(200).json(result.rows);
      } else {
        // Retorna OPs paginadas
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;
        const offset = (page - 1) * limit;

        const result = await pool.query(
          'SELECT * FROM ordens_de_producao ORDER BY numero DESC LIMIT $1 OFFSET $2',
          [limit, offset]
        );

        const totalResult = await pool.query('SELECT COUNT(*) FROM ordens_de_producao');
        const total = parseInt(totalResult.rows[0].count);

        res.status(200).json({
          rows: result.rows,
          total: total,
          page: page,
          pages: Math.ceil(total / limit),
        });
      }
    } else if (method === 'POST') {
      if (!usuarioLogado.permissoes.includes('criar-op')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
      const { numero, produto, variante, quantidade, data_entrega, observacoes, status, etapas } = req.body;
      const editId = Date.now().toString();
      const result = await pool.query(
        `INSERT INTO ordens_de_producao (numero, produto, variante, quantidade, data_entrega, observacoes, status, edit_id, etapas)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [numero, produto, variante || null, quantidade, data_entrega, observacoes || '', status || 'em-aberto', editId, JSON.stringify(etapas || [])]
      );
      res.status(201).json(result.rows[0]);
    } else if (method === 'PUT') {
      if (!usuarioLogado.permissoes.includes('editar-op')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
      const { edit_id, numero, produto, variante, quantidade, data_entrega, observacoes, status, etapas, data_final } = req.body;
      const result = await pool.query(
        `UPDATE ordens_de_producao 
         SET numero = $1, produto = $2, variante = $3, quantidade = $4, data_entrega = $5, observacoes = $6, status = $7, etapas = $8, data_final = $9
         WHERE edit_id = $10 RETURNING *`,
        [numero, produto, variante || null, quantidade, data_entrega, observacoes || '', status, JSON.stringify(etapas), data_final || null, edit_id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ordem de produção não encontrada' });
      }
      res.status(200).json(result.rows[0]);
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT']);
      res.status(405).end(`Método ${method} não permitido`);
    }
  } catch (error) {
    console.error('[ordens-de-producao] Erro:', error);
    res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
  }
}