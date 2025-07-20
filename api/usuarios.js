// api/usuarios.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import express from 'express';

import { permissoesDisponiveis as frontendPermissoesDisponiveis, permissoesPorTipo as frontendPermissoesPorTipo } from '../public/js/utils/permissoes.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    // Adicionar timezone: 'UTC' é uma boa prática se ainda não estiver globalmente configurado no pool
});
const SECRET_KEY = process.env.JWT_SECRET;

// ---------------------------------------------------------------
// NOVA FUNÇÃO: getPermissoesCompletasUsuarioDB
// ---------------------------------------------------------------
const backendPermissoesValidas = new Set(frontendPermissoesDisponiveis.map(p => p.id));

export async function getPermissoesCompletasUsuarioDB(dbClient, usuarioId) {
    let localClient = dbClient; // Usa o cliente passado, se houver
    let clientGerenciadoLocalmente = false;

    try {
        if (!localClient) { // Se nenhum cliente foi passado, conecta um novo
            localClient = await pool.connect();
            clientGerenciadoLocalmente = true;
        }

        const userResult = await localClient.query('SELECT tipos, permissoes FROM usuarios WHERE id = $1', [usuarioId]);
        if (userResult.rows.length === 0) {
            console.error(`[getPermissoesCompletasUsuarioDB] Usuário ID ${usuarioId} não encontrado no DB.`);
            throw new Error('Usuário não encontrado no DB para buscar permissões.');
        }
        const usuarioDB = userResult.rows[0];

        const tipos = Array.isArray(usuarioDB.tipos) ? usuarioDB.tipos : (typeof usuarioDB.tipos === 'string' ? [usuarioDB.tipos] : []);
        const tipoMap = {
            'administrador': 'admin', 'tiktik': 'tiktik', 'cortador': 'cortador',
            'costureira': 'costureira', 'lider_setor': 'lider_setor', 'supervisor': 'supervisor',
        };
        const tiposMapeados = tipos.map(tipo => tipoMap[tipo.toLowerCase()] || tipo.toLowerCase());
        const isAdmin = tiposMapeados.includes('admin');

        let permissoesBase = new Set();
        tiposMapeados.forEach(tipoMapeado => {
            (frontendPermissoesPorTipo[tipoMapeado] || []).forEach(p => permissoesBase.add(p));
        });

        (usuarioDB.permissoes || []).forEach(p => permissoesBase.add(p));

        if (isAdmin) { // Garante que admin (tipo) sempre tenha todas as permissões definidas para 'admin' em permissoesPorTipo
            (frontendPermissoesPorTipo['admin'] || []).forEach(permissao => permissoesBase.add(permissao));
        }
        
        const permissoesFinais = Array.from(permissoesBase).filter(p => backendPermissoesValidas.has(p));
        return permissoesFinais;

    } catch (error) {
        console.error(`[getPermissoesCompletasUsuarioDB] Erro ao buscar permissões para usuário ID ${usuarioId}:`, error.message, error.stack);
        throw error; // Re-lança o erro para ser tratado por quem chamou
    } finally {
        if (clientGerenciadoLocalmente && localClient) {
            localClient.release();
        }
    }
}
// ---------------------------------------------------------------

// Função verificarToken (usada pelo middleware deste router)
const verificarTokenOriginal = (reqOriginal) => {
    const token = reqOriginal.headers.authorization?.split(' ')[1];
    if (!token) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401;
        throw error;
    }
    try {
        // Retorna o payload decodificado, que deve incluir pelo menos o ID do usuário
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router (usuarios)
router.use(async (req, res, next) => {
    let cliente;
    try {
        req.usuarioLogado = verificarTokenOriginal(req); // Decodifica o token
        cliente = await pool.connect();
        req.dbCliente = cliente;
        // Não buscamos permissões completas aqui no middleware de /usuarios,
        // pois cada rota pode precisar ou não delas, ou de formas diferentes.
        // A rota específica (ou uma função chamada por ela) buscará se necessário.
        next();
    } catch (error) {
        console.error('[router/usuarios MID] Erro no middleware:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// GET /api/usuarios/me
router.get('/me', async (req, res) => {
    const { usuarioLogado, dbCliente } = req; // usuarioLogado tem o ID do token
    try {
        // Busca o usuário do banco para garantir dados atualizados
        const result = await dbCliente.query(
            'SELECT id, nome, nome_usuario, email, tipos, nivel, permissoes FROM usuarios WHERE id = $1',
            [usuarioLogado.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado no DB.' });
        }
        
        let usuarioCompleto = result.rows[0];
        // Sincroniza/calcula as permissões totais do usuário ANTES de enviar para o cliente
        // Isso garante que o frontend receba o conjunto completo de permissões.
        usuarioCompleto.permissoes = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        res.status(200).json(usuarioCompleto);

    } catch (error) {
        console.error('[router/usuarios/me] Erro:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao buscar dados do usuário', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

router.put('/me/avatar', async (req, res) => {
    // O middleware de autenticação deste router já deve ter verificado o token
    // e adicionado 'req.usuarioLogado'
    const { id: usuarioId } = req.usuarioLogado;
    const { avatarUrl } = req.body;
    let dbClient;

    if (!avatarUrl || typeof avatarUrl !== 'string') {
        return res.status(400).json({ error: 'A URL do avatar (avatarUrl) é obrigatória e deve ser uma string.' });
    }

    try {
        dbClient = await pool.connect();

        const queryText = `
            UPDATE usuarios
            SET avatar_url = $1
            WHERE id = $2
            RETURNING id, nome, email, avatar_url;
        `;

        const result = await dbClient.query(queryText, [avatarUrl, usuarioId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado para atualizar.' });
        }

        res.status(200).json({
            message: 'Avatar atualizado com sucesso!',
            usuario: result.rows[0]
        });

    } catch (error) {
        console.error('[API PUT /me/avatar] Erro na rota:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao atualizar o avatar.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// NOVA ROTA PUT para definir o badge em destaque do usuário
router.put('/me/badge', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    const { badgeId } = req.body; // Recebe o ID da conquista escolhida
    let dbClient;

    try {
        dbClient = await pool.connect();

        // Segurança (Opcional, mas recomendado): Verificar se o usuário realmente possui essa conquista
        if (badgeId) { // Se for null, significa que o usuário quer remover o badge
            const checkQuery = 'SELECT 1 FROM usuario_conquistas WHERE id_usuario = $1 AND id_conquista = $2';
            const checkResult = await dbClient.query(checkQuery, [usuarioId, badgeId]);
            if (checkResult.rowCount === 0) {
                return res.status(403).json({ error: 'Permissão negada. Você não possui esta conquista.' });
            }
        }
        
        // Atualiza a coluna na tabela de usuários
        const queryText = `
            UPDATE usuarios
            SET badge_destaque_id = $1
            WHERE id = $2
            RETURNING id, badge_destaque_id;
        `;
        const result = await dbClient.query(queryText, [badgeId, usuarioId]);

        res.status(200).json({ message: 'Badge em destaque atualizado!', usuario: result.rows[0] });

    } catch (error) {
        console.error('[API PUT /me/badge] Erro na rota:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar o badge.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/usuarios
router.get('/', async (req, res) => {
    const { dbCliente } = req;
    try {
        const query = `
            SELECT 
                u.id, u.nome, u.nome_usuario, u.email, u.tipos, u.nivel, u.permissoes,
                u.salario_fixo, u.valor_passagem_diaria, u.elegivel_pagamento, 
                u.id_contato_financeiro,
                c.nome AS nome_contato_financeiro,
                -- Agrega os IDs das concessionárias em um array, retornando um array vazio '{}' se não houver nenhum.
                COALESCE(
                    (SELECT array_agg(ucv.concessionaria_id) 
                     FROM usuario_concessionaria_vt ucv 
                     WHERE ucv.usuario_id = u.id),
                    '{}'
                ) AS concessionarias_vt
            FROM usuarios u
            LEFT JOIN fc_contatos c ON u.id_contato_financeiro = c.id
            ORDER BY u.nome ASC;
        `;
        const result = await dbCliente.query(query);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/usuarios GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao listar usuários', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/usuarios
router.post('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        const permissoesUsuarioAtual = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        if (!permissoesUsuarioAtual.includes('acesso-cadastrar-usuarios')) {
            return res.status(403).json({ error: 'Permissão negada para criar usuários' });
        }
        
        const { nome, nomeUsuario, email, senha, tipos, nivel, salario_fixo, valor_passagem_diaria } = req.body;
        if (!nome || !nomeUsuario || !email || !senha || !tipos) {
            return res.status(400).json({ error: "Campos nome, nomeUsuario, email, senha e tipos são obrigatórios." });
        }
        
        // Inicia a transação
        await dbCliente.query('BEGIN');

        // 1. Cria o usuário principal
        const senhaHash = await bcrypt.hash(senha, 10);
        const userResult = await dbCliente.query(
            `INSERT INTO usuarios (
                nome, nome_usuario, email, senha, 
                tipos, nivel, salario_fixo, valor_passagem_diaria, permissoes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [
                nome, nomeUsuario, email, senhaHash, 
                tipos, nivel, salario_fixo, valor_passagem_diaria, []
            ] 
        );
        const novoUsuarioId = userResult.rows[0].id;

        // 2. Lida com o contato financeiro, se for um empregado
        const ehEmpregado = tipos.includes('costureira') || tipos.includes('tiktik');
        if (ehEmpregado) {
            let contatoId;

            // 2a. Tenta encontrar um contato existente com o mesmo nome e tipo
            const existingContactRes = await dbCliente.query(
                "SELECT id FROM fc_contatos WHERE nome = $1 AND tipo = 'EMPREGADO' LIMIT 1",
                [nome]
            );

            if (existingContactRes.rows.length > 0) {
                // Se encontrou, usa o ID existente
                contatoId = existingContactRes.rows[0].id;
            } else {
                // Se não encontrou, cria um novo contato
                const newContactRes = await dbCliente.query(
                    "INSERT INTO fc_contatos (nome, tipo, ativo) VALUES ($1, 'EMPREGADO', TRUE) RETURNING id",
                    [nome]
                );
                contatoId = newContactRes.rows[0].id;
            }

            // 2b. Vincula o ID do contato (existente ou novo) ao usuário
            await dbCliente.query(
                "UPDATE usuarios SET id_contato_financeiro = $1 WHERE id = $2",
                [contatoId, novoUsuarioId]
            );
        }
        
        await dbCliente.query('COMMIT');
        
        const finalUserRes = await dbCliente.query('SELECT * FROM usuarios WHERE id = $1', [novoUsuarioId]);
        res.status(201).json(finalUserRes.rows[0]);

    } catch (error) {
        if (dbCliente) await dbCliente.query('ROLLBACK');
        console.error('[router/usuarios POST] Erro:', error);
        if (error.code === '23505') {
             res.status(409).json({ error: 'Usuário ou email já cadastrado.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao criar usuário', details: error.message });
        }
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// PUT /api/usuarios (para atualizar um usuário por ID no corpo)
router.put('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        const permissoesUsuarioAtual = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        if (!permissoesUsuarioAtual.includes('editar-usuarios')) {
            return res.status(403).json({ error: 'Permissão negada para editar usuários' });
        }
        
        // Recebemos todos os campos do corpo da requisição
        const { 
            id, nome, nomeUsuario, email, tipos, nivel, 
            salario_fixo, valor_passagem_diaria, 
            elegivel_pagamento, id_contato_financeiro, concessionaria_ids,
            permissoes: permissoesIndividuais 
        } = req.body;

        if (!id) {
            return res.status(400).json({ error: "O ID do usuário é obrigatório para atualização." });
        }

        await dbCliente.query('BEGIN'); // Inicia a transação

        // --- 1. Lógica para atualizar a tabela 'usuarios' ---
        const fieldsToUpdate = [];
        const values = [];
        let paramIndex = 1;

        if (nome !== undefined) { fieldsToUpdate.push(`nome = $${paramIndex++}`); values.push(nome); }
        if (nomeUsuario !== undefined) { fieldsToUpdate.push(`nome_usuario = $${paramIndex++}`); values.push(nomeUsuario); }
        if (email !== undefined) { fieldsToUpdate.push(`email = $${paramIndex++}`); values.push(email); }
        if (tipos !== undefined) { fieldsToUpdate.push(`tipos = $${paramIndex++}`); values.push(tipos); }
        if (nivel !== undefined) { fieldsToUpdate.push(`nivel = $${paramIndex++}`); values.push(nivel); }
        if (salario_fixo !== undefined) { fieldsToUpdate.push(`salario_fixo = $${paramIndex++}`); values.push(salario_fixo); }
        if (valor_passagem_diaria !== undefined) { fieldsToUpdate.push(`valor_passagem_diaria = $${paramIndex++}`); values.push(valor_passagem_diaria); }
        if (elegivel_pagamento !== undefined) { fieldsToUpdate.push(`elegivel_pagamento = $${paramIndex++}`); values.push(elegivel_pagamento); }
        if (id_contato_financeiro !== undefined) { fieldsToUpdate.push(`id_contato_financeiro = $${paramIndex++}`); values.push(id_contato_financeiro); }
        if (permissoesIndividuais !== undefined) {
            const permissoesValidas = permissoesIndividuais.filter(p => backendPermissoesValidas.has(p));
            fieldsToUpdate.push(`permissoes = $${paramIndex++}`);
            values.push(permissoesValidas);
        }

        if (fieldsToUpdate.length > 0) {
            values.push(id);
            const queryText = `UPDATE usuarios SET ${fieldsToUpdate.join(', ')} WHERE id = $${paramIndex}`;
            await dbCliente.query(queryText, values);
        }

        // --- 2. Lógica para atualizar a tabela 'usuario_concessionaria_vt' ---
        if (concessionaria_ids && Array.isArray(concessionaria_ids)) {
            await dbCliente.query('DELETE FROM usuario_concessionaria_vt WHERE usuario_id = $1', [id]);
            if (concessionaria_ids.length > 0) {
                const valuesClauses = concessionaria_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
                const insertVinculosQuery = `INSERT INTO usuario_concessionaria_vt (usuario_id, concessionaria_id) VALUES ${valuesClauses}`;
                await dbCliente.query(insertVinculosQuery, [id, ...concessionaria_ids]);
            }
        }

        await dbCliente.query('COMMIT'); // Finaliza a transação

        // Retorna o usuário atualizado para consistência no frontend
        const finalUserRes = await dbCliente.query('SELECT * FROM usuarios WHERE id = $1', [id]);
        let usuarioAtualizado = finalUserRes.rows[0];
        usuarioAtualizado.permissoes_totais = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioAtualizado.id);
        res.status(200).json(usuarioAtualizado);

    } catch (error) {
        if (dbCliente) await dbCliente.query('ROLLBACK');
        console.error('[router/usuarios PUT] Erro:', error);
        if (error.code === '23505') {
             res.status(409).json({ error: 'Nome de usuário ou email já em uso por outro usuário.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao atualizar usuário', details: error.message });
        }
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// PUT /api/usuarios/batch (atualizar permissões em lote)
// Esta rota parece ser para definir as *permissões individuais* de vários usuários.
router.put('/batch', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        const permissoesUsuarioAtual = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        if (!permissoesUsuarioAtual.includes('gerenciar-permissoes')) {
            return res.status(403).json({ error: 'Permissão negada para gerenciar permissões em lote' });
        }
        const usuariosParaAtualizar = req.body; // Espera um array de { id, permissoes: [...] }
        if (!Array.isArray(usuariosParaAtualizar) || usuariosParaAtualizar.length === 0) {
            return res.status(400).json({ error: 'Corpo da requisição inválido: esperado um array de usuários' });
        }

        await dbCliente.query('BEGIN');
        try {
            for (const usuario of usuariosParaAtualizar) {
                const { id, permissoes: permissoesIndividuaisNovas } = usuario;
                if (id === undefined || !Array.isArray(permissoesIndividuaisNovas)) {
                    throw new Error('Formato inválido: id ou permissoes ausentes/inválidos para um dos usuários.');
                }
                // Filtra para garantir que apenas permissões válidas sejam salvas
                const permissoesValidasParaSalvar = permissoesIndividuaisNovas.filter(p => backendPermissoesValidas.has(p));
                
                await dbCliente.query(
                    'UPDATE usuarios SET permissoes = $1 WHERE id = $2', // Atualiza a coluna 'permissoes'
                    [permissoesValidasParaSalvar, id]
                );
            }
            await dbCliente.query('COMMIT');
            res.status(200).json({ message: 'Permissões individuais dos usuários atualizadas com sucesso' });
        } catch (transactionError) {
            await dbCliente.query('ROLLBACK');
            console.error('[router/usuarios/batch] Erro na transação:', transactionError);
            const message = transactionError.message.startsWith('Formato inválido:') ? transactionError.message : 'Erro ao salvar permissões durante a transação.';
            res.status(400).json({ error: message, details: transactionError.message });
        }
    } catch (error) {
        console.error('[router/usuarios/batch] Erro geral:', error);
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// DELETE /api/usuarios (ID no corpo)
router.delete('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        const permissoesUsuarioAtual = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        if (!permissoesUsuarioAtual.includes('excluir-usuarios')) {
            return res.status(403).json({ error: 'Permissão negada para excluir usuários' });
        }
        const { id } = req.body;
        if (!id) {
             return res.status(400).json({ error: 'ID do usuário é obrigatório para exclusão.' });
        }
        const result = await dbCliente.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado para exclusão.' });
        }
        res.status(200).json({ message: 'Usuário excluído com sucesso.', id: result.rows[0].id });
    } catch (error) {
        console.error('[router/usuarios DELETE] Erro:', error);
        res.status(500).json({ error: 'Erro ao excluir usuário', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});


// GET /api/usuarios/buscar-contatos-empregado?q=termo
router.get('/buscar-contatos-empregado', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    const termoBusca = req.query.q;

    try {
        const permissoesUsuarioAtual = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        if (!permissoesUsuarioAtual.includes('editar-usuarios')) {
            return res.status(403).json({ error: 'Permissão negada para buscar contatos.' });
        }

        if (!termoBusca || termoBusca.trim().length < 3) {
            return res.status(200).json([]);
        }

        const query = `
            SELECT id, nome, tipo 
            FROM fc_contatos 
            WHERE 
                nome ILIKE $1 
                AND tipo = 'EMPREGADO' 
                AND ativo = true 
            ORDER BY nome LIMIT 10
        `;
        const params = [`%${termoBusca.trim()}%`];

        const result = await dbCliente.query(query, params);
        
        
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[BACKEND] ERRO CRÍTICO na rota /buscar-contatos-empregado:', error);
        res.status(500).json({ error: 'Erro interno ao buscar contatos.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;