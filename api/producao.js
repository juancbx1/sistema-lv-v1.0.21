// api/producao.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB, determinarStatusFinalServidor } from './usuarios.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação (pode ser copiado de outros arquivos de API)
router.use(async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Token não fornecido');
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
});

// ========= NOSSO NOVO ENDPOINT =========
router.get('/status-funcionarios', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
        if (!permissoes.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        const query = `
            SELECT 
                u.id, u.nome, u.avatar_url, u.status_atual, u.status_data_modificacao,
                u.horario_entrada_1, u.horario_saida_1, u.horario_entrada_2, u.horario_saida_2, 
                u.horario_entrada_3, u.horario_saida_3,
                u.tipos,
                s.id as id_sessao, s.op_numero, s.produto_id, s.variante, s.processo, 
                s.quantidade_atribuida, s.data_inicio,
                p.nome as produto_nome
            FROM usuarios u
            LEFT JOIN sessoes_trabalho_producao s ON u.id = s.funcionario_id AND s.status = 'EM_ANDAMENTO'
            LEFT JOIN produtos p ON s.produto_id = p.id
            WHERE u.data_demissao IS NULL
            AND ('costureira' = ANY(u.tipos) OR 'tiktik' = ANY(u.tipos))
            ORDER BY u.nome ASC;
        `;
        const result = await dbClient.query(query);

        const resultadoFinal = result.rows.map(row => {
            // 1. Calcula o status baseado no horário (Automático)
            let statusFinal = determinarStatusFinalServidor(row);
            
            // 2. LÓGICA DE PRECEDÊNCIA (A CORREÇÃO):
            // Se o banco diz que ele está "LIVRE" (liberado manualmente), 
            // ignoramos o "ALMOÇO" ou "FORA_DO_HORARIO" calculado pelo horário.
            if (row.status_atual === 'LIVRE') {
                statusFinal = 'LIVRE';
            } 
            // Se o banco diz que ele está em "PAUSA_MANUAL" ou "FALTOU", respeitamos também.
            else if (['PAUSA_MANUAL', 'FALTOU', 'ALOCADO_EXTERNO'].includes(row.status_atual)) {
                statusFinal = row.status_atual;
            }

            // 3. Se tiver tarefa ativa, ganha de tudo (PRODUZINDO)
            const tarefaAtiva = row.id_sessao ? {
                id_sessao: row.id_sessao,
                op_numero: row.op_numero,
                produto_id: row.produto_id,
                produto_nome: row.produto_nome,
                variante: row.variante,
                processo: row.processo,
                quantidade: row.quantidade_atribuida,
                data_inicio: row.data_inicio,
            } : null;

            return {
                id: row.id,
                nome: row.nome,
                avatar_url: row.avatar_url,
                tipos: row.tipos,
                // Se tem tarefa, é PRODUZINDO. Senão, usa o status que calculamos acima.
                status_atual: tarefaAtiva ? 'PRODUZINDO' : statusFinal,
                tarefa_atual: tarefaAtiva
            }
        });

        res.status(200).json(resultadoFinal);
    } catch (error) {
        console.error('[API /producao/status-funcionarios V2] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar status dos funcionários.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.get('/fila-de-tarefas', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        // ... (verificação de permissão)

        // --- INÍCIO DA ESTRATÉGIA "BULK DATA" ---

        // 1. "Pegar as Prateleiras de Dados" - Buscamos tudo em paralelo
        const [opsResult, producoesResult, sessoesResult, produtosResult] = await Promise.all([
            // Prateleira 1: Todas as OPs ativas
            dbClient.query(`SELECT numero, produto_id, variante, quantidade, etapas FROM ordens_de_producao WHERE status IN ('em-aberto', 'produzindo')`),
            // Prateleira 2: Todos os lançamentos de produção já feitos
            dbClient.query(`SELECT op_numero, etapa_index, SUM(quantidade) as total_lancado FROM producoes GROUP BY op_numero, etapa_index`),
            // Prateleira 3: Todas as sessões de produção atualmente EM ANDAMENTO
            dbClient.query(`SELECT op_numero, processo, SUM(quantidade_atribuida) as total_em_trabalho FROM sessoes_trabalho_producao WHERE status = 'EM_ANDAMENTO' GROUP BY op_numero, processo`),
            // Prateleira 4: Todos os produtos (para pegar imagens e nomes)
            dbClient.query(`SELECT id, nome, imagem FROM produtos`)
        ]);

        // 2. "Preparar os Ingredientes" - Criamos mapas para acesso rápido
        const lancamentosMap = new Map(producoesResult.rows.map(r => [`${r.op_numero}-${r.etapa_index}`, parseInt(r.total_lancado, 10)]));
        const emTrabalhoMap = new Map(sessoesResult.rows.map(r => [`${r.op_numero}-${r.processo}`, parseInt(r.total_em_trabalho, 10)]));
        const produtosMap = new Map(produtosResult.rows.map(p => [p.id, p]));

        // 3. "Cozinhar a Receita" - Processamos os dados em JavaScript
        const tarefasDisponiveis = [];
        for (const op of opsResult.rows) {
            if (!op.etapas || op.etapas.length === 0) continue;

            let saldoDaEtapaAnterior = op.quantidade; // O saldo inicial é a quantidade original da OP

            for (let i = 0; i < op.etapas.length; i++) {
                const etapaConfig = op.etapas[i];
                const processo = etapaConfig.processo || etapaConfig;
                const chaveLancamento = `${op.numero}-${i}`;

                // Quantidade REAL produzida e lançada na etapa anterior
                // Para a primeira etapa (i=0), consideramos o que foi lançado no corte (se houver)
                if (i > 0) {
                    const chaveLancamentoAnterior = `${op.numero}-${i - 1}`;
                    saldoDaEtapaAnterior = lancamentosMap.get(chaveLancamentoAnterior) || 0;
                } else { // Para a primeira etapa (Corte)
                     const chaveLancamentoCorte = `${op.numero}-0`;
                     // Se o corte já foi lançado, seu saldo é sua própria quantidade.
                     // Se não, o saldo disponível para ele é o total da OP.
                     if(lancamentosMap.has(chaveLancamentoCorte)){
                         saldoDaEtapaAnterior = lancamentosMap.get(chaveLancamentoCorte);
                     } else {
                         saldoDaEtapaAnterior = op.quantidade;
                     }
                }

                // A quantidade que JÁ FOI FEITA nesta etapa
                const jaLancadoNestaEtapa = lancamentosMap.get(chaveLancamento) || 0;
                
                // A quantidade que está AGORA nas mãos de alguém
                const emTrabalhoNestaEtapa = emTrabalhoMap.get(`${op.numero}-${processo}`) || 0;

                // O saldo disponível REAL é o que veio da etapa anterior, menos o que já foi feito e o que está em andamento.
                const saldoRealDisponivel = saldoDaEtapaAnterior - jaLancadoNestaEtapa - emTrabalhoNestaEtapa;
                
                if (saldoRealDisponivel > 0) {
                    // ENCONTRAMOS UMA TAREFA VÁLIDA!
                    const produtoInfo = produtosMap.get(op.produto_id);
                    tarefasDisponiveis.push({
                        produto_id: op.produto_id,
                        produto_nome: produtoInfo?.nome || 'Produto Desconhecido',
                        imagem_produto: produtoInfo?.imagem || null,
                        variante: op.variante,
                        processo: processo,
                        quantidade_disponivel: saldoRealDisponivel,
                        origem_ops: [op.numero]
                    });
                    break; // Para e vai para a próxima OP
                }
            }
        }

        // 4. "Servir o Prato" - Agrupamos e enviamos
        const filaAgrupada = tarefasDisponiveis.reduce((acc, tarefa) => {
            const chaveAgrupamento = `${tarefa.produto_id}-${tarefa.variante}-${tarefa.processo}`;
            if (!acc[chaveAgrupamento]) {
                acc[chaveAgrupamento] = { ...tarefa };
            } else {
                acc[chaveAgrupamento].quantidade_disponivel += tarefa.quantidade_disponivel;
                acc[chaveAgrupamento].origem_ops.push(...tarefa.origem_ops);
            }
            return acc;
        }, {});

        res.status(200).json(Object.values(filaAgrupada));

    } catch (error) {
        console.error('[API /producao/fila-de-tarefas V2] Erro:', error);
        res.status(500).json({ error: 'Erro ao montar a fila de tarefas de produção.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA GET: Busca todos os tempos padrão salvos
router.get('/tempos-padrao', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        // Não precisa de permissão específica, pois é um dado de configuração geral
        // para quem já tem acesso à página.

        const result = await dbClient.query('SELECT produto_id, processo, tempo_segundos FROM tempos_padrao_producao');
        
        // Transforma o array em um objeto para fácil acesso no frontend
        // Ex: { "1-Fechamento": 30.00, "1-Finalização": 25.50 }
        const temposObjeto = result.rows.reduce((acc, row) => {
            const chave = `${row.produto_id}-${row.processo}`;
            acc[chave] = parseFloat(row.tempo_segundos);
            return acc;
        }, {});

        res.status(200).json(temposObjeto);

    } catch (error) {
        console.error('[API /producao/tempos-padrao GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar tempos padrão.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// ROTA POST: Salva ou atualiza os tempos padrão
router.post('/tempos-padrao', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
        // Requer uma permissão específica para evitar que qualquer um altere os tempos
        if (!permissoes.includes('gerenciar-permissoes')) { // Usando uma permissão de admin/supervisor
            return res.status(403).json({ error: 'Permissão negada para configurar tempos padrão.' });
        }

        const tempos = req.body.tempos; // Espera um objeto como { "1-Fechamento": "30" }
        if (typeof tempos !== 'object' || tempos === null) {
            return res.status(400).json({ error: 'Formato de dados inválido.' });
        }

        await dbClient.query('BEGIN');

        for (const chave in tempos) {
            const [produto_id_str, ...processoParts] = chave.split('-');
            const processo = processoParts.join('-'); // Junta o resto, caso o processo tenha hífens
            const produto_id = parseInt(produto_id_str, 10);
            const tempo_segundos = parseFloat(tempos[chave]);

            if (!isNaN(produto_id) && processo && !isNaN(tempo_segundos) && tempo_segundos >= 0) {
                // ON CONFLICT (produto_id, processo) DO UPDATE -> Isso é um "UPSERT".
                // Se a combinação já existe, ele atualiza (UPDATE). Se não, ele insere (INSERT).
                await dbClient.query(`
                    INSERT INTO tempos_padrao_producao (produto_id, processo, tempo_segundos)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (produto_id, processo)
                    DO UPDATE SET tempo_segundos = EXCLUDED.tempo_segundos;
                `, [produto_id, processo, tempo_segundos]);
            }
        }

        await dbClient.query('COMMIT');

        res.status(200).json({ message: 'Tempos padrão salvos com sucesso!' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /producao/tempos-padrao POST] Erro:', error);
        res.status(500).json({ error: 'Erro ao salvar tempos padrão.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// ========= ROTA PARA CANCELAR UMA SESSÃO DE PRODUÇÃO =========
router.put('/sessoes/cancelar', async (req, res) => {
    const { usuarioLogado } = req;
    const { id_sessao } = req.body;
    let dbClient;

    if (!id_sessao) {
        return res.status(400).json({ error: 'ID da sessão é obrigatório.' });
    }

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // Usando uma permissão de supervisor/líder
        if (!permissoes.includes('editar-op')) {
            throw new Error('Permissão negada para cancelar tarefas.');
        }

        const sessaoResult = await dbClient.query('SELECT * FROM sessoes_trabalho_producao WHERE id = $1 FOR UPDATE', [id_sessao]);
        if (sessaoResult.rows.length === 0) throw new Error('Sessão de trabalho não encontrada.');
        const sessao = sessaoResult.rows[0];
        if (sessao.status !== 'EM_ANDAMENTO') throw new Error('Esta tarefa não está mais em andamento.');

        // Atualiza a sessão para CANCELADA
        await dbClient.query(`UPDATE sessoes_trabalho_producao SET status = 'CANCELADA', data_fim = NOW() WHERE id = $1`, [id_sessao]);

        // Libera o empregado
        await dbClient.query(
            `UPDATE usuarios SET status_atual = 'LIVRE', id_sessao_trabalho_atual = NULL WHERE id = $1 AND id_sessao_trabalho_atual = $2`,
            [sessao.funcionario_id, id_sessao]
        );

        await dbClient.query('COMMIT');
        res.status(200).json({ message: 'Tarefa cancelada com sucesso!' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /producao/sessoes/cancelar PUT] Erro:', error);
        res.status(500).json({ error: 'Erro ao cancelar tarefa.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


export default router;