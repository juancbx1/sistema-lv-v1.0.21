// api/embalagens.js

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Ajuste o caminho se necessário

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// --- Função de Verificação de Token (pode ser centralizada em um arquivo 'utils' no futuro) ---
const verificarToken = (req) => {
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
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// --- Middleware de Autenticação para este Router ---
router.use(async (req, res, next) => {
    try {
        req.usuarioLogado = verificarToken(req);
        next();
    } catch (error) {
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// --- Rota GET /api/embalagens/historico ---
router.get('/historico', async (req, res) => {
    const { usuarioLogado } = req;
    const { produto_ref_id, page = 1, limit = 5 } = req.query;

    if (!produto_ref_id) {
        return res.status(400).json({ error: "O SKU (produto_ref_id) é obrigatório para buscar o histórico." });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('acesso-embalagem-de-produtos')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar o histórico.' });
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const params = [produto_ref_id]; 
        
        const queryText = `
            WITH historico_combinado AS (
                -- 1. Embalagens de UNIDADE do item base (buscando pelo SKU direto)
                SELECT 
                    er.id, er.tipo_embalagem, er.quantidade_embalada, er.data_embalagem, er.observacao, er.status, 
                    p.nome as produto_embalado_nome, er.variante_embalada_nome, u.nome as usuario_responsavel
                FROM embalagens_realizadas er
                JOIN produtos p ON er.produto_embalado_id = p.id
                LEFT JOIN usuarios u ON er.usuario_responsavel_id = u.id
                WHERE er.produto_ref_id = $1

                UNION ALL

                -- 2. Montagens de KIT que usaram o item base como componente (buscando pelo SKU no JSON)
                SELECT 
                    er.id, er.tipo_embalagem, er.quantidade_embalada, er.data_embalagem, er.observacao, er.status,
                    p.nome as produto_embalado_nome, er.variante_embalada_nome, u.nome as usuario_responsavel
                FROM embalagens_realizadas er
                JOIN produtos p ON er.produto_embalado_id = p.id
                LEFT JOIN usuarios u ON er.usuario_responsavel_id = u.id
                WHERE 
                    er.tipo_embalagem = 'KIT' AND
                    jsonb_path_exists(er.componentes_consumidos, '$[*] ? (@.sku == $psku)', jsonb_build_object('psku', $1))
            )
            SELECT * FROM historico_combinado
            ORDER BY data_embalagem DESC
            LIMIT $2 OFFSET $3;
        `;
        
        const countQueryText = `
             SELECT SUM(count) as total_count FROM (
                SELECT COUNT(*) as count FROM embalagens_realizadas WHERE produto_ref_id = $1
                UNION ALL
                SELECT COUNT(*) as count FROM embalagens_realizadas
                WHERE tipo_embalagem = 'KIT' AND jsonb_path_exists(componentes_consumidos, '$[*] ? (@.sku == $psku)', jsonb_build_object('psku', $1))
            ) as subquery_counts;
        `;

        const [result, totalResult] = await Promise.all([
            dbClient.query(queryText, [...params, parseInt(limit), offset]),
            dbClient.query(countQueryText, params)
        ]);

        const total = parseInt(totalResult.rows[0].total_count) || 0;
        const totalPages = Math.ceil(total / parseInt(limit)) || 1;

        res.status(200).json({ rows: result.rows, total: total, page: parseInt(page), pages: totalPages });

    } catch (error) {
        console.error('[API /embalagens/historico] Erro na query:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico de embalagens.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


router.post('/estornar', async (req, res) => {
    const { usuarioLogado } = req;
    const { id_embalagem_realizada } = req.body;

    if (!id_embalagem_realizada) {
        return res.status(400).json({ error: "O ID da embalagem a ser estornada é obrigatório." });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        // A permissão para estornar pode ser a mesma de lançar uma embalagem
        if (!permissoes.includes('lancar-embalagem')) {
            return res.status(403).json({ error: 'Permissão negada para estornar embalagens.' });
        }

        // Inicia a transação para garantir a atomicidade das operações
        await dbClient.query('BEGIN');

        // 1. Busca os detalhes da embalagem que será estornada.
        //    Trava a linha (FOR UPDATE) para evitar que a mesma embalagem seja estornada duas vezes simultaneamente.
        const embalagemOriginalRes = await dbClient.query(
            `SELECT * FROM embalagens_realizadas WHERE id = $1 FOR UPDATE`,
            [id_embalagem_realizada]
        );

        if (embalagemOriginalRes.rows.length === 0) {
            // Se não encontrou, o ID não existe no banco.
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Registro de embalagem não encontrado.' });
        }

        const embalagemOriginal = embalagemOriginalRes.rows[0];

        // 2. VERIFICA O STATUS: Impede o estorno se já foi estornado.
        if (embalagemOriginal.status === 'ESTORNADO') {
            await dbClient.query('ROLLBACK');
            // Retorna um erro 409 Conflict, que é o código HTTP correto para "conflito com o estado atual do recurso".
            return res.status(409).json({ error: 'Esta embalagem já foi estornada anteriormente e não pode ser revertida novamente.' });
        }
        
        // 3. Cria um novo movimento de ESTOQUE de SAÍDA para reverter a entrada original.
        const { produto_embalado_id, variante_embalada_nome, quantidade_embalada, movimento_estoque_id, tipo_embalagem, componentes_consumidos } = embalagemOriginal;
        
        const estornoMovimentoQuery = `
            INSERT INTO estoque_movimentos 
                (produto_id, variante_nome, quantidade, tipo_movimento, usuario_responsavel, observacao)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await dbClient.query(estornoMovimentoQuery, [
            produto_embalado_id,
            variante_embalada_nome,
            -Math.abs(quantidade_embalada), // Garante que a quantidade seja negativa
            `ESTORNO_${tipo_embalagem}`, // Ex: 'ESTORNO_UNIDADE' ou 'ESTORNO_KIT'
            (usuarioLogado.nome || usuarioLogado.nome_usuario),
            `Estorno referente à embalagem #${id_embalagem_realizada}`
        ]);
        console.log(`[API Estorno] Movimento de estoque reverso criado para embalagem #${id_embalagem_realizada}.`);

        // 4. ATUALIZA OS ARREMATES para "devolver" a quantidade ao saldo "Pronto para Embalar".
        if (tipo_embalagem === 'UNIDADE') {
            const movEstoqueOriginalRes = await dbClient.query('SELECT origem_arremate_id FROM estoque_movimentos WHERE id = $1', [movimento_estoque_id]);
            if (movEstoqueOriginalRes.rows.length > 0 && movEstoqueOriginalRes.rows[0].origem_arremate_id) {
                const arremateOrigemId = movEstoqueOriginalRes.rows[0].origem_arremate_id;
                await dbClient.query(
                    `UPDATE arremates SET quantidade_ja_embalada = quantidade_ja_embalada - $1 WHERE id = $2`,
                    [quantidade_embalada, arremateOrigemId]
                );
                console.log(`[API Estorno] Saldo do arremate #${arremateOrigemId} revertido em ${quantidade_embalada} unidades.`);
            } else {
                throw new Error(`Não foi possível rastrear o arremate de origem para a embalagem de UNIDADE #${id_embalagem_realizada}.`);
            }
        } else if (tipo_embalagem === 'KIT' && componentes_consumidos) {
            // Se for KIT, itera sobre o JSON de componentes salvos para reverter cada um.
            for(const componente of componentes_consumidos) {
                // A lógica aqui assume que `componentes_consumidos` é um array de objetos com `{id_arremate, quantidade_usada}`
                if (!componente.id_arremate || !componente.quantidade_usada) {
                    throw new Error(`Componente malformado no JSON da embalagem de KIT #${id_embalagem_realizada}.`);
                }
                await dbClient.query(
                    `UPDATE arremates SET quantidade_ja_embalada = quantidade_ja_embalada - $1 WHERE id = $2`,
                    [componente.quantidade_usada, componente.id_arremate]
                );
                console.log(`[API Estorno] Saldo do arremate componente #${componente.id_arremate} revertido em ${componente.quantidade_usada} unidades.`);
            }
        } else {
             // Lança um erro se não for possível rastrear a origem, forçando o ROLLBACK.
             throw new Error(`Não foi possível rastrear a origem dos arremates para a embalagem #${id_embalagem_realizada}.`);
        }

        // 5. Marca a embalagem original como estornada.
        await dbClient.query(`UPDATE embalagens_realizadas SET status = 'ESTORNADO' WHERE id = $1`, [id_embalagem_realizada]);
        console.log(`[API Estorno] Embalagem #${id_embalagem_realizada} marcada como ESTORNADO.`);

        // 6. Confirma a transação
        await dbClient.query('COMMIT');
        
        res.status(200).json({ message: 'Embalagem estornada com sucesso!' });

    } catch (error) {
        if (dbClient) {
            // Em caso de qualquer erro no bloco try, desfaz todas as operações
            console.error(`[API /embalagens/estornar] Erro na transação para embalagem ID ${id_embalagem_realizada}. Executando ROLLBACK. Erro:`, error.message);
            await dbClient.query('ROLLBACK');
        }
        res.status(500).json({ error: 'Erro interno ao estornar a embalagem.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.get('/contagem-hoje', async (req, res) => {
    // Não precisa de verificação de permissão tão granular,
    // pois a página principal já é protegida. Mas podemos adicionar se quiser.
    // const { usuarioLogado } = req;

    let dbClient;
    try {
        dbClient = await pool.connect();

        // A query conta a soma de 'quantidade_embalada' de todos os registros
        // na tabela 'embalagens_realizadas' que foram criados hoje.
        // Usamos 'data_embalagem::date = NOW()::date' para comparar apenas a parte da data,
        // ignorando a hora, o que é eficiente em PostgreSQL.
        const query = `
            SELECT COALESCE(SUM(quantidade_embalada), 0) as total
            FROM embalagens_realizadas
            WHERE 
                data_embalagem >= date_trunc('day', NOW()) AND
                data_embalagem < date_trunc('day', NOW()) + interval '1 day' AND
                status = 'ATIVO'; -- Conta apenas embalagens que não foram estornadas
        `;
        
        const result = await dbClient.query(query);
        const totalEmbaladoHoje = parseInt(result.rows[0].total) || 0;

        res.status(200).json({ total: totalEmbaladoHoje });

    } catch (error) {
        console.error('[API /embalagens/contagem-hoje] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar a contagem de embalagens de hoje.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});



export default router;