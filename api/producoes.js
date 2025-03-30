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
      console.log('[api/producoes] Dados recebidos:', req.body);
      console.log('[api/producoes] Usuário logado:', usuarioLogado);
  
      const { id, quantidade, edicoes, editadoPorAdmin, assinada } = req.body;
  
      if (!id || (quantidade === undefined && assinada === undefined) || edicoes === undefined) {
          console.log('[api/producoes] Erro: Dados incompletos');
          return res.status(400).json({ error: 'Dados incompletos' });
      }
  
      const checkResult = await pool.query('SELECT * FROM producoes WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
          console.log('[api/producoes] Erro: Produção não encontrada para ID:', id);
          return res.status(404).json({ error: 'Produção não encontrada' });
      }
  
      const producao = checkResult.rows[0];
      console.log('[api/producoes] Produção encontrada:', producao);
  
      // Verificar permissões
      const isCostureira = usuarioLogado.tipos.includes('costureira');
      const isOwner = producao.funcionario === usuarioLogado.nome;
      const onlySigning = quantidade === undefined && assinada !== undefined && edicoes === producao.edicoes && editadoPorAdmin === undefined;
  
      console.log('[api/producoes] Verificando permissões:');
      console.log('[api/producoes] - É costureira:', isCostureira);
      console.log('[api/producoes] - É dono da produção:', isOwner);
      console.log('[api/producoes] - Apenas assinando:', onlySigning);
      console.log('[api/producoes] - Tem editar-registro-producao:', usuarioLogado.permissoes.includes('editar-registro-producao'));
  
      if (!usuarioLogado.permissoes.includes('editar-registro-producao') && !(isCostureira && isOwner && onlySigning)) {
          console.log('[api/producoes] Permissão negada para usuário:', usuarioLogado.nome);
          return res.status(403).json({ error: 'Permissão negada' });
      }
  
      const result = await pool.query(
          `UPDATE producoes 
           SET quantidade = COALESCE($1, quantidade), 
               edicoes = $2, 
               editado_por_admin = COALESCE($3, editado_por_admin),
               assinada = COALESCE($4, assinada)
           WHERE id = $5 RETURNING *`,
          [quantidade, edicoes, editadoPorAdmin || null, assinada, id]
      );
  
      console.log('[api/producoes] Produção atualizada:', result.rows[0]);
      res.status(200).json(result.rows[0]);

    } else if (method === 'DELETE') {
      console.log('[api/producoes] Processando DELETE...');
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