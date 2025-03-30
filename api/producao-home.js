import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';

console.log('[api/producao-home] Iniciando carregamento do módulo...');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

const SECRET_KEY = process.env.JWT_SECRET;
console.log('[api/producao-home] SECRET_KEY:', SECRET_KEY);

const verificarToken = (req) => {
    console.log('[verificarToken] Cabeçalhos recebidos:', req.headers);
    const token = req.headers.authorization?.split(' ')[1];
    console.log('[verificarToken] Token extraído:', token);
    if (!token) throw new Error('Token não fornecido');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        console.log('[verificarToken] Token decodificado:', decoded);
        return decoded;
    } catch (error) {
        console.error('[verificarToken] Erro ao verificar token:', error.message);
        throw error;
    }
};

export default async function handler(req, res) {
    console.log('[api/producao-home] Requisição recebida:', req.method, req.url);
    const { method } = req;

    try {
        const usuarioLogado = verificarToken(req);
        console.log('[api/producao-home] Usuário logado:', usuarioLogado);

        if (method === 'GET') {
            console.log('[api/producao-home] Processando GET...');
            if (!usuarioLogado.permissoes.includes('acesso-home')) {
                return res.status(403).json({ error: 'Permissão negada' });
            }

            const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
            console.log('[api/producao-home] Buscando produções para o dia:', hoje);

            // Query principal ajustada para LEFT JOIN e sem filtro de tipos
            const result = await pool.query(
                `SELECT p.id, p.op_numero, p.quantidade, p.funcionario, p.data, u.nome, u.tipos 
                 FROM producoes p
                 LEFT JOIN usuarios u ON p.funcionario = u.nome
                 WHERE DATE(p.data AT TIME ZONE 'America/Sao_Paulo') = $1`,
                [hoje]
            );
            console.log('[api/producao-home] Resultado da query:', result.rows);
            console.log('[api/producao-home] Total de registros encontrados:', result.rows.length);

            // Filtra apenas costureiras no backend
            const producoesCostureiras = result.rows.filter(row => 
                row.tipos && Array.isArray(row.tipos) && row.tipos.includes('costureira')
            );
            console.log('[api/producao-home] Produções de costureiras:', producoesCostureiras);
            console.log('[api/producao-home] Nomes das costureiras retornadas:', producoesCostureiras.map(row => row.nome || row.funcionario));

            if (producoesCostureiras.length === 0) {
                console.log('[api/producao-home] Nenhum registro encontrado para costureiras. Verificando produções brutas...');
                const producoesBrutas = await pool.query(
                    `SELECT p.*, u.nome, u.tipos 
                     FROM producoes p
                     LEFT JOIN usuarios u ON p.funcionario = u.nome
                     WHERE DATE(p.data AT TIME ZONE 'America/Sao_Paulo') = $1`,
                    [hoje]
                );
                console.log('[api/producao-home] Produções brutas:', producoesBrutas.rows);
            }

            res.status(200).json(producoesCostureiras);
        } else {
            res.setHeader('Allow', ['GET']);
            res.status(405).end(`Método ${method} não permitido`);
        }
    } catch (error) {
        console.error('[api/producao-home] Erro:', error);
        res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
    }
}