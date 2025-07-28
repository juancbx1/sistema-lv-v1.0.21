// server.js
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';

// Importar todos os routers
import loginRouter from './api/login.js';
import usuariosRouter from './api/usuarios.js';
import cortesRouter from './api/cortes.js';
import producoesRouter from './api/producoes.js';
import configuracaoPontosRouter from './api/configuracao-pontos.js';
import produtosRouter from './api/produtos.js';
import ordensDeProducaoRouter from './api/ordens-de-producao.js';
import comissoesPagasRouter from './api/comissoes-pagas.js';
import arrematesRouter from './api/arremates.js';
import opsParaEmbalagemRouter from './api/ops-para-embalagem.js';
import estoqueRouter from './api/estoque.js';
import kitsRouter from './api/kits.js';
import materiasPrimasRouter from './api/materias-primas.js';
import tiposMaoDeObraRouter from './api/tipos-mao-de-obra.js';
import despesasOperacionaisRouter from './api/despesas-operacionais.js';
import canaisVendaRouter from './api/canais-venda.js';
import precificacaoConfigRouter from './api/precificacao-config.js';
import niveisEstoqueRouter from './api/niveis-estoque.js'; 
import uploadRouter from './api/upload.js';
import promessasRouter from './api/producao-promessas.js';
import embalagensRouter from './api/embalagens.js';
import dashboardRouter from './api/dashboard.js';
import auditoriaRouter from './api/auditoria.js';
import comunicacoesRouter from './api/comunicacoes.js';
import ticketsRouter from './api/tickets.js';
import inventarioRouter from './api/inventario.js';
import financeiroRouter from './api/financeiro.js';
import pagamentosRouter from './api/pagamentos.js';
import avataresRouter from './api/avatares.js';
import perfisRouter from './api/perfis.js'; 
import historicoRouter from './api/historico.js'; 
import metasRouter from './api/metas.js'; 

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
    arrematesRouter,
    opsParaEmbalagemRouter,
    estoqueRouter,
    kitsRouter,
    materiasPrimasRouter,
    tiposMaoDeObraRouter,
    despesasOperacionaisRouter,
    canaisVendaRouter,
    precificacaoConfigRouter,
    niveisEstoqueRouter,
    embalagensRouter,
    dashboardRouter,
    auditoriaRouter,
    comunicacoesRouter,
    ticketsRouter,
    inventarioRouter,
    financeiroRouter,
    pagamentosRouter,
    avataresRouter,
    perfisRouter,
    historicoRouter,
    metasRouter

};
for (const routerName in routers) {
    if (!routers[routerName] || typeof routers[routerName] !== 'function') {
        console.error(`ERRO FATAL: ${routerName} não foi carregado corretamente ou não é uma função router válida! Valor:`, routers[routerName]);
    }
}

// --- Montar os roteadores da API ---
app.use('/api/login', loginRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/cortes', cortesRouter);
app.use('/api/producoes', producoesRouter);
app.use('/api/configuracao-pontos', configuracaoPontosRouter);
app.use('/api/produtos', produtosRouter);
app.use('/api/ordens-de-producao', ordensDeProducaoRouter);
app.use('/api/comissoes-pagas', comissoesPagasRouter);
app.use('/api/arremates', arrematesRouter);
app.use('/api/ops-para-embalagem', opsParaEmbalagemRouter);
app.use('/api/estoque', estoqueRouter);
app.use('/api/kits', kitsRouter);
app.use('/api/materias-primas', materiasPrimasRouter);
app.use('/api/tipos-mao-de-obra', tiposMaoDeObraRouter);
app.use('/api/despesas-operacionais', despesasOperacionaisRouter);
app.use('/api/canais-venda', canaisVendaRouter);
app.use('/api/precificacao-config', precificacaoConfigRouter);
app.use('/api/niveis-estoque', niveisEstoqueRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/producao-promessas', promessasRouter);
app.use('/api/embalagens', embalagensRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/auditoria', auditoriaRouter);
app.use('/api/comunicacoes', comunicacoesRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/inventario', inventarioRouter)
app.use('/api/financeiro', financeiroRouter);
app.use('/api/pagamentos', pagamentosRouter);
app.use('/api/avatares', avataresRouter);
app.use('/api/perfis', perfisRouter);
app.use('/api/historico', historicoRouter);
app.use('/api/metas', metasRouter);



app.get('/api/ping', (req, res) => res.status(200).json({ message: 'pong do server.js' }));
console.log("Rota /api/ping configurada.");

// Servir arquivos HTML específicos (ajuste os caminhos e adicione mais conforme necessário)
const serveHtmlFile = (filePath, res) => {
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
app.get('/dashboard/dashboard.html', (req, res) => serveHtmlFile('dashboard/dashboard.html', res));

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