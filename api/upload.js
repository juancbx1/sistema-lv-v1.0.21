// api/upload.js
import { put } from '@vercel/blob';
import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET;

// Função para converter o stream da requisição em um buffer
async function streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// A rota POST agora com verificação de autenticação
router.post('/', async (req, res) => {
    // --- INÍCIO DA VERIFICAÇÃO DE AUTENTICAÇÃO ---
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação ausente.' });
        }
        const token = authHeader.split(' ')[1];
        jwt.verify(token, SECRET_KEY); // Apenas verifica se o token é válido
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
    // --- FIM DA VERIFICAÇÃO DE AUTENTICAÇÃO ---

    const filename = req.headers['x-filename'];

    if (!filename) {
        return res.status(400).json({ error: 'O header "x-filename" é obrigatório.' });
    }

    try {
        const fileBuffer = await streamToBuffer(req);

        const blob = await put(filename, fileBuffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
        });

        return res.status(200).json(blob);

    } catch (error) {
        console.error("ERRO NA API DE UPLOAD (FINAL):", error.message);
        return res.status(500).json({ error: `Falha no upload do arquivo: ${error.message}` });
    }
});

export default router;