export default function handler(req, res) {
    if (req.method === 'POST') {
        const { usuario, senha } = req.body;

        // Exemplo simples de autenticação
        if (usuario === 'admin' && senha === '123') {
            res.status(200).json({ message: 'Login bem-sucedido', tipo: 'admin' });
        } else if (usuario === 'user' && senha === '456') {
            res.status(200).json({ message: 'Login bem-sucedido', tipo: 'user' });
        } else {
            res.status(401).json({ message: 'Credenciais inválidas' });
        }
    } else {
        res.status(405).json({ message: 'Método não permitido' });
    }
}