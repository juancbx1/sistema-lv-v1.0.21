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
        kit_produto_id, // ID do produto kit que está sendo montado
        kit_nome,       // Nome do kit (para logs, observações e fallback)
        kit_variante,
        quantidade_kits_montados,
        componentes_consumidos_de_arremates
    } = req.body;
    let dbCliente;

    console.log('[API /kits/montar] Recebido:', JSON.stringify(req.body, null, 2));

    try {
        dbCliente = await pool.connect();
        
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        if (!permissoesCompletas.includes('montar-kit')) {
            return res.status(403).json({ error: 'Permissão negada para montar kits.' });
        }

        // Validações de entrada
        if ((!kit_produto_id && !kit_nome) || quantidade_kits_montados === undefined || quantidade_kits_montados <= 0) {
            return res.status(400).json({ error: 'Dados inválidos: kit_produto_id (ou kit_nome), e quantidade_kits_montados (>0) são obrigatórios.' });
        }
        if (!componentes_consumidos_de_arremates || !Array.isArray(componentes_consumidos_de_arremates) || componentes_consumidos_de_arremates.length === 0) {
            return res.status(400).json({ error: 'Nenhum componente especificado para consumo na montagem do kit.' });
        }

        let final_kit_produto_id = kit_produto_id ? parseInt(kit_produto_id) : null;
        let final_kit_nome_para_log = kit_nome; // Usar o nome recebido para o log, se disponível

        // Se kit_produto_id não veio, mas kit_nome sim, tenta buscar o ID
        if (!final_kit_produto_id && kit_nome) {
            console.log(`[API /kits/montar] Buscando ID do kit pelo nome: "${kit_nome}"`);
            const produtoKitResult = await dbCliente.query('SELECT id FROM produtos WHERE nome = $1 AND is_kit = TRUE LIMIT 1', [kit_nome]);
            if (produtoKitResult.rows.length > 0) {
                final_kit_produto_id = produtoKitResult.rows[0].id;
            } else {
                return res.status(404).json({ error: `Produto kit com nome "${kit_nome}" não encontrado ou não é um kit.` });
            }
        } else if (!final_kit_produto_id) { // Se nem ID nem nome vieram (já coberto pela validação inicial, mas como dupla checagem)
            return res.status(400).json({ error: 'Identificação do kit (ID ou Nome) não fornecida.' });
        }

        // Se o nome do kit não veio, mas o ID sim, busca o nome para usar em logs e observações
        if (!final_kit_nome_para_log && final_kit_produto_id) {
            const produtoKitInfo = await dbCliente.query('SELECT nome FROM produtos WHERE id = $1 LIMIT 1', [final_kit_produto_id]);
            if (produtoKitInfo.rows.length > 0) {
                final_kit_nome_para_log = produtoKitInfo.rows[0].nome;
            } else {
                // Isso indicaria um ID inválido fornecido pelo frontend
                return res.status(404).json({ error: `Produto kit com ID "${final_kit_produto_id}" não encontrado.` });
            }
        }

        await dbCliente.query('BEGIN');

        for (const componente of componentes_consumidos_de_arremates) {
            const { id_arremate, produto_id: comp_produto_id, produto_nome: comp_produto_nome, variacao: comp_variacao, quantidade_usada } = componente;
            
            if (!id_arremate || !quantidade_usada || quantidade_usada <= 0) {
                await dbCliente.query('ROLLBACK');
                return res.status(400).json({ error: `Componente com dados inválidos no payload: ${JSON.stringify(componente)}`});
            }
            const arremateResult = await dbCliente.query(
                'SELECT id, quantidade_arrematada, quantidade_ja_embalada FROM arremates WHERE id = $1 FOR UPDATE',
                [id_arremate]
            );
            if (arremateResult.rows.length === 0) {
                await dbCliente.query('ROLLBACK');
                return res.status(404).json({ error: `Arremate de origem (ID: ${id_arremate}) não encontrado para o componente "${comp_produto_nome || comp_produto_id}" - "${comp_variacao}".` });
            }
            const arremate = arremateResult.rows[0];
            const saldoAtual = arremate.quantidade_arrematada - arremate.quantidade_ja_embalada;
            if (saldoAtual < quantidade_usada) {
                await dbCliente.query('ROLLBACK');
                return res.status(400).json({ error: `Saldo insuficiente no arremate ${id_arremate} para o componente "${comp_produto_nome || comp_produto_id}" - "${comp_variacao}". Saldo: ${saldoAtual}, Necessário: ${quantidade_usada}.` });
            }
            await dbCliente.query(
                'UPDATE arremates SET quantidade_ja_embalada = quantidade_ja_embalada + $1 WHERE id = $2',
                [quantidade_usada, id_arremate]
            );
        }

        // Inserir na tabela estoque_movimentos usando final_kit_produto_id
        await dbCliente.query(
            `INSERT INTO estoque_movimentos (
                produto_id, variante_nome, quantidade, tipo_movimento, 
                data_movimento, usuario_responsavel, observacao
            ) VALUES ($1, $2, $3, $4, NOW(), $5, $6);`,
            [
                final_kit_produto_id,
                kit_variante || null,
                quantidade_kits_montados,
                'ENTRADA_PRODUCAO_KIT_MONTADO',
                (usuarioLogado.nome || 'Sistema'),
                `Montagem de ${quantidade_kits_montados} kit(s) "${final_kit_nome_para_log}" (${kit_variante || 'Padrão'})`
            ]
        );
        
        // Inserir na tabela log_montagem_kits (mantendo kit_nome por enquanto)
        await dbCliente.query(
            `INSERT INTO log_montagem_kits (kit_nome, kit_variante, quantidade_montada, data_montagem, usuario_id, usuario_nome)
             VALUES ($1, $2, $3, NOW(), $4, $5);`,
            [
                final_kit_nome_para_log, // Usa o nome do kit aqui
                kit_variante || null,
                quantidade_kits_montados,
                usuarioLogado.id,
                (usuarioLogado.nome || 'Sistema')
            ]
        );

        await dbCliente.query('COMMIT');
        res.status(200).json({ message: `${quantidade_kits_montados} kit(s) "${final_kit_nome_para_log}" montado(s) e registrado(s) com sucesso!` });

    } catch (error) {
        if (dbCliente) {
            try { await dbCliente.query('ROLLBACK'); console.log('[API /kits/montar] ROLLBACK executado.'); }
            catch (rollbackError) { console.error('[API /kits/montar] Erro no ROLLBACK:', rollbackError); }
        }
        console.error('[API /kits/montar] Erro:', error.message, error.stack ? error.stack.substring(0,500):"");
        res.status(error.statusCode || 400).json({ error: error.message || 'Erro ao montar kits.' });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;