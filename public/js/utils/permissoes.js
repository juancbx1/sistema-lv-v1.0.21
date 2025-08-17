// public/js/utils/permissoes.js

// ==========================================================================
// 1. DEFINIÇÃO DAS PERMISSÕES DISPONÍVEIS (COM CATEGORIA)
// Esta é a fonte da verdade para todas as permissões no sistema.
// Cada permissão tem um ID único, uma descrição (label) e uma categoria para organização.
// ==========================================================================

export const permissoesDisponiveis = [
    // --- DASHBOARD COSTUREIRAS/TIKTIK ---
    { id: 'acesso-dashboard', label: 'Acesso ao Dashboard de Produção', categoria: 'Dashboard Costureira e Tiktik' },
    { id: 'acesso-desempenho', label: 'Acesso ao Meu Desempenho', categoria: 'Dashboard Costureira e Tiktik' },
    { id: 'assinar-producao-costureira', label: 'Ação: Costureira assina sua produção', categoria: 'Dashboard Costureira e Tiktik' },
    { id: 'assinar-producao-tiktik', label: 'Ação: TikTik assina sua produção de OP', categoria: 'Dashboard Costureira e Tiktik' },
    { id: 'assinar-arremate-tiktik', label: 'Ação: TikTik assina seus arremates', categoria: 'Dashboard Costureira e Tiktik' },
    { id: 'ver-proprias-producoes', label: 'Permite ver as próprias produções', categoria: 'Dashboard Costureira e Tiktik' },
    { id: 'ver-proprios-arremates', label: 'Permite ver os próprios arremates', categoria: 'Dashboard Costureira e Tiktik' },
    { id: 'ver-lista-produtos', label: 'Ação: Permite ver a Lista de produtos (VIA API)', categoria: 'Dashboard Costureira e Tiktik' },

    // --- ACESSO GERAL ---
    { id: 'acesso-admin-geral', label: 'Acesso Geral à Área Administrativa', categoria: 'Acesso Geral' },
    { id: 'acesso-home', label: 'Acesso à Home Administrativa', categoria: 'Acesso Geral' },
    
    // --- USUÁRIOS E PERMISSÕES ---
    { id: 'acesso-usuarios-cadastrados', label: 'Ver Tela de Usuários Cadastrados', categoria: 'Usuários e Permissões' },
    { id: 'acesso-cadastrar-usuario', label: 'Ver Tela de Cadastrar Usuário', categoria: 'Usuários e Permissões' },
    { id: 'acesso-permissoes-usuarios', label: 'Ver Tela de Gerenciar Permissões', categoria: 'Usuários e Permissões' },
    { id: 'acesso-cadastrar-usuarios', label: 'Ação: Cadastrar novos usuários', categoria: 'Usuários e Permissões' },
    { id: 'editar-usuarios', label: 'Ação: Editar dados de usuários', categoria: 'Usuários e Permissões' },
    { id: 'excluir-usuarios', label: 'Ação: Excluir usuários', categoria: 'Usuários e Permissões' },
    { id: 'gerenciar-permissoes', label: 'Ação: Alterar permissões individuais', categoria: 'Usuários e Permissões' },

    // --- PRODUTOS, KITS E MATÉRIAS-PRIMAS ---
    { id: 'acesso-cadastrar-produto', label: 'Ver Tela de Cadastro de Produtos', categoria: 'Produtos e Kits' },
    { id: 'ver-lista-produtos', label: 'Ação: Visualizar lista de produtos (API)', categoria: 'Produtos e Kits' },
    { id: 'gerenciar-produtos', label: 'Ação: Criar e editar produtos/kits', categoria: 'Produtos e Kits' },
    { id: 'cadastrar-produto', label: 'Ação: Cadastrar Produto (específico)', categoria: 'Produtos e Kits' },

    // --- PRODUÇÃO (OPs E CORTES) ---
    { id: 'acesso-ordens-de-producao', label: 'Ver Tela de Ordens de Produção', categoria: 'Produção e Cortes' },
    { id: 'criar-op', label: 'Ação: Criar Ordens de Produção', categoria: 'Produção e Cortes' },
    { id: 'editar-op', label: 'Ação: Editar Ordens de Produção', categoria: 'Produção e Cortes' },
    { id: 'finalizar-op', label: 'Ação: Finalizar uma OP', categoria: 'Produção e Cortes' },
    { id: 'cancelar-op', label: 'Ação: Cancelar uma OP', categoria: 'Produção e Cortes' },
    { id: 'lancar-producao', label: 'Ação: Lançar etapas de produção em uma OP', categoria: 'Produção e Cortes' },
    { id: 'registrar-corte', label: 'Ação: Registrar novo corte de tecido', categoria: 'Produção e Cortes' },
    { id: 'marcar-como-cortado', label: 'Ação: Mover corte para "cortado"', categoria: 'Produção e Cortes' },
    { id: 'excluir-corte-pendente', label: 'Ação: Excluir pedido de corte pendente', categoria: 'Produção e Cortes' },
    { id: 'excluir-estoque-corte', label: 'Ação: Excluir corte do estoque', categoria: 'Produção e Cortes' },

    // --- GERENCIAR PRODUÇÃO ---
    { id: 'acesso-gerenciar-producao', label: 'Ver Tela de Gerenciar Produção', categoria: 'Gerenciar Produção' },
    { id: 'editar-registro-producao', label: 'Permite Editar Produção', categoria: 'Gerenciar Produção' },
    { id: 'excluir-registro-producao', label: 'Permite Excluir Produção', categoria: 'Gerenciar Produção' },


    // --- ARREMATE E EMBALAGEM ---
    { id: 'acesso-ordens-de-arremates', label: 'Ver Tela de Ordens de Arremate', categoria: 'Arremate e Embalagem' },
    { id: 'acesso-embalagem-de-produtos', label: 'Ver Tela de Embalagem', categoria: 'Arremate e Embalagem' },
    { id: 'lancar-arremate', label: 'Ação: Registrar novo arremate', categoria: 'Arremate e Embalagem' },
    { id: 'estornar-arremate', label: 'Ação: Permite estornar Arremates', categoria: 'Arremate e Embalagem' },
    { id: 'registrar-perda-arremate', label: 'Ação: Registrar uma perda no arremate', categoria: 'Arremate e Embalagem' },
    { id: 'lancar-embalagem', label: 'Ação: Registrar embalagem de produtos', categoria: 'Arremate e Embalagem' },
    { id: 'lancar-embalagem-unidade', label: 'Ação: Lançar embalagem de unidade', categoria: 'Arremate e Embalagem' },
    { id: 'montar-kit', label: 'Ação: Montar/desmontar kits', categoria: 'Arremate e Embalagem' },

    // --- ESTOQUE ---
    { id: 'acesso-estoque', label: 'Ver Tela de Estoque', categoria: 'Estoque' },
    { id: 'gerenciar-estoque', label: 'Ação: Gerenciar Estoque (Geral)', categoria: 'Estoque' },
    { id: 'ajustar-saldo', label: 'Ação: Dar Entrada, Saída e Balanço', categoria: 'Estoque' },
    { id: 'gerenciar-fila-de-producao', label: 'Ação: Gerenciar fila de produção', categoria: 'Estoque' },
    { id: 'anular-promessa-producao', label: 'Ação: Anular promessa de produção', categoria: 'Estoque' },
    { id: 'gerenciar-niveis-alerta-estoque', label: 'Ação: Gerenciar níveis de alerta', categoria: 'Estoque' },
    { id: 'arquivar-produto-do-estoque', label: 'Ação: Arquivar um produto', categoria: 'Estoque' },
    { id: 'editar-itens-arquivados', label: 'Ação: Editar/retirar itens arquivados', categoria: 'Estoque' },
    { id: 'fazer-inventario', label: 'Ação: Permite Realizar Inventário', categoria: 'Estoque' },
    { id: 'registrar-entrada-manual', label: 'Ação: Permite dar Entrada Manual', categoria: 'Estoque' },
    { id: 'registrar-saida-manual', label: 'Ação: Permite dar Saída Manual', categoria: 'Estoque' },
    { id: 'registrar-devolucao', label: 'Ação: Permite Realizar Devolução', categoria: 'Estoque' },

    // --- FINANCEIRO (CONTROLE DE CAIXA) ---
    { id: 'acesso-financeiro', label: 'Acesso ao Módulo Financeiro (Caixa)', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'visualizar-financeiro', label: 'Visualizar dashboard e extratos', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'lancar-transacao', label: 'Ação: Lançar novas receitas e despesas', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'editar-transacao', label: 'Ação: Editar lançamentos financeiros', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'estornar-transacao', label: 'Ação: Estornar lançamentos financeiros', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'aprovar-pagamento', label: 'Ação: Dar baixa em contas a pagar/receber', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'gerenciar-contas', label: 'Ação: Criar e editar contas bancárias', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'gerenciar-categorias', label: 'Ação: Criar e editar categorias financeiras', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'criar-favorecido', label: 'Ação: Criar novos favorecidos (clientes/fornecedores)', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'visualizar-relatorios', label: 'Ação: Gerar relatórios financeiros', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'aprovar-alteracao-financeira', label: 'Ação: Aprovar/Rejeitar edições e exclusões', categoria: 'Financeiro (Controle de Caixa)' },
    { id: 'permite-excluir-agendamentos', label: 'Ação: Pode excluir agendamentos (pelo ID)', categoria: 'Financeiro (Controle de Caixa)' },


    // --- FINANCEIRO E RELATÓRIOS ---
    { id: 'acesso-precificacao', label: 'Ver Tela de Precificação', categoria: 'Financeiro e Relatórios' },
    { id: 'acesso-relatorio-de-comissao', label: 'Ver Relatório de Comissão', categoria: 'Financeiro e Relatórios' },
    { id: 'acesso-conferencia-e-auditoria', label: 'Ver Conferencia e Auditoria', categoria: 'Financeiro e Relatórios' },
    { id: 'acesso-producao-geral-costura', label: 'Ver Produção Geral (Costureiras)', categoria: 'Financeiro e Relatórios' },
    { id: 'gerenciar-precificacao', label: 'Ação: Editar configurações de precificação', categoria: 'Financeiro e Relatórios' },
    { id: 'confirmar-pagamento-comissao', label: 'Ação: Marcar comissões como pagas', categoria: 'Financeiro e Relatórios' },
    { id: 'gerenciar-taxas-vt', label: 'Ação: Gerenciar Concessionárias e Taxas de VT', categoria: 'Financeiro e Relatórios' },

     // --- PAGAMENTOS A FUNCIONARIOS ---
    { id: 'acessar-central-pagamentos', label: 'Acessar Central de Pagamentos à Empregados', categoria: 'Pagamentos à Empregados' },
    { id: 'efetuar-pagamento-empregado', label: 'Acessar Pagamentos à Empregados', categoria: 'Pagamentos à Empregados' },
    { id: 'permitir-pagar-comissao', label: 'Ação: Pagar comissões', categoria: 'Pagamentos à Empregados' },
    { id: 'permitir-conceder-bonus', label: 'Ação: Conceder bônus e premiações', categoria: 'Pagamentos à Empregados' },
    { id: 'permitir-pagar-passagens', label: 'Ação: Pagar vales-transporte (passagens)', categoria: 'Pagamentos à Empregados' },
    { id: 'permitir-lancar-falta-nao-justificada', label: 'Ação: Lançar faltas não justificadas', categoria: 'Pagamentos à Empregados' },
    { id: 'permitir-estornar-passagens', label: 'Ação: Estornar pagamentos de passagens', categoria: 'Pagamentos à Empregados' },


    // --- CONFIGURAÇÕES ---
    { id: 'acesso-ponto-por-processo', label: 'Ver Tela de Pontos por Processo', categoria: 'Configurações' },
    { id: 'gerenciar-comunicacoes', label: 'Ver Tela Gerenciar Comunicações', categoria: 'Configurações' },

    
    // --- ACESSAR PRODUCAO GERAL ---
    { id: 'acesso-producao-geral', label: 'Ver Tela a Tela Produção Geral dos Empregados', categoria: 'Produção Geral' },

    
];


// ==========================================================================
// 2. PERMISSÕES PADRÃO POR TIPO DE USUÁRIO
// Mapeia um "tipo" de usuário para um array de IDs de permissão que ele recebe por padrão.
// ==========================================================================

export const permissoesPorTipo = {
    // Perfis de produção (acesso focado)
    costureira: [
        
    ],
    tiktik: [
        
    ],
    cortador: [],

    // Perfis de gestão/administração (acesso amplo)
    lider_setor: [
        'acesso-admin-geral',
        'acesso-home',
        'acesso-ordens-de-producao',
        'acesso-ordens-de-arremates',
        'acesso-estoque',
    ],
    supervisor: [
        'acesso-admin-geral',
        'acesso-home',
        'acesso-usuarios-cadastrados',
        'acesso-ordens-de-producao',
        'acesso-ordens-de-arremates',
        'acesso-estoque',
        'acesso-relatorio-de-comissao',
        'gerenciar-comunicacoes' 
    ],

    // Admin tem acesso a tudo, sempre.
    admin: permissoesDisponiveis.map(p => p.id)
};


// ==========================================================================
// 3. ESTRUTURA CATEGORIZADA PARA O FRONTEND
// Esta função agrupa as permissões pela propriedade 'categoria'.
// O resultado é um objeto como: { "Acesso Geral": [perm1, perm2], "Produção": [perm3, perm4] }
// Isso facilita muito a criação dos grupos na interface (como o acordeão).
// ==========================================================================

export const permissoesCategorizadas = permissoesDisponiveis.reduce((acc, permissao) => {
    // Se uma permissão não tiver categoria, ela vai para um grupo 'Outras'.
    const categoria = permissao.categoria || 'Outras'; 
    
    // Se a categoria ainda não existe no nosso acumulador, cria um array para ela.
    if (!acc[categoria]) {
        acc[categoria] = [];
    }
    
    // Adiciona a permissão atual ao array da sua categoria.
    acc[categoria].push(permissao);
    
    return acc;
}, {});


// ==========================================================================
// 4. UTILITÁRIOS (Não precisa mudar)
// Um Set é uma estrutura de dados otimizada para verificações rápidas de "existe ou não existe".
// Útil para validar se um ID de permissão é válido no sistema.
// ==========================================================================

export const permissoesValidas = new Set(permissoesDisponiveis.map(p => p.id));