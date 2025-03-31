import { verificarAutenticacao, logout } from '/js/utils/auth.js';

(async () => {
  // Verificar autenticação de forma assíncrona
  const auth = await verificarAutenticacao('gerenciar-producao.html', ['acesso-gerenciar-producao']);
  if (!auth) {
    console.error('[admin-gerenciar-producao] Autenticação falhou. Usuário logado:', localStorage.getItem('usuarioLogado'));
    return; // O redirecionamento já é tratado pela função verificarAutenticacao
  }

  let permissoes = auth.permissoes || [];
  let usuarioLogado = auth.usuario;

  let currentPage = 1;
  const registrosPorPagina = 20;

  async function carregarProducoesDoBackend() {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/producoes', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao buscar produções: ${response.statusText}`);
      }

      const producoes = await response.json();
      console.log('[carregarProducoesDoBackend] Produções carregadas do backend:', producoes);
      return producoes.map(p => ({
        id: p.id,
        opNumero: p.op_numero,
        etapaIndex: p.etapa_index,
        processo: p.processo,
        produto: p.produto,
        maquina: p.maquina,
        quantidade: p.quantidade,
        funcionario: p.funcionario,
        data: p.data,
        dataHoraFormatada: new Date(p.data).toLocaleString('pt-BR'),
        assinada: p.assinada || false,
        lancadoPor: p.lancado_por,
        edicoes: p.edicoes || 0,
      }));
    } catch (error) {
      console.error('[carregarProducoesDoBackend] Erro:', error);
      return [];
    }
  }

  async function carregarFiltroFuncionarios() {
    const selectFuncionario = document.getElementById('filtroCostureira');
    if (!selectFuncionario) {
      console.error('[carregarFiltroFuncionarios] Elemento #filtroCostureira não encontrado no DOM');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/usuarios', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao buscar usuários: ${response.statusText}`);
      }

      const usuarios = await response.json();

      const funcionarios = usuarios.filter(u => {
        const tipos = u.tipos && Array.isArray(u.tipos) ? u.tipos : (u.tipo ? [u.tipo] : []);
        return tipos.includes('costureira') || tipos.includes('tiktik');
      });

      selectFuncionario.innerHTML = '<option value="">Todos</option>';
      funcionarios.forEach(f => {
        const tipos = f.tipos && Array.isArray(f.tipos) ? f.tipos : (f.tipo ? [f.tipo] : []);
        const tipoLabel = tipos.includes('costureira') ? 'Costureira' : 'TikTik';
        const option = document.createElement('option');
        option.value = f.nome;
        option.textContent = `${f.nome} (${tipoLabel}, Nível ${f.nivel || 1})`;
        selectFuncionario.appendChild(option);
      });
    } catch (error) {
      console.error('[carregarFiltroFuncionarios] Erro ao carregar usuários:', error);
      selectFuncionario.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  async function carregarFiltroProdutos() {
    const selectProduto = document.getElementById('filtroProduto');
    if (!selectProduto) {
      console.error('[carregarFiltroProdutos] Elemento #filtroProduto não encontrado no DOM');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/produtos', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao buscar produtos: ${response.statusText}`);
      }

      const produtos = await response.json();
      console.log('[carregarFiltroProdutos] Produtos carregados:', produtos);

      selectProduto.innerHTML = '<option value="">Todos</option>';
      produtos.forEach(p => {
        const option = document.createElement('option');
        option.value = p.nome;
        option.textContent = p.nome;
        selectProduto.appendChild(option);
      });
    } catch (error) {
      console.error('[carregarFiltroProdutos] Erro ao carregar produtos:', error);
      selectProduto.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }


  
  async function aplicarFiltros(page = 1, dataInicial = null) {
    currentPage = page;
    const producoes = await carregarProducoesDoBackend();

    // Buscar usuários da API
    let usuarios = [];
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/usuarios', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao buscar usuários: ${response.statusText}`);
      }

      usuarios = await response.json();
    } catch (error) {
      console.error('[aplicarFiltros] Erro ao carregar usuários:', error);
    }

    const filtroFuncionario = document.getElementById('filtroCostureira')?.value || '';
    const filtroData = dataInicial !== null ? dataInicial : (document.getElementById('filtroData')?.value || '');
    const filtroMaquina = document.getElementById('filtroMaquina')?.value || '';
    const filtroProcesso = document.getElementById('filtroProcesso')?.value || '';
    const filtroProduto = document.getElementById('filtroProduto')?.value || '';
    const filtroAssinatura = document.getElementById('filtroAssinatura')?.value || '';

    let filteredProducoes = producoes.filter(p => {
      let dataProducao;
      try {
        const dataRegistro = new Date(p.data);
        if (isNaN(dataRegistro.getTime())) {
          console.warn('[aplicarFiltros] Data inválida no registro:', p.id, p.data);
          return false;
        }

        const ano = dataRegistro.getFullYear();
        const mes = String(dataRegistro.getMonth() + 1).padStart(2, '0');
        const dia = String(dataRegistro.getDate()).padStart(2, '0');
        dataProducao = `${ano}-${mes}-${dia}`;
      } catch (e) {
        console.error('[aplicarFiltros] Erro ao processar data do registro:', p.id, p.data, e);
        return false;
      }

      const matchesData = !filtroData || dataProducao === filtroData;
      const matchesMaquina = !filtroMaquina || p.maquina === filtroMaquina;
      const matchesProcesso = !filtroProcesso || p.processo === filtroProcesso;
      const matchesProduto = !filtroProduto || p.produto === filtroProduto;
      const matchesAssinatura = 
        filtroAssinatura === '' || 
        (filtroAssinatura === 'sim' && p.assinada === true) || 
        (filtroAssinatura === 'nao' && !p.assinada);
      const matchesFuncionario = !filtroFuncionario || p.funcionario === filtroFuncionario;

      return matchesFuncionario && matchesData && matchesMaquina && matchesProcesso && matchesProduto && matchesAssinatura;
    });

    filteredProducoes.sort((a, b) => new Date(b.data) - new Date(a.data));

    const totalRegistros = filteredProducoes.length;
    const totalPaginas = Math.ceil(totalRegistros / registrosPorPagina);
    const inicio = (currentPage - 1) * registrosPorPagina;
    const fim = inicio + registrosPorPagina;
    const producoesPagina = filteredProducoes.slice(inicio, fim);
    const corpoTabela = document.getElementById('corpoTabelaProducoes');
    const paginacao = document.getElementById('paginacao');
    const tabelaProducoes = document.getElementById('tabelaProducoes');
    const noRecordsMessage = document.getElementById('noRecordsMessage');
    const currentFilterDate = document.getElementById('currentFilterDate');

    if (corpoTabela && paginacao && tabelaProducoes && noRecordsMessage && currentFilterDate) {
      corpoTabela.innerHTML = ''; // Limpar a tabela

      if (totalRegistros === 0) {
        tabelaProducoes.style.display = 'none';
        paginacao.style.display = 'none';
        noRecordsMessage.style.display = 'block';
        const dataExibida = filtroData || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
        currentFilterDate.textContent = dataExibida.split('-').reverse().join('/'); // Converter YYYY-MM-DD para DD/MM/YYYY
      } else {
        tabelaProducoes.style.display = 'table';
        paginacao.style.display = 'flex';
        noRecordsMessage.style.display = 'none';

        producoesPagina.forEach((p) => {
          const usuario = usuarios.find(u => u.nome === p.funcionario);
          const foiAssinado = p.assinada ? 'Sim' : 'Não';
          const edicoesTexto = p.edicoes > 0 ? `(E ${p.edicoes}x)` : '';
          const [data, hora] = p.dataHoraFormatada.split(', ');
      
          const tr = document.createElement('tr');
          tr.dataset.id = p.id;
      
          // ID
          const tdId = document.createElement('td');
          tdId.setAttribute('data-label', 'ID');
          tdId.textContent = p.id;
          tr.appendChild(tdId);
      
          // Funcionário
          const tdFuncionario = document.createElement('td');
          tdFuncionario.setAttribute('data-label', 'Funcionário');
          if (usuario) {
              tdFuncionario.textContent = usuario.nome;
          } else {
              const funcionarioText = document.createTextNode(p.funcionario + ' ');
              tdFuncionario.appendChild(funcionarioText);
              const spanDeletado = document.createElement('span');
              spanDeletado.className = 'deletado';
              spanDeletado.textContent = '(usuário deletado do sistema)';
              tdFuncionario.appendChild(spanDeletado);
          }
          tr.appendChild(tdFuncionario);
      
          // Produto
          const tdProduto = document.createElement('td');
          tdProduto.setAttribute('data-label', 'Produto');
          tdProduto.textContent = p.produto;
          tr.appendChild(tdProduto);
      
          // Proc./Máq.
          const tdProcMaq = document.createElement('td');
          tdProcMaq.setAttribute('data-label', 'Proc./Máq.');
          tdProcMaq.textContent = `${p.processo} / ${p.maquina}`;
          tr.appendChild(tdProcMaq);
      
          // OP
          const tdOp = document.createElement('td');
          tdOp.setAttribute('data-label', 'OP');
          tdOp.textContent = p.opNumero || '-';
          tr.appendChild(tdOp);
      
          // Qtde
          const tdQtde = document.createElement('td');
          tdQtde.setAttribute('data-label', 'Qtde');
          tdQtde.textContent = p.quantidade;
          tr.appendChild(tdQtde);
      
          // Data/Hora
          const tdDataHora = document.createElement('td');
          tdDataHora.setAttribute('data-label', 'Data/Hora');
          const dataText = document.createTextNode(`${data}, ${hora} `);
          tdDataHora.appendChild(dataText);
          if (edicoesTexto) {
              const edicoesSpan = document.createElement('span');
              edicoesSpan.textContent = edicoesTexto;
              tdDataHora.appendChild(edicoesSpan);
          }
          tr.appendChild(tdDataHora);
      
          // Assinou?
          const tdAssinou = document.createElement('td');
          tdAssinou.setAttribute('data-label', 'Assinou?');
          tdAssinou.textContent = foiAssinado;
          tr.appendChild(tdAssinou);
      
          // Por
          const tdPor = document.createElement('td');
          tdPor.setAttribute('data-label', 'Por');
          tdPor.textContent = p.lancadoPor || 'Desconhecido';
          tr.appendChild(tdPor);
      
          // Ação
          // Ação
const tdAcao = document.createElement('td');
tdAcao.setAttribute('data-label', 'Ação');

// Cria uma div para agrupar os botões
const divBotoes = document.createElement('div');
divBotoes.className = 'botoes-acao'; // Adiciona uma classe para estilização, se necessário

if (permissoes.includes('editar-registro-producao')) {
    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn-editar-registro';
    btnEditar.textContent = 'Editar';
    divBotoes.appendChild(btnEditar);
}
if (permissoes.includes('excluir-registro-producao')) {
    const btnExcluir = document.createElement('button');
    btnExcluir.className = 'btn-excluir-registro';
    btnExcluir.textContent = 'Excluir';
    divBotoes.appendChild(btnExcluir);
}

// Adiciona a div com os botões ao <td>
tdAcao.appendChild(divBotoes);
tr.appendChild(tdAcao);
      
          corpoTabela.appendChild(tr);
      });

        document.querySelectorAll('.btn-excluir-registro').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.closest('tr').dataset.id;
            excluirRegistro(id);
          });
        });

        document.querySelectorAll('.btn-editar-registro').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.closest('tr').dataset.id;
            editarRegistro(id);
          });
        });

        atualizarPaginacao(totalPaginas);
      }
    } else {
      console.error('[aplicarFiltros] Elementos necessários não encontrados no DOM');
    }
  }

  async function excluirRegistro(id) {
    if (!permissoes.includes('excluir-registro-producao')) {
      alert('Você não tem permissão para excluir registros.');
      return;
    }
    const confirmacao = confirm("Tem certeza que deseja excluir o registro?");
    if (!confirmacao) return;
  
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/producoes', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Erro ao excluir produção: ${errorData.error || response.statusText}`);
      }
  
      const producaoExcluida = await response.json();
      console.log('[excluirRegistro] Registro excluído do backend:', producaoExcluida);
  
      // Atualizar a OP correspondente
      const ordensDeProducaoResponse = await fetch('/api/ordens-de-producao', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
  
      if (!ordensDeProducaoResponse.ok) {
        throw new Error('Erro ao buscar ordens de produção');
      }
  
      const ordensDeProducao = await ordensDeProducaoResponse.json();
      const op = ordensDeProducao.find(o => o.numero === producaoExcluida.op_numero);
      if (!op) {
        console.warn('[excluirRegistro] OP não encontrada para opNumero:', producaoExcluida.op_numero);
        aplicarFiltros(currentPage);
        alert('Registro excluído com sucesso!');
        return;
      }
  
      const etapa = op.etapas.find(e => e.ultimoLancamentoId === String(id));
      if (etapa) {
        etapa.quantidade = '';
        etapa.lancado = false;
        etapa.ultimoLancamentoId = null;
        delete etapa.editadoPorAdmin;
  
        // Recalcular o status da OP
        let todasEtapasCompletas = true;
        for (const etapa of op.etapas) {
          const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
          const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
          const etapaCompleta = etapa.usuario && (!exigeQuantidade || (etapa.lancado && etapa.quantidade > 0));
          if (!etapaCompleta) {
            todasEtapasCompletas = false;
            break;
          }
        }
  
        if (op.status === 'finalizado' && !todasEtapasCompletas) {
          op.status = 'produzindo';
          console.log(`[excluirRegistro] OP ${op.numero} voltou para o status "produzindo" devido a exclusão de registro.`);
        } else if (!op.etapas.some(e => e.usuario || e.quantidade)) {
          op.status = 'em-aberto';
          console.log(`[excluirRegistro] OP ${op.numero} voltou para o status "em-aberto" porque não há etapas iniciadas.`);
        }
  
        const updateOpResponse = await fetch('/api/ordens-de-producao', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(op),
        });
  
        if (!updateOpResponse.ok) {
          throw new Error('Erro ao atualizar ordem de produção');
        }
      }
  
      aplicarFiltros(currentPage);
      alert('Registro excluído com sucesso!');
    } catch (error) {
      console.error('[excluirRegistro] Erro:', error);
      alert('Erro ao excluir registro: ' + error.message);
    }
  }

  async function editarRegistro(id) {
    if (!permissoes.includes('editar-registro-producao')) {
      alert('Você não tem permissão para editar registros.');
      return;
    }

    const producoes = await carregarProducoesDoBackend();
    const producao = producoes.find(p => p.id === id);
    if (!producao) return;

    const novaQuantidade = prompt('Digite a nova quantidade:', producao.quantidade);
    if (novaQuantidade === null) return;
    const quantidadeAtualizada = parseInt(novaQuantidade);

    if (isNaN(quantidadeAtualizada) || quantidadeAtualizada <= 0) {
      alert('Quantidade inválida. A edição foi cancelada.');
      return;
    }

    if (quantidadeAtualizada === producao.quantidade) {
      alert('A quantidade informada é a mesma já registrada. Não é possível realizar a edição.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/producoes', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          quantidade: quantidadeAtualizada,
          edicoes: (producao.edicoes || 0) + 1,
          editadoPorAdmin: usuarioLogado?.nome || 'Sistema',
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro ao editar produção: ${response.statusText}`);
      }

      const updatedProducao = await response.json();
      console.log('[editarRegistro] Produção editada no backend:', updatedProducao);

      // Atualizar a OP correspondente
      const ordensDeProducaoResponse = await fetch('/api/ordens-de-producao', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!ordensDeProducaoResponse.ok) {
        throw new Error('Erro ao buscar ordens de produção');
      }

      const ordensDeProducao = await ordensDeProducaoResponse.json();
      const op = ordensDeProducao.find(o => o.numero === producao.opNumero);
      if (op) {
        const etapa = op.etapas.find(e => e.ultimoLancamentoId === id);
        if (etapa) {
          etapa.quantidade = quantidadeAtualizada;
          etapa.editadoPorAdmin = usuarioLogado?.nome || 'Sistema';

          // Recalcular o status da OP (caso necessário)
          let todasEtapasCompletas = true;
          for (const etapa of op.etapas) {
            const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
            const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
            const etapaCompleta = etapa.usuario && (!exigeQuantidade || (etapa.lancado && etapa.quantidade > 0));
            if (!etapaCompleta) {
              todasEtapasCompletas = false;
              break;
            }
          }

          if (op.status === 'finalizado' && !todasEtapasCompletas) {
            op.status = 'produzindo';
            console.log(`[editarRegistro] OP ${op.numero} voltou para o status "produzindo" devido a edição de registro.`);
          }

          await fetch('/api/ordens-de-producao', {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(op),
          });
        }
      }

      aplicarFiltros(currentPage);
      alert(`Quantidade editada com sucesso para ${quantidadeAtualizada}!`);
    } catch (error) {
      console.error('[editarRegistro] Erro:', error);
      alert('Erro ao editar registro: ' + error.message);
    }
  }

  async function getTipoUsuarioPorProcesso(processo, produtoNome) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/produtos', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao buscar produtos: ${response.statusText}`);
      }

      const produtos = await response.json();
      const produto = produtos.find(p => p.nome === produtoNome);
      if (produto && produto.etapas) {
        const etapa = produto.etapas.find(e => e.processo === processo);
        return etapa ? etapa.feitoPor : '';
      }
      return '';
    } catch (error) {
      console.error('[getTipoUsuarioPorProcesso] Erro ao buscar tipo de usuário:', error);
      return '';
    }
  }

  function atualizarPaginacao(totalPaginas) {
    const paginacao = document.getElementById('paginacao');
    if (!paginacao) {
      console.error('[atualizarPaginacao] Elemento #paginacao não encontrado no DOM');
      return;
    }
    paginacao.innerHTML = '';

    const btnAnterior = document.createElement('button');
    btnAnterior.textContent = 'Anterior';
    btnAnterior.disabled = currentPage === 1;
    btnAnterior.onclick = () => aplicarFiltros(currentPage - 1);
    paginacao.appendChild(btnAnterior);

    const maxPagesToShow = 5;
    const pagesBeforeAfter = 2;

    if (totalPaginas <= maxPagesToShow) {
      for (let i = 1; i <= totalPaginas; i++) {
        const button = document.createElement('button');
        button.textContent = i;
        button.className = i === currentPage ? 'active' : '';
        button.onclick = () => aplicarFiltros(i);
        paginacao.appendChild(button);
      }
    } else {
      const firstPage = document.createElement('button');
      firstPage.textContent = '1';
      firstPage.className = currentPage === 1 ? 'active' : '';
      firstPage.onclick = () => aplicarFiltros(1);
      paginacao.appendChild(firstPage);

      if (currentPage > pagesBeforeAfter + 2) {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.style.padding = '0 5px';
        paginacao.appendChild(ellipsis);
      }

      const startPage = Math.max(2, currentPage - pagesBeforeAfter);
      const endPage = Math.min(totalPaginas - 1, currentPage + pagesBeforeAfter);

      for (let i = startPage; i <= endPage; i++) {
        const button = document.createElement('button');
        button.textContent = i;
        button.className = i === currentPage ? 'active' : '';
        button.onclick = () => aplicarFiltros(i);
        paginacao.appendChild(button);
      }

      if (currentPage < totalPaginas - pagesBeforeAfter - 1) {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.style.padding = '0 5px';
        paginacao.appendChild(ellipsis);
      }

      if (totalPaginas > 1) {
        const lastPage = document.createElement('button');
        lastPage.textContent = totalPaginas;
        lastPage.className = currentPage === totalPaginas ? 'active' : '';
        lastPage.onclick = () => aplicarFiltros(totalPaginas);
        paginacao.appendChild(lastPage);
      }
    }

    const btnProximo = document.createElement('button');
    btnProximo.textContent = 'Próximo';
    btnProximo.disabled = currentPage === totalPaginas;
    btnProximo.onclick = () => aplicarFiltros(currentPage + 1);
    paginacao.appendChild(btnProximo);
  }

  function limparFiltros() {
    const filtroFuncionario = document.getElementById('filtroCostureira');
    const filtroData = document.getElementById('filtroData');
    const filtroMaquina = document.getElementById('filtroMaquina');
    const filtroProcesso = document.getElementById('filtroProcesso');
    const filtroProduto = document.getElementById('filtroProduto');
    const filtroAssinatura = document.getElementById('filtroAssinatura');

    if (filtroFuncionario) filtroFuncionario.selectedIndex = 0;
    if (filtroData) filtroData.value = '';
    if (filtroMaquina) filtroMaquina.value = '';
    if (filtroProcesso) filtroProcesso.value = '';
    if (filtroProduto) filtroProduto.selectedIndex = 0;
    if (filtroAssinatura) filtroAssinatura.selectedIndex = 0;

    aplicarFiltros(1);
  }

  function inicializar() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const dataLocal = `${ano}-${mes}-${dia}`; // Formato YYYY-MM-DD
    const filtroDataElement = document.getElementById('filtroData');
    if (filtroDataElement) {
      filtroDataElement.value = dataLocal; // Definir a data atual como padrão
    } else {
    }

    carregarFiltroFuncionarios();
    carregarFiltroProdutos();
    aplicarFiltros(1, dataLocal);

    document.getElementById('filtroCostureira')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroData')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroMaquina')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroProcesso')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroProduto')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroAssinatura')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('limparFiltros')?.addEventListener('click', limparFiltros);
  }

  inicializar();
})();