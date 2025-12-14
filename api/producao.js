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
            // 1. Calcula o status baseado no horário (Automático: ALMOCO, PAUSA, FORA_DO_HORARIO, etc)
            let statusCalculado = determinarStatusFinalServidor(row);

            // 2. LÓGICA DE PRECEDÊNCIA CORRIGIDA:

            // Se o usuário está em uma tarefa (Sessão Ativa), isso ganha de TUDO.
            const tarefaAtiva = row.id_sessao ? {
                id_sessao: row.id_sessao,
                // ... (resto dos dados da tarefa)
                op_numero: row.op_numero,
                produto_id: row.produto_id,
                produto_nome: row.produto_nome,
                variante: row.variante,
                processo: row.processo,
                quantidade: row.quantidade_atribuida,
                data_inicio: row.data_inicio,
            } : null;

            let statusFinal = statusCalculado; // Começamos assumindo o cálculo do horário/manual forte

            if (tarefaAtiva) {
                statusFinal = 'PRODUZINDO';
            } 
            // Se não está produzindo, verificamos se o cálculo automático retornou apenas "LIVRE"
            // Mas o banco diz que é uma exceção manual forte (ex: FALTOU, PAUSA_MANUAL, ALOCADO_EXTERNO)
            else {
                // Lista de status manuais que DEVEM prevalecer sobre o horário automático
                // OBS: 'LIVRE' não entra aqui, pois 'LIVRE' no banco é placeholder.
                const statusManuaisFortes = ['FALTOU', 'PAUSA_MANUAL', 'ALOCADO_EXTERNO', 'LIVRE_MANUAL'];
                
                if (statusManuaisFortes.includes(row.status_atual)) {
                    // Precisamos verificar se essa definição manual é de HOJE (lógica que já existe no determinarStatusFinal, mas reforçamos)
                    // Como o determinarStatusFinalServidor já trata data, podemos confiar nele OU no row.status_atual direto.
                    // Pela sua lógica atual, row.status_atual é o que manda se for manual.
                    statusFinal = row.status_atual;
                    
                    // Ajuste visual: LIVRE_MANUAL deve aparecer como LIVRE para o usuário, mas com prioridade alta
                    if (statusFinal === 'LIVRE_MANUAL') statusFinal = 'LIVRE'; 
                }
                // SE NÃO FOR MANUAL FORTE:
                // Mantemos o `statusCalculado`. 
                // Isso significa que se o banco diz "LIVRE", mas o horário diz "ALMOCO", o statusCalculado será "ALMOCO".
                // Isso corrige o seu bug!
            }

            return {
                id: row.id,
                nome: row.nome,
                avatar_url: row.avatar_url,
                tipos: row.tipos,
                status_atual: statusFinal,
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
        
        // 1. "Pegar as Prateleiras de Dados" - Buscamos tudo em paralelo
        const [opsResult, producoesResult, sessoesResult, produtosResult] = await Promise.all([
            // Prateleira 1: Todas as OPs ativas (FIFO: Ordenadas por número para consumir as antigas primeiro)
            dbClient.query(`SELECT numero, produto_id, variante, quantidade, etapas FROM ordens_de_producao WHERE status IN ('em-aberto', 'produzindo') ORDER BY numero ASC`),
            
            // Prateleira 2: Todos os lançamentos de produção já feitos
            dbClient.query(`SELECT op_numero, etapa_index, SUM(quantidade) as total_lancado FROM producoes GROUP BY op_numero, etapa_index`),
            
            // Prateleira 3: Sessões EM ANDAMENTO (Agrupado por Produto/Etapa, IGNORANDO a OP específica)
            // Isso permite o "Abatimento Global": Se alguém está fazendo 9 peças de Faixa Peach, descontamos do total disponível, não importa a OP.
            dbClient.query(`
                SELECT produto_id, variante, processo, SUM(quantidade_atribuida) as total_em_trabalho 
                FROM sessoes_trabalho_producao 
                WHERE status = 'EM_ANDAMENTO' 
                GROUP BY produto_id, variante, processo
            `),
            
            // Prateleira 4: Produtos
            dbClient.query(`SELECT id, nome, imagem FROM produtos`)
        ]);

        // 2. Mapas de Acesso Rápido
        const lancamentosMap = new Map(producoesResult.rows.map(r => [`${r.op_numero}-${r.etapa_index}`, parseInt(r.total_lancado, 10)]));
        const produtosMap = new Map(produtosResult.rows.map(p => [p.id, p]));
        
        // Mapa de Trabalho Global: Chave "ProdID-Variante-Processo" -> Quantidade Total sendo feita na fábrica
        const emTrabalhoGlobalMap = new Map();
        sessoesResult.rows.forEach(r => {
             const chave = `${r.produto_id}-${r.variante || '-'}-${r.processo}`;
             emTrabalhoGlobalMap.set(chave, parseInt(r.total_em_trabalho, 10));
        });

        // 3. Processamento (Cozinha)
        const tarefasDisponiveis = [];

        for (const op of opsResult.rows) {
            if (!op.etapas || op.etapas.length === 0) continue;

            for (let i = 0; i < op.etapas.length; i++) {
                const etapaConfig = op.etapas[i];
                const processo = etapaConfig.processo || etapaConfig;
                const chaveLancamento = `${op.numero}-${i}`;

                // A. Quanto entrou nesta etapa? (Vindo da etapa anterior ou do corte inicial)
                let saldoEntrada = 0;
                if (i === 0) {
                    // Corte: Entra o total da OP
                    saldoEntrada = parseInt(op.quantidade, 10);
                } else {
                    // Outras: Entra o que foi finalizado na etapa anterior
                    const chaveLancamentoAnterior = `${op.numero}-${i - 1}`;
                    saldoEntrada = lancamentosMap.get(chaveLancamentoAnterior) || 0;
                }

                // B. Quanto já saiu desta etapa? (Já finalizado)
                const jaProduzidoNestaEtapa = lancamentosMap.get(chaveLancamento) || 0;

                // C. Saldo Líquido da OP (Disponível fisicamente, sem contar quem está trabalhando nela agora)
                let saldoLiquidoOP = Math.max(0, saldoEntrada - jaProduzidoNestaEtapa);

                // D. Abatimento Global (Waterfall Virtual)
                // Verifica se há gente trabalhando nisso na fábrica e desconta desta OP se tiver saldo.
                const chaveGlobal = `${op.produto_id}-${op.variante || '-'}-${processo}`;
                let emTrabalhoGlobal = emTrabalhoGlobalMap.get(chaveGlobal) || 0;

                // Se tem gente trabalhando, abate deste saldo
                const descontoTrabalho = Math.min(saldoLiquidoOP, emTrabalhoGlobal);
                
                // O Saldo Real é o que sobra
                const saldoRealDisponivel = saldoLiquidoOP - descontoTrabalho;

                // Atualiza o "Bolo Global" de trabalho para a próxima OP da fila
                // (Se descontamos 7 daqui, sobram 2 para descontar da próxima OP)
                if (descontoTrabalho > 0) {
                     emTrabalhoGlobalMap.set(chaveGlobal, emTrabalhoGlobal - descontoTrabalho);
                }
                
                // Se sobrou saldo real, adiciona na lista de tarefas
                if (saldoRealDisponivel > 0) {
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
                }
            }
        }

        // 4. Agrupamento Final
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
        console.error('[API /producao/fila-de-tarefas V3] Erro:', error);
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