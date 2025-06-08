// api/cortes.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importar a função de buscar permissões completas
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Verifique o caminho

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarTokenOriginal (mantenha a sua ou use uma centralizada)
const verificarTokenOriginal = (reqOriginal) => {
    const token = reqOriginal.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Token não fornecido');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // console.log('[api/cortes - verificarTokenOriginal] Token decodificado:', decoded);
        return decoded;
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
router.use(async (req, res, next) => {
    try {
        // console.log(`[router/cortes MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenOriginal(req);
        next();
    } catch (error) {
        console.error('[router/cortes MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

router.get('/next-pc-number', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        // A query para encontrar o maior número continua a mesma
        const query = `
            SELECT pn FROM cortes 
            ORDER BY CAST(NULLIF(REGEXP_REPLACE(pn, '[^0-9]', '', 'g'), '') AS INTEGER) DESC
            LIMIT 1;
        `;
        const result = await dbClient.query(query);

        let nextNumber = 10000;
        if (result.rows.length > 0) {
            const lastPn = result.rows[0].pn;
            // Apenas convertemos para número, sem nos preocupar com o prefixo
            const lastNumber = parseInt(lastPn.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(lastNumber) && lastNumber >= 10000) {
                nextNumber = lastNumber + 1;
            } else if (!isNaN(lastNumber) && lastNumber < 10000) {
                // Se o último número for antigo (menor que 10000), pulamos para 10000
                nextNumber = 10000;
            }
        }
        
        // A RESPOSTA AGORA É SÓ O NÚMERO
        res.status(200).json({ nextPC: nextNumber.toString() });

    } catch (error) {
        console.error('[API Cortes GET /next-pc-number] Erro:', error);
        res.status(500).json({ error: 'Erro ao gerar próximo número de PC.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/cortes
router.get('/', async (req, res) => {
    const { usuarioLogado } = req; // Do token
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API Cortes GET /] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        // Permissão para visualizar cortes (geralmente quem acessa OPs ou cria OPs precisa ver cortes)
        // Ajuste estas permissões conforme sua lógica de negócios
        if (!permissoesCompletas.includes('acesso-ordens-de-producao') && 
            !permissoesCompletas.includes('criar-op') &&
            !permissoesCompletas.includes('registrar-corte')) { // Adicionar permissão de quem registra corte
            return res.status(403).json({ error: 'Permissão negada para visualizar cortes.' });
        }

        const { status } = req.query; // Pega o ?status=pendente da URL, se existir

        // 1. A base da nossa instrução para o banco de dados.
        //    Leia como: "Selecione tudo da tabela 'cortes' ONDE o status for DIFERENTE de 'excluido'".
        //    O `$1` é um placeholder. Nós diremos qual valor ele representa em seguida.
        let queryText = 'SELECT * FROM cortes WHERE status != $1';
        
        // 2. O valor para o placeholder `$1`.
        //    Estamos dizendo que a condição `!= $1` significa `!= 'excluido'`.
        let queryParams = ['excluido'];

        // 3. Se o frontend pediu um status específico (ex: 'pendente' ou 'cortados')...
        if (status) {
            // ...adicionamos OUTRA condição à nossa instrução.
            //    Agora ela lê: "... ONDE status != $1 E TAMBÉM status = $2"
            queryText += ' AND status = $2';
            // E adicionamos o valor para o novo placeholder `$2`.
            queryParams.push(status); 
        }

        // 4. Sempre bom ordenar os resultados.
        queryText += ' ORDER BY data DESC';
        
        console.log(`[API Cortes GET] Executando query: "${queryText}" com params:`, queryParams);

        // 5. Executamos a instrução final no banco de dados.
        const result = await dbClient.query(queryText, queryParams);
        
        // 6. Enviamos a resposta (já filtrada!) de volta para o frontend.
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/cortes GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar cortes.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/cortes
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoesCompletas.includes('registrar-corte')) {
            return res.status(403).json({ error: 'Permissão negada para registrar corte.' });
        }

        // Sua lógica de POST original aqui, usando 'dbClient'
        const {
            produto, variante: varianteInput, quantidade, data,
            cortador: cortadorInput, status = 'pendente', // status default se não vier
            op = null, pn: pnInput
        } = req.body;

        if (!produto || quantidade === undefined || !data || !status) {
            return res.status(400).json({ error: 'Dados incompletos: produto, quantidade, data e status são obrigatórios.' });
        }
        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade deve ser um número positivo.' });
        }
        const varianteFinal = (varianteInput === undefined || varianteInput === null || String(varianteInput).trim() === '') ? null : String(varianteInput).trim();
        let cortadorFinal = null;
        if (status !== 'pendente') {
            if (!cortadorInput || String(cortadorInput).trim() === '') {
                return res.status(400).json({ error: 'Cortador é obrigatório para status diferente de "pendente".' });
            }
            cortadorFinal = String(cortadorInput).trim();
        } else {
            if (cortadorInput && String(cortadorInput).trim() !== '') {
                cortadorFinal = String(cortadorInput).trim();
            }
        }

        const MAX_RETRIES = 5;
        let insertedCorte = null;
        let pnGerado;

        if (pnInput && String(pnInput).trim() !== '') {
            pnGerado = String(pnInput).trim();
            try {
                const result = await dbClient.query(
                    `INSERT INTO cortes (pn, produto, variante, quantidade, data, cortador, status, op)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                    [pnGerado, produto, varianteFinal, parsedQuantidade, data, cortadorFinal, status, op]
                );
                insertedCorte = result.rows[0];
            } catch (error) {
                if (error.code === '23505' && error.constraint && error.constraint.endsWith('_pn_key')) {
                    return res.status(409).json({ error: `O PN "${pnGerado}" fornecido já está em uso.`, details: error.detail});
                }
                throw error;
            }
        } else {
            for (let i = 0; i < MAX_RETRIES; i++) {
                pnGerado = Math.floor(1000 + Math.random() * 9000).toString();
                try {
                    const result = await dbClient.query(
                        `INSERT INTO cortes (pn, produto, variante, quantidade, data, cortador, status, op)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                        [pnGerado, produto, varianteFinal, parsedQuantidade, data, cortadorFinal, status, op]
                    );
                    insertedCorte = result.rows[0];
                    break;
                } catch (error) {
                    if (error.code === '23505' && error.constraint && error.constraint.endsWith('_pn_key')) {
                        if (i === MAX_RETRIES - 1) {
                            throw new Error('Não foi possível gerar um PN único após várias tentativas.');
                        }
                    } else {
                        throw error;
                    }
                }
            }
        }
        if (!insertedCorte) {
            throw new Error('Falha ao criar lançamento de corte após retentativas.');
        }
        res.status(201).json(insertedCorte);

    } catch (error) {
        console.error('[router/cortes POST] Erro:', error.message, error.stack ? error.stack.substring(0,500) : "");
        if (error.message.includes('PN único')) {
            res.status(500).json({ error: error.message });
        } else if (error.code === '23505') {
            res.status(409).json({ error: 'Erro de conflito ao criar corte.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro interno ao criar o corte.', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/cortes
router.put('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        const { id, status, cortador, op, quantidade, produto, variante } = req.body;

        // Lógica de permissão para diferentes ações no PUT
        let permissaoConcedida = false;
        if (['cortados', 'verificado', 'usado'].includes(status) && permissoesCompletas.includes('marcar-como-cortado')) {
            permissaoConcedida = true;
        } else if (permissoesCompletas.includes('editar-op')) { // Permissão genérica para outras edições de corte
            permissaoConcedida = true;
        } else if (permissoesCompletas.includes('editar-corte')) { // Se você tiver uma permissão mais específica
             permissaoConcedida = true;
        }
        // Adicione mais 'else if' para outras permissões de edição de corte se necessário

        if (!permissaoConcedida) {
            return res.status(403).json({ error: 'Permissão negada para atualizar este corte ou seu status.' });
        }

        // Sua lógica de PUT original aqui, usando 'dbClient'
        if (!id) {
            return res.status(400).json({ error: 'ID do corte é obrigatório para atualização.' });
        }
        const fieldsToUpdate = [];
        const updateValues = [];
        let paramCount = 1;

        if (status !== undefined) { fieldsToUpdate.push(`status = $${paramCount++}`); updateValues.push(status); }
        if (cortador !== undefined) { fieldsToUpdate.push(`cortador = $${paramCount++}`); updateValues.push(cortador); }
        if (op !== undefined) { fieldsToUpdate.push(`op = $${paramCount++}`); updateValues.push(op); }
        if (quantidade !== undefined) { fieldsToUpdate.push(`quantidade = $${paramCount++}`); updateValues.push(quantidade); }
        if (produto !== undefined) { fieldsToUpdate.push(`produto = $${paramCount++}`); updateValues.push(produto); }
        if (variante !== undefined) { fieldsToUpdate.push(`variante = $${paramCount++}`); updateValues.push(variante === '' ? null : variante); } // Trata variante vazia como null

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'Nenhum campo fornecido para atualização.' });
        }
        updateValues.push(id); // Para o WHERE id = $X
        const queryText = `UPDATE cortes SET ${fieldsToUpdate.join(', ')}, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

        const result = await dbClient.query(queryText, updateValues);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corte não encontrado.' });
        }
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error('[router/cortes PUT] Erro:', error.message, error.stack ? error.stack.substring(0,500) : "");
        res.status(500).json({ error: 'Erro ao atualizar corte', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/cortes
router.delete('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { id } = req.body;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        if (!id) return res.status(400).json({ error: 'ID do corte é obrigatório.' });

        // 1. "Soft delete" do corte e pega seus dados completos
        const result = await dbClient.query(
            `UPDATE cortes SET status = 'excluido' WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'Corte não encontrado.' });

        const corteExcluido = result.rows[0];
        console.log(`[API Cortes DELETE] Corte ID ${corteExcluido.id} (PC: ${corteExcluido.pn}) marcado como 'excluido'.`);
        
        // 2. LÓGICA DE CASCATA
        const opNumeroParaCancelar = corteExcluido.op;

        // LOG DE DEPURAÇÃO CRUCIAL:
        console.log(`[API Cortes DELETE] Verificando cascata. OP associada: ${opNumeroParaCancelar} (Tipo: ${typeof opNumeroParaCancelar})`);

        if (opNumeroParaCancelar) {
            console.log(`[API Cortes DELETE] OP associada encontrada. Cancelando OP #${opNumeroParaCancelar}...`);
            
            const opCancelResult = await dbClient.query(
                `UPDATE ordens_de_producao SET status = 'cancelada' WHERE numero = $1 AND status NOT IN ('finalizado', 'cancelada')`,
                [String(opNumeroParaCancelar)] // Força para string por segurança
            );

            if (opCancelResult.rowCount > 0) {
                console.log(`[API Cortes DELETE] SUCESSO! A OP #${opNumeroParaCancelar} foi cancelada.`);
            } else {
                console.warn(`[API Cortes DELETE] AVISO: A OP #${opNumeroParaCancelar} não foi encontrada ou já estava finalizada/cancelada.`);
            }
        } else {
            console.log(`[API Cortes DELETE] Nenhuma OP associada. Cascata não necessária.`);
        }

        res.status(200).json({ message: 'Corte marcado como excluído.', corte: corteExcluido });

    } catch (error) {
        console.error('[router/cortes DELETE] Erro:', error);
        res.status(500).json({ error: 'Erro interno na exclusão do corte.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.delete('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { id } = req.body;
    let dbClient;

    try {
        dbClient = await pool.connect();
        // ... (sua lógica de permissão continua a mesma)
        
        if (!id) {
            return res.status(400).json({ error: 'ID do corte é obrigatório.' });
        }

        // 1. FAZEMOS O "SOFT DELETE" E PEGAMOS OS DADOS DO CORTE
        const result = await dbClient.query(
            `UPDATE cortes SET status = 'excluido' WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Corte não encontrado para exclusão.' });
        }

        const corteExcluido = result.rows[0];
        console.log(`[API Cortes DELETE] Corte ID ${corteExcluido.id} (PC: ${corteExcluido.pn}) marcado como 'excluido'.`);
        
        // 2. LÓGICA DE CASCATA REFORÇADA
        // A OP associada está no campo `corteExcluido.op`.
        // Vamos verificar se ele existe e não é uma string vazia ou nula.
        const opNumeroParaCancelar = corteExcluido.op;

        if (opNumeroParaCancelar) {
            console.log(`[API Cortes DELETE] Este corte estava associado à OP #${opNumeroParaCancelar}. Iniciando processo de cancelamento da OP...`);
            
            // Query para cancelar a OP associada.
            // A condição `status NOT IN ('finalizado', 'cancelada')` é CRUCIAL para não
            // reabrir ou alterar uma OP que já foi concluída ou cancelada por outro motivo.
            const opCancelResult = await dbClient.query(
                `UPDATE ordens_de_producao 
                 SET status = 'cancelada' 
                 WHERE numero = $1 AND status NOT IN ('finalizado', 'cancelada')`,
                [opNumeroParaCancelar]
            );

            if(opCancelResult.rowCount > 0) {
                console.log(`[API Cortes DELETE] SUCESSO! A OP #${opNumeroParaCancelar} foi cancelada em cascata.`);
            } else {
                console.warn(`[API Cortes DELETE] AVISO: A OP #${opNumeroParaCancelar} associada não foi encontrada para cancelamento ou seu status já era 'finalizado' ou 'cancelada'.`);
            }
        } else {
            console.log(`[API Cortes DELETE] Este corte não tinha uma OP associada. Nenhuma ação em cascata necessária.`);
        }

        // 3. Responde ao frontend com sucesso.
        res.status(200).json({ message: 'Corte marcado como excluído com sucesso.', corte: corteExcluido });

    } catch (error) {
        console.error('[router/cortes DELETE] Erro ao marcar corte como excluído:', error);
        res.status(500).json({ error: 'Erro interno ao processar a exclusão do corte.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


export default router;