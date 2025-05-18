// api/configuracao-pontos.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express'; // Importar Express para criar um router

const router = express.Router(); // Criar um router Express
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// --- Suas funções verificarToken e verificarPermissao podem permanecer as mesmas ---
const verificarToken = (req) => { /* ... seu código ... */
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401;
        throw error;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        const error = new Error('Token mal formatado');
        error.statusCode = 401;
        throw error;
    }
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        return decoded;
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') {
            error.details = 'jwt expired';
        }
        throw error;
    }
};

const verificarPermissao = (usuarioLogado, permissaoNecessaria) => { /* ... seu código ... */
    if (!usuarioLogado.permissoes || !usuarioLogado.permissoes.includes(permissaoNecessaria)) {
        const error = new Error('Permissão negada');
        error.statusCode = 403;
        throw error;
    }
};
// -----------------------------------------------------------------------------------

// Middleware para este router (opcional, mas bom para logs e tratamento de erro comum)
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/configuracao-pontos] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarToken(req); // Anexa o usuário logado ao request
        cliente = await pool.connect();
        req.dbCliente = cliente; // Anexa o cliente do banco ao request para uso nas rotas
        next(); // Passa para a próxima rota/middleware
    } catch (error) {
        console.error('[router/configuracao-pontos] Erro no middleware:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// Rotas para /padrao
router.get('/padrao', async (req, res) => {
    try {
        verificarPermissao(req.usuarioLogado, 'acesso-ponto-por-processo');
        const { produto_nome, processo_nome } = req.query;
        let query = 'SELECT id, produto_nome, processo_nome, pontos_padrao, ativo FROM configuracoes_pontos_processos';
        const queryParams = [];
        const conditions = [];

        if (produto_nome) {
            queryParams.push(produto_nome);
            conditions.push(`produto_nome ILIKE $${queryParams.length}`);
        }
        if (processo_nome) {
            queryParams.push(processo_nome);
            conditions.push(`processo_nome ILIKE $${queryParams.length}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY produto_nome, processo_nome';

        const result = await req.dbCliente.query(query, queryParams);
        res.status(200).json(result.rows);
    } catch (error) {
        // Tratamento de erro específico da rota, se necessário, ou deixar para o error handler global do Express
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    } finally {
        if (req.dbCliente) req.dbCliente.release();
    }
});

router.post('/padrao', async (req, res) => {
    try {
        verificarPermissao(req.usuarioLogado, 'acesso-ponto-por-processo');
        const { produto_nome, processo_nome, pontos_padrao } = req.body;
        // ... (suas validações) ...
        if (!produto_nome || !processo_nome || pontos_padrao === undefined || pontos_padrao === null) {
            return res.status(400).json({ error: 'Campos produto_nome, processo_nome e pontos_padrao são obrigatórios.' });
        }
        if (isNaN(parseFloat(pontos_padrao)) || parseFloat(pontos_padrao) <= 0) {
            return res.status(400).json({ error: 'pontos_padrao deve ser um número positivo.' });
        }

        const result = await req.dbCliente.query(
            `INSERT INTO configuracoes_pontos_processos (produto_nome, processo_nome, pontos_padrao)
             VALUES ($1, $2, $3)
             ON CONFLICT (produto_nome, processo_nome)
             DO UPDATE SET pontos_padrao = EXCLUDED.pontos_padrao, ativo = TRUE, data_atualizacao = CURRENT_TIMESTAMP
             RETURNING id, produto_nome, processo_nome, pontos_padrao, ativo;`,
            [produto_nome, processo_nome, parseFloat(pontos_padrao)]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        const statusCode = error.statusCode || (error.code === '23505' ? 409 : 500);
        const errorMessage = error.code === '23505' ? 'Erro de conflito: Já existe um registro com esses valores únicos.' : error.message;
        res.status(statusCode).json({ error: errorMessage, details: error.detail });
    } finally {
        if (req.dbCliente) req.dbCliente.release();
    }
});

// PUT /padrao/:id  (para atualizar por ID)
router.put('/padrao/:id', async (req, res) => {
    try {
        verificarPermissao(req.usuarioLogado, 'acesso-ponto-por-processo');
        const configId = parseInt(req.params.id, 10);
        const { pontos_padrao, ativo } = req.body;

        if (isNaN(configId)) {
            return res.status(400).json({ error: 'ID inválido fornecido na URL.' });
        }
        // ... (suas validações para pontos_padrao e ativo) ...
        if (pontos_padrao !== undefined && (isNaN(parseFloat(pontos_padrao)) || parseFloat(pontos_padrao) <= 0)) {
            return res.status(400).json({ error: 'Se fornecido, pontos_padrao deve ser um número positivo.' });
        }
        if (ativo !== undefined && typeof ativo !== 'boolean') {
            return res.status(400).json({ error: 'Se fornecido, ativo deve ser um booleano.' });
        }

        const fieldsToUpdate = [];
        const values = [configId];
        let paramIndex = 2;

        if (pontos_padrao !== undefined) {
            fieldsToUpdate.push(`pontos_padrao = $${paramIndex++}`);
            values.push(parseFloat(pontos_padrao));
        }
        if (ativo !== undefined) {
            fieldsToUpdate.push(`ativo = $${paramIndex++}`);
            values.push(ativo);
        }
        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar fornecido (pontos_padrao ou ativo).' });
        }
        const queryText = `UPDATE configuracoes_pontos_processos SET ${fieldsToUpdate.join(', ')}, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *;`;
        
        const result = await req.dbCliente.query(queryText, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Configuração de pontos padrão não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    } finally {
        if (req.dbCliente) req.dbCliente.release();
    }
});


router.delete('/padrao/:id', async (req, res) => {
    try {
        verificarPermissao(req.usuarioLogado, 'acesso-ponto-por-processo');
        const configId = parseInt(req.params.id, 10);
        // ... (suas validações) ...
         if (isNaN(configId)) {
            return res.status(400).json({ error: 'ID inválido fornecido na URL.' });
        }
        const result = await req.dbCliente.query(
            'DELETE FROM configuracoes_pontos_processos WHERE id = $1 RETURNING *;',
            [configId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Configuração de pontos padrão não encontrada.' });
        }
        res.status(200).json({ message: 'Configuração de pontos padrão excluída com sucesso.', deletedItem: result.rows[0] });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    } finally {
        if (req.dbCliente) req.dbCliente.release();
    }
});

// TODO: Adicionar rotas para /periodo e /especial aqui no futuro

export default router; // Exportar o router Express