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

// --- Middleware de Autenticação e Conexão (copie de outro router, ex: api/estoque.js) ---
const verificarTokenInterna = (reqOriginal) => {
    // ... (lógica completa de verificação do token)
    console.log('[router/kits - verificarTokenInterna] Verificando token...');
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
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        return decoded;
    } catch (error) {
        console.error('[router/kits - verificarTokenInterna] Erro ao verificar token:', error.message);
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};

router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/kits] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenInterna(req);
        console.log('[router/kits middleware] Usuário autenticado:', req.usuarioLogado.nome);

        if (!req.usuarioLogado.permissoes?.includes('montar-kit')) { // Permissão específica
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
        if (cliente) cliente.release(); // Garante que o cliente é liberado em caso de erro no middleware
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// POST /api/kits/montar - Registrar a montagem de um kit
router.post('/montar', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    const {
        kit_nome,
        kit_variante,
        quantidade_kits_montados,
        componentes_consumidos_de_arremates // Novo nome do campo no payload
    } = req.body;

    if (!kit_nome || !quantidade_kits_montados || quantidade_kits_montados <= 0 || 
        !componentes_consumidos_de_arremates || componentes_consumidos_de_arremates.length === 0) { // Verifica se o array existe e não é vazio
        return res.status(400).json({ error: 'Dados incompletos para montar o kit.' });
    }

    try {
        await dbCliente.query('BEGIN');

        // 1. Atualizar arremates e registrar SAÍDA para TODOS os componentes (vindos de arremates)
        for (const comp of componentes_consumidos_de_arremates) {
            if (!comp.id_arremate || !comp.produto || comp.quantidade_usada <= 0) {
                throw new Error(`Dados inválidos para componente consumido do arremate ID ${comp.id_arremate}.`);
            }
            
            // Segurança: Buscar o arremate
            const arremateAtual = await dbCliente.query(
                'SELECT quantidade_arrematada, quantidade_ja_embalada FROM arremates WHERE id = $1 FOR UPDATE',
                [comp.id_arremate]
            );
            if (arremateAtual.rows.length === 0) throw new Error(`Arremate ID ${comp.id_arremate} não encontrado.`);
            const saldoArremate = arremateAtual.rows[0].quantidade_arrematada - arremateAtual.rows[0].quantidade_ja_embalada;
            if (comp.quantidade_usada > saldoArremate) {
                throw new Error(`Tentativa de usar ${comp.quantidade_usada} do arremate ID ${comp.id_arremate}, mas apenas ${saldoArremate} estão disponíveis.`);
            }

            // Atualiza arremate
            await dbCliente.query(
                'UPDATE arremates SET quantidade_ja_embalada = quantidade_ja_embalada + $1 WHERE id = $2',
                [comp.quantidade_usada, comp.id_arremate]
            );
            
            // Registrar movimento de SAÍDA para o componente
            const varianteCompParaDB = (comp.variante === '' || comp.variante === '-') ? null : comp.variante;
            await dbCliente.query(
                `INSERT INTO estoque_movimentos 
                    (produto_nome, variante_nome, quantidade, tipo_movimento, origem_arremate_id, usuario_responsavel, observacao)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    comp.produto, 
                    varianteCompParaDB, 
                    -comp.quantidade_usada, // Negativo para saída
                    'SAIDA_COMPONENTE_KIT', // Tipo de movimento genérico para componente de kit
                    comp.id_arremate,
                    usuarioLogado.nome,
                    `Usado em ${quantidade_kits_montados}x ${kit_nome} (${kit_variante || 'Padrão'})`
                ]
            );
        }

        // 2. Registrar ENTRADA para o KIT MONTADO
        const varianteKitParaDB = (kit_variante === '' || kit_variante === '-') ? null : kit_variante;
        const kitEntradaResult = await dbCliente.query(
            `INSERT INTO estoque_movimentos
                (produto_nome, variante_nome, quantidade, tipo_movimento, usuario_responsavel, observacao)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [
                kit_nome,
                varianteKitParaDB,
                quantidade_kits_montados,
                'ENTRADA_KIT_MONTADO',
                usuarioLogado.nome,
                `Montagem de ${quantidade_kits_montados} kit(s)`
            ]
        );

        await dbCliente.query('COMMIT');

        console.log(`[router/kits POST /montar] Kit ${kit_nome} montado e registrado com sucesso (nova lógica).`);
        res.status(201).json({
            message: `${quantidade_kits_montados} kit(s) de ${kit_nome} montado(s) com sucesso!`,
            kitEntradaEstoque: kitEntradaResult.rows[0]
        });

    } catch (error) {
        await dbCliente.query('ROLLBACK'); // Desfaz em caso de erro
        console.error(`[router/kits POST /montar] Erro ao montar kit ${kit_nome}:`, error.message, error.stack);
        res.status(error.statusCode || 500).json({ error: 'Erro ao montar kit.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;