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
    comissoesPagasRouter
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