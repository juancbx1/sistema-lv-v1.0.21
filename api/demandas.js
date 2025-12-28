// api/demandas.js

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { gerarDiagnosticoCompleto, limparAtribuicoesOrfas } from './utils/diagnosticoProducao.js';


// 1. Inicialização do Express Router e do Pool de Conexão com o Banco
const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// 2. Middleware de Autenticação (copiado de outras APIs para consistência)
// Garante que apenas usuários logados possam acessar as rotas deste arquivo.
router.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token mal formatado' });
    }
    try {
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
});


// POST /api/demandas/
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const { produto_sku, quantidade_solicitada, observacoes, prioridade } = req.body;

        // Validação
        if (!produto_sku || !quantidade_solicitada) {
            return res.status(400).json({ error: 'SKU e quantidade são obrigatórios.' });
        }
        
        // Conversão forçada para garantir
        const prioridadeFinal = (parseInt(prioridade) === 1) ? 1 : 2; 
        
        const insertQuery = `
            INSERT INTO demandas_producao
                (produto_sku, quantidade_solicitada, solicitado_por, observacoes, prioridade)
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING *;
        `;

        const result = await dbClient.query(insertQuery, [
            produto_sku,
            parseInt(quantidade_solicitada),
            usuarioLogado.nome,
            observacoes || null,
            prioridadeFinal // Agora vai salvar 1 ou 2 corretamente
        ]);

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API /demandas POST] Erro:', error);
        res.status(500).json({ error: 'Erro interno.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/demandas/
router.get('/', async (req, res) => {
    let dbClient;

    try {
        dbClient = await pool.connect();

        // A query busca todas as demandas que não estão com o status 'concluidas'.
        // A ordenação é a chave para o nosso painel de prioridades:
        // 1. Ordena pelo campo 'prioridade' em ordem crescente (1, 2, 3...).
        // 2. Se duas demandas tiverem a mesma prioridade, a mais antiga (data_solicitacao) aparece primeiro.
        const selectQuery = `
            SELECT * FROM demandas_producao
            WHERE status IN ('pendente', 'em_atendimento', 'concluida')
            ORDER BY prioridade ASC, data_solicitacao ASC;
        `;

        const result = await dbClient.query(selectQuery);

        // Retorna o status 200 (OK) e a lista de demandas encontradas em formato JSON
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API /demandas GET] Erro ao listar demandas:', error);
        res.status(500).json({ error: 'Erro interno ao listar as demandas.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
        }
    }
});


// GET /api/demandas/diagnostico-completo
router.get('/diagnostico-completo', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Chama a função centralizada (Balanço Hídrico)
        const diagnostico = await gerarDiagnosticoCompleto(dbClient);

        // 2. REMOVEMOS A AUTO-CONCLUSÃO AUTOMÁTICA AQUI.
        // A lógica antiga estava baseada em estoque estático e causava sumiço de demandas.
        // Agora, o Painel mostra o Balanço. Se o supervisor ver que está tudo verde, ele pode concluir manualmente.
        
        // (Opcional) Podemos reativar uma limpeza de orfãs se necessário, 
        // mas vamos manter simples por enquanto para estabilizar.
        // limparAtribuicoesOrfas(dbClient).catch(...) 

        // 3. Envia a resposta final para o frontend
        res.status(200).json(diagnostico);

    } catch (error) {
        console.error('[API /demandas/diagnostico-completo GET] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao gerar diagnóstico.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// DELETE /api/demandas/:id
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    let dbClient;

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        // 1. Deleta a demanda
        const deleteResult = await dbClient.query('DELETE FROM demandas_producao WHERE id = $1', [id]);

        if (deleteResult.rowCount === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Demanda não encontrada.' });
        }

        // 2. Chama a função de limpeza para remover quaisquer atribuições que se tornaram órfãs
        await limparAtribuicoesOrfas(dbClient);

        await dbClient.query('COMMIT');
        res.status(200).json({ message: 'Demanda removida e atribuições limpas com sucesso.' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /demandas DELETE] Erro ao deletar demanda:', error);
        res.status(500).json({ error: 'Erro interno ao remover a demanda.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA PARA UM SUPERVISOR "ASSUMIR" A PRODUÇÃO DE UM COMPONENTE
// Agora ela também "congela" a meta de produção no momento da atribuição.
router.put('/assumir-producao-componente', async (req, res) => {
    const { usuarioLogado } = req;
    // Recebe a chave do componente E a necessidade de produção calculada pelo frontend
    const { componente_chave, necessidade_producao } = req.body;

    // Validação robusta dos dados de entrada
    if (!componente_chave || necessidade_producao === undefined) {
        return res.status(400).json({ error: 'A chave do componente e a necessidade de produção são obrigatórias.' });
    }

    const necessidadeNum = parseInt(necessidade_producao);
    if (isNaN(necessidadeNum) || necessidadeNum < 0) {
        return res.status(400).json({ error: 'A necessidade de produção deve ser um número válido.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();

        // Query de inserção/atualização na tabela de atribuições
        const insertQuery = `
            INSERT INTO demandas_componentes_atribuidos 
                (componente_chave, atribuida_a, necessidade_producao_no_momento)
            VALUES ($1, $2, $3)
            ON CONFLICT (componente_chave) DO UPDATE SET
                atribuida_a = EXCLUDED.atribuida_a,
                data_atribuicao = NOW();
                -- Propositalmente NÃO atualizamos a 'necessidade_producao_no_momento' em um conflito (ON CONFLICT).
                -- Isso garante que a meta original "congelada" no primeiro clique seja mantida,
                -- mesmo que outro supervisor assuma a tarefa depois.
        `;

        await dbClient.query(insertQuery, [
            componente_chave,
            usuarioLogado.nome,
            necessidadeNum
        ]);

        // Passo Adicional: Atualizar o status de TODAS as demandas dependentes para 'em_producao'
        // Primeiro, precisamos encontrar os IDs das demandas.
        // (Esta lógica é uma simplificação; idealmente, ela viria do frontend, mas faremos aqui para garantir)
        const demandasAfetadasQuery = `
            SELECT id FROM (
                SELECT d.id, p.id as produto_id, g.variacao
                FROM demandas_producao d
                JOIN produtos p ON p.sku = d.produto_sku OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p.grade) as gr(sku TEXT) WHERE gr.sku = d.produto_sku)
                LEFT JOIN jsonb_to_recordset(p.grade) as g(sku TEXT, variacao TEXT) ON g.sku = d.produto_sku
                WHERE d.status = 'pendente' AND p.is_kit = FALSE
                
                UNION
                
                SELECT d.id, (comp->>'produto_id')::int as produto_id, comp->>'variacao' as variacao
                FROM demandas_producao d
                JOIN produtos p ON p.sku = d.produto_sku OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p.grade) as gr(sku TEXT) WHERE gr.sku = d.produto_sku)
                JOIN jsonb_to_recordset(p.grade) as g(composicao JSONB) ON p.is_kit = TRUE
                CROSS JOIN jsonb_array_elements(g.composicao) as comp
                WHERE d.status = 'pendente'
            ) as subquery
            WHERE subquery.produto_id = $1 AND (subquery.variacao = $2 OR (subquery.variacao IS NULL AND $2 IS NULL));
        `;
        const [produtoId, variacao] = componente_chave.split('|');
        const resDemandas = await dbClient.query(demandasAfetadasQuery, [produtoId, variacao === '-' ? null : variacao]);
        const idsDemandasAfetadas = resDemandas.rows.map(r => r.id);

        if (idsDemandasAfetadas.length > 0) {
            await dbClient.query(
                `UPDATE demandas_producao SET status = 'em_producao' WHERE id = ANY($1::int[])`,
                [idsDemandasAfetadas]
            );
        }

        res.status(200).json({ 
            message: `Produção do componente ${componente_chave} foi atribuída a ${usuarioLogado.nome} com a meta de ${necessidadeNum} pçs.`
        });

    } catch (error) {
        console.error('[API /assumir-producao-componente PUT] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao atribuir produção do componente.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA PARA ATUALIZAR A META DE PRODUÇÃO DE UM COMPONENTE JÁ ASSUMIDO
router.put('/atualizar-meta-componente', async (req, res) => {
    const { usuarioLogado } = req;
    const { componente_chave, valor_a_adicionar } = req.body;

    if (!componente_chave || valor_a_adicionar === undefined) {
        return res.status(400).json({ error: 'A chave do componente e o valor a adicionar são obrigatórios.' });
    }
    const valorNum = parseInt(valor_a_adicionar);
    if (isNaN(valorNum) || valorNum < 0) {
        return res.status(400).json({ error: 'O valor a adicionar deve ser um número positivo.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();

        // Query que atualiza a meta somando o valor adicional
        const updateQuery = `
            UPDATE demandas_componentes_atribuidos
            SET necessidade_producao_no_momento = necessidade_producao_no_momento + $1
            WHERE componente_chave = $2
            RETURNING *;
        `;

        const result = await dbClient.query(updateQuery, [valorNum, componente_chave]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Atribuição para este componente não encontrada. Não foi possível atualizar a meta.' });
        }

        res.status(200).json({ 
            message: `Meta para ${componente_chave} atualizada com sucesso.`,
            atribuicaoAtualizada: result.rows[0]
        });

    } catch (error) {
        console.error('[API /atualizar-meta-componente PUT] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar a meta de produção.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;