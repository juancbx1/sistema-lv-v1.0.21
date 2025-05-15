export const permissoesDisponiveis = [
    { id: 'acesso-home', label: 'Acesso à Home' }, // Para home.html
    { id: 'acesso-costureira-dashboard', label: 'Acesso à Dashboard Costureira' }, // Acesso a dashboards de costureira
    { id: 'acesso-ordens-de-producao', label: 'Acesso a Ordens de Produção' }, // Para ordens-de-producao.html
    { id: 'acesso-cadastrar-produto', label: 'Acesso a Cadastrar Produto' }, // Para cadastrar-produto.html
    { id: 'acesso-embalagem-de-produtos', label: 'Acesso a Embalagem de Produtos' }, // Para embalagem-de-produtos.html
    { id: 'acesso-gerenciar-producao', label: 'Acesso a Gerenciar Produção' }, // Para gerenciar-producao.html
    { id: 'acesso-cadastrar-usuario', label: 'Acesso a Cadastrar Usuário' }, // Para cadastrar-usuario.html
    { id: 'acesso-usuarios-cadastrados', label: 'Acesso a Usuários Cadastrados' }, // Para usuarios-cadastrados.html
    { id: 'acesso-permissoes-usuarios', label: 'Acesso a Permissões de Usuários' }, // Para permissoes-usuarios.html
    { id: 'acesso-relatorio-de-assinaturas', label: 'Acesso a Relatório de Assinaturas' }, // Para relatorio-de-assinaturas.html
    { id: 'acesso-producao-diaria', label: 'Acesso a Produção Diária' }, // Para producao-diaria.html (nova permissão)
    { id: 'acesso-relatorio-de-comissao', label: 'Acesso a Relatório de Comissão' }, // Para relatorio-de-comissao.html
    { id: 'acesso-ponto-por-processo', label: 'Acesso a Ponto por Processo' }, // Para ponto-por-processo.html
    { id: 'criar-op', label: 'Criar Ordem de Produção' }, // Para ordens-de-producao.html
    { id: 'editar-op', label: 'Editar Ordem de Produção' }, // Para ordens-de-producao.html
    { id: 'editar-usuarios', label: 'Editar Usuários' }, // Para usuarios-cadastrados.html
    { id: 'acesso-cadastrar-usuarios', label: 'Cadastrar Usuários' }, // Para cadastrar-usuario.html
    { id: 'excluir-usuarios', label: 'Excluir Usuários' }, // Para usuarios-cadastrados.html
    { id: 'gerenciar-permissoes', label: 'Gerenciar Permissões' }, // Para permissoes-usuarios.html
    { id: 'editar-registro-producao', label: 'Editar Registro de Produção' }, // Para gerenciar-producao.html
    { id: 'excluir-registro-producao', label: 'Excluir Registro de Produção' }, // Para gerenciar-producao.html
    { id: 'cadastrar-produto', label: 'Cadastrar Produto' }, // Para cadastrar-produto.html
    { id: 'lancar-producao', label: 'Lançar Produção (Opera com editar OPs)' },
    { id: 'embalar-produto', label: 'Embalagem de Produto' }, // Para embalagem-de-produtos.html
    { id: 'lancar-arremate', label: 'Lançar Arremate' }, // Para embalagem-de-produtos.html
    { id: 'acesso-estoque', label: 'Acesso ao Estoque' }, // Para estoque.html
    { id: 'lancar-embalagem-unidade', label: 'Lançar embalagem Unidade' }, // Para relatorio-de-comissao.html
    { id: 'confirmar-pagamento-comissao', label: 'Confirmar Pagamento de Comissão' }, // Para embalagem-de-produtos.html
    { id: 'lancar-embalagem', label: 'Lançar Embalagem' }, // Para embalagem-de-produtos.html
    { id: 'montar-kit', label: 'Montar Kit' } // Para embalagem-de-produtos.html
];

// Apenas o tipo 'admin' terá permissões padrão
export const permissoesPorTipo = {
    supervisor: [],
    lider_setor: [],
    tiktik: [],
    cortador: [],
    costureira: ['acesso-costureira-dashboard'
        
    ],
    admin: [
        'acesso-home',
        'acesso-costureira-dashboard', // Admin também pode acessar a dashboard
        'acesso-cadastrar-usuarios',
        'acesso-ordens-de-producao',
        'acesso-cadastrar-produto',
        'acesso-embalagem-de-produtos',
        'acesso-gerenciar-producao',
        'acesso-cadastrar-usuario',
        'acesso-usuarios-cadastrados',
        'acesso-permissoes-usuarios',
        'acesso-relatorio-de-assinaturas',
        'acesso-relatorio-de-comissao',
        'acesso-producao-diaria', 
        'acesso-ponto-por-processo',
        'criar-op',
        'editar-op',
        'editar-usuarios',
        'excluir-usuarios',
        'gerenciar-permissoes',
        'editar-registro-producao',
        'excluir-registro-producao',
        'lancar-producao',
        'embalar-produto',
        'lancar-arremate',
        'acesso-estoque',
        'confirmar-pagamento-comissao',
        'lancar-embalagem-unidade',
        'montar-kit',
        'lancar-embalagem'

        
    ]
};