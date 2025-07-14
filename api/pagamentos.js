// api/pagamentos.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';
import { ciclos } from '../public/js/utils/ciclos.js'; // Importamos a definição de ciclos
import { calcularComissaoSemanal, obterMetas } from '../public/js/utils/metas.js';

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
    console.log('[API Pagamentos] Inicializando mapeamento de IDs de categoria...');
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
        
        console.log('[API Pagamentos] Mapeamento concluído:', CATEGORIA_MAP);

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
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token não fornecido.' });
        }
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);

        const dbClient = await pool.connect();
        try {
            req.permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
            // Vamos criar uma permissão nova para acessar esta central
            if (!req.permissoesUsuario.includes('acessar-central-pagamentos')) {
                return res.status(403).json({ error: 'Permissão negada para acessar a central de pagamentos.' });
            }
            next();
        } finally {
            dbClient.release();
        }
    } catch (error) {
        let message = 'Token inválido ou expirado.';
        if (error.name === 'TokenExpiredError') message = 'Sessão expirada. Faça login novamente.';
        return res.status(401).json({ error: message });
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
                
                // Itera sobre cada semana do ciclo para calcular individualmente
                for (const semana of cicloSelecionado.semanas) {
                    const dataInicioSemana = semana.inicio;
                    const dataFimSemana = semana.fim;

                    const producoesQuery = `SELECT COALESCE(SUM(pontos_gerados), 0) as total FROM producoes WHERE funcionario_id = $1 AND data BETWEEN $2 AND $3`;
                    const arrematesQuery = `SELECT COALESCE(SUM(pontos_gerados), 0) as total FROM arremates WHERE usuario_tiktik_id = $1 AND data_lancamento BETWEEN $2 AND $3`;

                    const [prodRes, arrRes] = await Promise.all([
                        dbClient.query(producoesQuery, [usuario_id, `${dataInicioSemana} 00:00:00`, `${dataFimSemana} 23:59:59`]),
                        dbClient.query(arrematesQuery, [usuario_id, `${dataInicioSemana} 00:00:00`, `${dataFimSemana} 23:59:59`])
                    ]);

                    const pontosDaSemana = parseFloat(prodRes.rows[0].total) + parseFloat(arrRes.rows[0].total);
                    totalPontosComissao += pontosDaSemana; // Acumula para o total do ciclo

                    // Determina o tipo de usuário para buscar a meta correta
                    const tipoUsuario = usuario.tipos?.includes('costureira') ? 'costureira' : 'tiktik';
                    
                    // Usa a sua função de cálculo de metas importada!
                    const resultadoComissaoSemana = calcularComissaoSemanal(pontosDaSemana, tipoUsuario, usuario.nivel);
                    
                    let valorComissaoSemana = 0;
                    let metaAtingida = "Nenhuma";
                    
                    if (typeof resultadoComissaoSemana === 'number') {
                        valorComissaoSemana = resultadoComissaoSemana;
                        // Encontra a descrição da meta atingida
                        const metas = obterMetas(tipoUsuario, usuario.nivel);
                        const metaObj = metas.filter(m => pontosDaSemana >= m.pontos_meta).sort((a,b) => b.pontos_meta - a.pontos_meta)[0];
                        if (metaObj) metaAtingida = metaObj.descricao;

                    } else if (resultadoComissaoSemana.faltam) {
                        metaAtingida = `Faltam ${resultadoComissaoSemana.faltam} pts`;
                    }
                    
                    valorComissao += valorComissaoSemana; // Acumula para o total do ciclo

                    detalhesSemanas.push({
                        periodo: `${new Date(dataInicioSemana+'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(dataFimSemana+'T00:00:00').toLocaleDateString('pt-BR')}`,
                        pontos: pontosDaSemana,
                        valor: valorComissaoSemana,
                        metaAtingida: metaAtingida
                    });
                }
                
                // Adiciona o novo campo detalhado na resposta da API
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
    if (!req.permissoesUsuario.includes('efetuar-pagamento-empregado')) {
        return res.status(403).json({ error: 'Permissão negada para efetuar pagamentos.' });
    }

    const { calculo, id_conta_debito } = req.body;
    const id_usuario_pagador = req.usuarioLogado.id;

    if (!calculo || !calculo.detalhes || !calculo.proventos || !calculo.totais || !id_conta_debito) {
        return res.status(400).json({ error: 'Dados do cálculo ou conta de débito ausentes ou malformados.' });
    }

    const { detalhes, proventos, totais } = calculo;
    const { funcionario, ciclo, tipoPagamento } = detalhes;
    const id_funcionario = funcionario.id;
    const nome_funcionario = funcionario.nome;

    let dbClient;
    try {
        dbClient = await pool.connect();
        // --- LOG 1: Rota acionada ---
        if (tipoPagamento === 'COMISSAO') {
            const checkQuery = "SELECT id FROM historico_pagamentos_funcionarios WHERE usuario_id = $1 AND ciclo_nome = $2";
            const checkResult = await dbClient.query(checkQuery, [id_funcionario, ciclo.nome]);
            if (checkResult.rowCount > 0) {
                return res.status(409).json({ error: `Pagamento de comissão para o ciclo "${ciclo.nome}" já foi registrado.` });
            }
        }
        
        await dbClient.query('BEGIN');
        const userRes = await dbClient.query('SELECT id_contato_financeiro FROM usuarios WHERE id = $1', [id_funcionario]);
        if (userRes.rows.length === 0 || !userRes.rows[0].id_contato_financeiro) {
            throw new Error(`O empregado ${nome_funcionario} não possui um contato financeiro vinculado.`);
        }
        const id_contato_financeiro = userRes.rows[0].id_contato_financeiro;
        const dataTransacao = new Date().toISOString();

        const fazerLancamento = async (idCategoria, valor, descricao) => {
            if (valor <= 0) return;
            if (!idCategoria) {
                throw new Error(`ID de categoria para "${descricao}" não configurado. Verifique as configurações e reinicie o servidor.`);
            }
            await dbClient.query(
                `INSERT INTO fc_lancamentos (id_conta_bancaria, id_categoria, tipo, valor, data_transacao, descricao, id_contato, id_usuario_lancamento) VALUES ($1, $2, 'DESPESA', $3, $4, $5, $6, $7)`,
                [id_conta_debito, idCategoria, valor, dataTransacao, descricao, id_contato_financeiro, req.usuarioLogado.id]
            );
        };

        // <<< LÓGICA DE LANÇAMENTO REVISADA E MAIS CLARA >>>
        const nomeCiclo = ciclo.nome || ''; // Garante que não seja undefined

        if (tipoPagamento === 'COMISSAO') {
            await fazerLancamento(CATEGORIA_MAP.COMISSAO, proventos.comissao, `Pgto Comissão (${nomeCiclo})`);
        } else if (tipoPagamento === 'BONUS') {
            // Para bônus, 'nomeCiclo' contém o motivo.
            await fazerLancamento(CATEGORIA_MAP.BONUS_PREMIACOES, proventos.beneficios, `Bônus/Premiação: ${nomeCiclo}`);
        }
        // (Adicione aqui a lógica para SALARIO e PASSAGENS no futuro)
        
        if (totais.totalLiquidoAPagar > 0) {
            const cicloParaSalvar = (tipoPagamento === 'COMISSAO') ? nomeCiclo : null;
            const descricaoParaSalvar = (tipoPagamento === 'COMISSAO') ? 'Pagamento de Comissão' : nomeCiclo; // Para bônus, é o motivo.

            await dbClient.query(
                `INSERT INTO historico_pagamentos_funcionarios (usuario_id, ciclo_nome, descricao, valor_liquido_pago, id_usuario_pagador, detalhes_pagamento, id_conta_debito) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id_funcionario, cicloParaSalvar, descricaoParaSalvar, totais.totalLiquidoAPagar, id_usuario_pagador, JSON.stringify(calculo), id_conta_debito]
            );
        }

        await dbClient.query('COMMIT');
        res.status(201).json({ message: `Pagamento para ${nome_funcionario} efetuado com sucesso!` });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
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

export default router;