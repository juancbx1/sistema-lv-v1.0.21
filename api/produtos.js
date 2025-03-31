import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET_KEY = process.env.JWT_SECRET;

export default async function handler(req, res) {
    const { method } = req;

    try {
        if (method === 'GET') {
            console.log('Tentando buscar produtos do banco...');
            const result = await pool.query('SELECT * FROM produtos');
            console.log('Produtos buscados com sucesso:', result.rows);
            res.status(200).json(result.rows);
        } else if (method === 'POST') {
            const produto = req.body;
            console.log('[POST] Produto recebido do cliente:', produto);
        
            // Garantir que is_kit seja um booleano
            const isKitValue = produto.isKit === true || produto.tipos && produto.tipos.includes('kits');
        
            const query = `
                INSERT INTO produtos (nome, sku, gtin, unidade, estoque, imagem, tipos, variacoes, estrutura, etapas, grade, is_kit, pontos, pontos_expiracao, pontos_criacao)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (nome)
                DO UPDATE SET
                    sku = EXCLUDED.sku,
                    gtin = EXCLUDED.gtin,
                    unidade = EXCLUDED.unidade,
                    estoque = EXCLUDED.estoque,
                    imagem = EXCLUDED.imagem,
                    tipos = EXCLUDED.tipos,
                    variacoes = EXCLUDED.variacoes,
                    estrutura = EXCLUDED.estrutura,
                    etapas = EXCLUDED.etapas,
                    grade = EXCLUDED.grade,
                    is_kit = EXCLUDED.is_kit,
                    pontos = EXCLUDED.pontos,
                    pontos_expiracao = EXCLUDED.pontos_expiracao,
                    pontos_criacao = EXCLUDED.pontos_criacao
                RETURNING *;
            `;
            const values = [
                produto.nome,
                produto.sku || '',
                produto.gtin || '',
                produto.unidade || '',
                produto.estoque || 0,
                produto.imagem || '',
                JSON.stringify(produto.tipos || []),
                JSON.stringify(produto.variacoes || []),
                JSON.stringify(produto.estrutura || []),
                JSON.stringify(produto.etapas || []),
                JSON.stringify(produto.grade || []),
                isKitValue, // Usar valor explícito
                JSON.stringify(produto.pontos || []),
                produto.pontos_expiracao || null,
                produto.pontos_criacao || new Date().toISOString()
            ];
            console.log('[POST] Valores preparados para a query:', values);
            const result = await pool.query(query, values);
            console.log('[POST] Produto salvo com sucesso:', result.rows[0]);
            res.status(200).json(result.rows[0]);
        } else {
            res.setHeader('Allow', ['GET', 'POST']);
            res.status(405).end(`Método ${method} não permitido`);
        }
    } catch (error) {
        console.error('Erro detalhado na API:', error.message, error.stack);
        res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
    }
}