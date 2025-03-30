import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

console.log('[api/producoes] Iniciando carregamento do módulo...');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  timezone: 'UTC', // Mantém o fuso horário como UTC para consistência
});

const SECRET_KEY = process.env.JWT_SECRET;
console.log('[api/producoes] SECRET_KEY:', SECRET_KEY);

// Função para verificar o token JWT
const verificarToken = (req) => {
  console.log('[verificarToken] Cabeçalhos recebidos:', req.headers);
  const token = req.headers.authorization?.split(' ')[1];
  console.log('[verificarToken] Token extraído:', token);
  if (!token) throw new Error('Token não fornecido');
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log('[verificarToken] Token decodificado:', decoded);
    return decoded;
  } catch (error) {
    console.error('[verificarToken] Erro ao verificar token:', error.message);
    throw error;
  }
};

export default async function handler(req, res) {
  console.log('[api/producoes] Requisição recebida:', req.method, req.url);
  const { method } = req;

  try {
    const usuarioLogado = verificarToken(req);
    console.log('[api/producoes] Usuário logado:', usuarioLogado);

    if (method === 'POST') {
      console.log('[api/producoes] Processando POST...');
      if (!usuarioLogado.permissoes.includes('lancar-producao')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
    
      const { id, opNumero, etapaIndex, processo, produto, variacao, maquina, quantidade, funcionario, data, lancadoPor } = req.body;
      console.log('[api/producoes] Dados recebidos:', req.body);
      console.log('[api/producoes] Valor de id:', id);
    
      if (!id) {
        throw new Error('ID não fornecido no corpo da requisição');
      }
    
      if (!opNumero || etapaIndex === undefined || !processo || !produto || !variacao || !maquina || !quantidade || !funcionario || !data || !lancadoPor) {
        return res.status(400).json({ error: 'Dados incompletos' });
      }
    
      console.log('[api/producoes] Data recebida (antes da conversão):', data);
      const dataLocal = data.replace('T', ' ') + ' -03:00';
      console.log('[api/producoes] Data com fuso horário:', dataLocal);
    
      const result = await pool.query(
        `INSERT INTO producoes (id, op_numero, etapa_index, processo, produto, variacao, maquina, quantidade, funcionario, data, lancado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [id, opNumero, etapaIndex, processo, produto, variacao, maquina, quantidade, funcionario, dataLocal, lancadoPor]
      );
    
      res.status(201).json({ ...result.rows[0], id });

    } else if (method === 'GET') {
      console.log('[api/producoes] Processando GET...');
      if (!usuarioLogado.permissoes.includes('acesso-gerenciar-producao') && !usuarioLogado.tipos.includes('costureira')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }

      const query = usuarioLogado.tipos.includes('costureira') && !usuarioLogado.permissoes.includes('acesso-gerenciar-producao')
        ? 'SELECT * FROM producoes WHERE funcionario = $1 ORDER BY data DESC'
        : 'SELECT * FROM producoes ORDER BY data DESC';
      const result = await pool.query(query, usuarioLogado.tipos.includes('costureira') && !usuarioLogado.permissoes.includes('acesso-gerenciar-producao') ? [usuarioLogado.nome] : []);
      console.log('[api/producoes] Resultado da query:', result.rows);
      res.status(200).json(result.rows);

    } else if (method === 'PUT') {
      console.log('[api/producoes] Processando PUT...');
      const { id, quantidade, edicoes, assinada } = req.body;
      console.log('[api/produces] Dados recebidos:', req.body);

      if (!id || (quantidade === undefined && assinada === undefined) || edicoes === undefined) {
        return res.status(400).json({ error: 'Dados incompletos' });
      }

      // Verificar se a produção existe
      const checkResult = await pool.query('SELECT * FROM producoes WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Produção não encontrada' });
      }

      const producao = checkResult.rows[0];

      // Verificar permissões: costureiras só podem assinar suas próprias produções
      const isCostureira = usuarioLogado.tipos.includes('costureira');
      const isOwner = producao.funcionario === usuarioLogado.nome;
      const onlySigning = quantidade === undefined && assinada !== undefined;

      if (!usuarioLogado.permissoes.includes('editar-registro-producao') && !(isCostureira && isOwner && onlySigning)) {
        return res.status(403).json({ error: 'Permissão negada' });
      }

      // Atualizar a produção
      const result = await pool.query(
        `UPDATE producoes 
         SET quantidade = COALESCE($1, quantidade), 
             edicoes = $2, 
             assinada = COALESCE($3, assinada)
         WHERE id = $4 RETURNING *`,
        [quantidade, edicoes, assinada, id]
      );

      console.log('[api/producoes] Produção atualizada:', result.rows[0]);
      res.status(200).json(result.rows[0]);

    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      res.status(405).end(`Método ${method} não permitido`);
    }
  } catch (error) {
    console.error('[api/producoes] Erro detalhado:', {
      message: error.message,
      stack: error.stack,
      data: req.body,
    });
    res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
  }
}