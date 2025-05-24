// api/cortes.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Sua função verificarToken (mantenha como está, ou centralize se preferir)
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

// Middleware para este router: Adquire a conexão e verifica o token
router.use(async (req, res, next) => {
    try {
        console.log(`[router/cortes middleware] Iniciando. URL: ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenOriginal(req); // Verifica o token e anexa o usuário
        console.log('[router/cortes middleware] Token verificado. Conectando ao banco...');
        req.dbClient = await pool.connect(); // Adquire a conexão do pool e anexa a req.dbClient
        console.log('[router/cortes middleware] Conexão com o banco estabelecida.');
        next(); // Prossegue para a rota específica (GET, POST, etc.)
    } catch (error) {
        console.error('[router/cortes middleware] Erro CAPTURADO no middleware:', error.message, error.stack);
        // Se a conexão foi estabelecida antes do erro no middleware, ela deve ser liberada aqui
        if (req.dbClient) {
            console.log('[router/cortes middleware] Liberando cliente do banco após erro no middleware.');
            req.dbClient.release();
        }
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
    // REMOVIDO: O bloco 'finally' global do middleware que liberava o cliente muito cedo.
});

// GET /api/cortes
router.get('/', async (req, res) => {
    const { usuarioLogado, dbClient } = req; // dbClient agora está disponível aqui
    try {
        if (!usuarioLogado.permissoes.includes('acesso-ordens-de-producao') && !usuarioLogado.permissoes.includes('criar-op')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar cortes.' });
        }
        const status = req.query.status || 'pendente';
        if (!['pendente', 'cortados', 'verificado', 'usado'].includes(status)) {
            return res.status(400).json({ error: 'Status inválido. Use "pendente", "cortados", "verificado" ou "usado".' });
        }
        const result = await dbClient.query(
            `SELECT id, pn, produto, variante, quantidade, data, cortador, status, op FROM cortes WHERE status = $1 ORDER BY data DESC`,
            [status]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/cortes GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar cortes', details: error.message });
    } finally {
        // LIBERA O CLIENTE DO BANCO AO FINAL DA REQUISIÇÃO, SUCESSO OU ERRO
        if (dbClient) dbClient.release();
    }
});

// POST /api/cortes
router.post('/', async (req, res) => {
    const { usuarioLogado, dbClient } = req;
    try {
        // Permissão para registrar corte
        if (!usuarioLogado.permissoes.includes('registrar-corte')) {
            return res.status(403).json({ error: 'Permissão negada para registrar corte.' });
        }

        const {
            produto,
            variante: varianteInput,
            quantidade,
            data,
            cortador: cortadorInput,
            status = 'pendente',
            op = null,
            pn: pnInput
        } = req.body;

        if (!produto || quantidade === undefined || !data || !status) {
            return res.status(400).json({ error: 'Dados incompletos: produto, quantidade, data e status são obrigatórios.' });
        }

        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade deve ser um número positivo.' });
        }

        const varianteFinal = (varianteInput === undefined || varianteInput === null || varianteInput.trim() === '') ? null : varianteInput.trim();

        let cortadorFinal = null;
        if (status !== 'pendente') {
            if (!cortadorInput || String(cortadorInput).trim() === '') {
                return res.status(400).json({ error: 'Cortador é obrigatório para status diferente de "pendente".' });
            }
            cortadorFinal = String(cortadorInput).trim();
        } else {
            if (cortadorInput && String(cortadorInput).trim() !== '') {
                cortadorFinal = String(cortadorInput).trim();
            }
        }

        const MAX_RETRIES = 5;
        let insertedCorte = null;
        let pnGerado;

        if (pnInput && String(pnInput).trim() !== '') {
            pnGerado = String(pnInput).trim();
            try {
                const result = await dbClient.query(
                    `INSERT INTO cortes (pn, produto, variante, quantidade, data, cortador, status, op)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                    [pnGerado, produto, varianteFinal, parsedQuantidade, data, cortadorFinal, status, op]
                );
                insertedCorte = result.rows[0];
            } catch (error) {
                if (error.code === '23505' && error.constraint && error.constraint.endsWith('_pn_key')) {
                    console.error(`[router/cortes POST] PN fornecido "${pnGerado}" já existe.`);
                    return res.status(409).json({ error: `O PN "${pnGerado}" fornecido já está em uso.`, details: error.detail});
                }
                throw error;
            }
        } else {
            for (let i = 0; i < MAX_RETRIES; i++) {
                pnGerado = Math.floor(1000 + Math.random() * 9000).toString();
                try {
                    const result = await dbClient.query(
                        `INSERT INTO cortes (pn, produto, variante, quantidade, data, cortador, status, op)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                        [pnGerado, produto, varianteFinal, parsedQuantidade, data, cortadorFinal, status, op]
                    );
                    insertedCorte = result.rows[0];
                    break;
                } catch (error) {
                    if (error.code === '23505' && error.constraint && error.constraint.endsWith('_pn_key')) {
                        console.warn(`[router/cortes POST] Colisão de PN gerado ${pnGerado}. Tentando novamente...`);
                        if (i === MAX_RETRIES - 1) {
                            console.error('[router/cortes POST] Falha ao gerar PN único após várias tentativas.', error);
                            throw new Error('Não foi possível gerar um PN único após várias tentativas.');
                        }
                    } else {
                        console.error('[router/cortes POST] Erro inesperado ao inserir corte:', error);
                        throw error;
                    }
                }
            }
        }

        if (!insertedCorte) {
            console.error('[router/cortes POST] Falha ao criar lançamento de corte. insertedCorte permaneceu nulo.');
            throw new Error('Falha ao criar lançamento de corte após retentativas (insertedCorte nulo).');
        }

        console.log('[router/cortes POST] Corte criado/salvo com sucesso:', insertedCorte);
        res.status(201).json(insertedCorte);

    } catch (error) {
        console.error('[router/cortes POST] Erro pego no catch principal:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            stack: error.stack
        });
        if (error.message.includes('PN único') || (error.constraint && error.constraint.endsWith('_pn_key'))) {
            res.status(500).json({ error: error.message, details: "Falha ao gerar/utilizar PN para o corte." });
        } else if (error.code === '23505') {
            res.status(409).json({ error: 'Erro de conflito ao criar corte.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro interno ao criar o corte.', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release(); // LIBERA O CLIENTE AQUI
    }
});

// PUT /api/cortes (ID no corpo)
router.put('/', async (req, res) => {
    const { usuarioLogado, dbClient } = req;
    try {
        const { id, status, cortador, op, quantidade, produto, variante } = req.body;

        // Permissão para marcar como cortado/verificado/usado
        if (['cortados', 'verificado', 'usado'].includes(status) && !usuarioLogado.permissoes.includes('marcar-como-cortado')) {
            return res.status(403).json({ error: 'Permissão negada para marcar cortes como realizados.' });
        }
        // Permissão geral para editar corte (se não for a ação de marcar como cortado)
        // Você pode adicionar uma permissão como 'editar-corte' aqui se necessário.
        // Por enquanto, mantenha 'editar-op' como fallback se não houver 'marcar-como-cortado'
        if (!usuarioLogado.permissoes.includes('editar-op') && !usuarioLogado.permissoes.includes('marcar-como-cortado')) {
             return res.status(403).json({ error: 'Permissão negada para atualizar corte.' });
        }

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
        updateValues.push(id);
        const queryText = `UPDATE cortes SET ${fieldsToUpdate.join(', ')}, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

        const result = await dbClient.query(queryText, updateValues);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corte não encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[router/cortes PUT] Erro:', error);
        res.status(500).json({ error: 'Erro ao atualizar corte', details: error.message });
    } finally {
        if (dbClient) dbClient.release(); // LIBERA O CLIENTE AQUI
    }
});

// DELETE /api/cortes (ID no corpo)
router.delete('/', async (req, res) => {
    const { usuarioLogado, dbClient } = req;
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'ID do corte é obrigatório para exclusão.' });
        }

         const checkCorteResult = await dbClient.query('SELECT status FROM cortes WHERE id = $1', [id]);
        if (checkCorteResult.rows.length === 0) {
            return res.status(404).json({ error: 'Corte não encontrado para exclusão.' });
        }
        const corteStatus = checkCorteResult.rows[0].status;

        let allowed = false;
        if (corteStatus === 'pendente' && usuarioLogado.permissoes.includes('excluir-corte-pendente')) {
            allowed = true;
        } else if (corteStatus === 'cortados' && usuarioLogado.permissoes.includes('excluir-estoque-corte')) {
            allowed = true;
        } else if (corteStatus === 'usado' && usuarioLogado.permissoes.includes('excluir-corte-usado')) { // Se existir
            allowed = true;
        } else if (usuarioLogado.permissoes.includes('gerenciar-cortes-geral')) { // Permissão 'super' para cortes
            allowed = true;
        }

        if (!allowed) {
            return res.status(403).json({ error: 'Permissão negada para excluir este corte (status:' + corteStatus + ').' });
        }
        const result = await dbClient.query('DELETE FROM cortes WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Corte não encontrado após verificação.' });
        }
        res.status(200).json({ message: 'Corte excluído com sucesso.', id: result.rows[0].id });
    } catch (error) {
        console.error('[router/cortes DELETE] Erro:', error);
        res.status(500).json({ error: 'Erro ao excluir corte', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;