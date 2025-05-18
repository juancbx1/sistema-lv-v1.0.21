// api/cortes.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express'; // <<< ADICIONADO

const router = express.Router(); // <<< ADICIONADO
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// --- Sua função verificarToken (ou uma versão centralizada dela) ---
const verificarTokenOriginal = (reqOriginal) => {
    const token = reqOriginal.headers.authorization?.split(' ')[1];
    if (!token) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401;
        throw error;
    }
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};
// ---------------------------------------------------------------

// <<< ADICIONADO: Middleware para este router >>>
router.use(async (req, res, next) => {
     let cliente;
    try {
        console.log(`[router/cortes middleware] Iniciando. URL: ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenOriginal(req);
        console.log('[router/cortes middleware] Token verificado. Conectando ao banco...');
        cliente = await pool.connect();
        console.log('[router/cortes middleware] Conexão com o banco estabelecida.');
        req.dbCliente = cliente;
        next();
    } catch (error) {
        console.error('[router/cortes middleware] Erro CAPTURADO no middleware:', error.message, error.stack);
        if (cliente) {
            console.log('[router/cortes middleware] Liberando cliente do banco após erro no middleware.');
            cliente.release();
        }
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// GET /api/cortes
router.get('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        if (!usuarioLogado.permissoes.includes('acesso-ordens-de-producao') && !usuarioLogado.permissoes.includes('criar-op')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar cortes.' });
        }
        const status = req.query.status || 'pendente';
        if (!['pendente', 'cortados', 'verificado', 'usado'].includes(status)) {
            return res.status(400).json({ error: 'Status inválido. Use "pendente", "cortados", "verificado" ou "usado".' });
        }
        const result = await dbCliente.query(
            `SELECT id, pn, produto, variante, quantidade, data, cortador, status, op FROM cortes WHERE status = $1 ORDER BY data DESC`,
            [status]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/cortes GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar cortes', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/cortes
router.post('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        // Ajuste a permissão se 'criar-op' não for a mais adequada para criar um corte
        if (!usuarioLogado.permissoes.includes('criar-op') && !usuarioLogado.permissoes.includes('gerenciar-cortes')) { 
            return res.status(403).json({ error: 'Permissão negada para criar corte.' });
        }

        // Desestruturar o corpo da requisição, definindo defaults se aplicável
        const { 
            produto, 
            // 'variante' pode ser string vazia se o produto não tem variantes,
            // mas para a query, é melhor convertê-la para null se for vazia.
            variante: varianteInput, 
            quantidade, 
            data, 
            cortador: cortadorInput, // Renomeado para evitar conflito com a variável processada
            status = 'pendente',  // Default para 'pendente' se não fornecido
            op = null,            // Default para null se não fornecido
            pn: pnInput            // PN pode ser fornecido ou gerado
        } = req.body;

        // Validações dos campos obrigatórios principais
        if (!produto || quantidade === undefined || !data || !status) {
            return res.status(400).json({ error: 'Dados incompletos: produto, quantidade, data e status são obrigatórios.' });
        }

        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade deve ser um número positivo.' });
        }

        // Processamento da variante: converter string vazia para null
        const varianteFinal = (varianteInput === undefined || varianteInput === null || varianteInput.trim() === '') ? null : varianteInput.trim();

        // Processamento do cortador:
        // Só é obrigatório se o status NÃO for 'pendente'.
        // Se o status é 'pendente', aceitamos null ou o valor fornecido.
        let cortadorFinal = null; // Default para null se pendente e não fornecido
        if (status !== 'pendente') {
            if (!cortadorInput || String(cortadorInput).trim() === '') {
                return res.status(400).json({ error: 'Cortador é obrigatório para status diferente de "pendente".' });
            }
            cortadorFinal = String(cortadorInput).trim();
        } else {
            // Para status 'pendente', se cortadorInput for fornecido (e não apenas espaços), use-o.
            // Se for null, undefined, ou string vazia, cortadorFinal permanecerá null.
            if (cortadorInput && String(cortadorInput).trim() !== '') {
                cortadorFinal = String(cortadorInput).trim();
            }
            // Se no frontend você envia explicitamente cortador: "A definir", e quer que isso seja salvo:
            // if (cortadorInput === "A definir") {
            //     cortadorFinal = "A definir";
            // } else if (cortadorInput && String(cortadorInput).trim() !== '') {
            //    cortadorFinal = String(cortadorInput).trim();
            // } // Senão, permanece null
        }

        const MAX_RETRIES = 5;
        let insertedCorte = null;
        let pnGerado;

        if (pnInput && String(pnInput).trim() !== '') {
            pnGerado = String(pnInput).trim(); // Usa o PN fornecido se existir
             try {
                const result = await dbCliente.query(
                    `INSERT INTO cortes (pn, produto, variante, quantidade, data, cortador, status, op)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                    [pnGerado, produto, varianteFinal, parsedQuantidade, data, cortadorFinal, status, op]
                );
                insertedCorte = result.rows[0];
            } catch (error) {
                if (error.code === '23505' && error.constraint && error.constraint.endsWith('_pn_key')) { // Checa se a constraint do PN foi violada
                    console.error(`[router/cortes POST] PN fornecido "${pnGerado}" já existe.`);
                    // Não tenta gerar novo PN se um foi fornecido e falhou. Retorna erro.
                    return res.status(409).json({ error: `O PN "${pnGerado}" fornecido já está em uso.`, details: error.detail});
                }
                throw error; // Re-lança outros erros
            }
        } else {
            // Gera PN apenas se não foi fornecido
            for (let i = 0; i < MAX_RETRIES; i++) {
                    pnGerado = Math.floor(1000 + Math.random() * 9000).toString(); // SÓ O NÚMERO
                try {
                    const result = await dbCliente.query(
                        `INSERT INTO cortes (pn, produto, variante, quantidade, data, cortador, status, op)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                        [pnGerado, produto, varianteFinal, parsedQuantidade, data, cortadorFinal, status, op]
                    );
                    insertedCorte = result.rows[0];
                    break; // Sucesso, sai do loop
                } catch (error) {
                    if (error.code === '23505' && error.constraint && error.constraint.endsWith('_pn_key')) { 
                        console.warn(`[router/cortes POST] Colisão de PN gerado ${pnGerado}. Tentando novamente...`);
                        if (i === MAX_RETRIES - 1) {
                            // Log do erro antes de lançar a exceção final
                            console.error('[router/cortes POST] Falha ao gerar PN único após várias tentativas.', error);
                            throw new Error('Não foi possível gerar um PN único após várias tentativas.');
                        }
                    } else {
                        // Log do erro antes de lançar para ter mais detalhes
                        console.error('[router/cortes POST] Erro inesperado ao inserir corte:', error);
                        throw error; // Re-lança outros erros
                    }
                }
            }
        }

        if (!insertedCorte) {
            // Este log ajuda a entender por que insertedCorte pode ser nulo
            console.error('[router/cortes POST] Falha ao criar lançamento de corte. insertedCorte permaneceu nulo.');
            throw new Error('Falha ao criar lançamento de corte após retentativas (insertedCorte nulo).');
        }
        
        console.log('[router/cortes POST] Corte criado/salvo com sucesso:', insertedCorte);
        res.status(201).json(insertedCorte);

    } catch (error) {
        // Logs mais detalhados no catch principal
        console.error('[router/cortes POST] Erro pego no catch principal:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            stack: error.stack // Útil para depuração mais profunda
        });

        if (error.message.includes('PN único') || (error.constraint && error.constraint.endsWith('_pn_key'))) {
            res.status(500).json({ error: error.message, details: "Falha ao gerar/utilizar PN para o corte." });
        } else if (error.code === '23505') { // Outras violações de constraint unique
            res.status(409).json({ error: 'Erro de conflito ao criar corte.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro interno ao criar o corte.', details: error.message });
        }
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// PUT /api/cortes (ID no corpo)
router.put('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        // Ajuste a permissão conforme necessário, pode ser 'editar-op' ou 'gerenciar-cortes'
        if (!usuarioLogado.permissoes.includes('editar-op')) {
            return res.status(403).json({ error: 'Permissão negada para atualizar corte.' });
        }
        const { id, status, cortador, op, quantidade, produto, variante } = req.body; // Adicionado op, quantidade, produto, variante
        if (!id) {
            return res.status(400).json({ error: 'ID do corte é obrigatório para atualização.' });
        }

        const fieldsToUpdate = [];
        const updateValues = [];
        let paramCount = 1;

        if (status !== undefined) { fieldsToUpdate.push(`status = $${paramCount++}`); updateValues.push(status); }
        if (cortador !== undefined) { fieldsToUpdate.push(`cortador = $${paramCount++}`); updateValues.push(cortador); }
        if (op !== undefined) { fieldsToUpdate.push(`op = $${paramCount++}`); updateValues.push(op); }
        if (quantidade !== undefined) { fieldsToUpdate.push(`quantidade = $${paramCount++}`); updateValues.push(quantidade); }
        if (produto !== undefined) { fieldsToUpdate.push(`produto = $${paramCount++}`); updateValues.push(produto); }
        if (variante !== undefined) { fieldsToUpdate.push(`variante = $${paramCount++}`); updateValues.push(variante); }


        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'Nenhum campo fornecido para atualização.' });
        }
        updateValues.push(id); // ID para a cláusula WHERE
        const queryText = `UPDATE cortes SET ${fieldsToUpdate.join(', ')}, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;
        
        const result = await dbCliente.query(queryText, updateValues);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corte não encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[router/cortes PUT] Erro:', error);
        res.status(500).json({ error: 'Erro ao atualizar corte', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// DELETE /api/cortes (ID no corpo)
router.delete('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        // Ajuste a permissão, pode ser 'excluir-registro-producao' ou 'gerenciar-cortes'
        if (!usuarioLogado.permissoes.includes('excluir-registro-producao')) { // Exemplo, ajuste se necessário
            return res.status(403).json({ error: 'Permissão negada para excluir corte.' });
        }
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'ID do corte é obrigatório para exclusão.' });
        }
        const result = await dbCliente.query('DELETE FROM cortes WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Corte não encontrado.' });
        }
        res.status(200).json({ message: 'Corte excluído com sucesso.', id: result.rows[0].id });
    } catch (error) {
        console.error('[router/cortes DELETE] Erro:', error);
        res.status(500).json({ error: 'Erro ao excluir corte', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router; // <<< EXPORTAR O ROUTER