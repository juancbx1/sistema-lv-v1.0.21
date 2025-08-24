const config = {
  dadosCompletos: [],
  renderizarResultados: null,
  camposParaBusca: [],
  filtrosAtuais: {},
};

function normalizarTexto(str) {
  if (typeof str !== 'string') return '';
  // Garante que a normalização não falhe se a string for vazia
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function aplicarFiltros() {
  // Pega uma cópia fresca dos dados originais a cada vez que a função é chamada
  let dadosFiltrados = [...config.dadosCompletos];
  const filtros = config.filtrosAtuais;

  // FILTRO DE BUSCA (TEXTO)
  if (filtros.termoBusca && config.camposParaBusca.length > 0) {
    const termoNormalizado = normalizarTexto(filtros.termoBusca);
    dadosFiltrados = dadosFiltrados.filter(item => 
      config.camposParaBusca.some(campo => 
        normalizarTexto(item[campo]).includes(termoNormalizado)
      )
    );
  }

  // FILTRO POR PRODUTO
  if (filtros.produtos && filtros.produtos.length > 0) {
    dadosFiltrados = dadosFiltrados.filter(item => 
      filtros.produtos.includes(item.produto)
    );
  }

   // FILTRO POR COR
  if (filtros.cores && filtros.cores.length > 0) {
    dadosFiltrados = dadosFiltrados.filter(item => {
      const varianteNormalizada = normalizarTexto(item.variante);
      return filtros.cores.some(corSelecionada => 
        varianteNormalizada.includes(normalizarTexto(corSelecionada))
      );
    });
  }

  // FILTRO POR TAMANHO
 if (filtros.tamanhos && filtros.tamanhos.length > 0) {
    dadosFiltrados = dadosFiltrados.filter(item => {
      const varianteNormalizada = normalizarTexto(item.variante);
      return filtros.tamanhos.some(tamanhoSelecionado =>
        varianteNormalizada.includes(normalizarTexto(tamanhoSelecionado))
      );
    });
  }

  // FILTRO DE STATUS
  if (filtros.status === 'antigos') {
    dadosFiltrados = dadosFiltrados.filter(item => {
      if (!item.data_lancamento_mais_antiga) return false;
      const diffDias = (new Date() - new Date(item.data_lancamento_mais_antiga)) / (1000 * 60 * 60 * 24);
      return diffDias >= 2;
    });
  } else if (filtros.status === 'recentes') {
      dadosFiltrados = dadosFiltrados.filter(item => {
        if (!item.data_lancamento_mais_antiga) return false;
        const diffDias = (new Date() - new Date(item.data_lancamento_mais_antiga)) / (1000 * 60 * 60 * 24);
        return diffDias < 2;
    });
  }

  // ORDENAÇÃO 
  dadosFiltrados.sort((a, b) => {
      switch (filtros.ordenacao) {
          case 'mais_antigos':
              return new Date(a.data_lancamento_mais_antiga) - new Date(b.data_lancamento_mais_antiga);
          case 'mais_recentes':
              return new Date(b.data_lancamento_mais_recente) - new Date(a.data_lancamento_mais_recente);
          case 'maior_quantidade':
              return b.total_disponivel_para_embalar - a.total_disponivel_para_embalar;
          case 'menor_quantidade':
              return a.total_disponivel_para_embalar - b.total_disponivel_para_embalar;
          case 'padrao':
          default:
              // A ordenação "padrão" recomendada é geralmente pelos mais antigos,
              // para que sejam processados primeiro. Vamos usar essa como padrão.
              return new Date(a.data_lancamento_mais_antiga) - new Date(b.data_lancamento_mais_antiga);
      }
  });

  // CHAMA A FUNÇÃO PARA RENDERIZAR
if (config.renderizarResultados) {
    config.renderizarResultados(dadosFiltrados);
  } else {
    console.error('[ERRO FATAL] Nenhuma função de renderização foi configurada no controlador!');
  }
}

function onFiltrosChange(novosFiltros) {
  config.filtrosAtuais = novosFiltros;
  aplicarFiltros();
}

export function inicializarControlador(setup) {
  config.dadosCompletos = setup.dadosCompletos || [];
  config.renderizarResultados = setup.renderizarResultados;
  config.camposParaBusca = setup.camposParaBusca;
  // Define um estado inicial completo para evitar 'undefined'
  config.filtrosAtuais = { termoBusca: '', ordenacao: 'padrao', status: 'todos' }; 
  
  window.onFiltrosChange = onFiltrosChange;
  
  aplicarFiltros();
}