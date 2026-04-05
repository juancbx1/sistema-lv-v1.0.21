// public/src/utils/demandaStatus.js
// Calcula o status de pipeline de uma demanda a partir dos saldos retornados
// pelo diagnostico-completo. Usado nos filtros do painel e no badge dos cards.
//
// Retornos possíveis:
//   'CONCLUIDO'   — estoque atingiu a meta, nada mais rodando
//   'DIVERGENCIA' — perdas fazem o total não fechar, pipeline parado
//   'EMBALAGEM'   — maior parte em embalagem (sem costura ativa)
//   'ARREMATE'    — itens no arremate, sem costura ativa
//   'COSTURA'     — itens em produção (costura ativa)
//   'AGUARDANDO'  — nenhuma etapa iniciada ainda

export function calcularStatusDemanda(item) {
    const emProducao  = item.saldo_em_producao          || 0;
    const emArremate  = item.saldo_disponivel_arremate   || 0;
    const emEmbalagem = item.saldo_disponivel_embalagem  || 0;
    const emEstoque   = item.saldo_disponivel_estoque    || 0;
    const emPerda     = item.saldo_perda                 || 0;
    const totalPedido = item.demanda_total               || 0;

    const totalConsumido = emProducao + emArremate + emEmbalagem + emEstoque + emPerda;
    const pendenteFila   = Math.max(0, totalPedido - totalConsumido);
    const algoEmAndamento = emProducao > 0 || emArremate > 0 || emEmbalagem > 0;

    if (emEstoque >= totalPedido && !algoEmAndamento)                              return 'CONCLUIDO';
    // DIVERGENCIA: nada mais vai entrar (pendenteFila=0, pipeline vazio) mas o estoque
    // não atingiu a meta — inclui o caso onde perdas + estoque = totalPedido (ex: 2 estoque + 6 perda = 8)
    if (pendenteFila === 0 && !algoEmAndamento && emEstoque < totalPedido)         return 'DIVERGENCIA';
    if (emProducao === 0 && emEmbalagem > emArremate)                              return 'EMBALAGEM';
    if (emProducao === 0 && emArremate > 0)                                        return 'ARREMATE';
    if (emProducao > 0)                                                             return 'COSTURA';
    return 'AGUARDANDO';
}

// Metadados visuais por status — usados nos chips de filtro e nos badges dos cards
export const STATUS_META = {
    AGUARDANDO:  { label: 'Aguardando',  icone: 'fa-clock',           cor: '#6c757d' },
    COSTURA:     { label: 'Costura',     icone: 'fa-cut',             cor: 'var(--gs-primaria)' },
    ARREMATE:    { label: 'Arremate',    icone: 'fa-clipboard-check', cor: '#8e44ad' },
    EMBALAGEM:   { label: 'Embalagem',   icone: 'fa-box-open',        cor: '#e67e22' },
    CONCLUIDO:   { label: 'Concluído',   icone: 'fa-check-circle',    cor: '#27ae60' },
    DIVERGENCIA: { label: 'Divergência', icone: 'fa-exclamation-triangle', cor: '#e74c3c' },
};
