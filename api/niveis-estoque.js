// api/niveis-estoque.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Certifique-se que o caminho está correto

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : undefined,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação e permissão base
router.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token mal formatado' });
    
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.usuarioLogado = decoded;

        const dbClient = await pool.connect();
        try {
            const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
            
            // === PERMISSÃO ATUALIZADA AQUI ===
            if (!permissoesUsuario.includes('gerenciar-niveis-alerta-estoque')) {
                return res.status(403).json({ error: 'Permissão negada para gerenciar níveis de alerta de estoque.' });
            }
            // ==================================
            
            next();
        } finally {
            dbClient.release();
        }
    } catch (err) {
        let message = 'Token inválido ou expirado';
        if (err.name === 'TokenExpiredError') message = 'Token expirado';
        return res.status(401).json({ error: message, details: err.name });
    }
});

// GET /api/niveis-estoque - Listar todas as configurações de níveis ativas
router.get('/', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        // Adicionado JOIN para buscar nome do produto e variação para facilitar no frontend, se necessário
        // Mas principalmente, retorna todas as configs para o frontend decidir o que fazer
        const result = await dbClient.query(`
            SELECT pne.* 
            FROM produto_niveis_estoque_alerta pne
            WHERE pne.ativo = TRUE 
            ORDER BY pne.produto_ref_id ASC
        `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/niveis-estoque GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar configurações de níveis de estoque', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/niveis-estoque/:produtoRefId - Obter configuração de nível para um produto/variação específico
router.get('/:produtoRefId', async (req, res) => {
    const { produtoRefId } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query(
            'SELECT * FROM produto_niveis_estoque_alerta WHERE produto_ref_id = $1 AND ativo = TRUE LIMIT 1', 
            [produtoRefId]
        );
        if (result.rows.length === 0) {
            // É normal não encontrar, significa que não foi configurado ainda.
            // O frontend pode tratar null ou 404. Vamos retornar null para o frontend decidir.
            return res.status(200).json(null); 
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`[API/niveis-estoque GET /${produtoRefId}] Erro:`, error);
        res.status(500).json({ error: 'Erro ao buscar configuração de nível do produto', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/niveis-estoque - Criar OU Atualizar (UPSERT) uma configuração de nível
router.post('/', async (req, res) => {
    const { 
        produto_ref_id, // Este é o SKU da variação
        nivel_estoque_baixo, 
        nivel_reposicao_urgente,
        ativo // opcional, default true
    } = req.body;

    if (!produto_ref_id || nivel_estoque_baixo === undefined || nivel_reposicao_urgente === undefined) {
        return res.status(400).json({ error: 'produto_ref_id, nivel_estoque_baixo e nivel_reposicao_urgente são obrigatórios.' });
    }
    const nivelBaixoNum = parseInt(nivel_estoque_baixo);
    const nivelUrgenteNum = parseInt(nivel_reposicao_urgente);

    if (isNaN(nivelBaixoNum) || nivelBaixoNum < 0 || isNaN(nivelUrgenteNum) || nivelUrgenteNum < 0) {
        return res.status(400).json({ error: 'Níveis de estoque devem ser números não negativos.' });
    }
    if (nivelUrgenteNum > nivelBaixoNum) {
        return res.status(400).json({ error: 'O nível de "Reposição Urgente" não pode ser maior que o nível de "Estoque Baixo".' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO produto_niveis_estoque_alerta 
                (produto_ref_id, nivel_estoque_baixo, nivel_reposicao_urgente, ativo)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (produto_ref_id) 
            DO UPDATE SET 
                nivel_estoque_baixo = EXCLUDED.nivel_estoque_baixo,
                nivel_reposicao_urgente = EXCLUDED.nivel_reposicao_urgente,
                ativo = EXCLUDED.ativo,
                atualizado_em = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const values = [
            produto_ref_id,
            nivelBaixoNum,
            nivelUrgenteNum,
            ativo === undefined ? true : Boolean(ativo)
        ];
        const result = await dbClient.query(query, values);
        res.status(201).json(result.rows[0]); // 201 para created ou updated via UPSERT
    } catch (error) {
        console.error('[API/niveis-estoque POST UPSERT] Erro:', error);
        // Não deve dar erro de UNIQUE por causa do ON CONFLICT,
        // mas pode dar outros erros (ex: tipo de dado inválido se o check falhar)
        res.status(500).json({ error: 'Erro ao salvar configuração de nível de estoque', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/niveis-estoque/:id (ou /:produtoRefId se preferir) - Desativar configuração
// Usando o ID da tabela produto_niveis_estoque_alerta para desativar
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID da configuração de nível inválido.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        // Soft delete: apenas marca como inativo
        const result = await dbClient.query(
            'UPDATE produto_niveis_estoque_alerta SET ativo = false, atualizado_em = NOW() WHERE id = $1 RETURNING *;', 
            [parseInt(id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Configuração de nível não encontrada para desativar.' });
        }
        res.status(200).json({ message: 'Configuração de nível desativada com sucesso.', itemDesativado: result.rows[0] });
    } catch (error) {
        console.error('[API/niveis-estoque DELETE/DESATIVAR] Erro:', error);
        res.status(500).json({ error: 'Erro ao desativar configuração de nível', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/batch', async (req, res) => {
    const { configs } = req.body; // Espera um array: [{ produto_ref_id, nivel_estoque_baixo, nivel_reposicao_urgente, ativo (opcional) }, ...]

    if (!Array.isArray(configs) || configs.length === 0) {
        return res.status(400).json({ error: 'Array de configurações "configs" é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN'); // Inicia transação

        const resultados = [];
        for (const config of configs) {
            const { 
                produto_ref_id, 
                nivel_estoque_baixo, 
                nivel_reposicao_urgente,
                ativo 
            } = config;

            if (!produto_ref_id || nivel_estoque_baixo === undefined || nivel_reposicao_urgente === undefined) {
                await dbClient.query('ROLLBACK');
                return res.status(400).json({ error: `Dados incompletos para o item ${produto_ref_id || '(desconhecido)'}. Todos os campos são obrigatórios.` });
            }
            const nivelBaixoNum = parseInt(nivel_estoque_baixo);
            const nivelUrgenteNum = parseInt(nivel_reposicao_urgente);

            if (isNaN(nivelBaixoNum) || nivelBaixoNum < 0 || isNaN(nivelUrgenteNum) || nivelUrgenteNum < 0) {
                await dbClient.query('ROLLBACK');
                return res.status(400).json({ error: `Níveis inválidos para ${produto_ref_id}. Devem ser números não negativos.` });
            }
            if (nivelUrgenteNum > nivelBaixoNum) {
                await dbClient.query('ROLLBACK');
                return res.status(400).json({ error: `Para ${produto_ref_id}, nível urgente não pode ser maior que o nível baixo.` });
            }

            const query = `
                INSERT INTO produto_niveis_estoque_alerta 
                    (produto_ref_id, nivel_estoque_baixo, nivel_reposicao_urgente, ativo)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (produto_ref_id) 
                DO UPDATE SET 
                    nivel_estoque_baixo = EXCLUDED.nivel_estoque_baixo,
                    nivel_reposicao_urgente = EXCLUDED.nivel_reposicao_urgente,
                    ativo = EXCLUDED.ativo,
                    atualizado_em = CURRENT_TIMESTAMP
                RETURNING *;
            `;
            const values = [
                produto_ref_id,
                nivelBaixoNum,
                nivelUrgenteNum,
                ativo === undefined ? true : Boolean(ativo)
            ];
            const result = await dbClient.query(query, values);
            resultados.push(result.rows[0]);
        }

        await dbClient.query('COMMIT'); // Finaliza transação
        res.status(201).json({ message: `${configs.length} configurações de nível salvas/atualizadas.`, data: resultados });
    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API/niveis-estoque POST /batch] Erro:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações de nível em lote', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;