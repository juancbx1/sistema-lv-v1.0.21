// server.js
import express from 'express';

// Importar todos os routers
import loginRouter from './api/login.js';
console.log('loginRouter:', typeof loginRouter, loginRouter ? 'Carregado' : 'NÃO CARREGADO');

import usuariosRouter from './api/usuarios.js';
console.log('usuariosRouter:', typeof usuariosRouter, usuariosRouter ? 'Carregado' : 'NÃO CARREGADO');

import cortesRouter from './api/cortes.js';
console.log('cortesRouter:', typeof cortesRouter, cortesRouter ? 'Carregado' : 'NÃO CARREGADO');

import producoesRouter from './api/producoes.js';
console.log('producoesRouter:', typeof producoesRouter, producoesRouter ? 'Carregado' : 'NÃO CARREGADO');

import configuracaoPontosRouter from './api/configuracao-pontos.js';
console.log('configuracaoPontosRouter:', typeof configuracaoPontosRouter, configuracaoPontosRouter ? 'Carregado' : 'NÃO CARREGADO');

import produtosRouter from './api/produtos.js';
console.log('produtosRouter:', typeof produtosRouter, produtosRouter ? 'Carregado' : 'NÃO CARREGADO');

import ordensDeProducaoRouter from './api/ordens-de-producao.js'; // <<< ADICIONAR IMPORT
console.log('ordensDeProducaoRouter:', typeof ordensDeProducaoRouter, ordensDeProducaoRouter ? 'Carregado' : 'NÃO CARREGADO');

import comissoesPagasRouter from './api/comissoes-pagas.js'; // Assumindo que você criou o arquivo com este nome
console.log('comissoesPagasRouter:', typeof comissoesPagasRouter, comissoesPagasRouter ? 'Carregado' : 'NÃO CARREGADO');

import arrematesRouter from './api/arremates.js';
console.log('arrematesRouter:', typeof arrematesRouter, arrematesRouter ? 'Carregado' : 'NÃO CARREGADO');

import opsParaEmbalagemRouter from './api/ops-para-embalagem.js';
console.log('opsParaEmbalagemRouter:', typeof opsParaEmbalagemRouter, opsParaEmbalagemRouter ? 'Carregado' : 'NÃO CARREGADO');

import estoqueRouter from './api/estoque.js';
console.log('estoqueRouter:', typeof estoqueRouter, estoqueRouter ? 'Carregado' : 'NÃO CARREGADO');

import kitsRouter from './api/kits.js'; // <<< ADICIONAR IMPORT
console.log('kitsRouter:', typeof kitsRouter, kitsRouter ? 'Carregado' : 'NÃO CARREGADO');

import materiasPrimasRouter from './api/materias-primas.js';
console.log('materiasPrimasRouter:', typeof materiasPrimasRouter, materiasPrimasRouter ? 'Carregado' : 'NÃO CARREGADO');

import tiposMaoDeObraRouter from './api/tipos-mao-de-obra.js';
console.log('tiposMaoDeObraRouter:', typeof tiposMaoDeObraRouter, tiposMaoDeObraRouter ? 'Carregado' : 'NÃO CARREGADO');

import despesasOperacionaisRouter from './api/despesas-operacionais.js';
console.log('despesasOperacionaisRouter:', typeof despesasOperacionaisRouter, despesasOperacionaisRouter ? 'Carregado' : 'NÃO CARREGADO');

import canaisVendaRouter from './api/canais-venda.js';
console.log('canaisVendaRouter:', typeof canaisVendaRouter, canaisVendaRouter ? 'Carregado' : 'NÃO CARREGADO');

import precificacaoConfigRouter from './api/precificacao-config.js';
console.log('precificacaoConfigRouter:', typeof precificacaoConfigRouter, precificacaoConfigRouter ? 'Carregado' : 'NÃO CARREGADO');

import niveisEstoqueRouter from './api/niveis-estoque.js'; 
console.log('niveisEstoqueRouter:', typeof niveisEstoqueRouter, niveisEstoqueRouter ? 'Carregado' : 'NÃO CARREGADO');

const app = express();
console.log('Aplicação Express inicializada.');

// Middlewares globais
app.use(express.json());
console.log('Middleware express.json configurado.');
app.use(express.static('public'));
console.log("Middleware express.static('public') configurado.");
app.use((req, res, next) => {
    console.log(`[server.js] Requisição recebida: ${req.method} ${req.originalUrl}`);
    next();
});

// Checagem se os routers foram carregados
const routers = {
    loginRouter,
    usuariosRouter,
    cortesRouter,
    producoesRouter,
    configuracaoPontosRouter,
    produtosRouter,
    ordensDeProducaoRouter,
    comissoesPagasRouter,
    arrematesRouter, // <<< ADICIONAR
    opsParaEmbalagemRouter,
    estoqueRouter,
    kitsRouter,
    materiasPrimasRouter,
    tiposMaoDeObraRouter,
    despesasOperacionaisRouter,
    canaisVendaRouter,
    precificacaoConfigRouter,
    niveisEstoqueRouter
};
for (const routerName in routers) {
    if (!routers[routerName] || typeof routers[routerName] !== 'function') {
        console.error(`ERRO FATAL: ${routerName} não foi carregado corretamente ou não é uma função router válida! Valor:`, routers[routerName]);
    }
}

// Montar os roteadores da API
if (loginRouter && typeof loginRouter === 'function') app.use('/api/login', loginRouter);
if (usuariosRouter && typeof usuariosRouter === 'function') app.use('/api/usuarios', usuariosRouter);
if (cortesRouter && typeof cortesRouter === 'function') app.use('/api/cortes', cortesRouter);
if (producoesRouter && typeof producoesRouter === 'function') app.use('/api/producoes', producoesRouter);
if (configuracaoPontosRouter && typeof configuracaoPontosRouter === 'function') app.use('/api/configuracao-pontos', configuracaoPontosRouter);
if (produtosRouter && typeof produtosRouter === 'function') app.use('/api/produtos', produtosRouter);
if (ordensDeProducaoRouter && typeof ordensDeProducaoRouter === 'function') { // <<< ADICIONAR
    app.use('/api/ordens-de-producao', ordensDeProducaoRouter);
    console.log("Rota /api/ordens-de-producao montada.");}
if (comissoesPagasRouter && typeof comissoesPagasRouter === 'function') {
    app.use('/api/comissoes-pagas', comissoesPagasRouter);
    console.log("Rota /api/comissoes-pagas montada.");
}
if (arrematesRouter && typeof arrematesRouter === 'function') {
    app.use('/api/arremates', arrematesRouter);
    console.log("Rota /api/arremates (Express Router) montada.");
} else {
    console.error("ERRO FATAL: arrematesRouter não foi carregado ou não é uma função router válida!");
}

if (opsParaEmbalagemRouter && typeof opsParaEmbalagemRouter === 'function') {
    app.use('/api/ops-para-embalagem', opsParaEmbalagemRouter);
    console.log("Rota /api/ops-para-embalagem (Express Router) montada.");
} else {
    console.error("ERRO FATAL: opsParaEmbalagemRouter não foi carregado ou não é uma função router válida!");
}

// <<< ADICIONAR ESTE BLOCO PARA MONTAR O ROUTER DE ESTOQUE >>>
if (estoqueRouter && typeof estoqueRouter === 'function') {
    app.use('/api/estoque', estoqueRouter);
    console.log("Rota /api/estoque (Express Router) montada.");
} else {
    console.error("ERRO FATAL: estoqueRouter não foi carregado ou não é uma função router válida!");
}

if (kitsRouter && typeof kitsRouter === 'function') {
    app.use('/api/kits', kitsRouter);
    console.log("Rota /api/kits (Express Router) montada.");
} else {
    console.error("ERRO FATAL: kitsRouter não foi carregado ou não é uma função router válida!");
}

if (materiasPrimasRouter && typeof materiasPrimasRouter === 'function') {
    app.use('/api/materias-primas', materiasPrimasRouter);
    console.log("Rota /api/materias-primas (Express Router) montada.");
} else {
    console.error("ERRO FATAL: materiasPrimasRouter não foi carregado ou não é uma função router válida!");
}

if (tiposMaoDeObraRouter && typeof tiposMaoDeObraRouter === 'function') {
    app.use('/api/tipos-mao-de-obra', tiposMaoDeObraRouter);
    console.log("Rota /api/tipos-mao-de-obra (Express Router) montada.");
} else {
    console.error("ERRO FATAL: tiposMaoDeObraRouter não foi carregado ou não é uma função router válida!");
}

if (despesasOperacionaisRouter && typeof despesasOperacionaisRouter === 'function') {
    app.use('/api/despesas-operacionais', despesasOperacionaisRouter);
    console.log("Rota /api/despesas-operacionais (Express Router) montada.");
} else {
    console.error("ERRO FATAL: despesasOperacionaisRouter não foi carregado ou não é uma função router válida!");
}

if (canaisVendaRouter && typeof canaisVendaRouter === 'function') {
    app.use('/api/canais-venda', canaisVendaRouter);
    console.log("Rota /api/canais-venda (Express Router) montada.");
} else {
    console.error("ERRO FATAL: canaisVendaRouter não foi carregado ou não é uma função router válida!");
}

if (precificacaoConfigRouter && typeof precificacaoConfigRouter === 'function') {
    app.use('/api/precificacao-config', precificacaoConfigRouter);
    console.log("Rota /api/precificacao-config (Express Router) montada.");
} else {
    console.error("ERRO FATAL: precificacaoConfigRouter não foi carregado ou não é uma função router válida!");
}

if (niveisEstoqueRouter && typeof niveisEstoqueRouter === 'function') {
    app.use('/api/niveis-estoque', niveisEstoqueRouter);
    console.log("Rota /api/niveis-estoque (Express Router) montada.");
} else {
    console.error("ERRO FATAL: niveisEstoqueRouter não foi carregado ou não é uma função router válida!");
}

app.get('/api/ping', (req, res) => res.status(200).json({ message: 'pong do server.js' }));
console.log("Rota /api/ping configurada.");

// Servir arquivos HTML específicos (ajuste os caminhos e adicione mais conforme necessário)
const serveHtmlFile = (filePath, res) => { /* ... sua função serveHtmlFile ... */
    const fullPath = process.cwd() + `/public/${filePath}`;
    console.log(`Tentando servir HTML: ${fullPath}`);
    res.sendFile(fullPath, (err) => {
        if (err) {
            console.error(`Erro ao servir ${fullPath}:`, err.message);
            if (!res.headersSent) {
                 res.status(404).send(`Arquivo não encontrado: ${filePath}`);
            }
        }
    });
};
app.get('/', (req, res) => serveHtmlFile('index.html', res));
app.get('/login.html', (req, res) => serveHtmlFile('login.html', res));
app.get('/admin/home.html', (req, res) => serveHtmlFile('admin/home.html', res));
app.get('/admin/ordens-de-producao.html', (req, res) => serveHtmlFile('admin/ordens-de-producao.html', res));
app.get('/admin/ponto-por-processo.html', (req, res) => serveHtmlFile('admin/ponto-por-processo.html', res));
app.get('/costureira/dashboard.html', (req, res) => serveHtmlFile('costureira/dashboard.html', res));


app.use((err, req, res, next) => { /* ... seu error handler global ... */
    console.error("[server.js] Erro não tratado:", err.stack || err.message || err);
    if (!res.headersSent) {
        res.status(err.statusCode || 500).json({
            error: "Erro interno do servidor",
            message: err.message || "Ocorreu um erro inesperado."
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Express rodando na porta ${PORT}.`));

export default app;