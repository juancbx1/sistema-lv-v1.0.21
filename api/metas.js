// /api/metas.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação (igual ao que você já usa)
router.use(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação ausente.' });
        }
        const token = authHeader.split(' ')[1];
        jwt.verify(token, SECRET_KEY); // Apenas verifica, não precisa dos dados do usuário aqui
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
});

// A rota principal que busca as metas

router.get('/', async (req, res) => {
    
    // 1. Cria a data de hoje, mas já formata como uma string no fuso horário do Brasil
    const hojeNoBrasil = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // 2. Transforma a string "DD/MM/YYYY" em "YYYY-MM-DD" para a query
    const [dia, mes, ano] = hojeNoBrasil.split('/');
    const dataRefFormatada = `${ano}-${mes}-${dia}`;

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // Com a coluna no banco sendo do tipo DATE, esta query simples é a mais correta e performática
        const versaoQuery = `
            SELECT id FROM metas_versoes
            WHERE data_inicio_vigencia <= $1
            ORDER BY data_inicio_vigencia DESC
            LIMIT 1;
        `;
        
        const versaoResult = await dbClient.query(versaoQuery, [dataRefFormatada]);
        
        if (versaoResult.rows.length > 0) {
        } else {
            console.error("4. ERRO CRÍTICO: A query NÃO encontrou nenhuma versão válida para a data de hoje!");
            // Vamos rodar uma query de debug para ver todas as versões
            const debugQuery = await dbClient.query("SELECT id, nome_versao, data_inicio_vigencia, TO_CHAR(data_inicio_vigencia, 'YYYY-MM-DD') as data_formatada FROM metas_versoes");
        }

        if (versaoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Nenhuma configuração de meta encontrada para a data fornecida.' });
        }
        const idVersaoCorreta = versaoResult.rows[0].id;

        const regrasQuery = `
            SELECT tipo_usuario, nivel, pontos_meta, valor_comissao AS valor, descricao_meta AS descricao, condicoes
            FROM metas_regras
            WHERE id_versao = $1
            ORDER BY tipo_usuario, nivel, pontos_meta ASC;
        `;
        const regrasResult = await dbClient.query(regrasQuery, [idVersaoCorreta]);
        const regras = regrasResult.rows;

        const metasConfigFormatado = {};
        for (const regra of regras) {
            const tipoUsuarioChave = regra.tipo_usuario.toLowerCase().trim();
            const { nivel, ...dadosMeta } = regra;
            delete dadosMeta.tipo_usuario;
            if (!metasConfigFormatado[tipoUsuarioChave]) metasConfigFormatado[tipoUsuarioChave] = {};
            if (!metasConfigFormatado[tipoUsuarioChave][nivel]) metasConfigFormatado[tipoUsuarioChave][nivel] = [];
            dadosMeta.pontos_meta = parseInt(dadosMeta.pontos_meta, 10);
            dadosMeta.valor = parseFloat(dadosMeta.valor);
            metasConfigFormatado[tipoUsuarioChave][nivel].push(dadosMeta);
        }

        res.status(200).json(metasConfigFormatado);

    } catch (error) {
        console.error('[API /api/metas] Erro na rota:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// =======================================================
// ROTAS DE ADMINISTRAÇÃO DE METAS
// =======================================================

// Rota para LISTAR todas as versões de metas
router.get('/versoes', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM metas_versoes ORDER BY data_inicio_vigencia DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API /api/metas/versoes] Erro:', error.message);
        res.status(500).json({ error: 'Erro ao buscar versões de metas.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota para CRIAR uma nova versão de meta e CLONAR as regras da versão anterior
router.post('/versoes', async (req, res) => {
    const { nome_versao, data_inicio_vigencia, id_versao_origem_clone } = req.body;
    
    // Validação
     if (!nome_versao || !data_inicio_vigencia || !id_versao_origem_clone) {
        return res.status(400).json({ error: 'Nome da versão, data de início e ID da versão para clonar são obrigatórios.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN'); // Inicia a transação

        // 1. Cria a nova versão
        const novaVersaoQuery = 'INSERT INTO metas_versoes (nome_versao, data_inicio_vigencia) VALUES ($1, $2) RETURNING id';
        const novaVersaoResult = await dbClient.query(novaVersaoQuery, [nome_versao, data_inicio_vigencia]);
        const novoIdVersao = novaVersaoResult.rows[0].id;

        // 2. Clona as regras da versão de origem para a nova versão
        const cloneRegrasQuery = `
            INSERT INTO metas_regras (id_versao, tipo_usuario, nivel, pontos_meta, valor_comissao, descricao_meta, condicoes)
            SELECT $1, tipo_usuario, nivel, pontos_meta, valor_comissao, descricao_meta, condicoes
            FROM metas_regras
            WHERE id_versao = $2;
        `;
        await dbClient.query(cloneRegrasQuery, [novoIdVersao, id_versao_origem_clone]);
        
        await dbClient.query('COMMIT'); // Finaliza a transação com sucesso
        res.status(201).json({ message: 'Nova versão criada e regras clonadas com sucesso!', id_nova_versao: novoIdVersao });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // Desfaz tudo em caso de erro
        console.error('[API /api/metas/versoes POST] Erro:', error.message);
        res.status(500).json({ error: 'Erro ao criar nova versão de metas.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota para buscar TODAS as regras de UMA versão específica
router.get('/regras/:id_versao', async (req, res) => {
    const { id_versao } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            SELECT * FROM metas_regras 
            WHERE id_versao = $1 
            ORDER BY tipo_usuario, nivel, pontos_meta ASC
        `;
        const result = await dbClient.query(query, [id_versao]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(`[API /api/metas/regras/${id_versao}] Erro:`, error.message);
        res.status(500).json({ error: 'Erro ao buscar regras da versão.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota para ATUALIZAR uma regra específica
router.put('/regras/:id_regra', async (req, res) => {
    const { id_regra } = req.params;
    const { pontos_meta, valor_comissao, descricao_meta, condicoes } = req.body;
    
    // Validação básica
    if (!pontos_meta || !valor_comissao || !descricao_meta) {
        return res.status(400).json({ error: 'Pontos, comissão e descrição são obrigatórios.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            UPDATE metas_regras 
            SET 
                pontos_meta = $1, 
                valor_comissao = $2, 
                descricao_meta = $3, 
                condicoes = $4,
                data_atualizacao = NOW()
            WHERE id = $5
            RETURNING *;
        `;
        
        const condicoesParaSalvar = (condicoes && typeof condicoes === 'object') 
                                        ? JSON.stringify(condicoes) 
                                        : null;
       
        const result = await dbClient.query(query, [pontos_meta, valor_comissao, descricao_meta, condicoesParaSalvar, id_regra]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Regra não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`[API /api/metas/regras/${id_regra} PUT] Erro:`, error.message);
        res.status(500).json({ error: 'Erro ao atualizar a regra.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota para CRIAR uma nova regra em uma versão
router.post('/regras', async (req, res) => {
    const { id_versao, tipo_usuario, nivel, pontos_meta, valor_comissao, descricao_meta } = req.body;
    
    if (!id_versao || !tipo_usuario || !nivel || !pontos_meta || !valor_comissao || !descricao_meta) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios para criar uma nova regra.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO metas_regras (id_versao, tipo_usuario, nivel, pontos_meta, valor_comissao, descricao_meta)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const result = await dbClient.query(query, [id_versao, tipo_usuario, nivel, pontos_meta, valor_comissao, descricao_meta]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API /api/metas/regras POST] Erro:', error.message);
        res.status(500).json({ error: 'Erro ao criar nova regra.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// Rota para DELETAR uma regra
router.delete('/regras/:id_regra', async (req, res) => {
    const { id_regra } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            UPDATE metas_regras 
            SET 
                pontos_meta = $1, 
                valor_comissao = $2, 
                descricao_meta = $3, 
                condicoes = $4
                -- REMOVIDO: data_atualizacao = NOW()
            WHERE id = $5
            RETURNING *;
        `;
        
        // Se 'condicoes' for um objeto/array, o convertemos para uma string JSON.
        // Se for null, undefined, ou qualquer outra coisa, passamos null.
        const condicoesParaSalvar = (condicoes && typeof condicoes === 'object') 
                                        ? JSON.stringify(condicoes) 
                                        : null;

        const result = await dbClient.query(query, [pontos_meta, valor_comissao, descricao_meta, condicoesParaSalvar, id_regra]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Regra não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`[API /api/metas/regras/${id_regra} DELETE] Erro:`, error.message);
        res.status(500).json({ error: 'Erro ao excluir a regra.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;