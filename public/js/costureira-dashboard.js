import { verificarAutenticacao, logout } from '/js/utils/auth.js';
import { criarGrafico } from '/js/utils/chart-utils.js';
import { calcularComissaoSemanal, obterMetasPorNivel } from '/js/utils/metas.js';
import { getCicloAtual } from '/js/utils/ciclos.js';
import { obterProdutos } from '/js/utils/storage.js';

console.log('Script costureira-dashboard.js carregado');

// Variáveis globais
let usuarioLogado = null;
let processosExibidos = 0;
let filtroAtivo = 'dia'; // Alterado para 'dia' como padrão
let dataSelecionadaDia = new Date();
let dataSelecionadaSemana = new Date();

// Função para buscar produções do servidor
async function obterProducoes() {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Token não encontrado');
    console.log('[obterProducoes] Fazendo requisição para /api/producoes com token:', token.slice(0, 10) + '...');
    const response = await fetch('/api/producoes', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const responseText = await response.text();
    console.log('[obterProducoes] Resposta bruta do servidor:', responseText);
    if (!response.ok) throw new Error(`Erro ao carregar produções: ${responseText}`);
    const producoes = JSON.parse(responseText);
    console.log('[obterProducoes] Produções carregadas:', producoes);
    return producoes;
}

function normalizarTexto(texto) {
    return texto
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

async function verificarAutenticacaoCostureira() {
    console.log('[verificarAutenticacaoCostureira] Iniciando verificação de autenticação...');
    const auth = await verificarAutenticacao('costureira-dashboard', ['acesso-costureira-dashboard']);
    if (!auth) {
        console.warn('[verificarAutenticacaoCostureira] Autenticação falhou, redirecionando para login...');
        window.location.href = '/index.html';
        return null;
    }
    console.log('[verificarAutenticacaoCostureira] Autenticação bem-sucedida, usuário:', auth.usuario);
    return auth.usuario;
}

function verificarDadosServidor(producoes, produtos) {
    console.log('Verificação de dados do servidor:');
    console.log('Produções:', producoes);
    console.log('Produtos:', produtos);

    const produtosNaoEncontrados = new Set();
    producoes.forEach(p => {
        const produtoNomeNormalizado = normalizarTexto(p.produto);
        const produto = produtos.find(prod => normalizarTexto(prod.nome) === produtoNomeNormalizado);
        if (!produto) produtosNaoEncontrados.add(p.produto);
    });

    if (produtosNaoEncontrados.size > 0) {
        console.warn('Produtos em produções não encontrados na lista de produtos:', Array.from(produtosNaoEncontrados));
    }
}

function atualizarSaudacao() {
    const hora = new Date().getHours();
    let saudacao;
    if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
    else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';
    document.getElementById('saudacaoCostureira').textContent = `${saudacao}, ${usuarioLogado.nome}!`;
}

function getMetaSelecionada() {
    const metaSalva = localStorage.getItem(`metaSelecionada_${usuarioLogado.nome}`);
    return metaSalva ? parseInt(metaSalva) : null;
}

function salvarMetaSelecionada(meta) {
    localStorage.setItem(`metaSelecionada_${usuarioLogado.nome}`, meta);
}

function carregarMetas(metaAtual) {
    const nivel = usuarioLogado.nivel || 1;
    const metas = obterMetasPorNivel(nivel);
    const metaSelect = document.getElementById('metaSelect');
    
    if (!metas || metas.length === 0) {
        console.error('Nenhuma meta disponível para o nível:', nivel);
        metaSelect.innerHTML = '<option value="0">Nenhuma meta disponível</option>';
        return;
    }
    
    metaSelect.innerHTML = metas.map(m => 
        `<option value="${m.processos}" ${m.processos === metaAtual ? 'selected' : ''}>${m.processos} Pontos (R$ ${m.valor.toFixed(2)})</option>`
    ).join('');
    metaSelect.disabled = true;
    console.log('Metas em processos carregadas (exibidas como pontos):', metas);
}

async function atualizarDashboard() {
    try {
        const producoes = await obterProducoes();
        const produtos = await obterProdutos();
        console.log('Produções carregadas do servidor:', producoes);
        verificarDadosServidor(producoes, produtos);
        atualizarSaudacao();
        document.getElementById('nivelValor').innerHTML = `<i class="fas fa-trophy"></i> ${usuarioLogado.nivel || 1}`;
        atualizarCardMeta(producoes, produtos);
        atualizarGraficoProducao(producoes);
        verificarAssinaturaProducao(producoes);
        atualizarDetalhamentoProcessos(producoes, produtos);
    } catch (error) {
        console.error('[atualizarDashboard] Erro ao carregar dados:', error.message);
        alert('Erro ao carregar dashboard. Tente novamente.');
    }
}

function atualizarCardMeta(producoes, produtos) {
    const metaSelect = document.getElementById('metaSelect');
    let metaSelecionada = getMetaSelecionada();

    if (!metaSelecionada) {
        metaSelecionada = parseInt(metaSelect.value) || 0;
    }

    carregarMetas(metaSelecionada);

    const cicloAtual = getCicloAtual();
    if (!cicloAtual) {
        console.error('Nenhum ciclo atual encontrado.');
        document.getElementById('quantidadeProcessos').textContent = 0;
        return;
    }
    console.log('Ciclo atual:', cicloAtual);

    const inicioSemana = cicloAtual.semana.inicio;
    const fimSemana = cicloAtual.semana.fim;
    const producoesSemana = producoes.filter(p => {
        const dataProducao = new Date(p.data);
        return p.funcionario === usuarioLogado.nome && dataProducao >= inicioSemana && dataProducao <= fimSemana;
    });
    console.log('Produções da semana:', producoesSemana);

    let totalPontosPonderados = 0;
    producoesSemana.forEach(p => {
        const produtoNomeNormalizado = normalizarTexto(p.produto);
        const produto = produtos.find(prod => normalizarTexto(prod.nome) === produtoNomeNormalizado);
        if (produto && Array.isArray(produto.etapas)) {
            const etapa = produto.etapas.find(e => e.processo === p.processo);
            const pontosPorProcesso = etapa && etapa.pontos ? etapa.pontos : 1;
            totalPontosPonderados += p.quantidade * pontosPorProcesso;
        } else {
            console.warn(`Produto ou processo não encontrado: ${p.produto} - ${p.processo}`);
            totalPontosPonderados += p.quantidade;
        }
    });

    const totalPontos = totalPontosPonderados;
    const nivel = usuarioLogado.nivel || 1;
    const metas = obterMetasPorNivel(nivel);
    const metaInfo = metas.find(m => m.processos === metaSelecionada) || { valor: 0 };

    const progresso = metaSelecionada ? (totalPontos / metaSelecionada) * 100 : 0;
    document.getElementById('progressoBarra').style.width = `${Math.min(progresso, 100)}%`;
    document.getElementById('quantidadeProcessos').textContent = Math.round(totalPontos);

    const pontosFaltantes = metaSelecionada - totalPontos;
    const processosFaltantesEl = document.getElementById('processosFaltantes');
    processosFaltantesEl.innerHTML = pontosFaltantes > 0 
        ? `Faltam <span class="highlight">${Math.ceil(pontosFaltantes)}</span> pontos para atingir a meta de ${metaSelecionada} pontos` 
        : 'Meta atingida!';

    const metasBatidas = metas.filter(m => totalPontos >= m.processos);
    const maiorMetaBatida = metasBatidas.length > 0 ? metasBatidas[metasBatidas.length - 1] : null;
    const comissaoGarantidaEl = document.getElementById('comissaoGarantida');
    const valorComissaoEl = document.getElementById('valorComissao');
    const semMetaBatidaEl = document.getElementById('semMetaBatida');
    if (maiorMetaBatida) {
        valorComissaoEl.textContent = `R$ ${maiorMetaBatida.valor.toFixed(2)}`;
        comissaoGarantidaEl.style.display = 'block';
        semMetaBatidaEl.style.display = 'none';
    } else {
        comissaoGarantidaEl.style.display = 'none';
        semMetaBatidaEl.style.display = 'block';
    }
    console.log('Card Meta atualizado - Total pontos:', totalPontos, 'Meta em processos:', metaSelecionada);
}

function atualizarGraficoProducao(producoes) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const producoesHoje = producoes.filter(p => {
        const dataProducao = new Date(p.data);
        dataProducao.setHours(0, 0, 0, 0);
        return p.funcionario === usuarioLogado.nome && dataProducao.getTime() === hoje.getTime();
    });
    console.log('Produções de hoje:', producoesHoje);

    const horas = Array(24).fill(0);
    producoesHoje.forEach(p => {
        const hora = new Date(p.data).getHours();
        horas[hora] += p.quantidade || 0;
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
    const dados = horas;

    const ctx = document.getElementById('graficoProducaoDia').getContext('2d');
    if (window.graficoProducao) window.graficoProducao.destroy();
    
    ctx.canvas.style.width = '100%';
    ctx.canvas.style.height = 'auto';

    window.graficoProducao = criarGrafico(
        ctx,
        'line',
        labels,
        '',
        dados,
        ['rgba(66, 153, 225, 0.2)'],
        ['rgba(66, 153, 225, 1)']
    );
    console.log('Gráfico de produção atualizado');
}

function verificarAssinaturaProducao(producoes) {
    const producoesNaoAssinadas = producoes.filter(p => 
        p.funcionario === usuarioLogado.nome && !p.assinada
    );
    console.log('Produções não assinadas:', producoesNaoAssinadas);

    const popup = document.getElementById('assinaturaPopup');
    const dashboardContent = document.querySelector('.dashboard-content');

    if (producoesNaoAssinadas.length > 0) {
        popup.style.display = 'flex';
        dashboardContent.style.display = 'none';

        const producoesPorData = {};
        producoesNaoAssinadas.forEach(p => {
            const data = new Date(p.data).toDateString();
            if (!producoesPorData[data]) producoesPorData[data] = [];
            producoesPorData[data].push(p);
        });

        let listaHTML = '';
        for (const [data, registros] of Object.entries(producoesPorData)) {
            listaHTML += `<li><strong>${new Date(data).toLocaleDateString('pt-BR')}:</strong><ul>`;
            registros.forEach(p => {
                listaHTML += `<li>${p.produto} - ${p.processo} (${p.quantidade} processos, ${new Date(p.data).toLocaleTimeString('pt-BR')})</li>`;
            });
            listaHTML += '</ul></li>';
        }
        document.getElementById('processosParaAssinatura').innerHTML = listaHTML;

        const checkbox = document.getElementById('confirmacaoAssinatura');
        checkbox.checked = false;
        document.getElementById('assinarProducaoBtn').disabled = true;
    } else {
        popup.style.display = 'none';
        dashboardContent.style.display = 'block';
    }
}

function gerarIdUnico() {
    return 'assinatura_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function assinarProducoes() {
    try {
        const producoes = await obterProducoes();
        const producoesNaoAssinadas = producoes.filter(p => p.funcionario === usuarioLogado.nome && !p.assinada);

        if (producoesNaoAssinadas.length === 0) {
            document.getElementById('assinaturaPopup').style.display = 'none';
            document.querySelector('.dashboard-content').style.display = 'block';
            return;
        }

        const token = localStorage.getItem('token');
        const agora = new Date();
        const assinaturas = JSON.parse(localStorage.getItem('assinaturas')) || [];

        // Atualizar cada produção não assinada no servidor
        for (const producao of producoesNaoAssinadas) {
            console.log('[assinarProducoes] Assinando produção:', producao.id);
            const requestBody = {
                id: producao.id,
                quantidade: producao.quantidade,
                edicoes: producao.edicoes || 0,
                assinada: true,
            };
            console.log('[assinarProducoes] Enviando requisição PUT com corpo:', requestBody);
            const response = await fetch('/api/producoes', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            const responseText = await response.text();
            console.log('[assinarProducoes] Resposta do servidor para produção', producao.id, ':', responseText);

            if (!response.ok) {
                throw new Error(`Erro ao assinar produção ${producao.id}: ${responseText}`);
            }
        }

        // Criar registro de assinatura
        const registroAssinatura = {
            id: gerarIdUnico(),
            costureira: usuarioLogado.nome,
            dataHora: agora.toISOString(),
            dispositivo: navigator.userAgent,
            producoesAssinadas: producoesNaoAssinadas.map(p => ({
                idProducao: p.id,
                produto: p.produto,
                processo: p.processo,
                quantidade: p.quantidade,
                dataProducao: p.data
            }))
        };

        if (navigator.geolocation) {
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        registroAssinatura.localizacao = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        };
                        resolve();
                    },
                    (error) => {
                        console.warn('Geolocalização não disponível:', error.message);
                        registroAssinatura.localizacao = 'Não disponível';
                        resolve();
                    },
                    { timeout: 5000 }
                );
            });
        } else {
            registroAssinatura.localizacao = 'Geolocalização não suportada';
        }

        assinaturas.push(registroAssinatura);
        localStorage.setItem('assinaturas', JSON.stringify(assinaturas));
        document.getElementById('assinaturaPopup').style.display = 'none';
        document.querySelector('.dashboard-content').style.display = 'block';
        await atualizarDashboard();
    } catch (error) {
        console.error('[assinarProducoes] Erro:', error.message);
        alert('Erro ao assinar produções: ' + error.message);
    }
}

function atualizarDetalhamentoProcessos(producoes, produtos) {
    const filtroDiaTexto = document.getElementById('filtroDia');
    const filtroSemanaTexto = document.getElementById('filtroSemana');
    const totalProcessosEl = document.getElementById('totalProcessos');
    const listaProcessos = document.getElementById('listaProcessos');
    const btnAnterior = document.getElementById('btnAnterior');
    const btnProximo = document.getElementById('btnProximo');
    const paginacaoNumeros = document.getElementById('paginacaoNumeros');

    const producoesAssinadas = producoes.filter(p => 
        p.funcionario === usuarioLogado.nome && p.assinada
    ).sort((a, b) => new Date(b.data) - new Date(a.data));
    console.log('Produções assinadas:', producoesAssinadas);

    let paginaAtual = 1;
    const itensPorPagina = 8;

    function normalizarData(data) {
        const d = new Date(data);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function filtrarProducoes() {
        if (filtroAtivo === 'dia') {
            const diaSelecionado = normalizarData(dataSelecionadaDia);
            return producoesAssinadas.filter(p => {
                const dataProducao = normalizarData(p.data);
                return dataProducao.getTime() === diaSelecionado.getTime();
            });
        } else {
            const inicioSemana = normalizarData(dataSelecionadaSemana);
            inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
            const fimSemana = new Date(inicioSemana);
            fimSemana.setDate(inicioSemana.getDate() + 6);
            fimSemana.setHours(23, 59, 59, 999);
            return producoesAssinadas.filter(p => {
                const dataProducao = normalizarData(p.data);
                return dataProducao >= inicioSemana && dataProducao <= fimSemana;
            });
        }
    }

    function calcularTotalProcessos(producoesFiltradas) {
        return producoesFiltradas.reduce((sum, p) => sum + (p.quantidade || 0), 0);
    }

    function renderizarPaginacao(producoesFiltradas) {
        const totalPaginas = Math.ceil(producoesFiltradas.length / itensPorPagina);
        paginacaoNumeros.innerHTML = '';

        for (let i = 1; i <= totalPaginas; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.classList.add(i === paginaAtual ? 'active' : '');
            btn.addEventListener('click', () => {
                paginaAtual = i;
                renderizarProcessos();
                atualizarBotoesPaginacao();
            });
            paginacaoNumeros.appendChild(btn);
        }

        btnAnterior.disabled = paginaAtual === 1;
        btnProximo.disabled = paginaAtual === totalPaginas || totalPaginas === 0;
    }

    function renderizarProcessos() {
        const producoesFiltradas = filtrarProducoes();
        const inicio = (paginaAtual - 1) * itensPorPagina;
        const fim = inicio + itensPorPagina;
        const processosParaExibir = producoesFiltradas.slice(inicio, fim);

        listaProcessos.innerHTML = processosParaExibir.length > 0 
            ? processosParaExibir.map(p => {
                const produtoNomeNormalizado = normalizarTexto(p.produto);
                const produto = produtos.find(prod => normalizarTexto(prod.nome) === produtoNomeNormalizado);
                const etapa = produto && Array.isArray(produto.etapas) ? produto.etapas.find(e => e.processo === p.processo) : null;
                const pontosPorProcesso = etapa && etapa.pontos ? etapa.pontos : 1;
                const totalPontosItem = p.quantidade * pontosPorProcesso;
                const pontoTexto = totalPontosItem === 1 ? 'ponto' : 'pontos';
                const variacao = p.variacao || 'N/A';
                const quemRetirou = p.lancado_por || 'Desconhecido';

                return `<li>${new Date(p.data).toLocaleDateString('pt-BR')} - ${p.produto} [${variacao}] - [${p.processo}] - [Retirado por: ${quemRetirou}] - [Somados: +${totalPontosItem} ${pontoTexto}], [Hora retirada ${new Date(p.data).toLocaleTimeString('pt-BR')}]</li>`;
            }).join('')
            : '<li>Nenhuma produção assinada encontrada para o período selecionado.</li>';

        const total = calcularTotalProcessos(producoesFiltradas);
        totalProcessosEl.textContent = `TOTAL DE PROCESSOS: ${total}`;
        renderizarPaginacao(producoesFiltradas);
    }

    function atualizarBotoesPaginacao() {
        const producoesFiltradas = filtrarProducoes();
        const totalPaginas = Math.ceil(producoesFiltradas.length / itensPorPagina);
        btnAnterior.disabled = paginaAtual === 1;
        btnProximo.disabled = paginaAtual === totalPaginas || totalPaginas === 0;
        paginacaoNumeros.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.textContent) === paginaAtual);
        });
    }

    btnAnterior.onclick = () => {
        if (paginaAtual > 1) {
            paginaAtual--;
            renderizarProcessos();
            atualizarBotoesPaginacao();
        }
    };

    btnProximo.onclick = () => {
        const totalPaginas = Math.ceil(filtrarProducoes().length / itensPorPagina);
        if (paginaAtual < totalPaginas) {
            paginaAtual++;
            renderizarProcessos();
            atualizarBotoesPaginacao();
        }
    };

    filtroDiaTexto.onclick = () => {
        paginaAtual = 1;
        filtroAtivo = 'dia';
        filtroDiaTexto.classList.add('active');
        filtroSemanaTexto.classList.remove('active');
        renderizarProcessos();
    };

    filtroSemanaTexto.onclick = () => {
        paginaAtual = 1;
        filtroAtivo = 'semana';
        filtroSemanaTexto.classList.add('active');
        filtroDiaTexto.classList.remove('active');
        renderizarProcessos();
    };

    $("#datepickerDia").datepicker({
        dateFormat: 'dd/mm/yy',
        defaultDate: dataSelecionadaDia,
        onSelect: function(dateText) {
            const [dia, mes, ano] = dateText.split('/');
            dataSelecionadaDia = new Date(ano, mes - 1, dia);
            paginaAtual = 1;
            filtroAtivo = 'dia';
            filtroDiaTexto.classList.add('active');
            filtroSemanaTexto.classList.remove('active');
            renderizarProcessos();
        }
    }).datepicker('setDate', dataSelecionadaDia);

    $("#datepickerSemana").datepicker({
        dateFormat: 'dd/mm/yy',
        defaultDate: dataSelecionadaSemana,
        onSelect: function(dateText) {
            const [dia, mes, ano] = dateText.split('/');
            dataSelecionadaSemana = new Date(ano, mes - 1, dia);
            paginaAtual = 1;
            filtroAtivo = 'semana';
            filtroSemanaTexto.classList.add('active');
            filtroDiaTexto.classList.remove('active');
            renderizarProcessos();
        }
    });

    const inicioSemanaAtual = new Date();
    inicioSemanaAtual.setDate(inicioSemanaAtual.getDate() - inicioSemanaAtual.getDay());
    const fimSemanaAtual = new Date(inicioSemanaAtual);
    fimSemanaAtual.setDate(inicioSemanaAtual.getDate() + 6);
    $("#datepickerSemana").val(`${inicioSemanaAtual.toLocaleDateString('pt-BR')} - ${fimSemanaAtual.toLocaleDateString('pt-BR')}`);

    // Definir "Dia" como padrão na inicialização
    filtroAtivo = 'dia';
    filtroDiaTexto.classList.add('active');
    filtroSemanaTexto.classList.remove('active');
    renderizarProcessos();
}

// Eventos
document.addEventListener('DOMContentLoaded', async () => {
    usuarioLogado = await verificarAutenticacaoCostureira();
    if (!usuarioLogado) {
        throw new Error('Autenticação falhou, redirecionando...');
    }

    $("#datepickerDia").datepicker({
        dateFormat: 'dd/mm/yy',
        defaultDate: dataSelecionadaDia,
        onSelect: async function(dateText) {
            const [dia, mes, ano] = dateText.split('/');
            dataSelecionadaDia = new Date(ano, mes - 1, dia);
            filtroAtivo = 'dia';
            document.getElementById('filtroDia').classList.add('active');
            document.getElementById('filtroSemana').classList.remove('active');
            const producoes = await obterProducoes();
            const produtos = await obterProdutos();
            atualizarDetalhamentoProcessos(producoes, produtos);
        }
    }).datepicker('setDate', dataSelecionadaDia);

    $("#datepickerSemana").datepicker({
        dateFormat: 'dd/mm/yy',
        defaultDate: dataSelecionadaSemana,
        onSelect: async function(dateText) {
            const [dia, mes, ano] = dateText.split('/');
            dataSelecionadaSemana = new Date(ano, mes - 1, dia);
            filtroAtivo = 'semana';
            document.getElementById('filtroSemana').classList.add('active');
            document.getElementById('filtroDia').classList.remove('active');
            const producoes = await obterProducoes();
            const produtos = await obterProdutos();
            atualizarDetalhamentoProcessos(producoes, produtos);
        }
    });

    const inicioSemanaAtual = new Date();
    inicioSemanaAtual.setDate(inicioSemanaAtual.getDate() - inicioSemanaAtual.getDay());
    const fimSemanaAtual = new Date(inicioSemanaAtual);
    fimSemanaAtual.setDate(inicioSemanaAtual.getDate() + 6);
    $("#datepickerSemana").val(`${inicioSemanaAtual.toLocaleDateString('pt-BR')} - ${fimSemanaAtual.toLocaleDateString('pt-BR')}`);

    await atualizarDashboard();

    document.getElementById('metaSelect').addEventListener('change', async () => {
        const metaSelect = document.getElementById('metaSelect');
        const editarMetaBtn = document.getElementById('editarMetaBtn');
        const novaMeta = parseInt(metaSelect.value);
        salvarMetaSelecionada(novaMeta);
        metaSelect.disabled = true;
        editarMetaBtn.textContent = 'Editar Meta';
        const producoes = await obterProducoes();
        const produtos = await obterProdutos();
        atualizarCardMeta(producoes, produtos);
    });

    document.getElementById('editarMetaBtn').addEventListener('click', async () => {
        const metaSelect = document.getElementById('metaSelect');
        const editarMetaBtn = document.getElementById('editarMetaBtn');
        if (metaSelect.disabled) {
            metaSelect.disabled = false;
            editarMetaBtn.textContent = 'Escolher Meta';
            metaSelect.focus();
        } else {
            metaSelect.disabled = true;
            editarMetaBtn.textContent = 'Editar Meta';
            const producoes = await obterProducoes();
            const produtos = await obterProdutos();
            atualizarCardMeta(producoes, produtos);
        }
    });

    document.getElementById('confirmacaoAssinatura').addEventListener('change', () => {
        const checkbox = document.getElementById('confirmacaoAssinatura');
        document.getElementById('assinarProducaoBtn').disabled = !checkbox.checked;
    });

    document.getElementById('assinarProducaoBtn').addEventListener('click', assinarProducoes);

    document.getElementById('logoutBtn').addEventListener('click', () => {
        logout();
    });
});