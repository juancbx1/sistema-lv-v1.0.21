// api/upload.js
import { put } from '@vercel/blob';
import express from 'express';

const router = express.Router();

// Função para converter o stream da requisição em um buffer
async function streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// A rota POST que agora recebe o arquivo de verdade
router.post('/', async (req, res) => {
    const filename = req.headers['x-filename']; // O nome do arquivo virá em um header

    if (!filename) {
        return res.status(400).json({ error: 'O header "x-filename" é obrigatório.' });
    }

    try {
        // Converte o corpo da requisição (que é o arquivo) em um buffer
        const fileBuffer = await streamToBuffer(req);

        // Faz o upload do buffer para o Vercel Blob
        const blob = await put(filename, fileBuffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
        });

        // Retorna o objeto do blob com a URL final
        return res.status(200).json(blob);

    } catch (error) {
        console.error("ERRO NA API DE UPLOAD (FINAL):", error.message);
        return res.status(500).json({ error: `Falha no upload do arquivo: ${error.message}` });
    }
});

export default router;