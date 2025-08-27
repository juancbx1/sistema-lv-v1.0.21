const config = {
  dadosCompletos: [],
  renderizarResultados: null,
  filtrosAtuais: {},
  // --- CAMPOS DE MAPEAMENTO ---
  // Mapeia os nomes genéricos (usados nos filtros) para os nomes reais dos campos nos dados
  mapeamentoDeCampos: {
    busca: ['produto', 'variante'],
    produto: 'produto',
    variante: 'variante',
    quantidade: 'total_disponivel_para_embalar',
    dataRecente: 'data_lancamento_mais_recente',
    dataAntiga: 'data_lancamento_mais_antiga',
  }
};

function normalizarTexto(str) {
  if (typeof str !== 'string') return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function aplicarFiltros() {
  let dadosFiltrados = [...config.dadosCompletos];
  const filtros = config.filtrosAtuais;
  const mapa = config.mapeamentoDeCampos;

  // --- FILTRAGEM ---

  // 1. Filtro de BUSCA (Texto)
  if (filtros.termoBusca) {
    const termoNormalizado = normalizarTexto(filtros.termoBusca);
    dadosFiltrados = dadosFiltrados.filter(item => 
      mapa.busca.some(campoReal => 
        normalizarTexto(item[campoReal]).includes(termoNormalizado)
      )
    );
  }

  // 2. Filtro de PRODUTO (Checkbox)
  if (filtros.produtos && filtros.produtos.length > 0) {
    dadosFiltrados = dadosFiltrados.filter(item => 
      filtros.produtos.includes(item[mapa.produto])
    );
  }

  // 3. Filtro de COR (Checkbox) - Agora usa o campo 'variante' mapeado
  if (filtros.cores && filtros.cores.length > 0) {
    dadosFiltrados = dadosFiltrados.filter(item => {
      const varianteDoItem = normalizarTexto(item[mapa.variante]);
      return filtros.cores.some(corSelecionada => 
        varianteDoItem.includes(normalizarTexto(corSelecionada))
      );
    });
  }

  // 4. Filtro de TAMANHO (Checkbox) - Agora usa o campo 'variante' mapeado
  if (filtros.tamanhos && filtros.tamanhos.length > 0) {
    dadosFiltrados = dadosFiltrados.filter(item => {
      const varianteDoItem = normalizarTexto(item[mapa.variante]);
      return filtros.tamanhos.some(tamanhoSelecionado => {
        const regex = new RegExp(`\\b${normalizarTexto(tamanhoSelecionado)}\\b`);
        return regex.test(varianteDoItem);
      });
    });
  }
  
  // 5. Filtro de STATUS (Antigos/Recentes)
  if (filtros.status === 'antigos' || filtros.status === 'recentes') {
      dadosFiltrados = dadosFiltrados.filter(item => {
        if (!item[mapa.dataAntiga]) return false;
        const diffDias = (new Date() - new Date(item[mapa.dataAntiga])) / (1000 * 60 * 60 * 24);
        return filtros.status === 'antigos' ? diffDias >= 2 : diffDias < 2;
    });
  }

  // --- ORDENAÇÃO ---
  dadosFiltrados.sort((a, b) => {
      const tipoOrdenacao = filtros.ordenacao === 'padrao' ? 'mais_recentes' : filtros.ordenacao;
  
      switch (tipoOrdenacao) {
          case 'mais_antigos':
              // Usa || new Date(0) como segurança caso a data seja nula
              return new Date(a[mapa.dataAntiga] || 0) - new Date(b[mapa.dataAntiga] || 0);
          case 'maior_quantidade':
              return (b[mapa.quantidade] || 0) - (a[mapa.quantidade] || 0);
          case 'menor_quantidade':
              return (a[mapa.quantidade] || 0) - (b[mapa.quantidade] || 0);
          case 'mais_recentes':
          default:
              return new Date(b[mapa.dataRecente] || 0) - new Date(a[mapa.dataRecente] || 0);
      }
  });

  // Chama a função para renderizar os resultados
  if (config.renderizarResultados) {
    config.renderizarResultados(dadosFiltrados, 1);
  }
}


function onFiltrosChange(novosFiltros) {
  config.filtrosAtuais = novosFiltros;
  aplicarFiltros();
}

export function inicializarControlador(setup) {
  config.dadosCompletos = setup.dadosCompletos || [];
  config.renderizarResultados = setup.renderizarResultados;
  // Sobrescreve o mapeamento padrão com o que foi passado na configuração
  config.mapeamentoDeCampos = { ...config.mapeamentoDeCampos, ...setup.mapeamentoDeCampos };
  
  config.filtrosAtuais = { termoBusca: '', ordenacao: 'mais_recentes', status: 'todos', produtos:[], cores:[], tamanhos:[] }; 
  
  const callbackName = setup.callbackGlobal || 'onFiltrosChange';
  window[callbackName] = onFiltrosChange;
  
  aplicarFiltros();
}

export function atualizarDadosControlador(novosDados) {
  if (!Array.isArray(novosDados)) {
    console.error('[Controlador] Tentativa de atualizar com dados que não são um array.');
    return;
  }
  config.dadosCompletos = novosDados;
  aplicarFiltros();
}