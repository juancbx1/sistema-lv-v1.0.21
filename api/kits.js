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
        kit_produto_id,
        kit_variante,
        quantidade_kits_montados,
        componentes_consumidos_de_arremates,
        observacao
    } = req.body;
    
    let dbClient;

    try {
        dbClient = await pool.connect();
        
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('lancar-embalagem')) {
            return res.status(403).json({ error: 'Permissão negada para montar kits.' });
        }

        // Validações
        if (!kit_produto_id || !quantidade_kits_montados || quantidade_kits_montados <= 0 || !componentes_consumidos_de_arremates || !Array.isArray(componentes_consumidos_de_arremates) || componentes_consumidos_de_arremates.length === 0) {
            return res.status(400).json({ error: 'Dados para montagem de kit estão incompletos ou inválidos.' });
        }

        await dbClient.query('BEGIN');

        const componentesComSkuParaSalvar = [];

        for (const componente of componentes_consumidos_de_arremates) {
            // <<< CORREÇÃO AQUI: Acessando as propriedades diretamente >>>
            const id_arremate = componente.id_arremate;
            const comp_produto_id = componente.produto_id; // Nome claro da variável
            const comp_variacao = componente.variacao;
            const quantidade_usada = componente.quantidade_usada;
            
            const arremateResult = await dbClient.query('SELECT quantidade_arrematada, quantidade_ja_embalada FROM arremates WHERE id = $1 FOR UPDATE', [id_arremate]);
            if (arremateResult.rows.length === 0) throw new Error(`Arremate de origem (ID: ${id_arremate}) não encontrado.`);
            
            const arremate = arremateResult.rows[0];
            const saldoAtual = arremate.quantidade_arrematada - arremate.quantidade_ja_embalada;
            if (saldoAtual < quantidade_usada) {
                throw new Error(`Saldo insuficiente no arremate ${id_arremate}. Saldo: ${saldoAtual}, Necessário: ${quantidade_usada}.`);
            }
            
        await dbClient.query('UPDATE arremates SET quantidade_ja_embalada = quantidade_ja_embalada + $1 WHERE id = $2', [quantidade_usada, id_arremate]);

            // LÓGICA PARA ENCONTRAR E ADICIONAR O SKU
            let skuComponente = null;
            // Usa a variável correta 'comp_produto_id'
            const produtoComponenteInfo = await dbClient.query('SELECT sku, grade FROM produtos WHERE id = $1', [comp_produto_id]);
            if (produtoComponenteInfo.rows.length > 0) {
                const prod = produtoComponenteInfo.rows[0];
                if (comp_variacao && comp_variacao !== '-') {
                    const gradeInfo = prod.grade?.find(g => g.variacao === comp_variacao);
                    skuComponente = gradeInfo?.sku || prod.sku;
                } else {
                    skuComponente = prod.sku;
                }
                
                componentesComSkuParaSalvar.push({ ...componente, sku: skuComponente });
            } else { 
                throw new Error(`Produto componente com ID ${comp_produto_id} não encontrado.`);
            }
        }

        // Busca o SKU do kit montado
        let skuDoKitMontado = null;
        const infoDoKitMontado = await dbClient.query('SELECT sku, grade FROM produtos WHERE id = $1', [kit_produto_id]);
        if (infoDoKitMontado.rows.length > 0) {
            const kitProd = infoDoKitMontado.rows[0];
            if(kit_variante && kit_variante !== '-') {
                const gradeInfoKit = kitProd.grade?.find(g => g.variacao === kit_variante);
                skuDoKitMontado = gradeInfoKit?.sku || kitProd.sku;
            } else { skuDoKitMontado = kitProd.sku; }
        }
        if (!skuDoKitMontado) {
            throw new Error(`Não foi possível encontrar o SKU para o kit montado (ID: ${kit_produto_id})`);
        }

        // Registra a embalagem
         const embalagemRealizadaQuery = `
            INSERT INTO embalagens_realizadas 
                (tipo_embalagem, produto_embalado_id, variante_embalada_nome, produto_ref_id, quantidade_embalada, 
                usuario_responsavel_id, observacao, status, componentes_consumidos) 
            VALUES ('KIT', $1, $2, $3, $4, $5, $6, 'ATIVO', $7) RETURNING id;
        `;
        const embalagemResult = await dbClient.query(embalagemRealizadaQuery, [
            kit_produto_id, 
            kit_variante || null, 
            skuDoKitMontado, 
            quantidade_kits_montados, 
            usuarioLogado.id, 
            observacao || null, 
            // Salva o JSON que agora contém o SKU de cada componente
            JSON.stringify(componentesComSkuParaSalvar) 
        ]);
        const novaEmbalagemId = embalagemResult.rows[0].id;

        // Registra a entrada no estoque
        await dbClient.query(
        `INSERT INTO estoque_movimentos (produto_id, variante_nome, quantidade, tipo_movimento, usuario_responsavel, observacao) VALUES ($1, $2, $3, 'ENTRADA_KIT', $4, $5);`,
        [
            kit_produto_id,
            kit_variante || null,
            quantidade_kits_montados,
            usuarioLogado.nome,
            `Montagem de kit via embalagem #${novaEmbalagemId}`
        ]
    );
        
        await dbClient.query('COMMIT');
        res.status(200).json({ message: `${quantidade_kits_montados} kit(s) montado(s) com sucesso!` });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /kits/montar] Erro na transação:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao montar kits.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;