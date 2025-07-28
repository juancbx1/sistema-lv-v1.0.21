// api/pagamentos.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';
import { ciclos } from '../public/js/utils/ciclos.js'; // Importamos a definição de ciclos

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Objeto para mapear nomes lógicos para IDs de categoria
const CATEGORIA_MAP = {
    COMISSAO: null,        // Singular
    SALARIO: null,
    VALE_TRANSPORTE: null,
    BONUS_PREMIACOES: null, // Nome mais descritivo
    BENEFICIOS_DIVERSOS: null
};

// Função que inicializa o mapeamento ao iniciar o servidor
async function inicializarMapeamentoCategorias() {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const categoriasNomes = [
            'Comissão',
            'Salário',
            'Vale Transporte',
            'Bônus e Premiações',
            'Benefícios Diversos'
        ];
        
        const query = "SELECT id, nome FROM fc_categorias WHERE nome = ANY($1::text[])";
        const result = await dbClient.query(query, [categoriasNomes]);

        result.rows.forEach(cat => {
            if (cat.nome === 'Comissão') CATEGORIA_MAP.COMISSAO = cat.id;
            if (cat.nome === 'Salário') CATEGORIA_MAP.SALARIO = cat.id;
            if (cat.nome === 'Vale Transporte') CATEGORIA_MAP.VALE_TRANSPORTE = cat.id;
            if (cat.nome === 'Bônus e Premiações') CATEGORIA_MAP.BONUS_PREMIACOES = cat.id;
            if (cat.nome === 'Benefícios Diversos') CATEGORIA_MAP.BENEFICIOS_DIVERSOS = cat.id;
        });
        
    } catch (error) {
        console.error('[API Pagamentos] ERRO CRÍTICO ao mapear categorias. Pagamentos podem falhar.', error);
    } finally {
        if (dbClient) dbClient.release();
    }
}

// Chama a função de inicialização uma vez quando o servidor sobe
inicializarMapeamentoCategorias();

// --- Middleware de Autenticação para este Módulo ---
router.use(async (req, res, next) => {

    let dbClient;
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token não fornecido.' });
        }
        
        // 1. Decodifica o token para obter o ID do usuário
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        
        // 2. Conecta ao banco de dados para buscar as permissões
        dbClient = await pool.connect();
        req.permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
        
        // --- LOG DE SUCESSO DO MIDDLEWARE ---
        console.log(`[PAGAMENTOS MIDDLEWARE] Permissões carregadas para o usuário ID ${req.usuarioLogado.id}.`);

        next(); // Passa para a rota específica (ex: /efetuar, /registros-dias)

    } catch (error) {
        let message = 'Token inválido ou expirado.';
        if (error.name === 'TokenExpiredError') {
            message = 'Sessão expirada. Faça login novamente.';
        } else {
            console.error('[PAGAMENTOS MIDDLEWARE] Erro:', error);
        }
        return res.status(401).json({ error: message, details: 'jwt_error' });
    } finally {
        // IMPORTANTE: O middleware libera a conexão.
        // As rotas que o seguem precisarão de sua própria conexão.
        if (dbClient) dbClient.release();
    }
});

// --- ROTA PRINCIPAL DE CÁLCULO ---
// GET /api/pagamentos/calcular?usuario_id=123&ciclo_index=4
router.get('/calcular', async (req, res) => {
    const { usuario_id, tipo_pagamento, ciclo_index, mes_referencia, data_inicio, data_fim } = req.query;

    if (!usuario_id || !tipo_pagamento) {
        return res.status(400).json({ error: 'Parâmetros usuario_id e tipo_pagamento são obrigatórios.' });
    }

    // Variáveis para armazenar os resultados dos cálculos
    let salarioProporcional = 0;
    let valorComissao = 0;
    let valorTotalPassagens = 0;
    let valorBeneficios = 0; // Para o futuro
    let descontoVT = 0;
    let totalPontosComissao = 0;
    let cicloSelecionado = null; // Para guardar os detalhes do ciclo se houver
    let periodoDetalhe = tipo_pagamento; // Detalhe para o frontend

    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Buscar dados base do usuário (sempre necessário)
        const userRes = await dbClient.query('SELECT * FROM usuarios WHERE id = $1', [usuario_id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'Empregado não encontrado.' });
        }
        const usuario = userRes.rows[0];

        // 2. Lógica de cálculo baseada no tipo de pagamento
        switch (tipo_pagamento) {
            case 'SALARIO':
                if (!mes_referencia) return res.status(400).json({ error: 'Mês de referência é obrigatório para cálculo de salário.' });
                // Para o salário, pagamos o valor fixo mensal. A proporcionalidade pode ser ajustada se necessário.
                salarioProporcional = usuario.salario_fixo;
                periodoDetalhe = new Date(mes_referencia + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                break;

            case 'COMISSAO':
            if (ciclo_index === undefined) {
                return res.status(400).json({ error: 'Ciclo é obrigatório para cálculo de comissão.' });
            }
            cicloSelecionado = ciclos[parseInt(ciclo_index)];
            if (!cicloSelecionado) {
                return res.status(404).json({ error: 'Ciclo não encontrado.' });
            }
            
            periodoDetalhe = cicloSelecionado.nome;
            let detalhesSemanas = [];
            const tipoUsuario = usuario.tipos?.includes('costureira') ? 'costureira' : 'tiktik';

            // Itera sobre cada semana do ciclo para calcular individualmente
            for (const semana of cicloSelecionado.semanas) {
                const dataFimSemana = new Date(semana.fim + 'T23:59:59');

                // 1. Encontra a versão de metas correta para esta semana específica
                const versaoQuery = `
                    SELECT id FROM metas_versoes
                    WHERE data_inicio_vigencia <= $1
                    ORDER BY data_inicio_vigencia DESC LIMIT 1;
                `;
                const versaoResult = await dbClient.query(versaoQuery, [dataFimSemana]);
                if (versaoResult.rows.length === 0) {
                    throw new Error(`Nenhuma configuração de meta encontrada para a semana que termina em ${semana.fim}`);
                }
                const idVersaoCorreta = versaoResult.rows[0].id;

                // 2. Busca as regras de meta para essa versão, tipo de usuário e nível
                const regrasQuery = `
                    SELECT pontos_meta, valor_comissao, descricao_meta 
                    FROM metas_regras 
                    WHERE id_versao = $1 AND tipo_usuario = $2 AND nivel = $3 
                    ORDER BY pontos_meta ASC;
                `;
                const regrasResult = await dbClient.query(regrasQuery, [idVersaoCorreta, tipoUsuario, usuario.nivel]);
                const metasDaSemana = regrasResult.rows.map(r => ({
                    pontos_meta: parseInt(r.pontos_meta),
                    valor: parseFloat(r.valor_comissao),
                    descricao: r.descricao_meta
                }));

                // 3. Busca os pontos do usuário para esta semana
                const producoesQuery = `SELECT COALESCE(SUM(pontos_gerados), 0) as total FROM producoes WHERE funcionario_id = $1 AND data BETWEEN $2 AND $3`;
                const arrematesQuery = `SELECT COALESCE(SUM(pontos_gerados), 0) as total FROM arremates WHERE usuario_tiktik_id = $1 AND data_lancamento BETWEEN $2 AND $3`;
                const [prodRes, arrRes] = await Promise.all([
                    dbClient.query(producoesQuery, [usuario_id, `${semana.inicio} 00:00:00`, `${semana.fim} 23:59:59`]),
                    dbClient.query(arrematesQuery, [usuario_id, `${semana.inicio} 00:00:00`, `${semana.fim} 23:59:59`])
                ]);
                const pontosDaSemana = parseFloat(prodRes.rows[0].total) + parseFloat(arrRes.rows[0].total);
                totalPontosComissao += pontosDaSemana;

                // 4. Calcula a comissão com as regras corretas (lógica replicada do antigo metas.js)
                let valorComissaoSemana = 0;
                let metaAtingida = "Nenhuma";
                const metasBatidas = metasDaSemana.filter(m => pontosDaSemana >= m.pontos_meta);

                if (metasBatidas.length > 0) {
                    metasBatidas.sort((a, b) => b.pontos_meta - a.pontos_meta);
                    const melhorMetaBatida = metasBatidas[0];
                    valorComissaoSemana = melhorMetaBatida.valor;
                    metaAtingida = melhorMetaBatida.descricao;
                } else if (metasDaSemana.length > 0) {
                    const primeiraMeta = metasDaSemana[0];
                    const pontosFaltantes = Math.ceil(primeiraMeta.pontos_meta - pontosDaSemana);
                    metaAtingida = `Faltam ${pontosFaltantes} pts`;
                }
                
                valorComissao += valorComissaoSemana;

                detalhesSemanas.push({
                    periodo: `${new Date(semana.inicio+'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(semana.fim+'T00:00:00').toLocaleDateString('pt-BR')}`,
                    pontos: pontosDaSemana,
                    valor: valorComissaoSemana,
                    metaAtingida: metaAtingida
                });
            }
            
            res.dadosDetalhados = { semanas: detalhesSemanas };
            break;

            case 'PASSAGENS':
                if (!data_inicio || !data_fim) return res.status(400).json({ error: 'Data de início e fim são obrigatórias para adiantamento de passagens.' });
                
                let diasUteis = 0;
                let dataCorrente = new Date(data_inicio + 'T00:00:00');
                const dataFinal = new Date(data_fim + 'T00:00:00');
                while (dataCorrente <= dataFinal) {
                    const diaDaSemana = dataCorrente.getUTCDay(); // 0 = Domingo, 6 = Sábado
                    if (diaDaSemana > 0 && diaDaSemana < 6) { // Se não for Domingo ou Sábado
                        diasUteis++;
                    }
                    dataCorrente.setUTCDate(dataCorrente.getUTCDate() + 1);
                }

                valorTotalPassagens = diasUteis * usuario.valor_passagem_diaria;
                // Para passagens, o desconto é aplicado no pagamento do salário, não aqui.
                // Aqui apenas calculamos o valor do adiantamento.
                periodoDetalhe = `${new Date(data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}`;
                break;

            case 'BENEFICIOS':
                // Exemplo: buscando um valor fixo de cesta básica do JSONB (a fazer no futuro)
                valorBeneficios = (usuario.config_beneficios?.cesta_basica) || 150.00; // Valor fixo de exemplo
                periodoDetalhe = "Benefícios Diversos";
                break;

            default:
                return res.status(400).json({ error: 'Tipo de pagamento inválido.' });
        }

        // 3. Calcular Descontos (APENAS se o pagamento for de SALÁRIO)
        if (tipo_pagamento === 'SALARIO') {
            descontoVT = usuario.salario_fixo * (usuario.desconto_vt_percentual / 100);
        }

        // 4. Montar o resultado final
        const proventos = salarioProporcional + valorComissao + valorTotalPassagens + valorBeneficios;
        const descontos = descontoVT;
        const totalLiquido = proventos - descontos;

        // <<< O objeto de detalhes da comissão ANTES de montar a resposta final >>>
        const detalhesComissaoCalculada = res.dadosDetalhados 
            ? { ...res.dadosDetalhados, totalPontos: totalPontosComissao, totalComissao: valorComissao }
            : null;

        res.status(200).json({
            detalhes: {
                funcionario: { id: usuario.id, nome: usuario.nome },
                ciclo: { nome: periodoDetalhe },
                tipoPagamento: tipo_pagamento,
            },
            proventos: {
                salarioProporcional: parseFloat(salarioProporcional.toFixed(2)),
                comissao: parseFloat(valorComissao.toFixed(2)),
                valeTransporte: parseFloat(valorTotalPassagens.toFixed(2)),
                beneficios: parseFloat(valorBeneficios.toFixed(2)),
            },
            descontos: {
                valeTransporte: parseFloat(descontoVT.toFixed(2))
            },
            totais: {
                totalProventos: parseFloat(proventos.toFixed(2)),
                totalDescontos: parseFloat(descontos.toFixed(2)),
                totalLiquidoAPagar: parseFloat(totalLiquido.toFixed(2))
            },
            // Este campo pode ser mantido para depuração, mas não é mais a fonte principal
            dadosBrutos: {
                totalPontosComissao
            },
            detalhesComissao: detalhesComissaoCalculada 
        });

    } catch (error) {
        console.error('[API /pagamentos/calcular] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao calcular pagamento.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/efetuar', async (req, res) => {
    // <<<< CORREÇÃO: Leitura segura do tipo de pagamento >>>>
    const tipoPagamento = req.body.calculo?.detalhes?.tipoPagamento;

    if (!tipoPagamento) {
        return res.status(400).json({ error: "Payload inválido. 'tipoPagamento' não encontrado nos detalhes do cálculo." });
    }

    // Lógica de permissão refinada
    const permissoesNecessarias = {
        COMISSAO: 'permitir-pagar-comissao',
        BONUS: 'permitir-conceder-bonus',
        VALE_TRANSPORTE: 'permitir-pagar-passagens'
    };
    const permissaoRequerida = permissoesNecessarias[tipoPagamento];

    if (!permissaoRequerida || !req.permissoesUsuario.includes(permissaoRequerida)) {
        return res.status(403).json({ error: `Permissão negada para efetuar pagamento do tipo '${tipoPagamento}'.` });
    }

    // <<<< FIM DA CORREÇÃO DE PERMISSÃO >>>>

    const { calculo, id_conta_debito, datas_pagas, valor_passagem_diaria } = req.body;
    const id_usuario_pagador = req.usuarioLogado.id;
    
    // A validação completa continua aqui para garantir a integridade dos dados
    if (!calculo || !calculo.detalhes || !calculo.totais || !id_conta_debito) {
        return res.status(400).json({ error: 'Dados do cálculo ou conta de débito ausentes ou malformados.' });
    }

    const { detalhes, totais } = calculo;
    const { funcionario, ciclo } = detalhes;
    const id_funcionario = funcionario.id;
    const nome_funcionario = funcionario.nome;
    const nomeCicloOuMotivo = ciclo.nome || '';

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        const userRes = await dbClient.query('SELECT id_contato_financeiro FROM usuarios WHERE id = $1', [id_funcionario]);
        if (userRes.rows.length === 0 || !userRes.rows[0].id_contato_financeiro) {
            throw new Error(`O empregado ${nome_funcionario} não possui um contato financeiro vinculado.`);
        }
        const id_contato_financeiro = userRes.rows[0].id_contato_financeiro;
        
        await dbClient.query('BEGIN');

        const fazerLancamento = async (idCategoria, valor, descricao, idContato) => {
        if (valor <= 0) return;
        if (!idCategoria) throw new Error(`ID de categoria para "${descricao}" não configurado ou nulo.`);
                
        //    Isso garante que o timestamp salvo é o do servidor do banco de dados.
        //    Os parâmetros foram reordenados.
        await dbClient.query(
            `INSERT INTO fc_lancamentos (id_conta_bancaria, id_categoria, tipo, valor, data_transacao, descricao, id_contato, id_usuario_lancamento) VALUES ($1, $2, 'DESPESA', $3, NOW(), $4, $5, $6)`,
            [id_conta_debito, idCategoria, valor, descricao, idContato, id_usuario_pagador]
        );
    };

        if (tipoPagamento === 'COMISSAO') {
            const { proventos } = calculo;
            
            const checkQuery = "SELECT id FROM historico_pagamentos_funcionarios WHERE usuario_id = $1 AND ciclo_nome = $2";
            const checkResult = await dbClient.query(checkQuery, [id_funcionario, nomeCicloOuMotivo]);
            if (checkResult.rowCount > 0) {
                return res.status(409).json({ error: `Pagamento de comissão para o ciclo "${nomeCicloOuMotivo}" já foi registrado.` });
            }
            
            await fazerLancamento(CATEGORIA_MAP.COMISSAO, proventos.comissao, `Pgto Comissão (${nomeCicloOuMotivo}) para ${nome_funcionario}`, id_contato_financeiro);

        } else if (tipoPagamento === 'BONUS') {
            const { proventos } = calculo;
            await fazerLancamento(CATEGORIA_MAP.BONUS_PREMIACOES, proventos.beneficios, `Bônus/Premiação: ${nomeCicloOuMotivo}`, id_contato_financeiro);
        
        } else if (tipoPagamento === 'VALE_TRANSPORTE') {
            if (!datas_pagas || !Array.isArray(datas_pagas) || datas_pagas.length === 0) {
                throw new Error("A lista de 'datas_pagas' é obrigatória para o pagamento de Vale-Transporte.");
            }
            if (valor_passagem_diaria === undefined || valor_passagem_diaria <= 0) {
                throw new Error("O 'valor_passagem_diaria' é obrigatório e deve ser maior que zero.");
            }

            const descricaoLancamento = `Recarga VT (${datas_pagas.length} dias)`;
            await fazerLancamento(CATEGORIA_MAP.VALE_TRANSPORTE, totais.totalLiquidoAPagar, descricaoLancamento, id_contato_financeiro);

            for (const data of datas_pagas) {
                await dbClient.query(
                    `INSERT INTO registro_dias_trabalhados (usuario_id, data, status, valor_referencia, observacao) VALUES ($1, $2, 'PAGO', $3, $4)`,
                    [id_funcionario, data, valor_passagem_diaria, `Pagamento efetuado em lote por ${req.usuarioLogado.nome}`]
                );
            }
        }
        
        if (totais.totalLiquidoAPagar > 0) {
            const cicloParaSalvar = (tipoPagamento === 'COMISSAO') ? nomeCicloOuMotivo : null;
            
            let descricaoParaSalvar = nomeCicloOuMotivo;
            if (tipoPagamento === 'COMISSAO') descricaoParaSalvar = 'Pagamento de Comissão';
            if (tipoPagamento === 'VALE_TRANSPORTE') descricaoParaSalvar = `Recarga VT (${datas_pagas.length} dias)`;
            
            const detalhesParaSalvar = { ...calculo, datas_pagas: datas_pagas, valor_passagem_diaria: valor_passagem_diaria };
            
            await dbClient.query(
                `INSERT INTO historico_pagamentos_funcionarios (usuario_id, ciclo_nome, descricao, valor_liquido_pago, id_usuario_pagador, detalhes_pagamento, id_conta_debito) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id_funcionario, cicloParaSalvar, descricaoParaSalvar, totais.totalLiquidoAPagar, id_usuario_pagador, JSON.stringify(detalhesParaSalvar), id_conta_debito]
            );
        }

        await dbClient.query('COMMIT');        
        res.status(201).json({ message: `Pagamento para ${nome_funcionario} efetuado com sucesso!` });

    } catch (error) {
        if (dbClient) {
            await dbClient.query('ROLLBACK');
            console.error('[API /efetuar] ERRO NA TRANSAÇÃO, ROLLBACK EXECUTADO.');
        }
        console.error('[API /efetuar] DETALHES DO ERRO:', error);
        res.status(500).json({ error: 'Erro ao efetuar pagamento.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


router.get('/historico', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        const query = `
            SELECT 
                h.id,
                h.usuario_id,
                h.data_pagamento,
                h.ciclo_nome,
                h.descricao,
                h.valor_liquido_pago,
                u.nome as nome_empregado,
                p.nome as nome_pagador
            FROM 
                historico_pagamentos_funcionarios h
            JOIN usuarios u ON h.usuario_id = u.id
            JOIN usuarios p ON h.id_usuario_pagador = p.id
            ORDER BY h.data_pagamento DESC;
        `;

        const result = await dbClient.query(query);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API /historico] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico de pagamentos.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/pagamentos/registros-dias?usuario_id=X&inicio=YYYY-MM-DD&fim=YYYY-MM-DD
router.get('/registros-dias', async (req, res) => {
    // A rota agora espera que req.usuarioLogado já exista (do middleware)
    const { usuarioLogado } = req;
    const { usuario_id, start, end } = req.query;

    if (!usuario_id || !start || !end) {
        return res.status(400).json({ error: 'Parâmetros usuario_id, start e end são obrigatórios.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();

        // <<< A VERIFICAÇÃO DE PERMISSÃO AGORA ACONTECE AQUI DENTRO >>>
        const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesUsuario.includes('acessar-central-pagamentos')) {
            return res.status(403).json({ error: 'Permissão negada para acessar esta funcionalidade.' });
        }
        
        // O resto da lógica da rota continua a mesma
        const query = `
            SELECT data, status, valor_referencia, observacao 
            FROM registro_dias_trabalhados
            WHERE usuario_id = $1 AND data BETWEEN $2 AND $3
        `;
        const result = await dbClient.query(query, [usuario_id, start, end]);
        
        const eventos = result.rows.map(row => {
            let color = '#7f8c8d';
            let title = row.status.replace(/_/g, ' '); // Padrão

            if (row.status === 'PAGO') color = '#27ae60';
            if (row.status === 'FALTA_COMPENSAR') color = '#8e44ad';
            if (row.status === 'COMPENSADO') color = '#bdc3c7';

            if (row.status === 'FALTA_NAO_JUSTIFICADA') {
                color = '#f39c12';
                title = 'FNJ'; // Abreviação para Falta Não Justificada
            }

            return {
                id: row.data.toISOString().split('T')[0],
                title: title, // Usa a variável title
                start: row.data,
                allDay: true,
                backgroundColor: color,
                borderColor: color,
                extendedProps: {
                    status: row.status,
                    valor: row.valor_referencia,
                    observacao: row.observacao
                }
            };
        });

        res.status(200).json(eventos);

    } catch (error) {
        console.error('[API /registros-dias] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar registros de dias.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/pagamentos/registrar-falta
router.post('/registrar-falta', async (req, res) => {
    // A permissão para registrar falta pode ser a mesma de efetuar pagamento
    if (!req.permissoesUsuario.includes('efetuar-pagamento-empregado')) {
        return res.status(403).json({ error: 'Permissão negada para registrar faltas.' });
    }

    const { usuario_id, datas } = req.body;
    const { id: id_usuario_logado, nome: nome_usuario_logado } = req.usuarioLogado;

    // --- LOGS E VALIDAÇÕES INICIAIS ---
    console.log('--- [API /registrar-falta] INICIANDO REGISTRO DE FALTAS ---');
    console.log(`Payload recebido: usuario_id=${usuario_id}, datas=${JSON.stringify(datas)}`);

    if (!usuario_id || !Array.isArray(datas) || datas.length === 0) {
        return res.status(400).json({ error: 'Parâmetros usuario_id e datas (array) são obrigatórios.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');
        console.log('[API /registrar-falta] Transação BEGIN executada.');

        for (const data of datas) {
            // Verifica se já existe um registro para esse dia, para evitar duplicatas
            const checkQuery = `SELECT id FROM registro_dias_trabalhados WHERE usuario_id = $1 AND data = $2`;
            const checkResult = await dbClient.query(checkQuery, [usuario_id, data]);

            if (checkResult.rowCount > 0) {
                // Se já existe, apenas pulamos para o próximo, sem dar erro.
                // Isso torna a operação "idempotente": rodá-la várias vezes com os mesmos dados tem o mesmo resultado.
                console.log(`  - Dia ${data} já possui registro. Pulando.`);
                continue; 
            }

            // Se não existe, insere o novo registro de falta
            const insertQuery = `
                INSERT INTO registro_dias_trabalhados (usuario_id, data, status, valor_referencia, observacao)
                VALUES ($1, $2, 'FALTA_NAO_JUSTIFICADA', $3, $4)
            `;
            const observacao = `Falta registrada por: ${nome_usuario_logado}`;
            
            // Adicionamos o valor 0 como quarto parâmetro para o valor_referencia
            await dbClient.query(insertQuery, [usuario_id, data, 0, observacao]);
            console.log(`  - Falta registrada para o dia ${data}.`);
        }

        await dbClient.query('COMMIT');
        console.log('[API /registrar-falta] Transação COMMIT executada. Operação finalizada.');

        res.status(201).json({ message: 'Faltas registradas com sucesso!' });

    } catch (error) {
        if (dbClient) {
            await dbClient.query('ROLLBACK');
            console.error('[API /registrar-falta] ERRO NA TRANSAÇÃO, ROLLBACK EXECUTADO.');
        }
        console.error('[API /registrar-falta] DETALHES DO ERRO:', error);
        res.status(500).json({ error: 'Erro ao registrar faltas.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/pagamentos/historico-vt?usuario_id=X
router.get('/historico-vt', async (req, res) => {
    // Reutilizando a permissão de acesso à central
    if (!req.permissoesUsuario.includes('acessar-central-pagamentos')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }

    const { usuario_id } = req.query;
    if (!usuario_id) {
        return res.status(400).json({ error: 'O parâmetro usuario_id é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();

        // Buscamos no histórico todos os pagamentos cuja descrição começa com "Recarga VT"
        // e que não foram estornados ainda.
        const query = `
            SELECT 
                id,
                data_pagamento,
                descricao,
                valor_liquido_pago,
                detalhes_pagamento,
                estornado_em -- Coluna que vamos adicionar ao banco
            FROM 
                historico_pagamentos_funcionarios
            WHERE 
                usuario_id = $1 
                AND descricao LIKE 'Recarga VT%'
            ORDER BY data_pagamento DESC;
        `;

        const result = await dbClient.query(query, [usuario_id]);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API /historico-vt] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico de recargas de VT.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/pagamentos/estornar-vt
router.post('/estornar-vt', async (req, res) => {
    // Permissão para estornar pode ser a mesma de efetuar o pagamento
    if (!req.permissoesUsuario.includes('efetuar-pagamento-empregado')) {
        return res.status(403).json({ error: 'Permissão negada para estornar pagamentos.' });
    }

    const { recarga_id } = req.body; // Recebe o ID do registro do histórico

    // --- LOGS E VALIDAÇÕES ---
    console.log(`--- [API /estornar-vt] INICIANDO ESTORNO PARA HISTÓRICO ID: ${recarga_id} ---`);
    if (!recarga_id) {
        return res.status(400).json({ error: 'O parâmetro recarga_id é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');
        console.log('[API /estornar-vt] Transação BEGIN executada.');

        // 1. Busca o registro do histórico para obter os detalhes do pagamento original
        const historicoQuery = `
            SELECT usuario_id, detalhes_pagamento, estornado_em 
            FROM historico_pagamentos_funcionarios 
            WHERE id = $1 FOR UPDATE; -- FOR UPDATE bloqueia a linha para evitar duplos estornos
        `;
        const historicoResult = await dbClient.query(historicoQuery, [recarga_id]);

        if (historicoResult.rowCount === 0) {
            throw new Error(`Registro de pagamento com ID ${recarga_id} não encontrado.`);
        }
        
        const recarga = historicoResult.rows[0];
        console.log('[API /estornar-vt] [DEBUG] Registro do histórico encontrado:', recarga);

        if (recarga.estornado_em) {
            throw new Error(`Este pagamento já foi estornado em ${new Date(recarga.estornado_em).toLocaleString('pt-BR')}.`);
        }

        // 2. Extrai a lista de datas pagas do JSON salvo (COM PARSE)
        let detalhes;
        if (typeof recarga.detalhes_pagamento === 'string') {
            try {
                detalhes = JSON.parse(recarga.detalhes_pagamento);
            } catch (e) {
                throw new Error('Falha ao analisar os detalhes do pagamento. O JSON está malformado.');
            }
        } else {
            detalhes = recarga.detalhes_pagamento; // Já é um objeto
        }
        
        console.log('[API /estornar-vt] [DEBUG] Detalhes do pagamento extraídos:', detalhes);
        
        const datasPagas = detalhes?.datas_pagas;
        if (!datasPagas || !Array.isArray(datasPagas) || datasPagas.length === 0) {
            throw new Error('Não foi possível encontrar a lista de dias pagos nos detalhes deste registro. Não é possível estornar.');
        }
        console.log(`[API /estornar-vt] Encontradas ${datasPagas.length} datas para estornar:`, datasPagas);
        console.log(`[API /estornar-vt] ID do usuário para deleção: ${recarga.usuario_id}`);

        // 3. Deleta os registros de dias da tabela de controle
        const deleteQuery = `
            DELETE FROM registro_dias_trabalhados 
            WHERE usuario_id = $1 AND data = ANY($2::date[]) AND status = 'PAGO'
        `;
        console.log('[API /estornar-vt] [DEBUG] Executando query de DELEÇÃO...');
        const deleteResult = await dbClient.query(deleteQuery, [recarga.usuario_id, datasPagas]);
        console.log(`[API /estornar-vt] ${deleteResult.rowCount} dias foram removidos da tabela 'registro_dias_trabalhados'.`);

        // 4. Marca o registro do histórico como estornado
        const updateHistoricoQuery = `
            UPDATE historico_pagamentos_funcionarios 
            SET estornado_em = NOW() 
            WHERE id = $1
        `;
        console.log('[API /estornar-vt] [DEBUG] Executando query de ATUALIZAÇÃO do histórico...');
        await dbClient.query(updateHistoricoQuery, [recarga_id]);
        console.log(`[API /estornar-vt] Registro de histórico ID ${recarga_id} marcado como estornado.`);
        
        await dbClient.query('COMMIT');
        console.log('[API /estornar-vt] Transação COMMIT executada. Estorno finalizado com sucesso!');

        res.status(200).json({ message: 'Recarga estornada e dias liberados com sucesso!' });

    } catch (error) {
        if (dbClient) {
            await dbClient.query('ROLLBACK');
            console.error('[API /estornar-vt] ERRO NA TRANSAÇÃO, ROLLBACK EXECUTADO.');
        }
        // Este é o log mais importante para depuração
        console.error('[API /estornar-vt] DETALHES DO ERRO:', error);
        res.status(500).json({ error: 'Erro ao processar estorno.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/pagamentos/remover-registro-dia
// Endpoint genérico para remover qualquer registro de dia (FNJ, Atestado, etc.)
router.post('/remover-registro-dia', async (req, res) => {
    if (!req.permissoesUsuario.includes('efetuar-pagamento-empregado')) {
        return res.status(403).json({ error: 'Permissão negada para remover registros de dias.' });
    }

    const { usuario_id, data } = req.body;

    if (!usuario_id || !data) {
        return res.status(400).json({ error: 'Parâmetros usuario_id e data são obrigatórios.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // Simplesmente deleta a linha. Não precisa de transação para uma única operação.
        const deleteQuery = `DELETE FROM registro_dias_trabalhados WHERE usuario_id = $1 AND data = $2`;
        const result = await dbClient.query(deleteQuery, [usuario_id, data]);

        if (result.rowCount === 0) {
            // Isso pode acontecer se o usuário clicar rápido duas vezes. Não é um erro crítico.
        } else {
        }

        res.status(200).json({ message: 'Registro de dia removido com sucesso!' });

    } catch (error) {
        console.error('[API /remover-registro-dia] DETALHES DO ERRO:', error);
        res.status(500).json({ error: 'Erro ao remover registro de dia.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;