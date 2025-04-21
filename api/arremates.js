import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

console.log('[api/arremates] Iniciando carregamento do módulo...');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    // O SSL é geralmente necessário para o Neon, pode já estar configurado via variável de ambiente
    // ssl: {
    //     rejectUnauthorized: false // Pode ser necessário dependendo da configuração do Neon/Vercel
    // },
    timezone: 'UTC', // Boa prática manter UTC no banco
});

const SECRET_KEY = process.env.JWT_SECRET;
// Verifique se a chave secreta está carregada
if (!SECRET_KEY) {
    console.error('[api/arremates] ERRO CRÍTICO: JWT_SECRET não está definida nas variáveis de ambiente!');
}

// Função para verificar o token JWT (igual à sua)
const verificarToken = (req) => {
    console.log('[api/arremates - verificarToken] Verificando token...');
    const token = req.headers.authorization?.split(' ')[1];
    // console.log('[api/arremates - verificarToken] Token extraído:', token); // Comente se for muito verboso
    if (!token) throw new Error('Token não fornecido');
    try {
        // Use { ignoreExpiration: false } para garantir que tokens expirados sejam rejeitados
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        // console.log('[api/arremates - verificarToken] Token decodificado:', decoded); // Comente se for muito verboso
        return decoded;
    } catch (error) {
        console.error('[api/arremates - verificarToken] Erro ao verificar token:', error.message);
        // Diferencia erro de expiração de outros erros
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expirado');
        } else if (error.name === 'JsonWebTokenError') {
            throw new Error('Token inválido');
        } else {
            throw error; // Outro erro
        }
    }
};

export default async function handler(req, res) {
    console.log('[api/arremates] Requisição recebida:', req.method, req.url);
    const { method } = req;

    try {
        // 1. Verificar Autenticação e Permissões
        const usuarioLogado = verificarToken(req);
        console.log('[api/arremates] Usuário autenticado:', usuarioLogado.nome);

        // Verifica permissão GERAL de acesso a esta área
        if (!usuarioLogado.permissoes || !usuarioLogado.permissoes.includes('acesso-embalagem-de-produtos')) {
             console.warn(`[api/arremates] Permissão 'acesso-embalagem-de-produtos' negada para ${usuarioLogado.nome}`);
             return res.status(403).json({ error: 'Permissão negada para acessar esta funcionalidade.' });
        }


        // 2. Rotear por Método HTTP
        if (method === 'POST') {
            // --- Criar um novo registro de Arremate ---
            console.log('[api/arremates] Processando POST...');

            // Verifica permissão específica para lançar arremate
            // Crie essa permissão no seu sistema se ainda não existir!
            if (!usuarioLogado.permissoes.includes('lancar-arremate')) {
                console.warn(`[api/arremates] Permissão 'lancar-arremate' negada para ${usuarioLogado.nome}`);
                return res.status(403).json({ error: 'Permissão negada para lançar arremate.' });
            }

            // Extrair dados do corpo da requisição
            const {
                op_numero,
                op_edit_id, // Recebe opcionalmente
                produto,
                variante,
                quantidade_arrematada,
                usuario_tiktik
            } = req.body;
            console.log('[api/arremates] Dados recebidos para POST:', req.body);

            // Validar dados obrigatórios
            if (!op_numero || !produto || !quantidade_arrematada || !usuario_tiktik) {
                console.error('[api/arremates] Dados incompletos para POST:', { op_numero, produto, quantidade_arrematada, usuario_tiktik });
                return res.status(400).json({ error: 'Dados incompletos fornecidos. Campos obrigatórios: op_numero, produto, quantidade_arrematada, usuario_tiktik.' });
            }
            // Validação da quantidade
            const quantidadeNum = parseInt(quantidade_arrematada);
            if (isNaN(quantidadeNum) || quantidadeNum <= 0) {
                 console.error('[api/arremates] Quantidade inválida:', quantidade_arrematada);
                 return res.status(400).json({ error: 'Quantidade arrematada deve ser um número positivo.' });
            }


            // Verificar duplicata? (Opcional, mas pode ser útil)
            // Se um registro para a mesma OP já existe, talvez retornar erro 409
            const checkDuplicate = await pool.query(
                'SELECT id FROM arremates WHERE op_numero = $1',
                [op_numero]
            );

            if (checkDuplicate.rows.length > 0) {
                 console.warn(`[api/arremates] Tentativa de lançar arremate duplicado para OP ${op_numero}. ID existente: ${checkDuplicate.rows[0].id}`);
                 // Você pode decidir retornar um erro ou apenas o registro existente
                 // Retornar erro 409 é mais claro que já foi feito
                 return res.status(409).json({ error: `Arremate para a OP ${op_numero} já foi lançado anteriormente.` });
                 // Alternativa: buscar e retornar o existente
                 // const existingArremate = await pool.query('SELECT * FROM arremates WHERE id = $1', [checkDuplicate.rows[0].id]);
                 // return res.status(200).json(existingArremate.rows[0]);
            }


            // Inserir no banco de dados
            console.log(`[api/arremates] Inserindo arremate para OP ${op_numero}...`);
            const result = await pool.query(
                `INSERT INTO arremates (op_numero, op_edit_id, produto, variante, quantidade_arrematada, usuario_tiktik)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`, // Retorna o registro completo inserido
                [
                    op_numero,
                    op_edit_id || null, // Permite nulo se não fornecido
                    produto,
                    variante || null, // Permite nulo
                    quantidadeNum, // Usa a quantidade validada
                    usuario_tiktik
                ]
            );

            if (result.rows.length === 0) {
                 throw new Error('Falha ao inserir o registro de arremate, nenhum dado retornado.');
            }

            console.log('[api/arremates] Arremate salvo com sucesso:', result.rows[0]);
            res.status(201).json(result.rows[0]); // Retorna 201 Created com o objeto salvo

        } else if (method === 'GET') {
            // --- Buscar registros de Arremate ---
            console.log('[api/arremates] Processando GET...');
            // Permissão já verificada no início

            const { op_numero } = req.query; // Verifica se há filtro por op_numero na URL

            let queryText;
            let queryParams = [];

            if (op_numero) {
                console.log(`[api/arremates] Buscando arremates para OP específica: ${op_numero}`);
                queryText = 'SELECT * FROM arremates WHERE op_numero = $1 ORDER BY data_lancamento DESC';
                queryParams = [String(op_numero)]; // Garante que seja string
            } else {
                console.log('[api/arremates] Buscando todos os arremates...');
                queryText = 'SELECT * FROM arremates ORDER BY data_lancamento DESC';
                // Considere adicionar LIMIT e OFFSET aqui para paginação se a tabela crescer muito
                // const limit = parseInt(req.query.limit) || 50; // Exemplo: padrão 50
                // const page = parseInt(req.query.page) || 1;
                // const offset = (page - 1) * limit;
                // queryText += ` LIMIT $1 OFFSET $2`;
                // queryParams = [limit, offset];
            }

            const result = await pool.query(queryText, queryParams);

            console.log(`[api/arremates] ${result.rows.length} arremates encontrados.`);
            res.status(200).json(result.rows); // Retorna array de resultados

        } else {
            // --- Método não permitido ---
            console.warn(`[api/arremates] Método ${method} não permitido.`);
            res.setHeader('Allow', ['GET', 'POST']); // Informa os métodos válidos
            res.status(405).end(`Método ${method} não permitido`);
        }

    } catch (error) {
        // --- Tratamento de Erros ---
        console.error('[api/arremates] Erro não tratado:', {
            message: error.message,
            stack: error.stack, // Útil para debug no servidor
            url: req.url,
            method: req.method,
            body: req.body, // Cuidado ao logar body em produção (dados sensíveis)
        });

        // Resposta genérica de erro interno
        let statusCode = 500;
        let errorMessage = 'Erro interno no servidor.';

        // Personaliza resposta para erros de token conhecidos
        if (error.message === 'Token não fornecido' || error.message === 'Token inválido') {
            statusCode = 401; // Unauthorized
            errorMessage = error.message;
        } else if (error.message === 'Token expirado') {
            statusCode = 401; // Unauthorized
            errorMessage = error.message;
        }
        // Você pode adicionar mais verificações para erros específicos do DB (ex: pool.query error)

        res.status(statusCode).json({ error: errorMessage, details: error.message });
    }
}