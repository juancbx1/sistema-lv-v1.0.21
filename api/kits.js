// api/kits.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importar a função de buscar permissões completas
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; 

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
    console.error('[router/kits] ERRO CRÍTICO: JWT_SECRET não está definida!');
}

// Função verificarTokenInterna
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
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        return decoded;
    } catch (error) {
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};

// Middleware para este router: Apenas autentica o token.
router.use(async (req, res, next) => {
    try {
        req.usuarioLogado = verificarTokenInterna(req);
        next();
    } catch (error) {
        console.error('[router/kits MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// POST /api/kits/montar
router.post('/montar', async (req, res) => {
    const { usuarioLogado } = req; 
    const {
        kit_nome, kit_variante, quantidade_kits_montados,
        componentes_consumidos_de_arremates
    } = req.body;
    let dbCliente; // Declarado aqui

    try {
        dbCliente = await pool.connect(); // ***** CORREÇÃO: CONECTAR AO BANCO *****
        
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        // console.log(`[API Kits POST /montar] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('montar-kit')) {
            // console.warn(`[router/kits POST /montar] Permissão 'montar-kit' negada para ${usuarioLogado.nome || usuarioLogado.nome_usuario}.`);
            return res.status(403).json({ error: 'Permissão negada para montar kits.' });
        }

        // console.log('[router/kits POST /montar] Dados recebidos:', JSON.stringify(req.body, null, 2));

        if (!kit_nome || !quantidade_kits_montados || !componentes_consumidos_de_arremates || !Array.isArray(componentes_consumidos_de_arremates) || quantidade_kits_montados <= 0) {
            return res.status(400).json({ error: 'Dados inválidos para montar kit (kit_nome, quantidade_kits_montados > 0, componentes_consumidos_de_arremates são obrigatórios).' });
        }
        if (componentes_consumidos_de_arremates.length === 0 && quantidade_kits_montados > 0) {
            return res.status(400).json({ error: 'Nenhum componente especificado para consumo na montagem do kit.' });
        }

        await dbCliente.query('BEGIN');

        for (const componente of componentes_consumidos_de_arremates) {
            const { id_arremate, produto, variante, quantidade_usada } = componente;
            if (!id_arremate || !quantidade_usada || quantidade_usada <= 0) {
                // Importante: Rollback antes de lançar o erro se a transação já começou
                await dbCliente.query('ROLLBACK');
                throw new Error(`Componente com dados inválidos no payload: ${JSON.stringify(componente)}`);
            }
            const arremateResult = await dbCliente.query(
                'SELECT id, quantidade_arrematada, quantidade_ja_embalada FROM arremates WHERE id = $1 FOR UPDATE',
                [id_arremate]
            );
            if (arremateResult.rows.length === 0) {
                await dbCliente.query('ROLLBACK');
                throw new Error(`Arremate de origem (ID: ${id_arremate}) não encontrado para o componente "${produto}" - "${variante}".`);
            }
            const arremate = arremateResult.rows[0];
            const saldoAtual = arremate.quantidade_arrematada - arremate.quantidade_ja_embalada;
            if (saldoAtual < quantidade_usada) {
                await dbCliente.query('ROLLBACK');
                throw new Error(`Saldo insuficiente no arremate ${id_arremate} para o componente "${produto}" - "${variante}". Saldo: ${saldoAtual}, Necessário: ${quantidade_usada}.`);
            }
            await dbCliente.query(
                'UPDATE arremates SET quantidade_ja_embalada = quantidade_ja_embalada + $1 WHERE id = $2',
                [quantidade_usada, id_arremate]
            );
        }

        await dbCliente.query(
            `INSERT INTO estoque_movimentos (
                produto_nome, variante_nome, quantidade, tipo_movimento, 
                data_movimento, usuario_responsavel, observacao
            ) VALUES ($1, $2, $3, $4, NOW(), $5, $6);`,
            [
                kit_nome, kit_variante || null, quantidade_kits_montados,
                'ENTRADA_PRODUCAO_KIT_MONTADO', 
                (usuarioLogado.nome || usuarioLogado.nome_usuario),
                `Montagem de ${quantidade_kits_montados} kit(s) ${kit_nome} (${kit_variante || 'Padrão'})`
            ]
        );
        
        await dbCliente.query(
            `INSERT INTO log_montagem_kits (kit_nome, kit_variante, quantidade_montada, data_montagem, usuario_id, usuario_nome)
             VALUES ($1, $2, $3, NOW(), $4, $5);`,
            [kit_nome, kit_variante || null, quantidade_kits_montados, usuarioLogado.id, (usuarioLogado.nome || usuarioLogado.nome_usuario)]
        );

        await dbCliente.query('COMMIT');
        res.status(200).json({ message: `${quantidade_kits_montados} kit(s) "${kit_nome}" montado(s) e registrado(s) com sucesso!` });

    } catch (error) {
        // Se o dbClient foi conectado e um erro ocorreu (que não foi um rollback já feito), faz o rollback
        if (dbCliente && !res.headersSent) { // Verifica se os headers já foram enviados para evitar erro de "Can't set headers after they are sent."
            try {
                await dbCliente.query('ROLLBACK');
                console.log('[router/kits POST /montar] ROLLBACK executado devido a erro.');
            } catch (rollbackError) {
                console.error('[router/kits POST /montar] Erro ao tentar executar ROLLBACK:', rollbackError);
            }
        }
        console.error('[router/kits POST /montar] Erro na transação:', error.message, error.stack ? error.stack.substring(0,500):"");
        // Só envia resposta se não foi enviada ainda
        if (!res.headersSent) {
            res.status(400).json({ error: error.message || 'Erro ao montar kits.' });
        }
    } finally {
        if (dbCliente) {
            dbCliente.release();
            // console.log('[router/kits POST /montar] Cliente DB liberado.');
        }
    }
});

export default router;