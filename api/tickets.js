// api/divergencias.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação para este router
router.use(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação ausente.' });
        }
        const token = authHeader.split(' ')[1];
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
});

// Rota POST /api/divergencias/reportar (EXISTENTE)
router.post('/reportar', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        const {
            id_registro,
            tipo_registro,
            tipo_divergencia, // 'Quantidade', 'Cor/Variação', 'Funcionário Incorreto', 'Outro'
            quantidade_original,
            quantidade_correta_reportada,
            observacao
        } = req.body;

        // 1. Validação dos dados de entrada
        if (!id_registro || !tipo_registro || !tipo_divergencia || !observacao) {
            return res.status(400).json({ error: 'Dados incompletos. ID, tipo de registro, tipo de divergência e observação são obrigatórios.' });
        }
        if (!['producao', 'arremate'].includes(tipo_registro)) {
            return res.status(400).json({ error: "Tipo de registro inválido. Deve ser 'producao' ou 'arremate'." });
        }
        if (!['Quantidade', 'Cor/Variação', 'Funcionário Incorreto', 'Outro'].includes(tipo_divergencia)) {
            return res.status(400).json({ error: "Tipo de divergência inválido." });
        }
        
        // 2. Validação específica para erro de 'Quantidade'
        if (tipo_divergencia === 'Quantidade') {
            if (quantidade_original === undefined || quantidade_correta_reportada === undefined) {
                return res.status(400).json({ error: 'Para divergência de quantidade, as quantidades original e reportada são obrigatórias.' });
            }
            const qtdOriginalNum = parseInt(quantidade_original);
            const qtdCorretaNum = parseInt(quantidade_correta_reportada);
            if (isNaN(qtdOriginalNum) || isNaN(qtdCorretaNum)) {
                return res.status(400).json({ error: 'As quantidades devem ser números válidos.' });
            }
            if (qtdOriginalNum === qtdCorretaNum) {
                return res.status(400).json({ error: 'A quantidade reportada não pode ser igual à original.' });
            }
        }

        dbClient = await pool.connect();
        
        // 3. Segurança: Verificar se o registro pertence ao usuário que está reportando
        let pertenceAoUsuario = false;
        if (tipo_registro === 'producao') {
            const prodResult = await dbClient.query('SELECT funcionario FROM producoes WHERE id = $1', [id_registro]);
            if (prodResult.rows.length > 0 && prodResult.rows[0].funcionario === usuarioLogado.nome) pertenceAoUsuario = true;
        } else if (tipo_registro === 'arremate') {
            const arremateResult = await dbClient.query('SELECT usuario_tiktik FROM arremates WHERE id = $1', [parseInt(id_registro)]);
            if (arremateResult.rows.length > 0 && arremateResult.rows[0].usuario_tiktik === usuarioLogado.nome) pertenceAoUsuario = true;
        }
        if (!pertenceAoUsuario) {
            return res.status(403).json({ error: 'Você não tem permissão para reportar divergência neste item.' });
        }

        // 4. Inserir na tabela log_divergencias
        const idProducao = tipo_registro === 'producao' ? id_registro : null;
        const idArremate = tipo_registro === 'arremate' ? parseInt(id_registro) : null;
        
        const queryText = `
            INSERT INTO log_divergencias (
                id_producao_original, id_arremate_original, id_usuario_reportou, 
                tipo_divergencia,
                quantidade_original, quantidade_sugerida,
                observacao
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`;
        
        const values = [
            idProducao,
            idArremate,
            usuarioLogado.id,
            tipo_divergencia,
            // Passa null se não for um erro de quantidade
            tipo_divergencia === 'Quantidade' ? parseInt(quantidade_original) : null,
            tipo_divergencia === 'Quantidade' ? parseInt(quantidade_correta_reportada) : null,
            observacao
        ];

        const result = await dbClient.query(queryText, values);
        res.status(201).json({ message: 'Divergência reportada com sucesso! O supervisor irá analisar.', divergencia: result.rows[0] });

    } catch (error) {
        console.error('[API /api/divergencias/reportar] Erro na rota:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao reportar divergência.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// NOVA ROTA GET /api/divergencias - Para o admin listar os tickets
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('acesso-conferencia-e-auditoria')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar tickets.' });
        }

        const { status } = req.query;
        
        // Query para buscar DIVERGÊNCIAS
        const divergenciasQuery = `
            SELECT 
                'Divergência'::text as tipo_ticket,
                d.id,
                d.status::text,
                d.data_reporte as data_criacao,
                u_reportou.nome::text as nome_autor,
                d.tipo_divergencia::text as titulo,
                d.observacao::text as conteudo,
                d.id_usuario_resolveu,
                u_resolveu.nome::text as nome_usuario_resolveu,
                d.data_resolucao,
                d.observacao_resolucao::text,
                json_build_object(
                    'nome_produto', COALESCE(p_prod.nome, p_arremate.nome),
                    'op_numero', COALESCE(prod.op_numero, arremate.op_numero),
                    'quantidade_original', d.quantidade_original,
                    'quantidade_sugerida', d.quantidade_sugerida
                ) as detalhes_ticket
            FROM log_divergencias d
            JOIN usuarios u_reportou ON d.id_usuario_reportou = u_reportou.id
            LEFT JOIN usuarios u_resolveu ON d.id_usuario_resolveu = u_resolveu.id
            LEFT JOIN producoes prod ON d.id_producao_original = prod.id
            LEFT JOIN arremates arremate ON d.id_arremate_original = arremate.id
            LEFT JOIN produtos p_prod ON prod.produto_id = p_prod.id
            LEFT JOIN produtos p_arremate ON arremate.produto_id = p_arremate.id
            ${status ? `WHERE d.status = '${status}'` : ''}
        `;
        
        // Query para buscar PONTOS DE ATENÇÃO
        const pontosAtencaoQuery = `
            SELECT 
                'Ponto de Atenção'::text as tipo_ticket,
                c.id,
                'Pendente'::text as status,
                c.data_criacao,
                u.nome::text as nome_autor,
                c.titulo::text,
                c.conteudo::text,
                null::integer as id_usuario_resolveu, -- Especificando o tipo do NULL
                null::text as nome_usuario_resolveu,
                null::timestamptz as data_resolucao,
                null::text as observacao_resolucao,
                json_build_object('imagem_url', c.imagem_url) as detalhes_ticket
            FROM comunicacoes c
            JOIN usuarios u ON c.id_autor = u.id
            WHERE c.tipo_post = 'Ponto de Atenção'
            ${status && status !== 'Pendente' ? 'AND 1=0' : ''}
        `;

        const queryText = `
            SELECT * FROM (${divergenciasQuery}) as divergencias
            UNION ALL
            SELECT * FROM (${pontosAtencaoQuery}) as pontos_atencao
            ORDER BY status, data_criacao DESC;
        `;
        
        const result = await dbClient.query(queryText);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API GET /api/tickets] Erro na rota:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar tickets.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// NOVA ROTA PUT /api/divergencias/:id/status - Para o admin mudar o status do ticket
router.put('/:id/status', async (req, res) => {
    const { usuarioLogado } = req;
    const { id: divergenciaId } = req.params;
    const { novoStatus, observacaoResolucao } = req.body;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('acesso-conferencia-e-auditoria')) {
            return res.status(403).json({ error: 'Permissão negada para alterar status de divergências.' });
        }

        const statusValidos = ['Em Análise', 'Resolvida', 'Recusada'];
        if (!novoStatus || !statusValidos.includes(novoStatus)) {
            return res.status(400).json({ error: `Status inválido. Permitidos: ${statusValidos.join(', ')}.` });
        }
        
        if ((novoStatus === 'Recusada' || novoStatus === 'Resolvida') && (!observacaoResolucao || observacaoResolucao.trim() === '')) {
            return res.status(400).json({ error: `Para '${novoStatus}', a observação (mensagem para o funcionário) é obrigatória.` });
        }

        // INICIA A TRANSAÇÃO
        await dbClient.query('BEGIN');

        // 1. Atualiza o status da divergência
        const updateDivergenciaQuery = `
            UPDATE log_divergencias
            SET status = $1, id_usuario_resolveu = $2, data_resolucao = NOW(), observacao_resolucao = $3
            WHERE id = $4
            RETURNING *;
        `;
        const resultDivergencia = await dbClient.query(updateDivergenciaQuery, [novoStatus, usuarioLogado.id, observacaoResolucao, divergenciaId]);

        if (resultDivergencia.rowCount === 0) {
            throw new Error('Divergência não encontrada.');
        }

        const divergenciaAtualizada = resultDivergencia.rows[0];

        // 2. Se a divergência foi Resolvida ou Recusada, cria um post de comunicação para o funcionário
        if (novoStatus === 'Resolvida' || novoStatus === 'Recusada') {
            const idUsuarioDestinatario = divergenciaAtualizada.id_usuario_reportou;

            // Pega detalhes do item original para compor o título da mensagem
            let detalhesItem = await dbClient.query(`
                SELECT COALESCE(p_prod.nome, p_arremate.nome) as nome_produto
                FROM log_divergencias d
                LEFT JOIN producoes prod ON d.id_producao_original = prod.id
                LEFT JOIN arremates arremate ON d.id_arremate_original = arremate.id
                LEFT JOIN produtos p_prod ON prod.produto_id = p_prod.id
                LEFT JOIN produtos p_arremate ON arremate.produto_id = p_arremate.id
                WHERE d.id = $1
            `, [divergenciaId]);
            
            const nomeProduto = detalhesItem.rows[0]?.nome_produto || 'item reportado';
            
            const tituloComunicacao = `Resposta sobre sua solicitação: ${nomeProduto}`;
            const conteudoComunicacao = observacaoResolucao; // A mensagem do supervisor é o conteúdo

            const insertComunicacaoQuery = `
                INSERT INTO comunicacoes (titulo, conteudo, id_autor, tipo_post, destinatario_id)
                VALUES ($1, $2, $3, 'Resposta Supervisor', $4);
            `;
            await dbClient.query(insertComunicacaoQuery, [tituloComunicacao, conteudoComunicacao, usuarioLogado.id, idUsuarioDestinatario]);
        }

        // CONFIRMA A TRANSAÇÃO
        await dbClient.query('COMMIT');
        
        res.status(200).json({ message: `Status da divergência atualizado e notificação enviada.`, divergencia: divergenciaAtualizada });
        
    } catch (error) {
        // Se der qualquer erro, desfaz a transação inteira
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API PUT /api/divergencias/:id/status] Erro:', error);
        res.status(500).json({ error: error.message || 'Erro interno do servidor ao atualizar status da divergência.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


export default router;