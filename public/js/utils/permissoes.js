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
    { id: 'acesso-producao-geral-costura', label: 'Acesso a Produção Geral de Costureiras' }, // Para producao-geral-costura.html 
    { id: 'acesso-relatorio-de-comissao', label: 'Acesso a Relatório de Comissão' }, // Para relatorio-de-comissao.html
    { id: 'acesso-ponto-por-processo', label: 'Acesso a Ponto por Processo' }, // Para ponto-por-processo.html
    { id: 'acesso-dashboard-tiktik', label: 'Acesso a Dashboard Tiktik' }, // Para dashboard-tiktik.html
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
    { id: 'montar-kit', label: 'Montar Kit' }, // Para embalagem-de-produtos.html
    { id: 'gerenciar-produtos', label: 'Gerenciar Produtos' }, // Para cadastrar-produtos.html
    { id: 'gerenciar-estoque', label: 'Gerenciar Estoque' }, // Para estoque.html
    { id: 'registrar-corte', label: 'Registrar Corte para Estoque' }, // Para ordens-de-producao.html
    { id: 'excluir-estoque-corte', label: 'Excluir Corte do Estoque' }, // Para ordens-de-producao.html
    { id: 'marcar-como-cortado', label: 'Marcar Corte como Cortado' }, // Para ordens-de-producao.html
    { id: 'excluir-corte-pendente', label: 'Excluir Corte Pendente' }, // Para ordens-de-producao.html
    { id: 'finalizar-op', label: 'Finalizar uma OP' }, // Para ordens-de-producao.html
    { id: 'cancelar-op', label: 'Cancelar uma OP' }, // Para ordens-de-producao.html
    { id: 'acesso-admin-geral', label: 'Acesso Geral para Telas de Admins' }, // Para usuário tiktik/costureira ser redirecionado para home.html
    { id: 'ver-proprias-producoes', label: 'Permite ver as próprias producoes' }, // Para costureiras e tiktik (dashboards)
    { id: 'ver-proprios-arremates', label: 'Permite ver os próprios arremates' }, // Para costureiras e tiktik (dashboards)
    { id: 'assinar-propria-producao-costureira', label: 'Permite assinar a própria producao' }, // Para costureiras (dashboard)
    { id: 'ver-lista-produtos', label: 'Permite visualizar a lista de produtos cadastrados' }, // para api/produtos.js
    { id: 'acesso-ordens-de-arremates', label: 'Acesso a Ordens de Arremate' }, // para ordens-de-arremate.html
    { id: 'gerenciar-precificacao', label: 'Permite Gerenciar Precificacao' }, // para precificacao.html
    { id: 'acesso-precificacao', label: 'Acesso a Precificação' }, // para precificacao.html
    { id: 'gerenciar-niveis-alerta-estoque', label: 'Permite Gerenciar os Níveis de Estoque Baixo e Urgente' }, // para estoque.html
    { id: 'ajustar-saldo', label: 'Permite dar Entrada, Saída e Balanço' }, // para estoque.html
    { id: 'assinar-propria-producao-tiktik', label: 'Permite o Tiktik assinar a própria producao' }, // para dashboard-tiktik.html
    { id: 'assinar-proprio-arremate', label: 'Permite o Tiktik assinar o próprio arremate' }, // para dashboard-tiktik.html
    { id: 'arquivar-produto-do-estoque', label: 'Permite arquivar um produto do estoque' }, // para estoque.html
    { id: 'gerenciar-fila-de-producao', label: 'Permite gerenciar fila de producao do estoque' } // para estoque.html


];

// Apenas o tipo 'admin' terá permissões padrão
export const permissoesPorTipo = {
    supervisor: [],
    lider_setor: [],
    tiktik: [
        'acesso-dashboard-tiktik',
        'ver-proprias-producoes',
        'assinar-propria-producao-tiktik',
        'assinar-proprio-arremate'
    ],
    cortador: [],
    costureira: [
        'acesso-costureira-dashboard',
        'ver-proprias-producoes',
        'assinar-propria-producao-costureira'
    ],
    admin: [
        'acesso-admin-geral', 
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
        'acesso-producao-geral-costura', 
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
        'lancar-embalagem',
        'gerenciar-produtos',
        'gerenciar-estoque',
        'ver-lista-produtos',
        'acesso-ordens-de-arremates',
        'gerenciar-precificacao',
        'acesso-precificacao',
        'gerenciar-niveis-alerta-estoque',
        'ajustar-saldo',
        'arquivar-produto-do-estoque',
        'gerenciar-fila-de-producao'

        
    ]
};