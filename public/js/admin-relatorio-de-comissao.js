// js/pages/relatorio-comissao.js
import { obterUsuarios } from './utils/storage.js';
import { obterProdutos } from './utils/storage.js';
import { criarGrafico } from './utils/chart-utils.js';
import { formatarData } from './utils/date-utils.js';
import { ciclos } from './utils/ciclos.js';
import { preencherSelectCostureiras } from './utils/dom-utils.js';
import { calcularComissaoSemanal } from './utils/metas.js';
import {  verificarAutenticacaoSincrona } from './utils/auth.js';

// Verificação de Autenticação
const auth = verificarAutenticacaoSincrona('relatorio-de-comissao.html', ['acesso-relatorio-de-comissao']);
if (!auth) {
    throw new Error('Autenticação falhou, redirecionando...');
}

const permissoes = auth.permissoes || [];
const usuarioLogado = auth.usuario;
console.log('Inicializando relatorio-de-comissao para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);

function carregarFiltrosRelatorio() {
    const filtroCostureira = document.getElementById('rc-filter-costureira');
    const filtroCiclo = document.getElementById('rc-filter-ciclo');
    const filtroCostureiraComparativo = document.getElementById('rc-chart-costureira');
    const filtroSemana1 = document.getElementById('rc-chart-week1');
    const filtroSemana2 = document.getElementById('rc-chart-week2');
    const usuarios = obterUsuarios();
    const costureiras = usuarios.filter(u => u.tipo === 'costureira');
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const dataAtual = new Date('2025-03-12'); // Data fixa para teste, conforme contexto

    if (filtroCostureira) {
        preencherSelectCostureiras(filtroCostureira, '<option value="">Selecione uma costureira</option>', costureiras);
        if (costureiras.length > 0) {
            const randomIndex = Math.floor(Math.random() * costureiras.length);
            filtroCostureira.value = costureiras[randomIndex].email;
        }
        filtroCostureira.onchange = function() {
            atualizarRelatorio();
            if (filtroCostureiraComparativo) {
                filtroCostureiraComparativo.value = this.value;
                atualizarGraficoComparativo();
            }
        };
    }

    if (filtroCiclo) {
        filtroCiclo.innerHTML = '';
        ciclos.forEach((ciclo, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = ciclo.nome;
            filtroCiclo.appendChild(option);
        });
        const cicloAtualIndex = ciclos.findIndex(ciclo => 
            ciclo.semanas.some(semana => {
                const inicio = new Date(semana.inicio + 'T00:00:00-03:00');
                const fim = new Date(semana.fim + 'T23:59:59-03:00');
                return dataAtual >= inicio && dataAtual <= fim;
            })
        );
        filtroCiclo.value = cicloAtualIndex >= 0 ? cicloAtualIndex : 0;
        filtroCiclo.onchange = atualizarRelatorio;
    }

    if (filtroCostureiraComparativo) {
        preencherSelectCostureiras(filtroCostureiraComparativo, '<option value="">Selecione uma costureira</option>', costureiras);
        if (filtroCostureira && filtroCostureira.value) {
            filtroCostureiraComparativo.value = filtroCostureira.value;
        }
        filtroCostureiraComparativo.onchange = atualizarGraficoComparativo;
    }

    if (filtroSemana1 && filtroSemana2) {
        const todasSemanas = ciclos.flatMap(ciclo => ciclo.semanas).sort((a, b) => new Date(b.fim) - new Date(a.fim));
        const hoje = new Date('2025-03-12'); // Data fixa para teste
        const semanasCompletas = todasSemanas.filter(semana => {
            const fim = new Date(semana.fim + 'T23:59:59-03:00');
            return fim < hoje;
        });

        const ultimaSemana = semanasCompletas[0];
        const penultimaSemana = semanasCompletas[1];

        filtroSemana1.innerHTML = todasSemanas.map(s => `<option value="${s.inicio}|${s.fim}">${formatarData(s.inicio)} - ${formatarData(s.fim)}</option>`).join('');
        filtroSemana2.innerHTML = todasSemanas.map(s => `<option value="${s.inicio}|${s.fim}">${formatarData(s.inicio)} - ${formatarData(s.fim)}</option>`).join('');

        filtroSemana1.value = ultimaSemana ? `${ultimaSemana.inicio}|${ultimaSemana.fim}` : todasSemanas[0].inicio + '|' + todasSemanas[0].fim;
        filtroSemana2.value = penultimaSemana ? `${penultimaSemana.inicio}|${penultimaSemana.fim}` : todasSemanas[1].inicio + '|' + todasSemanas[1].fim;

        filtroSemana1.onchange = atualizarGraficoComparativo;
        filtroSemana2.onchange = atualizarGraficoComparativo;
    }

    atualizarRelatorio();
    atualizarGraficoComparativo();
}

function atualizarRelatorio() {
    const filtroCostureira = document.getElementById('rc-filter-costureira')?.value;
    const filtroCiclo = document.getElementById('rc-filter-ciclo')?.value;
    if (!filtroCostureira || filtroCiclo === undefined) return;

    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const produtos = obterProdutos();
    const cicloSelecionado = ciclos[parseInt(filtroCiclo)];
    if (!cicloSelecionado) return;

    let totalProcessosCrus = 0;
    let totalPontosPonderados = 0;
    const usuarios = obterUsuarios();
    const nivelCostureira = usuarios.find(u => u.email === filtroCostureira)?.nivel || 1;

    const semanasList = document.getElementById('rc-weeks-list');
    if (semanasList) {
        semanasList.innerHTML = '';
        cicloSelecionado.semanas.forEach((semana, index) => {
            const producoesSemana = producoes.filter(p => {
                const dataProducao = new Date(p.data);
                const inicioSemanaLocal = new Date(semana.inicio + 'T00:00:00-03:00');
                const fimSemanaLocal = new Date(semana.fim + 'T23:59:59-03:00');
                return p.costureira === filtroCostureira && 
                       dataProducao >= inicioSemanaLocal && 
                       dataProducao <= fimSemanaLocal;
            });

            let processosSemanaCrus = 0;
            let pontosSemana = 0;
            producoesSemana.forEach(p => {
                const produto = produtos.find(prod => prod.nome === p.produto);
                if (produto) {
                    const processoIndex = produto.processos.indexOf(p.processo);
                    const pontos = produto.pontos?.[processoIndex] || 1;
                    processosSemanaCrus += p.quantidade;
                    pontosSemana += p.quantidade * pontos;
                } else {
                    processosSemanaCrus += p.quantidade;
                    pontosSemana += p.quantidade;
                }
            });

            const inicioSemana = new Date(semana.inicio + 'T00:00:00-03:00');
            const fimSemana = new Date(semana.fim + 'T23:59:59-03:00');
            const isSemanaAtual = new Date('2025-03-12') >= inicioSemana && new Date('2025-03-12') <= fimSemana; // Data fixa para teste

            const semanaDiv = document.createElement('div');
            semanaDiv.className = 'rc-week-item';
            semanaDiv.innerHTML = `
                <button class="${isSemanaAtual ? 'semana-atual' : ''}">
                    S${index + 1} (${formatarData(semana.inicio)} a ${formatarData(semana.fim)})
                </button>
                <span class="${isSemanaAtual ? 'processos-atual' : ''}">
                    ${Math.round(pontosSemana)} ${pontosSemana <= 1 ? 'Ponto' : 'Pontos'}
                </span>
            `;
            semanasList.appendChild(semanaDiv);

            totalProcessosCrus += processosSemanaCrus;
            totalPontosPonderados += pontosSemana;
        });
    }

    const totalProcessosEl = document.getElementById('rc-total-processos');
    const totalPontosEl = document.getElementById('rc-total-pontos');
    const comissionEl = document.getElementById('rc-comission-value');
    if (totalProcessosEl && totalPontosEl && comissionEl) {
        totalProcessosEl.textContent = Math.round(totalProcessosCrus);
        totalPontosEl.textContent = Math.round(totalPontosPonderados);
        
        const comissao = calcularComissaoSemanal(totalPontosPonderados, nivelCostureira, producoes.filter(p => 
            p.costureira === filtroCostureira && 
            cicloSelecionado.semanas.some(semana => {
                const inicio = new Date(semana.inicio + 'T00:00:00-03:00');
                const fim = new Date(semana.fim + 'T23:59:59-03:00');
                const dataProducao = new Date(p.data);
                return dataProducao >= inicio && dataProducao <= fim;
            })
        ));
        
        if (typeof comissao === 'number') {
            comissionEl.textContent = `R$ ${comissao.toFixed(2).replace('.', ',')}`;
            comissionEl.classList.remove('nao-bateu');
        } else {
            comissionEl.textContent = `Não bateu a 1ª meta. Faltam ${comissao.faltam} pontos para a 1ª meta.`;
            comissionEl.classList.add('nao-bateu');
        }
    }
}

function atualizarGraficoComparativo() {
    const filtroCostureira = document.getElementById('rc-chart-costureira')?.value;
    const semana1Value = document.getElementById('rc-chart-week1')?.value;
    const semana2Value = document.getElementById('rc-chart-week2')?.value;
    if (!filtroCostureira || !semana1Value || !semana2Value) return;

    const [inicioSemana1, fimSemana1] = semana1Value.split('|');
    const [inicioSemana2, fimSemana2] = semana2Value.split('|');

    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const produtos = obterProdutos();
    const usuarios = obterUsuarios();
    const nivelCostureira = usuarios.find(u => u.email === filtroCostureira)?.nivel || 1;

    const producoesSemana1 = producoes.filter(p => {
        const dataProducao = new Date(p.data);
        const inicio = new Date(inicioSemana1 + 'T00:00:00-03:00');
        const fim = new Date(fimSemana1 + 'T23:59:59-03:00');
        return p.costureira === filtroCostureira && dataProducao >= inicio && dataProducao <= fim;
    });
    let pontosSemana1 = 0;
    producoesSemana1.forEach(p => {
        const produto = produtos.find(prod => prod.nome === p.produto);
        if (produto) {
            const processoIndex = produto.processos.indexOf(p.processo);
            const pontos = produto.pontos?.[processoIndex] || 1;
            pontosSemana1 += p.quantidade * pontos;
        } else {
            pontosSemana1 += p.quantidade;
        }
    });

    const producoesSemana2 = producoes.filter(p => {
        const dataProducao = new Date(p.data);
        const inicio = new Date(inicioSemana2 + 'T00:00:00-03:00');
        const fim = new Date(fimSemana2 + 'T23:59:59-03:00');
        return p.costureira === filtroCostureira && dataProducao >= inicio && dataProducao <= fim;
    });
    let pontosSemana2 = 0;
    producoesSemana2.forEach(p => {
        const produto = produtos.find(prod => prod.nome === p.produto);
        if (produto) {
            const processoIndex = produto.processos.indexOf(p.processo);
            const pontos = produto.pontos?.[processoIndex] || 1;
            pontosSemana2 += p.quantidade * pontos;
        } else {
            pontosSemana2 += p.quantidade;
        }
    });

    const comissaoSemana1 = calcularComissaoSemanal(pontosSemana1, nivelCostureira, producoesSemana1);
    const comissaoSemana2 = calcularComissaoSemanal(pontosSemana2, nivelCostureira, producoesSemana2);

    const valores = [
        typeof comissaoSemana1 === 'number' ? comissaoSemana1 : 0,
        typeof comissaoSemana2 === 'number' ? comissaoSemana2 : 0
    ];

    const canvas = document.getElementById('rc-chart-canvas');
    if (canvas) {
        if (window.graficoComparativo && typeof window.graficoComparativo.destroy === 'function') {
            window.graficoComparativo.destroy();
        }
        window.graficoComparativo = criarGrafico(
            canvas, 'bar',
            [`Semana (${formatarData(inicioSemana1)})`, `Semana (${formatarData(inicioSemana2)})`],
            'Comissão (R$)', valores,
            ['rgba(54, 162, 235, 0.2)'], ['rgba(54, 162, 235, 1)']
        );
    }
}

carregarFiltrosRelatorio();