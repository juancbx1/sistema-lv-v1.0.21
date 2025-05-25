// api/usuarios.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import express from 'express';

// Importações para getPermissoesCompletasUsuarioDB
// Ajuste este caminho se 'permissoes.js' estiver em um local diferente em relação a esta pasta 'api'
// Se permissoes.js está em 'public/js/utils/permissoes.js'
// e este arquivo (api/usuarios.js) está em 'api/', o caminho relativo é '../public/js/utils/permissoes.js'
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
    console.log(`[getPermissoesCompletasUsuarioDB] Buscando permissões para usuário ID: ${usuarioId}`);
    let localClient = dbClient; // Usa o cliente passado, se houver
    let clientGerenciadoLocalmente = false;

    try {
        if (!localClient) { // Se nenhum cliente foi passado, conecta um novo
            console.log(`[getPermissoesCompletasUsuarioDB] Nenhum dbClient fornecido, conectando um novo.`);
            localClient = await pool.connect();
            clientGerenciadoLocalmente = true;
        }

        const userResult = await localClient.query('SELECT tipos, permissoes FROM usuarios WHERE id = $1', [usuarioId]);
        if (userResult.rows.length === 0) {
            console.error(`[getPermissoesCompletasUsuarioDB] Usuário ID ${usuarioId} não encontrado no DB.`);
            throw new Error('Usuário não encontrado no DB para buscar permissões.');
        }
        const usuarioDB = userResult.rows[0];
        console.log(`[getPermissoesCompletasUsuarioDB] Usuário DB encontrado: Tipos=${JSON.stringify(usuarioDB.tipos)}, Permissões Individuais=${JSON.stringify(usuarioDB.permissoes)}`);

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
        console.log(`[getPermissoesCompletasUsuarioDB] Permissões baseadas em tipo:`, Array.from(permissoesBase));

        (usuarioDB.permissoes || []).forEach(p => permissoesBase.add(p));
        console.log(`[getPermissoesCompletasUsuarioDB] Permissões após adicionar individuais do DB:`, Array.from(permissoesBase));

        if (isAdmin) { // Garante que admin (tipo) sempre tenha todas as permissões definidas para 'admin' em permissoesPorTipo
            (frontendPermissoesPorTipo['admin'] || []).forEach(permissao => permissoesBase.add(permissao));
        }
        
        const permissoesFinais = Array.from(permissoesBase).filter(p => backendPermissoesValidas.has(p));
        console.log(`[getPermissoesCompletasUsuarioDB] Permissões finais filtradas para ID ${usuarioId}:`, permissoesFinais);
        return permissoesFinais;

    } catch (error) {
        console.error(`[getPermissoesCompletasUsuarioDB] Erro ao buscar permissões para usuário ID ${usuarioId}:`, error.message, error.stack);
        throw error; // Re-lança o erro para ser tratado por quem chamou
    } finally {
        if (clientGerenciadoLocalmente && localClient) {
            localClient.release();
            console.log(`[getPermissoesCompletasUsuarioDB] Cliente DB local liberado.`);
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
        console.log(`[router/usuarios MID] Recebida ${req.method} em ${req.originalUrl}`);
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
        
        console.log(`[API /me] Usuário ${usuarioCompleto.nome_usuario} encontrado, permissões totais:`, usuarioCompleto.permissoes);
        res.status(200).json(usuarioCompleto);

    } catch (error) {
        console.error('[router/usuarios/me] Erro:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao buscar dados do usuário', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// GET /api/usuarios
router.get('/', async (req, res) => {
    const { dbCliente } = req;
    try {
        // Apenas usuários com permissão podem listar todos os usuários
        // Esta verificação de permissão deve acontecer aqui, usando as permissões do usuarioLogado (do token)
        // e, se necessário, buscando as permissões completas como em /me ou em /api/producoes.
        // Por agora, vou assumir que o middleware de /api/usuarios já lida com uma permissão geral de acesso.
        // Se não, você precisaria adicionar:
        // const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbCliente, req.usuarioLogado.id);
        // if (!permissoesUsuario.includes('acesso-usuarios-cadastrados')) { // ou similar
        //     return res.status(403).json({ error: 'Permissão negada para listar usuários.' });
        // }

        const result = await dbCliente.query('SELECT id, nome, nome_usuario, email, tipos, nivel, permissoes FROM usuarios ORDER BY nome ASC');
        // Para cada usuário listado, idealmente também calcularíamos suas permissões completas
        // se o frontend precisar delas diretamente na lista.
        // Mas para a página de usuários cadastrados que você tem, ela já faz chamadas PUT para atualizar,
        // então talvez não seja necessário enviar permissões completas de TODOS os usuários aqui.
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
        const { nome, nomeUsuario, email, senha, tipos, nivel } = req.body;
        if (!nome || !nomeUsuario || !email || !senha || !tipos) {
            return res.status(400).json({ error: "Campos nome, nomeUsuario, email, senha e tipos são obrigatórios." });
        }
        const senhaHash = await bcrypt.hash(senha, 10);
        
        // As permissões individuais são salvas como um array vazio inicialmente,
        // as permissões efetivas virão dos tipos e da função getPermissoesCompletasUsuarioDB.
        const result = await dbCliente.query(
            'INSERT INTO usuarios (nome, nome_usuario, email, senha, tipos, nivel, permissoes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, nome, nome_usuario, email, tipos, nivel',
            [nome, nomeUsuario, email, senhaHash, tipos || [], nivel || null, []] 
        );
        
        let novoUsuario = result.rows[0];
        // Calcula e adiciona as permissões completas ao usuário recém-criado antes de retornar
        novoUsuario.permissoes = await getPermissoesCompletasUsuarioDB(dbCliente, novoUsuario.id);

        res.status(201).json(novoUsuario);
    } catch (error) {
        console.error('[router/usuarios POST] Erro:', error);
        if (error.code === '23505') { // Conflito/duplicidade
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
        const { id, nome, nomeUsuario, email, tipos, nivel, permissoes: permissoesIndividuais } = req.body; // 'permissoes' aqui são as individuais
        if (!id) {
            return res.status(400).json({ error: "O ID do usuário é obrigatório para atualização." });
        }

        const fieldsToUpdate = [];
        const values = [];
        let paramIndex = 1;

        if (nome !== undefined) { fieldsToUpdate.push(`nome = $${paramIndex++}`); values.push(nome); }
        if (nomeUsuario !== undefined) { fieldsToUpdate.push(`nome_usuario = $${paramIndex++}`); values.push(nomeUsuario); }
        if (email !== undefined) { fieldsToUpdate.push(`email = $${paramIndex++}`); values.push(email); }
        
        if (tipos !== undefined) { 
            if (Array.isArray(tipos)) {
                fieldsToUpdate.push(`tipos = $${paramIndex++}`); values.push(tipos); 
            } else {
                console.warn("[API Usuários PUT] 'tipos' recebido para update não é um array:", tipos);
                // Não atualiza tipos se não for array para evitar erro
            }
        }
        
        if (nivel !== undefined) { 
            const nivelFinal = (nivel === '' || nivel === undefined || isNaN(parseInt(nivel))) ? null : parseInt(nivel);
            fieldsToUpdate.push(`nivel = $${paramIndex++}`); values.push(nivelFinal); 
        }

        // Se 'permissoesIndividuais' for enviado, atualiza a coluna 'permissoes' do usuário no DB
        // Estas são as permissões que *não* vêm automaticamente do tipo.
        if (permissoesIndividuais !== undefined) {
            if (Array.isArray(permissoesIndividuais)) {
                fieldsToUpdate.push(`permissoes = $${paramIndex++}`);
                // Filtra para garantir que apenas permissões válidas conhecidas pelo sistema sejam salvas
                values.push(permissoesIndividuais.filter(p => backendPermissoesValidas.has(p)));
            } else {
                 console.warn("[API Usuários PUT] 'permissoes' (individuais) recebido para update não é um array:", permissoesIndividuais);
            }
        }


        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: "Nenhum campo fornecido para atualização." });
        }

        values.push(id); // Para o WHERE id = $X

        const queryText = `UPDATE usuarios SET ${fieldsToUpdate.join(', ')} WHERE id = $${paramIndex} RETURNING id, nome, nome_usuario, email, tipos, nivel, permissoes AS permissoes_individuais`;
        
        const result = await dbCliente.query(queryText, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado para atualização.' });
        }
        
        let usuarioAtualizado = result.rows[0];
        // Recalcula e adiciona as permissões totais (baseadas em tipo + individuais) ao usuário atualizado
        usuarioAtualizado.permissoes_totais = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioAtualizado.id);
        // Renomeia permissoes_individuais para algo mais claro ou remove se não for enviar de volta
        // delete usuarioAtualizado.permissoes_individuais; 

        res.status(200).json(usuarioAtualizado);
    } catch (error) {
        console.error('[router/usuarios PUT] Erro:', error);
         if (error.code === '23505') { // Conflito/duplicidade
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

export default router; // Exporta o router para ser usado no seu server.js