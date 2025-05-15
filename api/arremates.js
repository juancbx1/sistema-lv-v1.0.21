// api/arremates.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

console.log('[api/arremates] Iniciando carregamento do módulo...');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error('[api/arremates] ERRO CRÍTICO: JWT_SECRET não está definida nas variáveis de ambiente!');
}

const verificarToken = (req) => {
    console.log('[api/arremates - verificarToken] Verificando token...');
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Token não fornecido');
    try {
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        return decoded;
    } catch (error) {
        console.error('[api/arremates - verificarToken] Erro ao verificar token:', error.message);
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expirado');
        } else if (error.name === 'JsonWebTokenError') {
            throw new Error('Token inválido');
        } else {
            throw error;
        }
    }
};

export default async function handler(req, res) {
    console.log('[api/arremates] Requisição recebida:', req.method, req.url);
    const { method } = req;

    try {
        const usuarioLogado = verificarToken(req);
        console.log('[api/arremates] Usuário autenticado:', usuarioLogado.nome);

        if (!usuarioLogado.permissoes || !usuarioLogado.permissoes.includes('acesso-embalagem-de-produtos')) {
             console.warn(`[api/arremates] Permissão 'acesso-embalagem-de-produtos' negada para ${usuarioLogado.nome}`);
             return res.status(403).json({ error: 'Permissão negada para acessar esta funcionalidade.' });
        }

        if (method === 'POST') {
            console.log('[api/arremates] Processando POST...');
            // Verifica permissão específica para lançar arremate
            if (!usuarioLogado.permissoes.includes('lancar-arremate')) { // ESSA É A VERIFICAÇÃO CHAVE
             console.warn(`[api/arremates] Permissão 'lancar-arremate' negada para ${usuarioLogado.nome}`);
            return res.status(403).json({ error: 'Permissão negada para lançar arremate.' }); // RETORNA 403
    }

            const {
                op_numero,
                op_edit_id,
                produto,
                variante,
                quantidade_arrematada, // Esta será a quantidade DESTE lançamento
                usuario_tiktik
            } = req.body;
            console.log('[api/arremates] Dados recebidos para POST:', req.body);

            if (!op_numero || !produto || !quantidade_arrematada || !usuario_tiktik) {
                console.error('[api/arremates] Dados incompletos para POST:', { op_numero, produto, quantidade_arrematada, usuario_tiktik });
                return res.status(400).json({ error: 'Dados incompletos fornecidos. Campos obrigatórios: op_numero, produto, quantidade_arrematada, usuario_tiktik.' });
            }
            const quantidadeNum = parseInt(quantidade_arrematada);
            if (isNaN(quantidadeNum) || quantidadeNum <= 0) {
                 console.error('[api/arremates] Quantidade inválida:', quantidade_arrematada);
                 return res.status(400).json({ error: 'Quantidade arrematada deve ser um número positivo.' });
            }
            console.log(`[api/arremates] Inserindo novo registro de arremate para OP ${op_numero} com quantidade ${quantidadeNum}...`);
            const result = await pool.query(
                `INSERT INTO arremates (op_numero, op_edit_id, produto, variante, quantidade_arrematada, usuario_tiktik, data_lancamento)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())
                 RETURNING *`, // Retorna o registro completo inserido
                [
                    op_numero,
                    op_edit_id || null,
                    produto,
                    variante || null,
                    quantidadeNum, // A quantidade deste lançamento específico
                    usuario_tiktik
                ]
            );

            if (result.rows.length === 0) {
                 throw new Error('Falha ao inserir o registro de arremate, nenhum dado retornado.');
            }

            console.log('[api/arremates] Novo arremate salvo com sucesso:', result.rows[0]);
            res.status(201).json(result.rows[0]);

        } else if (method === 'GET') {
            console.log('[api/arremates] Processando GET...');
            const { op_numero } = req.query;

            let queryText;
            let queryParams = [];

            if (op_numero) {
                console.log(`[api/arremates] Buscando arremates para OP específica: ${op_numero}`);
                // Retorna todos os lançamentos para esta OP, ordenados (mais recente primeiro, por exemplo)
                queryText = 'SELECT * FROM arremates WHERE op_numero = $1 ORDER BY data_lancamento DESC';
                queryParams = [String(op_numero)];
            } else {
                console.log('[api/arremates] Buscando todos os arremates...');
                // Retorna todos os arremates, pode ser muitos. Considere paginação aqui se necessário no futuro.
                queryText = 'SELECT * FROM arremates ORDER BY data_lancamento DESC';
            }

            const result = await pool.query(queryText, queryParams);
            console.log(`[api/arremates] ${result.rows.length} arremates encontrados.`);
            res.status(200).json(result.rows);

        } else {
            console.warn(`[api/arremates] Método ${method} não permitido.`);
            res.setHeader('Allow', ['GET', 'POST']);
            res.status(405).end(`Método ${method} não permitido`);
        }

    } catch (error) {
        console.error('[api/arremates] Erro não tratado:', {
            message: error.message,
            url: req.url,
            method: req.method,
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