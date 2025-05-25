// api/kits.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
    console.error('[router/kits] ERRO CRÍTICO: JWT_SECRET não está definida!');
}

// Função verificarToken (Reutilizada - idealmente seria um módulo compartilhado)
const verificarTokenInterna = (reqOriginal) => {
    const authHeader = reqOriginal.headers.authorization;
    if (!authHeader) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401;
        throw error;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        const error = new Error('Token mal formatado');
        error.statusCode = 401;
        throw error;
    }
    try {
        return jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
    } catch (error) {
        console.error('[router/kits - verificarTokenInterna] Erro ao verificar token:', error.message);
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};

// Middleware para este router: autenticação e conexão com banco
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/kits] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenInterna(req);
        console.log('[router/kits middleware] Usuário autenticado:', req.usuarioLogado.nome);

        // Permissão específica para montar kits (você pode ajustar 'montar-kit')
        if (!req.usuarioLogado.permissoes || !req.usuarioLogado.permissoes.includes('montar-kit')) {
            console.warn(`[router/kits middleware] Permissão 'montar-kit' negada para ${req.usuarioLogado.nome}`);
            const err = new Error('Permissão negada para montar kits.');
            err.statusCode = 403;
            throw err;
        }

        cliente = await pool.connect();
        req.dbCliente = cliente;
        console.log('[router/kits middleware] Conexão com o banco estabelecida.');
        next();
    } catch (error) {
        console.error('[router/kits middleware] Erro:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// POST /api/kits/montar
router.post('/montar', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    const {
        kit_nome,
        kit_variante,
        quantidade_kits_montados,
        componentes_consumidos_de_arremates // ARRAY DE OBJETOS: { id_arremate, produto, variante, quantidade_usada }
    } = req.body;

    console.log('[router/kits POST /montar] Dados recebidos:', JSON.stringify(req.body, null, 2));

    // Validação inicial
    if (!kit_nome || !quantidade_kits_montados || !componentes_consumidos_de_arremates || !Array.isArray(componentes_consumidos_de_arremates) || quantidade_kits_montados <= 0) {
        return res.status(400).json({ error: 'Dados inválidos para montar kit.' });
    }
    if (componentes_consumidos_de_arremates.length === 0) {
        return res.status(400).json({ error: 'Nenhum componente especificado para consumo.' });
    }

    try {
        await dbCliente.query('BEGIN'); // INICIA A TRANSAÇÃO

        // 1. Consumir componentes dos arremates (Atualizar quantidade_ja_embalada)
        for (const componente of componentes_consumidos_de_arremates) {
            const { id_arremate, produto, variante, quantidade_usada } = componente;

            if (!id_arremate || !quantidade_usada || quantidade_usada <= 0) {
                throw new Error('Componente com dados inválidos: id_arremate ou quantidade_usada ausente/inválido.');
            }

            // Busca o arremate para verificar o saldo e bloquear a linha
            // FOR UPDATE garante que ninguém mais atualize essa linha ao mesmo tempo
            const arremateResult = await dbCliente.query(
                'SELECT id, quantidade_arrematada, quantidade_ja_embalada FROM arremates WHERE id = $1 FOR UPDATE',
                [id_arremate]
            );

            if (arremateResult.rows.length === 0) {
                throw new Error(`Arremate de origem (ID: ${id_arremate}) não encontrado para o componente "${produto}" - "${variante}".`);
            }

            const arremate = arremateResult.rows[0];
            const saldoAtual = arremate.quantidade_arrematada - arremate.quantidade_ja_embalada;

            if (saldoAtual < quantidade_usada) {
                throw new Error(`Saldo insuficiente no arremate ${id_arremate} para o componente "${produto}" - "${variante}". Saldo: ${saldoAtual}, Necessário: ${quantidade_usada}.`);
            }

            // Atualiza a quantidade_ja_embalada no registro de arremate
            await dbCliente.query(
                'UPDATE arremates SET quantidade_ja_embalada = quantidade_ja_embalada + $1 WHERE id = $2',
                [quantidade_usada, id_arremate]
            );
            console.log(`[router/kits POST /montar] Consumido ${quantidade_usada} de ${produto} (${variante}) do arremate ${id_arremate}.`);
        }

        // 2. Registrar o kit montado como entrada no estoque (opcional, dependendo do seu estoque)
        // Se você tem uma tabela de estoque consolidado de produtos (não de arremates), adicione aqui:
        // Exemplo (adapte para sua estrutura de estoque):
        try {
            // Supondo uma tabela 'estoque' com (produto_nome, variante_nome, quantidade)
            // Se não existir, crie-a ou adapte a lógica para onde seu estoque final vai
            await dbCliente.query(
                `INSERT INTO estoque_movimentos (
                    produto_nome, 
                    variante_nome, 
                    quantidade, 
                    tipo_movimento, 
                    data_movimento,
                    usuario_responsavel,
                    observacao
                    -- Se você quiser rastrear de qual(is) arremate(s) os componentes vieram,
                    -- precisaria de uma coluna JSONB ou array no estoque_movimentos, ou uma tabela de ligação.
                    -- Por simplicidade, para o kit, vamos considerar a origem 'KIT_MONTADO'.
                )
                VALUES ($1, $2, $3, $4, NOW(), $5, $6);`,
                [
                    kit_nome,
                    kit_variante || null,
                    quantidade_kits_montados,
                    'ENTRADA_PRODUCAO_KIT_MONTADO', // Novo tipo de movimento para kits
                    usuarioLogado.nome, // Nome do usuário que montou o kit
                    `Montagem de ${quantidade_kits_montados} kit(s) ${kit_nome} (${kit_variante || 'Padrão'})` // Observação
                ]
            );
            console.log(`[router/kits POST /montar] ${quantidade_kits_montados} kits "${kit_nome}" (${kit_variante || 'Padrão'}) registrados em estoque_movimentos.`);
        } catch (stockError) {
            console.error('[router/kits POST /montar] Erro ao registrar kit no estoque_movimentos:', stockError.message);
            // É crucial relançar o erro para que a transação seja desfeita (ROLLBACK)
            throw new Error(`Erro ao registrar kit no estoque: ${stockError.message}`);
        }

        // 3. Opcional: Registrar um log de montagem de kit (para auditoria)
        // Se você tem uma tabela 'log_montagem_kits' com (kit_nome, kit_variante, quantidade_montada, data, usuario_montador)
        await dbCliente.query(
            `INSERT INTO log_montagem_kits (kit_nome, kit_variante, quantidade_montada, data_montagem, usuario_id, usuario_nome)
             VALUES ($1, $2, $3, NOW(), $4, $5);`,
            [kit_nome, kit_variante || null, quantidade_kits_montados, usuarioLogado.id, usuarioLogado.nome]
        );
        console.log(`[router/kits POST /montar] Log de montagem de kit registrado.`);

        await dbCliente.query('COMMIT'); // FINALIZA A TRANSAÇÃO COM SUCESSO

        res.status(200).json({ message: `${quantidade_kits_montados} kit(s) "${kit_nome}" montado(s) e registrado(s) com sucesso!` });

    } catch (error) {
        await dbCliente.query('ROLLBACK'); // DESFAZ TUDO EM CASO DE ERRO
        console.error('[router/kits POST /montar] Erro na transação de montagem de kit:', error.message, error.stack);
        res.status(400).json({ error: error.message || 'Erro ao montar kits.' });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;