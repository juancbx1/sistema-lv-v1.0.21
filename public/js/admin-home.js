// /js/admin-home.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterUsuarios } from '/js/utils/storage.js';
import { criarGrafico } from '/js/utils/chart-utils.js';

let grafico;
let graficoTempoReal;

function atualizarGrafico() {
  const filtroCostureira = document.getElementById('filtroCostureira');
  if (!filtroCostureira) return;
  const filtro = filtroCostureira.value;
  const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
  const hoje = new Date().toISOString().split('T')[0];

  const producoesHoje = producoes.filter(p => p.data.startsWith(hoje));
  const dados = {};

  producoesHoje.forEach(p => {
    if (!filtro || p.costureira === filtro) {
      if (!dados[p.costureira]) dados[p.costureira] = 0;
      dados[p.costureira] += p.quantidade;
    }
  });

  const labels = Object.keys(dados);
  const valores = Object.values(dados);

  if (window.grafico) window.grafico.destroy();
  const ctx = document.getElementById('graficoProducao');
  if (!ctx) return;

  window.grafico = criarGrafico(
    ctx, 'bar', labels.map(email => {
      const user = obterUsuarios().find(u => u.email === email);
      return user ? user.nome : email;
    }), 'Processos Hoje', valores,
    'rgba(75, 192, 192, 0.2)', 'rgba(75, 192, 192, 1)'
  );
}

function atualizarGraficoTempoReal() {
  const hoje = new Date().toISOString().split('T')[0];
  const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
  const usuarios = obterUsuarios();
  const producoesHoje = producoes.filter(p => p.data.startsWith(hoje));

  const dados = {};
  producoesHoje.forEach(p => {
    if (!dados[p.costureira]) dados[p.costureira] = 0;
    dados[p.costureira] += p.quantidade;
  });

  const labels = Object.keys(dados).map(email => {
    const user = usuarios.find(u => u.email === email);
    return user ? user.nome : email;
  });
  const valores = Object.values(dados);

  if (graficoTempoReal) graficoTempoReal.destroy();
  const ctx = document.getElementById('graficoProducaoTempoReal');
  if (!ctx) return;

  graficoTempoReal = criarGrafico(
    ctx, 'bar', labels, `Processos Hoje (${hoje})`, valores,
    'rgba(52, 152, 219, 0.6)', 'rgba(52, 152, 219, 1)'
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[admin-home] Verificando autenticação para home.html');
    const auth = await verificarAutenticacao('home.html', []);
    if (!auth) {
      console.log('[admin-home] Autenticação falhou, redirecionando para acesso-negado');
      window.location.href = '/admin/acesso-negado.html';
      return;
    }

    const usuarioLogado = auth.usuario;
    const permissoes = auth.permissoes || [];
    console.log('[admin-home] Inicializando home para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);

    const nomeAdmin = document.getElementById('nomeAdmin');
    if (nomeAdmin && usuarioLogado) {
      nomeAdmin.textContent = usuarioLogado.nome;
    }

    atualizarGrafico();
    atualizarGraficoTempoReal();
    setInterval(atualizarGraficoTempoReal, 60000);
  } catch (error) {
    console.error('[admin-home] Erro ao carregar home:', error);
    window.location.href = '/admin/acesso-negado.html'; // Redireciona sem logout
  }
});