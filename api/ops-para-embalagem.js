import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

console.log('[api/ops-para-embalagem] Iniciando carregamento...');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC', // Manter UTC no banco
});

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error('[api/ops-para-embalagem] ERRO CRÍTICO: JWT_SECRET não definida!');
}

// Função para verificar o token JWT (Reutilizada)
const verificarToken = (req) => {
    console.log('[api/ops-para-embalagem] Verificando token...');
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Token não fornecido');
    try {
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        return decoded;
    } catch (error) {
        console.error('[api/ops-para-embalagem] Erro ao verificar token:', error.message);
        if (error.name === 'TokenExpiredError') throw new Error('Token expirado');
        if (error.name === 'JsonWebTokenError') throw new Error('Token inválido');
        throw error;
    }
};

export default async function handler(req, res) {
    console.log('[api/ops-para-embalagem] Requisição recebida:', req.method, req.url);
    const { method, query } = req;

    if (method !== 'GET') {
        console.warn(`[api/ops-para-embalagem] Método ${method} não permitido.`);
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Método ${method} não permitido`);
    }

    try {
        // 1. Verificar Autenticação e Permissão
        const usuarioLogado = verificarToken(req);
        console.log('[api/ops-para-embalagem] Usuário autenticado:', usuarioLogado.nome);

        // Verifica permissão para acessar a área de embalagem
        if (!usuarioLogado.permissoes || !usuarioLogado.permissoes.includes('acesso-embalagem-de-produtos')) {
            console.warn(`[api/ops-para-embalagem] Permissão 'acesso-embalagem-de-produtos' negada para ${usuarioLogado.nome}`);
            return res.status(403).json({ error: 'Permissão negada para acessar OPs para embalagem.' });
        }

        // 2. Parâmetros da Query (Opcional: suportar `all` ou paginação)
        const fetchAll = query.all === 'true';
        const page = parseInt(query.page) || 1;
        // Ajuste o limite padrão se desejar um valor diferente para esta API
        const limit = parseInt(query.limit) || 50; // Ex: padrão maior
        const offset = (page - 1) * limit;

        // 3. Construir a Query SQL
        const baseQuery = `FROM ordens_de_producao WHERE status = 'finalizado'`;
        // Ordenar por data de finalização (mais recente primeiro) ou número da OP
        const orderBy = `ORDER BY data_final DESC NULLS LAST, CAST(numero AS INTEGER) DESC`;

        // Query para buscar os dados
        let queryText = `SELECT * ${baseQuery} ${orderBy}`;
        let queryParams = [];

        // Query para contar o total (para paginação)
        let totalQuery = `SELECT COUNT(*) ${baseQuery}`;
        let totalParams = []; // status = 'finalizado' já está no baseQuery

        // Aplicar paginação se `all=true` NÃO for passado
        if (!fetchAll) {
            queryText += ` LIMIT $1 OFFSET $2`;
            queryParams = [limit, offset];
        } else {
            console.log('[api/ops-para-embalagem] Buscando todas as OPs finalizadas (all=true).');
        }

        // 4. Executar as Queries
        console.log('[api/ops-para-embalagem] Executando query principal:', queryText, queryParams);
        const result = await pool.query(queryText, queryParams);

        console.log('[api/ops-para-embalagem] Executando query de contagem:', totalQuery, totalParams);
        const totalResult = await pool.query(totalQuery, totalParams);
        const total = parseInt(totalResult.rows[0].count);
        const pages = fetchAll ? 1 : Math.ceil(total / limit); // Apenas 1 página se buscar tudo

        console.log(`[api/ops-para-embalagem] ${result.rows.length} OPs finalizadas encontradas (Total: ${total}).`);

        // 5. Retornar a Resposta
        res.status(200).json({
            rows: result.rows,
            total: total,
            page: fetchAll ? 1 : page,
            pages: pages,
        });

    } catch (error) {
        // 6. Tratamento de Erros (Similar ao anterior)
        console.error('[api/ops-para-embalagem] Erro não tratado:', {
            message: error.message,
            stack: error.stack,
            url: req.url,
        });
        let statusCode = 500;
        let errorMessage = 'Erro interno no servidor.';
        if (error.message === 'Token não fornecido' || error.message === 'Token inválido' || error.message === 'Token expirado') {
            statusCode = 401;
            errorMessage = error.message;
        }
        res.status(statusCode).json({ error: errorMessage, details: error.message });
    }
}