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

function generateUniquePN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export default async function handler(req, res) {
  const { method, query, body } = req;

  try {
    const usuarioLogado = verificarToken(req);

    if (!usuarioLogado.permissoes.includes('acesso-ordens-de-producao') && !usuarioLogado.permissoes.includes('criar-op')) {
      return res.status(403).json({ error: 'Permissão negada' });
    }

    if (method === 'GET') {
      const status = query.status || 'pendente';
      if (!['pendente', 'cortados', 'verificado', 'usado'].includes(status)) {
        console.log('[api/cortes][GET] Status inválido:', status);
        return res.status(400).json({ error: 'Status inválido. Use "pendente", "cortados", "verificado" ou "usado".' });
      }
    
      console.log(`[api/cortes][GET] Buscando cortes com status: ${status}`);

      const colunasCortes = 'id, pn, produto, variante, quantidade, data, cortador, status, op';
      const result = await pool.query(
        `SELECT ${colunasCortes} FROM cortes WHERE status = $1 ORDER BY data DESC`, // Use a lista de colunas
                [status]
      );

      res.status(200).json(result.rows);

      console.log(`[api/cortes][GET] Retornando ${result.rows.length} cortes.`);

    } else if (method === 'POST') {
      console.log('[api/cortes] Processando POST...');
      if (!usuarioLogado.permissoes.includes('criar-op')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
      const { produto, variante, quantidade, data, cortador, status = 'pendente', op = null } = body;
      console.log('[api/cortes] Dados recebidos:', req.body);

      if (!produto || !variante || !quantidade || !data || !cortador) {
        return res.status(400).json({ error: 'Dados incompletos' });

      }

      const MAX_RETRIES = 5; // Define um número máximo de tentativas
      let insertedCorte = null;
      let pnGerado = null;
      for (let i = 0; i < MAX_RETRIES; i++) {
        pnGerado = Math.floor(1000 + Math.random() * 9000).toString(); // Gera um novo PN aleatório
        console.log(`[api/cortes][POST] Tentativa ${i + 1}: Gerado PN ${pnGerado}`);

        try {
          const result = await pool.query(
            `INSERT INTO cortes (pn, produto, variante, quantidade, data, cortador, status, op)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [pnGerado, produto, variante, quantidade, data, cortador, status, op || null]
          );

          insertedCorte = result.rows[0];
          console.log(`[api/cortes][POST] Lançamento salvo com PN ${pnGerado} na tentativa ${i + 1}.`);
          break; // Sai do loop se a inserção for bem-sucedida

        } catch (error) {
          if (error.code === '23505') {
            console.warn(`[api/cortes][POST] Colisão de PN detectada para ${pnGerado}. Tentando novamente...`);
            // Se for uma violação de unicidade, o loop continua para a próxima tentativa
            if (i === MAX_RETRIES - 1) {
              // Se chegou à última tentativa e ainda houve colisão, lança um erro fatal
              console.error(`[api/cortes][POST] Falha ao gerar PN único após ${MAX_RETRIES} tentativas.`);
              throw new Error('Não foi possível gerar um PN único.');
            }

          } else {
            // Se for outro tipo de erro, lança o erro imediatamente
            console.error(`[api/cortes][POST] Erro inesperado ao inserir corte:`, error);
            throw error;
          }
        }
      }

      if (!insertedCorte) {
         console.error('[api/cortes][POST] Lançamento falhou por motivo desconhecido após retentativas.');
         throw new Error('Falha ao criar lançamento de corte.');
      }

      res.status(201).json(insertedCorte);

    } else if (method === 'PUT') {
      if (!usuarioLogado.permissoes.includes('editar-op')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }

      const { id, status, cortador } = body; // Pegar o ID do body

      if (!id || (!status && !cortador)) {
        return res.status(400).json({ error: 'ID e status ou cortador são necessários' });
      }

      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      if (status) {
        updateFields.push(`status = $${paramCount}`);
        updateValues.push(status);
        paramCount++;
      }

      if (cortador) {
        updateFields.push(`cortador = $${paramCount}`);
        updateValues.push(cortador);
        paramCount++;
      }

      updateValues.push(id);

      const query = `
        UPDATE cortes 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount} RETURNING *`;

      const result = await pool.query(query, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Corte não encontrado' });
      }

      res.status(200).json(result.rows[0]);

    } else if (method === 'DELETE') {
      if (!usuarioLogado.permissoes.includes('excluir-registro-producao')) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
    
      const { id } = body; // Pegar o ID do body em vez de query
    
      if (!id) {
        return res.status(400).json({ error: 'ID não fornecido' });
      }
    
      const result = await pool.query(
        'DELETE FROM cortes WHERE id = $1 RETURNING *',
        [id]
      );
    
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Corte não encontrado' });
      }
    
      res.status(200).json({ message: 'Corte excluído com sucesso', id });

    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      res.status(405).end(`Método ${method} não permitido`);
    }

  } catch (error) {
    console.error('[cortes] Erro:', error);
    res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
  }
}