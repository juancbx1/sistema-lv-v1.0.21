// api/demandas.js

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { gerarDiagnosticoCompleto } from './utils/diagnosticoProducao.js';


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
    // Pega as informações do usuário logado que vieram do token
    const { usuarioLogado } = req;
    let dbClient;

    try {
        // Pega uma conexão do pool para usar no banco
        dbClient = await pool.connect();

        // Extrai os dados que o frontend vai enviar no corpo da requisição
        const { produto_sku, quantidade_solicitada, observacoes } = req.body;

        // --- Validação dos Dados de Entrada ---
        if (!produto_sku || !quantidade_solicitada) {
            return res.status(400).json({ error: 'SKU do produto e quantidade são obrigatórios.' });
        }
        const quantidade = parseInt(quantidade_solicitada);
        if (isNaN(quantidade) || quantidade <= 0) {
            return res.status(400).json({ error: 'A quantidade solicitada deve ser um número positivo.' });
        }

        // --- Inserção no Banco de Dados ---
        const insertQuery = `
            INSERT INTO demandas_producao
                (produto_sku, quantidade_solicitada, solicitado_por, observacoes)
            VALUES
                ($1, $2, $3, $4)
            RETURNING *; -- 'RETURNING *' faz com que o banco retorne a linha que acabou de ser inserida
        `;

        const result = await dbClient.query(insertQuery, [
            produto_sku,
            quantidade,
            usuarioLogado.nome, // Pega o nome do usuário do token
            observacoes || null // Se não houver observação, insere NULL
        ]);

        // Retorna o status 201 (Created) e os dados da nova demanda criada
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API /demandas POST] Erro ao criar demanda:', error);
        res.status(500).json({ error: 'Erro interno ao criar a demanda.', details: error.message });
    } finally {
        // ESSENCIAL: Libera a conexão de volta para o pool, ocorrendo erro ou não.
        if (dbClient) {
            dbClient.release();
        }
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
            WHERE status IN ('pendente', 'em_atendimento')
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

        // 1. Chama a função centralizada que faz todo o trabalho pesado
        const diagnostico = await gerarDiagnosticoCompleto(dbClient);

        // 2. Lógica de auto-conclusão (como planejado)
        diagnostico.diagnosticoPorDemanda.forEach(demanda => {
            // ======================= LÓGICA DE AUTO-CONCLUSÃO CORRIGIDA =======================
            let demandaEstaConcluida = false;

            if (demanda.is_kit) {
                // Para KITS, a condição é ter os kits prontos em estoque.
                if (demanda.diagnostico_geral.kits_prontos_estoque >= demanda.quantidade_solicitada) {
                    demandaEstaConcluida = true;
                }
            } else {
                // Para PRODUTOS SIMPLES, a condição é ter as unidades prontas em estoque.
                if (demanda.diagnostico_geral.saldoEstoque >= demanda.quantidade_solicitada) {
                    demandaEstaConcluida = true;
                }
            }

            // Apenas atualiza o status se a condição foi atendida E o status atual ainda for 'em_producao' ou 'pendente'.
            if (demandaEstaConcluida && demanda.status !== 'concluida') {
                console.log(`[Auto-Conclusão Rígida] Demanda #${demanda.id} foi completada pelo estoque. Atualizando status.`);
                dbClient.query('UPDATE demandas_producao SET status = $1 WHERE id = $2', ['concluida', demanda.id])
                    .catch(err => console.error(`Erro ao auto-concluir demanda #${demanda.id}:`, err));
            }
            // ===================================================================================
        });

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
    const { usuarioLogado } = req;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const { id } = req.params; // Pega o ID da URL (ex: /api/demandas/5)

        // OPCIONAL, MAS RECOMENDADO: Verificar permissões específicas para deleção
        // Se você tiver uma permissão como 'gerenciar-demandas', poderia checar aqui.

        const deleteQuery = 'DELETE FROM demandas_producao WHERE id = $1';
        const result = await dbClient.query(deleteQuery, [id]);

        // O 'result.rowCount' nos diz quantas linhas foram afetadas.
        if (result.rowCount === 0) {
            // Se for 0, significa que não encontrou uma demanda com aquele ID.
            return res.status(404).json({ error: 'Demanda não encontrada.' });
        }

        // Se chegou aqui, a deleção foi bem-sucedida.
        res.status(200).json({ message: 'Demanda removida com sucesso.' });

    } catch (error) {
        console.error('[API /demandas DELETE] Erro ao deletar demanda:', error);
        res.status(500).json({ error: 'Erro interno ao remover a demanda.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
        }
    }
});

// ROTA PARA UM SUPERVISOR "ASSUMIR" A PRODUÇÃO DE UM COMPONENTE
// Isso atualiza todas as demandas dependentes daquele componente.
router.put('/assumir-producao-componente', async (req, res) => {
    const { usuarioLogado } = req;
    const { componente_chave } = req.body;

    if (!componente_chave) {
        return res.status(400).json({ error: 'A chave do componente é obrigatória.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();

        const insertQuery = `
            INSERT INTO demandas_componentes_atribuidos (componente_chave, atribuida_a)
            VALUES ($1, $2)
            ON CONFLICT (componente_chave) DO UPDATE SET
                atribuida_a = EXCLUDED.atribuida_a,
                data_atribuicao = NOW();
        `;
        // ON CONFLICT... garante que se alguém já assumiu, o novo clique "rouba" a tarefa.

        await dbClient.query(insertQuery, [
            componente_chave,
            usuarioLogado.nome
        ]);

        res.status(200).json({ 
            message: `Produção do componente ${componente_chave} foi atribuída a ${usuarioLogado.nome}.` 
        });

    } catch (error) {
        console.error('[API /assumir-producao-componente PUT] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao atribuir produção do componente.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;