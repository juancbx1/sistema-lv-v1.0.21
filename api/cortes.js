// api/cortes.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importar a função de buscar permissões completas
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Verifique o caminho

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarTokenOriginal (mantenha a sua ou use uma centralizada)
const verificarTokenOriginal = (reqOriginal) => {
    const token = reqOriginal.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Token não fornecido');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // console.log('[api/cortes - verificarTokenOriginal] Token decodificado:', decoded);
        return decoded;
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
router.use(async (req, res, next) => {
    try {
        // console.log(`[router/cortes MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenOriginal(req);
        next();
    } catch (error) {
        console.error('[router/cortes MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/cortes
router.get('/', async (req, res) => {
    const { usuarioLogado } = req; // Do token
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API Cortes GET /] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        // Permissão para visualizar cortes (geralmente quem acessa OPs ou cria OPs precisa ver cortes)
        // Ajuste estas permissões conforme sua lógica de negócios
        if (!permissoesCompletas.includes('acesso-ordens-de-producao') && 
            !permissoesCompletas.includes('criar-op') &&
            !permissoesCompletas.includes('registrar-corte')) { // Adicionar permissão de quem registra corte
            return res.status(403).json({ error: 'Permissão negada para visualizar cortes.' });
        }

        const status = req.query.status || 'pendente'; // Default para pendente se não especificado
        if (!['pendente', 'cortados', 'verificado', 'usado'].includes(status)) {
            return res.status(400).json({ error: 'Status inválido. Use "pendente", "cortados", "verificado" ou "usado".' });
        }
        
        const result = await dbClient.query(
            `SELECT id, pn, produto, variante, quantidade, data, cortador, status, op FROM cortes WHERE status = $1 ORDER BY data DESC, id DESC`, // Adicionado id DESC para desempate
            [status]
        );
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/cortes GET] Erro:', error.message, error.stack ? error.stack.substring(0, 500) : "");
        res.status(500).json({ error: 'Erro ao buscar cortes', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/cortes
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoesCompletas.includes('registrar-corte')) {
            return res.status(403).json({ error: 'Permissão negada para registrar corte.' });
        }

        // Sua lógica de POST original aqui, usando 'dbClient'
        const {
            produto, variante: varianteInput, quantidade, data,
            cortador: cortadorInput, status = 'pendente', // status default se não vier
            op = null, pn: pnInput
        } = req.body;

        if (!produto || quantidade === undefined || !data || !status) {
            return res.status(400).json({ error: 'Dados incompletos: produto, quantidade, data e status são obrigatórios.' });
        }
        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade deve ser um número positivo.' });
        }
        const varianteFinal = (varianteInput === undefined || varianteInput === null || String(varianteInput).trim() === '') ? null : String(varianteInput).trim();
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
                        if (i === MAX_RETRIES - 1) {
                            throw new Error('Não foi possível gerar um PN único após várias tentativas.');
                        }
                    } else {
                        throw error;
                    }
                }
            }
        }
        if (!insertedCorte) {
            throw new Error('Falha ao criar lançamento de corte após retentativas.');
        }
        res.status(201).json(insertedCorte);

    } catch (error) {
        console.error('[router/cortes POST] Erro:', error.message, error.stack ? error.stack.substring(0,500) : "");
        if (error.message.includes('PN único')) {
            res.status(500).json({ error: error.message });
        } else if (error.code === '23505') {
            res.status(409).json({ error: 'Erro de conflito ao criar corte.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro interno ao criar o corte.', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/cortes
router.put('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        const { id, status, cortador, op, quantidade, produto, variante } = req.body;

        // Lógica de permissão para diferentes ações no PUT
        let permissaoConcedida = false;
        if (['cortados', 'verificado', 'usado'].includes(status) && permissoesCompletas.includes('marcar-como-cortado')) {
            permissaoConcedida = true;
        } else if (permissoesCompletas.includes('editar-op')) { // Permissão genérica para outras edições de corte
            permissaoConcedida = true;
        } else if (permissoesCompletas.includes('editar-corte')) { // Se você tiver uma permissão mais específica
             permissaoConcedida = true;
        }
        // Adicione mais 'else if' para outras permissões de edição de corte se necessário

        if (!permissaoConcedida) {
            return res.status(403).json({ error: 'Permissão negada para atualizar este corte ou seu status.' });
        }

        // Sua lógica de PUT original aqui, usando 'dbClient'
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
        if (variante !== undefined) { fieldsToUpdate.push(`variante = $${paramCount++}`); updateValues.push(variante === '' ? null : variante); } // Trata variante vazia como null

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'Nenhum campo fornecido para atualização.' });
        }
        updateValues.push(id); // Para o WHERE id = $X
        const queryText = `UPDATE cortes SET ${fieldsToUpdate.join(', ')}, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

        const result = await dbClient.query(queryText, updateValues);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corte não encontrado.' });
        }
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error('[router/cortes PUT] Erro:', error.message, error.stack ? error.stack.substring(0,500) : "");
        res.status(500).json({ error: 'Erro ao atualizar corte', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/cortes
router.delete('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
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
        if (corteStatus === 'pendente' && permissoesCompletas.includes('excluir-corte-pendente')) {
            allowed = true;
        } else if (corteStatus === 'cortados' && permissoesCompletas.includes('excluir-estoque-corte')) {
            allowed = true;
        } else if (corteStatus === 'usado' && permissoesCompletas.includes('excluir-corte-usado')) {
            allowed = true;
        } else if (permissoesCompletas.includes('gerenciar-cortes-geral')) { 
            allowed = true;
        }

        if (!allowed) {
            return res.status(403).json({ error: `Permissão negada para excluir este corte (status: ${corteStatus}).` });
        }
        const result = await dbClient.query('DELETE FROM cortes WHERE id = $1 RETURNING id', [id]);
        // rowCount é mais confiável para DELETE/UPDATE do que result.rows.length se RETURNING não for sempre usado ou se a linha não existir
        if (result.rowCount === 0) { 
            return res.status(404).json({ error: 'Corte não encontrado (ou já excluído) após verificação de permissão.' });
        }
        res.status(200).json({ message: 'Corte excluído com sucesso.', id: result.rows[0]?.id || id }); // Retorna o ID

    } catch (error) {
        console.error('[router/cortes DELETE] Erro:', error.message, error.stack ? error.stack.substring(0,500) : "");
        res.status(500).json({ error: 'Erro ao excluir corte', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;