// js/pages/costureira-dashboard.js
import { verificarAutenticacaoSincrona, logout } from './utils/auth.js';
import { criarGrafico } from './utils/chart-utils.js';
import { calcularComissaoSemanal, obterMetasPorNivel } from './utils/metas.js';
import { getCicloAtual } from './utils/ciclos.js';
import { obterProdutos } from './utils/storage.js';

console.log('Script costureira-dashboard.js carregado');

function normalizarTexto(texto) {
    return texto
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove caracteres invisíveis
        .normalize('NFD') // Decompõe caracteres acentuados
        .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos (acentos)
        .trim()
        .toLowerCase();
}

function verificarAutenticacaoCostureira() {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    console.log('[verificarAutenticacaoCostureira] Usuário logado:', usuarioLogado);
    console.log('[verificarAutenticacaoCostureira] Permissões do usuário:', usuarioLogado?.permissoes);
    console.log('[verificarAutenticacaoCostureira] Tipos do usuário:', usuarioLogado?.tipos);

    const tipos = usuarioLogado?.tipos || [];
    const isCostureira = tipos.includes('costureira');
    if (!isCostureira) {
        console.warn('[verificarAutenticacaoCostureira] Usuário não é do tipo costureira. Redirecionando para login...');
        window.location.href = '/index.html';
        return null;
    }

    const auth = verificarAutenticacaoSincrona('dashboard', ['acesso-costureira-dashboard'], () => true);
    if (!auth) {
        console.warn('[verificarAutenticacaoCostureira] Usuário não tem permissão para acessar a dashboard. Redirecionando para acesso restrito...');
        window.location.href = '/costureira/acesso-restrito-costureira.html';
        return null;
    }

    console.log('Usuário logado:', auth.usuario);
    return auth.usuario;
}

const usuarioLogado = verificarAutenticacaoCostureira();
if (!usuarioLogado) {
    throw new Error('Autenticação falhou, redirecionando...');
}

function verificarDadosLocalStorage() {
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const produtos = JSON.parse(localStorage.getItem('produtos')) || [];
    console.log('Verificação de dados no localStorage:');
    console.log('Produções:', producoes);
    console.log('Produtos:', produtos);

    const produtosNaoEncontrados = new Set();
    producoes.forEach(p => {
        const produtoNomeNormalizado = normalizarTexto(p.produto);
        const produto = produtos.find(prod => {
            const nomeProdNormalizado = normalizarTexto(prod.nome);
            return nomeProdNormalizado === produtoNomeNormalizado;
        });
        if (!produto) {
            produtosNaoEncontrados.add(p.produto);
        }
    });

    if (produtosNaoEncontrados.size > 0) {
        console.warn('Produtos em produções não encontrados na lista de produtos:', Array.from(produtosNaoEncontrados));
    }
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

function atualizarSaudacao() {
    const hora = new Date().getHours();
    let saudacao;
    if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
    else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';
    document.getElementById('saudacaoCostureira').textContent = `${saudacao}, ${usuarioLogado.nome}!`;
}

function gerarIdUnico() {
    return 'assinatura_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function atualizarDashboard() {
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    console.log('Produções carregadas:', producoes);
    verificarDadosLocalStorage();
    atualizarSaudacao();
    document.getElementById('nivelValor').innerHTML = `<i class="fas fa-trophy"></i> ${usuarioLogado.nivel || 1}`;
    atualizarCardMeta(producoes);
    atualizarGraficoProducao(producoes);
    verificarAssinaturaProducao(producoes);
    atualizarDetalhamentoProcessos(producoes);
}

function atualizarCardMeta(producoes) {
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

    const produtos = obterProdutos();
    console.log('Produtos carregados:', produtos);
    let totalPontosPonderados = 0;
    producoesSemana.forEach(p => {
        const produtoNomeNormalizado = normalizarTexto(p.produto);
        const produto = produtos.find(prod => {
            const nomeProdNormalizado = normalizarTexto(prod.nome);
            return nomeProdNormalizado === produtoNomeNormalizado;
        });
        if (produto && Array.isArray(produto.processos)) {
            const processoIndex = produto.processos.indexOf(p.processo);
            const pontosPorProcesso = processoIndex !== -1 && Array.isArray(produto.pontos) ? (produto.pontos[processoIndex] || 1) : 1;
            totalPontosPonderados += p.quantidade * pontosPorProcesso;
        } else {
            console.warn(`Produto não encontrado ou sem processos: ${p.produto}`, {
                producao: p,
                produtosDisponiveis: produtos,
                produtoNomeNormalizado: produtoNomeNormalizado,
                nomesProdutosDisponiveis: produtos.map(prod => normalizarTexto(prod.nome))
            });
            totalPontosPonderados += p.quantidade; // Usa 1 ponto por quantidade como fallback
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
    
    // Redimensiona o canvas antes de criar o gráfico
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

function assinarProducoes() {
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const assinaturas = JSON.parse(localStorage.getItem('assinaturas')) || [];
    const agora = new Date();
    const producoesNaoAssinadas = producoes.filter(p => p.funcionario === usuarioLogado.nome && !p.assinada);

    producoes.forEach(p => {
        if (p.funcionario === usuarioLogado.nome && !p.assinada) {
            p.assinada = true;
            p.dataAssinatura = agora.toISOString();
        }
    });

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
        navigator.geolocation.getCurrentPosition(
            (position) => {
                registroAssinatura.localizacao = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                salvarRegistroAssinatura(registroAssinatura, producoes, assinaturas);
            },
            (error) => {
                console.warn('Geolocalização não disponível:', error.message);
                registroAssinatura.localizacao = 'Não disponível';
                salvarRegistroAssinatura(registroAssinatura, producoes, assinaturas);
            },
            { timeout: 5000 }
        );
    } else {
        registroAssinatura.localizacao = 'Geolocalização não suportada';
        salvarRegistroAssinatura(registroAssinatura, producoes, assinaturas);
    }
}

function salvarRegistroAssinatura(registro, producoes, assinaturas) {
    assinaturas.push(registro);
    localStorage.setItem('producoes', JSON.stringify(producoes));
    localStorage.setItem('assinaturas', JSON.stringify(assinaturas));
    document.getElementById('assinaturaPopup').style.display = 'none';
    document.querySelector('.dashboard-content').style.display = 'block';
    atualizarDashboard();
}

let processosExibidos = 0;
let filtroAtivo = 'semana';
let dataSelecionadaDia = new Date();
let dataSelecionadaSemana = new Date();

function atualizarDetalhamentoProcessos(producoes) {
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

    const produtos = obterProdutos();
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
                const processoIndex = produto && Array.isArray(produto.processos) ? produto.processos.indexOf(p.processo) : -1;
                const pontosPorProcesso = produto && processoIndex !== -1 && Array.isArray(produto.pontos) ? (produto.pontos[processoIndex] || 1) : 1;
                const totalPontosItem = p.quantidade * pontosPorProcesso;
                const pontoTexto = totalPontosItem === 1 ? 'ponto' : 'pontos';
                const variacao = p.variacao || 'N/A';
                const quemRetirou = p.lancadoPor || 'Desconhecido';

                return `<li>${new Date(p.data).toLocaleDateString('pt-BR')} - ${p.produto} [${variacao}] - [${p.processo}] - [${quemRetirou}] - [${totalPontosItem} ${pontoTexto}], ${new Date(p.data).toLocaleTimeString('pt-BR')}</li>`;
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
    dataSelecionadaSemana = new Date();

    filtroAtivo = 'semana';
    filtroSemanaTexto.classList.add('active');
    filtroDiaTexto.classList.remove('active');
    renderizarProcessos();
}

// Eventos
document.getElementById('metaSelect').addEventListener('change', () => {
    const metaSelect = document.getElementById('metaSelect');
    const editarMetaBtn = document.getElementById('editarMetaBtn');
    const novaMeta = parseInt(metaSelect.value);
    salvarMetaSelecionada(novaMeta);
    metaSelect.disabled = true;
    editarMetaBtn.textContent = 'Editar Meta';
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    atualizarCardMeta(producoes);
});

document.getElementById('editarMetaBtn').addEventListener('click', () => {
    const metaSelect = document.getElementById('metaSelect');
    const editarMetaBtn = document.getElementById('editarMetaBtn');
    if (metaSelect.disabled) {
        metaSelect.disabled = false;
        editarMetaBtn.textContent = 'Escolher Meta';
        metaSelect.focus();
    } else {
        metaSelect.disabled = true;
        editarMetaBtn.textContent = 'Editar Meta';
        const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
        atualizarCardMeta(producoes);
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

// Inicialização
atualizarDashboard();