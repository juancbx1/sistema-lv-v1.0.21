// api/login.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

console.log('POSTGRES_URL:', process.env.POSTGRES_URL);

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  // Considere adicionar configurações de SSL se o NeonDB exigir e não estiver globalmente configurado
  // ssl: {
  //   rejectUnauthorized: false // Ou true, dependendo da configuração do NeonDB
  // }
});

const SECRET_KEY = process.env.JWT_SECRET;
console.log('[api/login] SECRET_KEY:', SECRET_KEY ? 'Definida' : 'NÃO DEFINIDA!'); // Verifica se a chave secreta está carregada


export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { nomeUsuario, senha } = req.body;

  if (!nomeUsuario || !senha) {
    return res.status(400).json({ error: 'Nome de usuário e senha são obrigatórios.' });
  }

  let clienteDb; // Variável para o cliente do pool

  try {
    clienteDb = await pool.connect(); // Pega uma conexão do pool
    console.log(`[api/login] Buscando usuário: ${nomeUsuario}`);
    const result = await clienteDb.query('SELECT id, nome, nome_usuario, email, senha, tipos, permissoes, nivel FROM usuarios WHERE nome_usuario = $1', [nomeUsuario]);
    const usuario = result.rows[0];

    if (!usuario) {
      console.log(`[api/login] Usuário não encontrado: ${nomeUsuario}`);
      return res.status(401).json({ error: 'Usuário não encontrado ou senha incorreta.' }); // Mensagem mais genérica por segurança
    }

    console.log(`[api/login] Usuário encontrado: ${usuario.nome_usuario}, comparando senha...`);
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      console.log(`[api/login] Senha incorreta para usuário: ${nomeUsuario}`);
      return res.status(401).json({ error: 'Usuário não encontrado ou senha incorreta.' });
    }

    console.log(`[api/login] Login bem-sucedido para: ${nomeUsuario}. Gerando token...`);
    // Payload do Token:
    // Incluímos 'id', 'nome_usuario', 'tipos', e o mais importante para nosso caso, 'nome'.
    // As 'permissoes' individuais do usuário (da coluna 'permissoes') também são incluídas.
    // As permissões totais (baseadas em tipo + individuais) serão calculadas no backend quando necessário (ex: getPermissoesCompletasUsuarioDB).
    const payload = {
      id: usuario.id,
      nome_usuario: usuario.nome_usuario, // Mantido para compatibilidade, se usado em outro lugar
      nome: usuario.nome,                 // << ADICIONADO: Nome completo do usuário
      tipos: usuario.tipos || [],         // Garante que é um array
      // Não é estritamente necessário incluir 'permissoes' (individuais) aqui se getPermissoesCompletasUsuarioDB
      // sempre busca do banco. Mas se você já tem e usa, pode manter.
      // Para ser consistente com getPermissoesCompletasUsuarioDB, que busca tudo do DB,
      // poderíamos omitir 'permissoes' e 'tipos' do token e sempre buscar no backend.
      // Mas por ora, vamos manter o que você tem e adicionar 'nome'.
      permissoes_individuais: usuario.permissoes || [], // Renomeado para clareza, se você mantiver
    };
    console.log('[api/login] Payload do token a ser gerado:', payload);

    const token = jwt.sign(
      payload,
      SECRET_KEY,
      { expiresIn: '24h' } // 24 horas de validade
    );

    // Não retornamos o objeto usuário completo aqui, apenas o token.
    // O frontend fará uma chamada a /api/usuarios/me para obter os detalhes do usuário
    // e lá as permissões completas serão calculadas e retornadas.
    res.status(200).json({ token });

  } catch (error) {
    console.error('[api/login] Erro durante o processo de login:', error.message, error.stack ? error.stack.substring(0, 300) : '');
    res.status(500).json({ error: 'Erro interno no servidor durante o login.' });
  } finally {
    if (clienteDb) {
      clienteDb.release(); // Libera a conexão de volta para o pool
      console.log('[api/login] Conexão com DB liberada.');
    }
  }
};