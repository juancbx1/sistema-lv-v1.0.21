// api/utils/diagnosticoProducao.js

export async function gerarDiagnosticoCompleto(dbClient) {
    // 1. BULK DATA
    const [
        demandasResult,
        opsResult,       
        arrematesResult, 
        produtosResult
    ] = await Promise.all([
        dbClient.query(`SELECT * FROM demandas_producao WHERE status IN ('pendente', 'em_producao', 'concluida') ORDER BY prioridade ASC, data_solicitacao ASC`),
        dbClient.query(`SELECT id, numero, demanda_id, produto_id, variante, quantidade, status, etapas FROM ordens_de_producao WHERE demanda_id IS NOT NULL`),
        dbClient.query(`SELECT op_numero, quantidade_arrematada, quantidade_ja_embalada FROM arremates JOIN ordens_de_producao op ON arremates.op_numero = op.numero WHERE op.demanda_id IS NOT NULL AND arremates.tipo_lancamento = 'PRODUCAO'`),
        dbClient.query("SELECT id, nome, sku, is_kit, grade, imagem FROM produtos")
    ]);

    // 2. MAPAS DE PRODUTOS
    const produtosMapById = new Map(produtosResult.rows.map(p => [p.id, p]));
    const produtosMapBySku = new Map();
    
    produtosResult.rows.forEach(p => {
        if (p.sku) produtosMapBySku.set(p.sku.trim().toUpperCase(), p);
        let grade = p.grade;
        if (typeof grade === 'string') try { grade = JSON.parse(grade); } catch(e){}
        if (Array.isArray(grade)) {
            grade.forEach(g => {
                if(g.sku) produtosMapBySku.set(g.sku.trim().toUpperCase(), { ...p, gradeInfo: g });
            });
        }
    });

    // 3. HELPERS DE CÁLCULO
    const obterQuantidadeFinalProduzida = (op) => {
        if (!op || !Array.isArray(op.etapas) || op.etapas.length === 0) return parseInt(op?.quantidade, 10) || 0;
        for (let i = op.etapas.length - 1; i >= 0; i--) { 
            const etapa = op.etapas[i]; 
            if (etapa && etapa.lancado && etapa.quantidade !== null) { 
                const qtd = parseInt(etapa.quantidade, 10);
                if (!isNaN(qtd) && qtd >= 0) return qtd;
            } 
        }
        return parseInt(op.quantidade, 10) || 0;
    };

    const arrematadoPorOp = new Map(); 
    const embaladoPorOp = new Map();   
    arrematesResult.rows.forEach(ar => {
        const opNum = String(ar.op_numero);
        arrematadoPorOp.set(opNum, (arrematadoPorOp.get(opNum) || 0) + ar.quantidade_arrematada);
        embaladoPorOp.set(opNum, (embaladoPorOp.get(opNum) || 0) + ar.quantidade_ja_embalada);
    });

    // 4. MAPA DE PROGRESSO DETALHADO
    // Chave: DemandaID|ProdutoID|Variante
    // (Importante para diferenciar componentes diferentes dentro de um mesmo Kit/Demanda)
    const progressoMap = new Map();
    const getProg = (dId, pId, vari) => {
        const chave = `${dId}|${pId}|${vari || '-'}`;
        if (!progressoMap.has(chave)) progressoMap.set(chave, { costura: 0, arremate: 0, embalagem: 0, estoque: 0, perda: 0 });
        return progressoMap.get(chave);
    };

    opsResult.rows.forEach(op => {
        if (!op.demanda_id) return;
        const prog = getProg(op.demanda_id, op.produto_id, op.variante);

        if (op.status === 'em-aberto' || op.status === 'produzindo') {
            prog.costura += parseInt(op.quantidade) || 0;
        } 
        else if (op.status === 'finalizado') {
            const opNum = String(op.numero);
            const qtdProduzidaReal = obterQuantidadeFinalProduzida(op);
            const qtdOriginal = parseInt(op.quantidade) || 0;
            
            // Perda/Quebra
            prog.perda += Math.max(0, qtdOriginal - qtdProduzidaReal);

            const qtdArrematada = arrematadoPorOp.get(opNum) || 0;
            const qtdEmbalada = embaladoPorOp.get(opNum) || 0;

            prog.estoque += qtdEmbalada;
            prog.embalagem += Math.max(0, qtdArrematada - qtdEmbalada);
            prog.arremate += Math.max(0, qtdProduzidaReal - qtdArrematada);
        }
    });

    // 5. MONTAR LISTA FINAL (AGREGADOS)
    const agregadosMap = new Map();

    const processarItem = (demandaOriginal, produtoId, variante, quantidadeNecessaria) => {
        const produtoInfo = produtosMapById.get(produtoId);
        if (!produtoInfo) return;

        // Chave Única Visual: DemandaID + ProdutoID + Variante
        const chaveUnica = `${demandaOriginal.id}|${produtoId}|${variante || '-'}`;
        
        // Busca o progresso específico deste componente nesta demanda
        const prog = getProg(demandaOriginal.id, produtoId, variante);
        
        const totalProcessado = prog.costura + prog.arremate + prog.embalagem + prog.estoque + prog.perda;
        const saldoFila = Math.max(0, quantidadeNecessaria - totalProcessado);

        const gradeInfo = produtoInfo.grade?.find(g => g.variacao === (variante === '-' ? null : variante));

        agregadosMap.set(chaveUnica, {
            // Rastreio
            demanda_id: demandaOriginal.id,
            produto_id: produtoId,
            variante: variante === '-' ? null : variante,
            
            // Visual
            produto_nome: gradeInfo ? `${produtoInfo.nome} (${gradeInfo.variacao})` : produtoInfo.nome,
            imagem: gradeInfo?.imagem || produtoInfo.imagem,
            prioridade: demandaOriginal.prioridade,
            
            // Números do Pipeline
            demanda_total: quantidadeNecessaria,
            saldo_em_fila: saldoFila,
            saldo_em_producao: prog.costura,
            saldo_disponivel_arremate: prog.arremate,
            saldo_disponivel_embalagem: prog.embalagem,
            saldo_disponivel_estoque: prog.estoque,
            saldo_perda: prog.perda,
            
            credito_total: totalProcessado + saldoFila,
            demandas_dependentes_ids: [demandaOriginal.id]
        });
    };

    for (const demanda of demandasResult.rows) {
        const skuBusca = demanda.produto_sku ? demanda.produto_sku.trim().toUpperCase() : '';
        const produtoPrincipal = produtosMapBySku.get(skuBusca);
        if (!produtoPrincipal) continue;

        if (produtoPrincipal.is_kit) {
            // --- EXPLOSÃO DE KIT ---
            const gradeInfo = produtoPrincipal.gradeInfo;
            if (gradeInfo && gradeInfo.composicao && Array.isArray(gradeInfo.composicao)) {
                gradeInfo.composicao.forEach(comp => {
                    const qtdTotalComp = demanda.quantidade_solicitada * comp.quantidade;
                    processarItem(demanda, comp.produto_id, comp.variacao, qtdTotalComp);
                });
            }
        } else {
            // --- PRODUTO SIMPLES ---
            const variante = produtoPrincipal.gradeInfo?.variacao;
            processarItem(demanda, produtoPrincipal.id, variante, demanda.quantidade_solicitada);
        }
    }

    // Auto-Conclusão no Banco (Por Demanda)
    // Uma demanda só acaba quando TODOS os seus componentes acabam (sem perdas críticas)
    // Para simplificar: se o estoque >= total demandado, consideramos ok.
    const statusPorDemanda = new Map();
    agregadosMap.forEach(item => {
        if (!statusPorDemanda.has(item.demanda_id)) statusPorDemanda.set(item.demanda_id, { ok: true });
        // Se qualquer componente ainda tem fila ou está no meio do processo, não acabou.
        if (item.saldo_disponivel_estoque < item.demanda_total) {
            statusPorDemanda.get(item.demanda_id).ok = false;
        }
    });

    statusPorDemanda.forEach((status, demandaId) => {
        if (status.ok) {
             const demandaOriginal = demandasResult.rows.find(d => d.id === demandaId);
             if (demandaOriginal && demandaOriginal.status !== 'concluida') {
                 dbClient.query(`UPDATE demandas_producao SET status = 'concluida', data_conclusao = NOW() WHERE id = $1`, [demandaId]).catch(console.error);
             }
        }
    });

    // Ordenação Final
    const listaFinal = Array.from(agregadosMap.values());
    listaFinal.sort((a, b) => {
        const aConcluido = a.saldo_disponivel_estoque >= a.demanda_total;
        const bConcluido = b.saldo_disponivel_estoque >= b.demanda_total;
        if (aConcluido && !bConcluido) return 1;
        if (!aConcluido && bConcluido) return -1;
        return a.prioridade - b.prioridade;
    });

    return {
        diagnosticoPorDemanda: [],
        diagnosticoAgregado: listaFinal
    };
}

export async function verificarEAtualizarDemandasPorSKU() { return; }
export async function limparAtribuicoesOrfas() { return 0; }