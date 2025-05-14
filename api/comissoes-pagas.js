// api/comissoes-pagas.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

console.log('[api/comissoes-pagas] Iniciando carregamento do módulo...');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error("ERRO FATAL: JWT_SECRET não está definida nas variáveis de ambiente.");
}

// Função para verificar o token JWT (igual à de producoes.js)
const verificarToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401; // Unauthorized
        throw error;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        const error = new Error('Token mal formatado');
        error.statusCode = 401;
        throw error;
    }
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        return decoded; // Contém o payload do token, ex: { userId: 1, nome: 'Admin', permissoes: ['...'] }
    } catch (error) {
        console.error('[verificarToken] Erro ao verificar token:', error.message);
        if (error.name === 'TokenExpiredError') {
            const err = new Error('Token expirado');
            err.statusCode = 401;
            throw err;
        }
        const err = new Error('Token inválido');
        err.statusCode = 403; // Forbidden
        throw err;
    }
};

export default async function handler(req, res) {
    console.log(`[api/comissoes-pagas] Requisição recebida: ${req.method} ${req.url}`);
    const { method } = req;

    try {
        const usuarioLogado = verificarToken(req); // Verifica o token para todas as rotas
        console.log(`[api/comissoes-pagas] Usuário logado: ${usuarioLogado.nome} (ID: ${usuarioLogado.id || 'N/A'})`);

        if (method === 'POST') {
            // --- Lógica para REGISTRAR uma comissão como PAGA ---
            if (!usuarioLogado.permissoes || !usuarioLogado.permissoes.includes('confirmar-pagamento-comissao')) {
                return res.status(403).json({ error: 'Permissão negada para confirmar pagamento de comissão.' });
            }

            const {
                costureira_nome,
                ciclo_nome,
                ciclo_inicio, // YYYY-MM-DD
                ciclo_fim,    // YYYY-MM-DD
                valor_pago,
                data_prevista_pagamento, // YYYY-MM-DD
                data_pagamento_efetivo,  // ISO String (YYYY-MM-DDTHH:mm:ss.sssZ)
                confirmado_por_nome,
                observacoes
            } = req.body;

            // Validação básica dos dados
            if (!costureira_nome || !ciclo_nome || !ciclo_inicio || !ciclo_fim || valor_pago === undefined || !data_prevista_pagamento || !data_pagamento_efetivo || !confirmado_por_nome) {
                return res.status(400).json({ error: 'Dados incompletos para registrar o pagamento da comissão.' });
            }
            if (isNaN(parseFloat(valor_pago)) || parseFloat(valor_pago) <= 0) {
                return res.status(400).json({ error: 'Valor pago inválido.' });
            }

            try {
                const result = await pool.query(
                    `INSERT INTO comissoes_pagas 
                     (costureira_nome, ciclo_nome, ciclo_inicio, ciclo_fim, valor_pago, data_prevista_pagamento, data_pagamento_efetivo, confirmado_por_nome, confirmado_por_id, observacoes)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     RETURNING *`,
                    [
                        costureira_nome, ciclo_nome, ciclo_inicio, ciclo_fim,
                        parseFloat(valor_pago), data_prevista_pagamento, data_pagamento_efetivo,
                        confirmado_por_nome, usuarioLogado.id, // Salva o ID do usuário que confirmou
                        observacoes || null
                    ]
                );
                console.log('[api/comissoes-pagas POST] Comissão paga registrada:', result.rows[0]);
                res.status(201).json(result.rows[0]);
            } catch (dbError) {
                if (dbError.code === '23505') { // Código de erro para violação de constraint UNIQUE
                    console.error('[api/comissoes-pagas POST] Erro de duplicidade:', dbError.detail);
                    return res.status(409).json({ error: 'Este pagamento de comissão (costureira/ciclo) já foi registrado.' });
                }
                console.error('[api/comissoes-pagas POST] Erro ao inserir no banco:', dbError);
                res.status(500).json({ error: 'Erro interno do servidor ao registrar pagamento.', details: dbError.message });
            }

        } else if (method === 'GET') {
            if (!usuarioLogado.permissoes || !usuarioLogado.permissoes.includes('acesso-relatorio-de-comissao')) {
                if (usuarioLogado.tipos && usuarioLogado.tipos.includes('costureira')) {
 
                } else {
                    return res.status(403).json({ error: 'Permissão negada para acessar relatório de comissões pagas.' });
                }
            }

            const { costureira_nome, mes_pagamento } = req.query; // mes_pagamento no formato YYYY-MM

            let queryText = 'SELECT * FROM comissoes_pagas';
            const queryParams = [];
            const conditions = [];

            // Se o usuário logado é costureira e não tem permissão geral, força o filtro para ela.
            if (usuarioLogado.tipos && usuarioLogado.tipos.includes('costureira') && !usuarioLogado.permissoes.includes('acesso-total-relatorio-comissao')) { // acesso-total-relatorio-comissao é permissão de admin/supervisor
                queryParams.push(usuarioLogado.nome);
                conditions.push(`costureira_nome = $${queryParams.length}`);
            } else if (costureira_nome) { // Se for admin e um filtro de costureira for aplicado
                queryParams.push(costureira_nome);
                conditions.push(`costureira_nome = $${queryParams.length}`);
            }

            if (mes_pagamento) {
                // Validar formato YYYY-MM
                if (!/^\d{4}-\d{2}$/.test(mes_pagamento)) {
                    return res.status(400).json({ error: "Formato de 'mes_pagamento' inválido. Use YYYY-MM." });
                }
                const [ano, mes] = mes_pagamento.split('-');
                queryParams.push(parseInt(ano));
                conditions.push(`EXTRACT(YEAR FROM data_pagamento_efetivo) = $${queryParams.length}`);
                queryParams.push(parseInt(mes));
                conditions.push(`EXTRACT(MONTH FROM data_pagamento_efetivo) = $${queryParams.length}`);
            }

            if (conditions.length > 0) {
                queryText += ' WHERE ' + conditions.join(' AND ');
            }
            queryText += ' ORDER BY data_pagamento_efetivo DESC, criado_em DESC'; // Mais recentes primeiro

            console.log('[api/comissoes-pagas GET] Query:', queryText, 'Params:', queryParams);

            const result = await pool.query(queryText, queryParams);
            res.status(200).json(result.rows);

        } else {
            res.setHeader('Allow', ['GET', 'POST']);
            res.status(405).end(`Método ${method} não permitido`);
        }

    } catch (error) {
        console.error('[api/comissoes-pagas] Erro geral no handler:', {
            message: error.message,
            statusCode: error.statusCode,
            stack: error.stack, // Útil para debugging
        });
        res.status(error.statusCode || 500).json({ error: error.message || 'Erro interno no servidor.' });
    }
}