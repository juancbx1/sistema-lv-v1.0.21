import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

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
            const query = `
                INSERT INTO produtos (nome, sku, gtin, unidade, estoque, imagem, tipos, variacoes, estrutura, etapas, grade, is_kit)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
                    is_kit = EXCLUDED.is_kit
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
                produto.isKit || false
            ];
            console.log('Salvando produto:', produto);
            const result = await pool.query(query, values);
            console.log('Produto salvo com sucesso:', result.rows[0]);
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