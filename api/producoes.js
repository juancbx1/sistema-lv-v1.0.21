import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

console.log('[api/producoes] Iniciando carregamento do módulo...'); // Log inicial

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const SECRET_KEY = process.env.JWT_SECRET;
console.log('[api/producoes] SECRET_KEY:', SECRET_KEY); // Log do SECRET_KEY

// Função para verificar o token JWT
const verificarToken = (req) => {
  console.log('[verificarToken] Cabeçalhos recebidos:', req.headers); // Log dos cabeçalhos
  const token = req.headers.authorization?.split(' ')[1];
  console.log('[verificarToken] Token extraído:', token); // Log do token
  if (!token) throw new Error('Token não fornecido');
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log('[verificarToken] Token decodificado:', decoded); // Log do token decodificado
    return decoded;
  } catch (error) {
    console.error('[verificarToken] Erro ao verificar token:', error.message); // Log do erro
    throw error;
  }
};

export default async function handler(req, res) {
  console.log('[api/producoes] Requisição recebida:', req.method, req.url); // Log da requisição
  const { method } = req;

  try {
    const usuarioLogado = verificarToken(req);
    console.log('[api/producoes] Usuário logado:', usuarioLogado);

    if (method === 'POST') {
      console.log('[api/producoes] Processando POST...');
      if (!usuarioLogado.permissoes.includes('lancar-producao')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }

      const { opNumero, etapaIndex, processo, produto, variacao, maquina, quantidade, funcionario, data, lancadoPor } = req.body;
      console.log('[api/producoes] Dados recebidos:', req.body);

      if (!opNumero || etapaIndex === undefined || !processo || !produto || !variacao || !maquina || !quantidade || !funcionario || !data || !lancadoPor) {
        return res.status(400).json({ error: 'Dados incompletos' });
      }

      const id = Date.now().toString();

      const result = await pool.query(
        `INSERT INTO producoes (id, op_numero, etapa_index, processo, produto, variacao, maquina, quantidade, funcionario, data, lancado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [id, opNumero, etapaIndex, processo, produto, variacao, maquina, quantidade, funcionario, data, lancadoPor]
      );

      res.status(201).json({ ...result.rows[0], id });

      
    } else if (method === 'GET') {
      console.log('[api/producoes] Processando GET...');
      if (!usuarioLogado.permissoes.includes('acesso-gerenciar-producao')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }

      const result = await pool.query('SELECT * FROM producoes ORDER BY data DESC');
      res.status(200).json(result.rows);
    } else if (method === 'PUT') {
      console.log('[api/produces] Processando PUT...');
      if (!usuarioLogado.permissoes.includes('editar-registro-producao')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }

      const { id, quantidade, edicoes, editadoPorAdmin } = req.body;

      if (!id || !quantidade || edicoes === undefined) {
        return res.status(400).json({ error: 'Dados incompletos' });
      }

      const checkResult = await pool.query('SELECT * FROM producoes WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Produção não encontrada' });
      }

      const result = await pool.query(
        `UPDATE producoes 
         SET quantidade = $1, edicoes = $2, editado_por_admin = $3
         WHERE id = $4 RETURNING *`,
        [quantidade, edicoes, editadoPorAdmin || null, id]
      );

      res.status(200).json(result.rows[0]);
    } else if (method === 'DELETE') {
      console.log('[api/produces] Processando DELETE...');
      if (!usuarioLogado.permissoes.includes('excluir-registro-producao')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }

      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'ID da produção não fornecido' });
      }

      const checkResult = await pool.query('SELECT * FROM producoes WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Produção não encontrada' });
      }

      const result = await pool.query(
        'DELETE FROM producoes WHERE id = $1 RETURNING *',
        [id]
      );

      res.status(200).json(result.rows[0]);
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      res.status(405).end(`Método ${method} não permitido`);
    }
  } catch (error) {
    console.error('[api/producoes] Erro:', error);
    res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
  }
}