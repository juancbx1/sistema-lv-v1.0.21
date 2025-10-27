// api/utils/diagnosticoProducao.js

// A função principal que encapsula toda a nossa lógica de diagnóstico
export async function gerarDiagnosticoCompleto(dbClient) {

    // --- INÍCIO DA ESTRATÉGIA "BULK DATA" (INSPIRADA NO SEU radar-producao.js) ---

        // 1. BUSCAR TODOS OS DADOS BRUTOS (INGREDIENTES) EM PARALELO
        const [
            demandasResult,
            opsResult,
            arrematesResult,
            sessoesResult,
            estoqueResult,
            produtosResult,
            atribuicoesResult
        ] = await Promise.all([
            dbClient.query(`SELECT * FROM demandas_producao WHERE status IN ('pendente', 'em_producao') ORDER BY prioridade ASC, data_solicitacao ASC`),
            dbClient.query("SELECT numero, produto_id, variante, quantidade, etapas, data_final FROM ordens_de_producao WHERE status = 'finalizado'"),
            dbClient.query("SELECT produto_id, variante, op_numero, quantidade_arrematada, quantidade_ja_embalada, tipo_lancamento FROM arremates"),
            dbClient.query("SELECT produto_id, variante, quantidade_entregue FROM sessoes_trabalho_arremate WHERE status = 'EM_ANDAMENTO'"),
            dbClient.query(`SELECT produto_id, variante_nome, SUM(quantidade)::integer as saldo_atual FROM estoque_movimentos GROUP BY produto_id, variante_nome`),
            dbClient.query("SELECT id, nome, sku, is_kit, grade, imagem FROM produtos"),
            dbClient.query("SELECT componente_chave, atribuida_a, necessidade_producao_no_momento FROM demandas_componentes_atribuidos")
        ]);
        
        const demandasAtivas = demandasResult.rows;
        if (demandasAtivas.length === 0) {
            // A função agora retorna o objeto esperado, mas vazio.
            return { diagnosticoPorDemanda: [], diagnosticoAgregado: [] };
        }

        // 2. PREPARAR A "RECEITA" EM JAVASCRIPT (PROCESSAR OS DADOS EM MEMÓRIA)
        
        // Helper para obter a quantidade real produzida (exatamente como no seu radar)
        const obterQuantidadeFinalProduzida = (op) => {
            if (!op || !Array.isArray(op.etapas) || op.etapas.length === 0) return parseInt(op?.quantidade, 10) || 0;
            for (let i = op.etapas.length - 1; i >= 0; i--) { const etapa = op.etapas[i]; if (etapa && etapa.lancado && etapa.quantidade !== null && etapa.quantidade !== undefined) { const qtdString = String(etapa.quantidade).trim(); if (qtdString !== '') { const qtdNumerica = parseInt(qtdString, 10); if (!isNaN(qtdNumerica) && qtdNumerica >= 0) return qtdNumerica; } } }
            return parseInt(op.quantidade, 10) || 0;
        };
        
        // Mapear produtos por ID para acesso rápido
        const produtosMapById = new Map(produtosResult.rows.map(p => [p.id, p]));
        const atribuicoesMap = new Map(atribuicoesResult.rows.map(a => [a.componente_chave, a]));
        
        // --- Cálculo do Saldo de Arremate ---
        const arrematadoPorOp = new Map();
        arrematesResult.rows.forEach(ar => {
            if (ar.tipo_lancamento === 'PRODUCAO' || ar.tipo_lancamento === 'PERDA') {
                const chave = `${ar.op_numero}|${ar.variante || '-'}`;
                arrematadoPorOp.set(chave, (arrematadoPorOp.get(chave) || 0) + ar.quantidade_arrematada);
            }
        });

        const sessoesPorProduto = new Map();
        sessoesResult.rows.forEach(s => {
            const chave = `${s.produto_id}|${s.variante || '-'}`;
            sessoesPorProduto.set(chave, (sessoesPorProduto.get(chave) || 0) + s.quantidade_entregue);
        });

        const saldoArremateFinal = new Map();
        opsResult.rows.forEach(op => {
            const produzido = obterQuantidadeFinalProduzida(op);
            const chaveOp = `${op.numero}|${op.variante || '-'}`;
            const arrematado = arrematadoPorOp.get(chaveOp) || 0;
            const saldoOp = produzido - arrematado;
            if (saldoOp > 0) {
                const chaveProduto = `${op.produto_id}|${op.variante || '-'}`;
                saldoArremateFinal.set(chaveProduto, (saldoArremateFinal.get(chaveProduto) || 0) + saldoOp);
            }
        });
        saldoArremateFinal.forEach((saldo, chave) => {
            const emTrabalho = sessoesPorProduto.get(chave) || 0;
            saldoArremateFinal.set(chave, Math.max(0, saldo - emTrabalho));
        });

        // --- Cálculo do Saldo de Embalagem ---
        const saldoEmbalagemFinal = new Map();
        arrematesResult.rows.forEach(ar => {
            if (ar.tipo_lancamento === 'PRODUCAO') {
                const saldo = ar.quantidade_arrematada - ar.quantidade_ja_embalada;
                if (saldo > 0) {
                    const chave = `${ar.produto_id}|${ar.variante || '-'}`;
                    saldoEmbalagemFinal.set(chave, (saldoEmbalagemFinal.get(chave) || 0) + saldo);
                }
            }
        });
        
        // --- Mapeamento do Saldo de Estoque ---
        const saldoEstoqueFinal = new Map(estoqueResult.rows.map(item => [`${item.produto_id}|${item.variante_nome || '-'}`, item.saldo_atual]));
        
        // Função Helper para buscar os saldos já calculados nos mapas
        const getSaldosFromMaps = (produtoId, variante) => {
            const chave = `${produtoId}|${variante || '-'}`;
            return {
                saldoArremate: saldoArremateFinal.get(chave) || 0,
                saldoEmbalagem: saldoEmbalagemFinal.get(chave) || 0,
                saldoEstoque: saldoEstoqueFinal.get(chave) || 0,
            };
        };

        // 3. MONTAR A RESPOSTA FINAL (USANDO OS DADOS JÁ PROCESSADOS)
        
        // Criar um mapa de produtos por SKU para encontrar o produto principal da demanda
        const produtosMapBySku = new Map();
        produtosResult.rows.forEach(p => {
            // Mapeia o produto principal pelo seu SKU
            if (p.sku) {
                produtosMapBySku.set(p.sku, p);
            }
            // Mapeia cada variação da grade pelo seu SKU
            if (p.grade) {
                p.grade.forEach(g => {
                    if (g.sku) {
                        // O valor salvo agora é o produto pai INTEIRO + a informação da grade
                        produtosMapBySku.set(g.sku, {
                            ...p, // Inclui id, nome_pai, is_kit, etc.
                            gradeInfo: g // Adiciona a informação específica da variação
                        });
                    }
                });
            }
        });
        
        const diagnosticoFinal = [];
        for (const demanda of demandasAtivas) {
            const produtoPrincipal = produtosMapBySku.get(demanda.produto_sku);
            if (!produtoPrincipal) continue;
            
            const gradeInfo = produtoPrincipal.grade?.find(g => g.sku === demanda.produto_sku);
            const variantePrincipal = gradeInfo?.variacao;

            const diagnosticoDemanda = { 
                ...demanda, 
                produto_id: produtoPrincipal.id, // <-- ADICIONA O ID CORRETO AQUI
                produto_nome: produtoPrincipal.gradeInfo ? `${produtoPrincipal.nome} (${produtoPrincipal.gradeInfo.variacao})` : produtoPrincipal.nome, 
                produto_imagem: produtoPrincipal.gradeInfo?.imagem || produtoPrincipal.imagem, 
                is_kit: produtoPrincipal.is_kit, 
                componentes: [], 
                diagnostico_geral: {} 
            };

            if (!produtoPrincipal.is_kit) {
                // A 'variantePrincipal' para um produto simples é a informação da sua própria gradeInfo
                const varianteSimples = produtoPrincipal.gradeInfo?.variacao;
                const saldos = getSaldosFromMaps(produtoPrincipal.id, varianteSimples);
                const totalDisponivel = saldos.saldoArremate + saldos.saldoEmbalagem + saldos.saldoEstoque;
                
                diagnosticoDemanda.diagnostico_geral = {
                    ...saldos,
                    total_disponivel: totalDisponivel,
                    deficit_producao: Math.max(0, demanda.quantidade_solicitada - totalDisponivel)
                };

            } else {
                if (!gradeInfo || !gradeInfo.composicao) continue;

                // 1. ESTOQUE DO KIT PRONTO:
                const chaveEstoqueKit = `${produtoPrincipal.id}|${variantePrincipal || '-'}`;
                const kitsProntosEmEstoque = saldoEstoqueFinal.get(chaveEstoqueKit) || 0;

                // 2. POTENCIAL DE MONTAGEM (CHÃO DE FÁBRICA):
                let potencialMontagemChaoFabrica = Infinity;
                for (const componente of gradeInfo.composicao) {
                    const saldosComponente = getSaldosFromMaps(componente.produto_id, componente.variacao);
                    const disponivelChaoFabrica = saldosComponente.saldoArremate + saldosComponente.saldoEmbalagem;
                    const potencialComponente = Math.floor(disponivelChaoFabrica / componente.quantidade);
                    
                    if (potencialComponente < potencialMontagemChaoFabrica) {
                        potencialMontagemChaoFabrica = potencialComponente;
                    }
                }
                if (potencialMontagemChaoFabrica === Infinity) potencialMontagemChaoFabrica = 0;

                // 3. CÁLCULO DO DÉFICIT REAL DO KIT:
                const totalKitsADisposicao = kitsProntosEmEstoque + potencialMontagemChaoFabrica;
                const deficitKitsReal = Math.max(0, demanda.quantidade_solicitada - totalKitsADisposicao);

                diagnosticoDemanda.diagnostico_geral = {
                    kits_prontos_estoque: kitsProntosEmEstoque,
                    potencial_montagem_chao_fabrica: potencialMontagemChaoFabrica,
                    total_disponivel: totalKitsADisposicao,
                    deficit_producao: deficitKitsReal
                };

                // 4. DIAGNÓSTICO DETALHADO DOS COMPONENTES
                for (const componente of gradeInfo.composicao) {
                    const saldosComponente = getSaldosFromMaps(componente.produto_id, componente.variacao);
                    const disponivelChaoFabrica = saldosComponente.saldoArremate + saldosComponente.saldoEmbalagem;
                    const quantidadeNecessariaParaDeficit = deficitKitsReal * componente.quantidade;
                    const deficitComponente = Math.max(0, quantidadeNecessariaParaDeficit - disponivelChaoFabrica);

                    const produtoComponente = produtosMapById.get(componente.produto_id);

                    diagnosticoDemanda.componentes.push({
                        ...componente,
                        produto_nome: produtoComponente ? produtoComponente.nome : 'Componente não encontrado',
                        saldos: saldosComponente, 
                        disponivel_chao_fabrica: disponivelChaoFabrica,
                        quantidade_necessaria_para_deficit: quantidadeNecessariaParaDeficit,
                        deficit_producao: deficitComponente
                    });
                }
            }
            diagnosticoFinal.push(diagnosticoDemanda);
        }

    // ======================= INÍCIO DA NOVA LÓGICA DE AGREGAÇÃO =======================

        // Etapa 1: Calcular a NECESSIDADE BRUTA de cada componente em todas as demandas
    const necessidadeBruta = new Map();
    for (const demanda of diagnosticoFinal) {
        const produtoPrincipal = produtosMapBySku.get(demanda.produto_sku);
        if (!produtoPrincipal) continue;

        if (produtoPrincipal.is_kit) {
            const gradeInfo = produtoPrincipal.gradeInfo;
            if (!gradeInfo || !gradeInfo.composicao) continue;

            for (const componente of gradeInfo.composicao) {
                const chave = `${componente.produto_id}|${componente.variacao || '-'}`;
                const necessidadeAtual = necessidadeBruta.get(chave) || 0;
                necessidadeBruta.set(chave, necessidadeAtual + (demanda.quantidade_solicitada * componente.quantidade));
            }
        } else { // É um produto simples
            const variante = produtoPrincipal.gradeInfo?.variacao;
            const chave = `${produtoPrincipal.id}|${variante || '-'}`;
            const necessidadeAtual = necessidadeBruta.get(chave) || 0;
            necessidadeBruta.set(chave, necessidadeAtual + demanda.quantidade_solicitada);
        }
    }
    // Etapa 2: Para cada componente com necessidade, calcular o déficit real e agregar
    const componentesAgregados = new Map(); // A declaração correta, apenas uma vez.

        for (const [chave, necessidadeTotal] of necessidadeBruta.entries()) {
        const [produtoIdStr, ...variacaoParts] = chave.split('|');
        const produtoId = parseInt(produtoIdStr);
        const variacao = variacaoParts.join('|');

        const produtoInfo = produtosMapById.get(produtoId);
        if (!produtoInfo) continue;

        const saldos = getSaldosFromMaps(produtoId, variacao === '-' ? null : variacao);
        
        // CORREÇÃO DO "ESTOQUE FANTASMA"
        const isDemandedAsUnit = diagnosticoFinal.some(
            demanda => !demanda.is_kit && `${demanda.produto_id}|${demanda.diagnostico_geral.variante || '-'}` === chave
        );
        const disponivelTotal = isDemandedAsUnit
            ? saldos.saldoArremate + saldos.saldoEmbalagem + saldos.saldoEstoque
            : saldos.saldoArremate + saldos.saldoEmbalagem;
        
        const deficitDinamico = Math.max(0, necessidadeTotal - disponivelTotal);
        
        const atribuicao = atribuicoesMap.get(chave);
        let alvoFinalProducao = 0;
        let deficitAdicional = 0;

        if (atribuicao && atribuicao.necessidade_producao_no_momento !== null) {
            // --- LÓGICA PARA ITEM JÁ ASSUMIDO ---
            const metaCongelada = atribuicao.necessidade_producao_no_momento;
            alvoFinalProducao = metaCongelada;

            // Calcula o déficit dinâmico atual e verifica se ele é maior que a meta já assumida
            if (deficitDinamico > metaCongelada) {
                deficitAdicional = deficitDinamico - metaCongelada;
            }
        } else {
            // --- LÓGICA PARA ITEM NÃO ASSUMIDO ---
            alvoFinalProducao = deficitDinamico;
        }

        // Só adiciona ao painel se houver um alvo de produção (seja ele dinâmico ou congelado)
        if (alvoFinalProducao > 0 || deficitAdicional > 0) {
            const gradeInfo = produtoInfo.grade?.find(g => g.variacao === (variacao === '-' ? null : variacao));
            const imagemCorreta = gradeInfo?.imagem || produtoInfo.imagem;

            if (!componentesAgregados.has(chave)) {
                componentesAgregados.set(chave, {
                    produto_id: produtoId, variacao: variacao, produto_nome: produtoInfo.nome,
                    imagem: imagemCorreta, necessidade_total_producao: 0,
                    saldo_disponivel_arremate: saldos.saldoArremate,
                    saldo_disponivel_embalagem: saldos.saldoEmbalagem,
                    saldo_disponivel_estoque: saldos.saldoEstoque,
                    demandas_dependentes: [], 
                    demandas_dependentes_ids: [],
                    atribuida_a: atribuicao?.atribuida_a || null,
                    deficit_adicional_nao_assumido: 0 // Inicia com 0
                });
            }
            
            const agregado = componentesAgregados.get(chave);
            agregado.necessidade_total_producao = alvoFinalProducao;
            agregado.deficit_adicional_nao_assumido = deficitAdicional;
        }
    }

    // Etapa 3: Preencher as demandas dependentes
    for (const demanda of diagnosticoFinal) {
        const produtoPrincipal = produtosMapBySku.get(demanda.produto_sku);
        if (!produtoPrincipal) continue;
        const nomeDemanda = produtoPrincipal.gradeInfo ? `${produtoPrincipal.nome} (${produtoPrincipal.gradeInfo.variacao})` : produtoPrincipal.nome;
        if (produtoPrincipal.is_kit) {
            const gradeInfo = produtoPrincipal.gradeInfo;
            if (!gradeInfo || !gradeInfo.composicao) continue;
            for (const componente of gradeInfo.composicao) {
                const chave = `${componente.produto_id}|${componente.variacao || '-'}`;
                if (componentesAgregados.has(chave)) {
                    const agregado = componentesAgregados.get(chave);
                    if (!agregado.demandas_dependentes.includes(nomeDemanda)) {
                        agregado.demandas_dependentes.push(nomeDemanda);
                    }
                    if (!agregado.demandas_dependentes_ids.includes(demanda.id)) {
                        agregado.demandas_dependentes_ids.push(demanda.id);
                    }
                }
            }
        } else {
            const variante = produtoPrincipal.gradeInfo?.variacao;
            const chave = `${produtoPrincipal.id}|${variante || '-'}`;
            if (componentesAgregados.has(chave)) {
                const agregado = componentesAgregados.get(chave);
                if (!agregado.demandas_dependentes.includes(nomeDemanda)) {
                    agregado.demandas_dependentes.push(nomeDemanda);
                }
                if (!agregado.demandas_dependentes_ids.includes(demanda.id)) {
                    agregado.demandas_dependentes_ids.push(demanda.id);
                }
            }
        }
    }

    const diagnosticoAgregadoFinal = Array.from(componentesAgregados.values()).sort((a, b) => b.necessidade_total_producao - a.necessidade_total_producao);

    // ======================= FIM DA NOVA LÓGICA DE AGREGAÇÃO =======================


    // No final, em vez de res.json, a função RETORNA o objeto completo.
    return {
        diagnosticoPorDemanda: diagnosticoFinal,
        diagnosticoAgregado: diagnosticoAgregadoFinal
    };
}

// Verifica e atualiza demandas após uma entrada no estoque
export async function verificarEAtualizarDemandasPorSKU(pool, produtoId, variante) {
    let dbClient;
    try {
        dbClient = await pool.connect();

        // Passo A: Encontrar todas as demandas ativas que dependem deste componente.
        // Esta query é a "busca reversa" que discutimos.
        const demandasAfetadasQuery = `
            WITH DemandasDeUnidade AS (
                -- Demandas onde o produto é a própria unidade
                SELECT d.id
                FROM demandas_producao d
                JOIN produtos p ON (
                    p.sku = d.produto_sku OR 
                    EXISTS (
                        SELECT 1 FROM jsonb_to_recordset(p.grade) as g(sku TEXT) WHERE g.sku = d.produto_sku
                    )
                )
                WHERE d.status IN ('pendente', 'em_producao') AND p.id = $1
            ),
            DemandasDeKit AS (
                -- Demandas onde o produto é um componente de um kit
                SELECT d.id
                FROM demandas_producao d
                JOIN produtos p ON (
                    p.sku = d.produto_sku OR 
                    EXISTS (
                        SELECT 1 FROM jsonb_to_recordset(p.grade) as g(sku TEXT) WHERE g.sku = d.produto_sku
                    )
                )
                WHERE 
                    d.status IN ('pendente', 'em_producao') AND
                    p.is_kit = TRUE AND
                    EXISTS (
                        SELECT 1
                        FROM jsonb_to_recordset(p.grade) as g(composicao JSONB),
                             jsonb_array_elements(g.composicao) as comp
                        WHERE (comp->>'produto_id')::int = $1 
                          AND (comp->>'variacao' = $2 OR ($2 IS NULL AND comp->>'variacao' IS NULL))
                    )
            )
            SELECT id FROM DemandasDeUnidade
            UNION
            SELECT id FROM DemandasDeKit;
        `;
        const varianteTratada = (variante === '-' || !variante) ? null : variante;
        const resDemandas = await dbClient.query(demandasAfetadasQuery, [produtoId, varianteTratada]);
        const idsDemandasAfetadas = resDemandas.rows.map(r => r.id);

        if (idsDemandasAfetadas.length === 0) {
            return; // Encerra a função se não há nada para verificar.
        }
        
        // Passo B: Para cada demanda afetada, recalcular seu déficit individualmente.
        // Chamamos a função 'gerarDiagnosticoCompleto' para ter acesso a todos os saldos atualizados.
        const diagnosticoCompleto = await gerarDiagnosticoCompleto(dbClient);
        
        for (const id of idsDemandasAfetadas) {
            const demandaDiagnostico = diagnosticoCompleto.diagnosticoPorDemanda.find(d => d.id === id);
            
            if (demandaDiagnostico) {
                let demandaEstaConcluida = false;
                if (demandaDiagnostico.is_kit) {
                    if (demandaDiagnostico.diagnostico_geral.kits_prontos_estoque >= demandaDiagnostico.quantidade_solicitada) {
                        demandaEstaConcluida = true;
                    }
                } else {
                    if (demandaDiagnostico.diagnostico_geral.saldoEstoque >= demandaDiagnostico.quantidade_solicitada) {
                        demandaEstaConcluida = true;
                    }
                }

                if (demandaEstaConcluida) {
                    console.log(`[Auto-Conclusão Rígida] Demanda #${id} foi completada pelo estoque. Atualizando status.`);
                    await dbClient.query('UPDATE demandas_producao SET status = $1 WHERE id = $2', ['concluida', id]);
                }
            }
        }

    } catch (error) {
        // Logamos o erro mas não "quebramos" a aplicação principal, pois isso roda em segundo plano.
        console.error('[verificarEAtualizarDemandasPorSKU] Erro durante a verificação:', error);
    } finally {
        if (dbClient) dbClient.release();
    }
}

// ======================= NOVA FUNÇÃO DE LIMPEZA REUTILIZÁVEL =======================
export async function limparAtribuicoesOrfas(dbClient) {
    try {
        console.log('[LIMPEZA] Iniciando rotina de limpeza de atribuições órfãs...');
        
        // 1. Gera o diagnóstico mais recente para saber o que AINDA precisa de produção.
        // OBS: Chamamos a função passando o mesmo cliente de banco para manter a transação.
        const diagnostico = await gerarDiagnosticoCompleto(dbClient);

        // 2. Pega a lista de todas as chaves que AINDA têm déficit de produção.
        const chavesComDeficit = new Set(diagnostico.diagnosticoAgregado.map(item => `${item.produto_id}|${item.variacao || '-'}`));

        // 3. Busca TODAS as atribuições que existem no banco.
        const atribuicoesRes = await dbClient.query('SELECT componente_chave FROM demandas_componentes_atribuidos');
        const chavesAtribuidas = new Set(atribuicoesRes.rows.map(a => a.componente_chave));

        // 4. Compara as duas listas para encontrar as atribuições órfãs.
        const chavesParaLimpar = [];
        for (const chaveAtribuida of chavesAtribuidas) {
            if (!chavesComDeficit.has(chaveAtribuida)) {
                chavesParaLimpar.push(chaveAtribuida);
            }
        }

        // 5. Se encontrar alguma, executa a limpeza.
        if (chavesParaLimpar.length > 0) {
            console.log('[LIMPEZA] Atribuições órfãs/concluídas encontradas. Removendo:', chavesParaLimpar);
            await dbClient.query('DELETE FROM demandas_componentes_atribuidos WHERE componente_chave = ANY($1::text[])', [chavesParaLimpar]);
            return chavesParaLimpar.length; // Retorna o número de itens limpos
        } else {
            console.log('[LIMPEZA] Nenhuma atribuição órfã encontrada.');
            return 0; // Retorna 0 se nada foi limpo
        }

    } catch (error) {
        console.error('[LIMPEZA] Erro ao executar a rotina de limpeza:', error);
        // Lança o erro para que a transação principal possa fazer rollback
        throw error;
    }
}
// ====================================================================================