// public/src/components/LoginApp.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { sincronizarPermissoesUsuario } from '/js/utils/auth.js';

// ─── Constantes ──────────────────────────────────────────────────────────────

const FRASES_LOADING = [
  { icone: '🔍', texto: 'Verificando identidade...' },
  { icone: '🧠', texto: 'Analisando perfil de acesso...' },
  { icone: '⚡', texto: 'Sincronizando dados...' },
];

// Cooldown crescente: 30s → 90s → 450s → ... até 4h
function calcularCooldownMs(tentativas) {
  const base = 30_000;
  const maximo = 4 * 60 * 60 * 1000;
  return Math.min(base * Math.pow(3, tentativas - 1), maximo);
}

function formatarTempo(ms) {
  const totalSeg = Math.ceil(ms / 1000);
  const horas = Math.floor(totalSeg / 3600);
  const min = Math.floor((totalSeg % 3600) / 60);
  const seg = totalSeg % 60;
  if (horas > 0) return `${horas}h ${min.toString().padStart(2, '0')}min`;
  if (min > 0) return `${min}min ${seg.toString().padStart(2, '0')}seg`;
  return `${seg}seg`;
}

function salvarBloqueio(nomeUsuario, tentativas) {
  const cooldownMs = calcularCooldownMs(tentativas);
  const bloqueadoAte = Date.now() + cooldownMs;
  localStorage.setItem(
    `demitido_${nomeUsuario.toLowerCase()}`,
    JSON.stringify({ tentativas, bloqueadoAte })
  );
  return bloqueadoAte;
}

function lerBloqueio(nomeUsuario) {
  try {
    const raw = localStorage.getItem(`demitido_${nomeUsuario.toLowerCase()}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function decidirRedirecionamento(usuario) {
  const permissoes = usuario.permissoes || [];
  if (permissoes.includes('acesso-admin-geral')) return '/admin/home.html';
  if (permissoes.includes('acesso-dashboard')) return '/dashboard/dashboard.html';
  return '/admin/acesso-negado.html';
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function LoginApp() {
  // Telas possíveis: 'formulario' | 'loading' | 'despedida'
  const [tela, setTela] = useState('formulario');

  // Formulário
  const [nomeUsuario, setNomeUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [manterConectado, setManterConectado] = useState(false);
  const [erroUsuario, setErroUsuario] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  const [erroGeral, setErroGeral] = useState('');

  // Loading com mensagens de "IA"
  const [faseFrase, setFaseFrase] = useState(0);

  // Microinteração de "identificação" no campo de usuário
  const [mostrando, setMostrando] = useState(false); // "Identificando colaborador..."
  const timerIdent = useRef(null);

  // Despedida
  const [nomeDemitido, setNomeDemitido] = useState('');
  const [cooldownRestante, setCooldownRestante] = useState(0);
  const timerCooldown = useRef(null);

  // Cooldown inline (mostrado no formulário enquanto digita)
  const [cooldownInline, setCooldownInline] = useState(0);
  const timerCooldownInline = useRef(null);

  // ── Auto-login com token salvo ──
  // Token sempre vai para localStorage — a diferença entre "manter conectado" e não
  // é apenas a duração do token (30d vs 8h), não o storage.
  // auth.js das outras páginas só lê localStorage, então sessionStorage causaria loop.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    (async () => {
      try {
        const res = await fetch('/api/usuarios/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          localStorage.removeItem('token');
          return;
        }
        let usuario = await res.json();
        usuario = await sincronizarPermissoesUsuario(usuario);
        localStorage.setItem('permissoes', JSON.stringify(usuario.permissoes || []));
        window.location.href = decidirRedirecionamento(usuario);
      } catch {
        localStorage.removeItem('token');
      }
    })();
  }, []);

  // ── Microinteração "Identificando colaborador..." ──
  useEffect(() => {
    if (timerIdent.current) clearTimeout(timerIdent.current);
    if (nomeUsuario.length >= 3) {
      setMostrando(true);
      timerIdent.current = setTimeout(() => setMostrando(false), 1400);
    } else {
      setMostrando(false);
    }
    return () => clearTimeout(timerIdent.current);
  }, [nomeUsuario]);

  // ── Cooldown inline: detecta bloqueio conforme o usuário digita o username ──
  useEffect(() => {
    if (timerCooldownInline.current) clearInterval(timerCooldownInline.current);

    const bloqueio = lerBloqueio(nomeUsuario);
    if (!bloqueio || bloqueio.bloqueadoAte <= Date.now()) {
      setCooldownInline(0);
      return;
    }

    setCooldownInline(bloqueio.bloqueadoAte - Date.now());
    timerCooldownInline.current = setInterval(() => {
      const b = lerBloqueio(nomeUsuario);
      const restante = b ? b.bloqueadoAte - Date.now() : 0;
      if (restante <= 0) {
        setCooldownInline(0);
        clearInterval(timerCooldownInline.current);
      } else {
        setCooldownInline(restante);
      }
    }, 1000);

    return () => clearInterval(timerCooldownInline.current);
  }, [nomeUsuario]);

  // ── Contador regressivo do cooldown ──
  useEffect(() => {
    if (tela !== 'despedida') return;
    if (timerCooldown.current) clearInterval(timerCooldown.current);

    timerCooldown.current = setInterval(() => {
      const bloqueio = lerBloqueio(nomeDemitido || nomeUsuario);
      if (!bloqueio) { setCooldownRestante(0); return; }
      const restante = bloqueio.bloqueadoAte - Date.now();
      if (restante <= 0) {
        setCooldownRestante(0);
        clearInterval(timerCooldown.current);
      } else {
        setCooldownRestante(restante);
      }
    }, 1000);

    return () => clearInterval(timerCooldown.current);
  }, [tela, nomeDemitido, nomeUsuario]);

  // ── Animação das frases de loading ──
  useEffect(() => {
    if (tela !== 'loading') { setFaseFrase(0); return; }
    setFaseFrase(0);
    const intervalId = setInterval(() => {
      setFaseFrase(f => (f < FRASES_LOADING.length - 1 ? f + 1 : f));
    }, 900);
    return () => clearInterval(intervalId);
  }, [tela]);

  // ── Submit do formulário ──
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setErroUsuario('');
    setErroSenha('');
    setErroGeral('');

    let hasError = false;
    if (!nomeUsuario.trim()) { setErroUsuario('Informe o nome de usuário.'); hasError = true; }
    if (!senha) { setErroSenha('Informe a senha.'); hasError = true; }
    if (hasError) return;

    // Se há cooldown ativo (visível inline), não fazer request
    const bloqueio = lerBloqueio(nomeUsuario);
    if (bloqueio && bloqueio.bloqueadoAte > Date.now()) return;

    setTela('loading');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeUsuario: nomeUsuario.trim(), senha, manterConectado }),
      });

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'CONTRATO_ENCERRADO') {
          const bloqueioAtual = lerBloqueio(nomeUsuario);
          const tentativas = (bloqueioAtual?.tentativas || 0) + 1;
          const bloqueadoAte = salvarBloqueio(nomeUsuario, tentativas);
          setNomeDemitido(data.nome || nomeUsuario);
          setCooldownRestante(bloqueadoAte - Date.now());
          setTela('despedida');
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Erro desconhecido.' }));
        setTela('formulario');
        if (data.error?.includes('nválidas') || data.error?.includes('ncorreta') || data.error?.includes('ncontrado')) {
          setErroSenha('Usuário ou senha incorretos.');
        } else {
          setErroGeral(data.error || 'Erro ao fazer login. Tente novamente.');
        }
        return;
      }

      const { token } = await res.json();

      // Token sempre vai para localStorage (auth.js das outras páginas só lê localStorage).
      // A distinção "manter conectado" é feita pela duração do token no servidor (30d vs 8h).
      localStorage.setItem('token', token);
      if (manterConectado) {
        localStorage.setItem('keepLoggedIn', 'true');
      } else {
        localStorage.removeItem('keepLoggedIn');
      }

      // Buscar permissões e redirecionar
      const meRes = await fetch('/api/usuarios/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) throw new Error('Erro ao carregar perfil.');
      let usuario = await meRes.json();
      usuario = await sincronizarPermissoesUsuario(usuario);
      localStorage.setItem('permissoes', JSON.stringify(usuario.permissoes || []));

      // Fade out antes de redirecionar
      document.getElementById('lv-login-root')?.classList.add('lv-fadeout');
      setTimeout(() => { window.location.href = decidirRedirecionamento(usuario); }, 400);

    } catch (err) {
      console.error('[Login] Erro:', err);
      setTela('formulario');
      setErroGeral('Erro no servidor. Tente novamente em instantes.');
    }
  }, [nomeUsuario, senha, manterConectado]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Tela de Loading
  // ─────────────────────────────────────────────────────────────────────────
  if (tela === 'loading') {
    return (
      <div className="lv-root" id="lv-login-root">
        <TelaDeFundo />
        <div className="lv-card lv-card--loading">
          <div className="lv-loading-spinner">
            <div className="lv-spinner-ring"></div>
            <div className="lv-spinner-ring lv-spinner-ring--2"></div>
          </div>
          <div className="lv-loading-frases">
            {FRASES_LOADING.map((f, i) => (
              <div
                key={i}
                className={`lv-loading-frase ${i === faseFrase ? 'lv-loading-frase--ativa' : i < faseFrase ? 'lv-loading-frase--passada' : ''}`}
              >
                <span className="lv-loading-frase-icone">{f.icone}</span>
                <span>{f.texto}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Tela de Despedida
  // ─────────────────────────────────────────────────────────────────────────
  if (tela === 'despedida') {
    const temCooldown = cooldownRestante > 0;
    return (
      <div className="lv-root" id="lv-login-root">
        <TelaDeFundo />
        <div className="lv-card lv-card--despedida">
          <div className="lv-despedida-icone">
            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              {/* Agulha estilizada com linha */}
              <circle cx="40" cy="40" r="36" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
              <path d="M52 24 L28 56" stroke="#a7f3d0" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="52" cy="24" r="4" fill="#6ee7b7"/>
              <circle cx="52" cy="24" r="2" fill="#fff"/>
              <path d="M28 56 Q22 62 26 64 Q30 66 32 60" stroke="#a7f3d0" strokeWidth="2" strokeLinecap="round" fill="none"/>
              {/* Pequeno coração */}
              <path d="M38 34 C38 32 35 30 33 32 C31 34 33 37 38 40 C43 37 45 34 43 32 C41 30 38 32 38 34Z" fill="#fca5a5" opacity="0.8"/>
            </svg>
          </div>

          <h1 className="lv-despedida-titulo">
            Até logo{nomeDemitido ? `, ${nomeDemitido.split(' ')[0]}` : ''}! 👋
          </h1>

          <p className="lv-despedida-mensagem">
            Seu acesso ao sistema foi encerrado junto com o fim do seu vínculo de trabalho com a{' '}
            <strong>Lojas Variara</strong>. Esperamos que essa fase tenha sido especial pra você!
          </p>

          <p className="lv-despedida-mensagem lv-despedida-mensagem--sub">
            Se precisar de algo — holerites, documentos, qualquer dúvida — é só procurar a gerência.
            Muito obrigado por tudo que fez por aqui. 🌟
          </p>

          {temCooldown && (
            <div className="lv-despedida-cooldown">
              <span className="lv-despedida-cooldown-icone">⏳</span>
              <span>
                Próxima tentativa disponível em{' '}
                <strong>{formatarTempo(cooldownRestante)}</strong>
              </span>
            </div>
          )}

          <button
            className="lv-despedida-outra-conta"
            onClick={() => {
              setNomeUsuario('');
              setSenha('');
              setErroUsuario('');
              setErroSenha('');
              setErroGeral('');
              setTela('formulario');
            }}
          >
            ← Entrar com outra conta
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Formulário de Login
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="lv-root" id="lv-login-root">
      <TelaDeFundo />

      <div className="lv-layout">
        {/* Coluna esquerda — identidade visual (só tablet+) */}
        <div className="lv-identidade" aria-hidden="true">
          <div className="lv-identidade-inner">
            <div className="lv-logo-mark">
              {/* Ícone de agulha/costura estilizado */}
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="30" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
                <path d="M44 16 L20 48" stroke="#6ee7b7" strokeWidth="3" strokeLinecap="round"/>
                <circle cx="44" cy="16" r="5" fill="#34d399"/>
                <circle cx="44" cy="16" r="2.5" fill="#fff"/>
                <path d="M20 48 Q13 55 18 58 Q23 61 25 54" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <path d="M32 28 Q38 22 44 26" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" fill="none" strokeDasharray="3 3"/>
              </svg>
            </div>
            <div className="lv-identidade-nome">
              <span className="lv-identidade-sistema">Sistema</span>
              <span className="lv-identidade-empresa">Lojas Variara</span>
            </div>
            <p className="lv-identidade-tagline">
              Gestão inteligente da produção
            </p>
            <div className="lv-identidade-badges">
              <span className="lv-badge">✦ Costura</span>
              <span className="lv-badge">✦ Arremate</span>
              <span className="lv-badge">✦ Produção</span>
            </div>
          </div>
        </div>

        {/* Coluna direita — formulário */}
        <div className="lv-form-wrap">
          <div className="lv-card">
            {/* Header mobile (só aparece em telas pequenas) */}
            <div className="lv-card-header-mobile">
              <span className="lv-card-header-mobile-nome">Lojas Variara</span>
            </div>

            <h2 className="lv-form-titulo">Entrar no sistema</h2>
            <p className="lv-form-subtitulo">Bem-vindo de volta. Faça seu acesso abaixo.</p>

            <form onSubmit={handleSubmit} noValidate>
              {/* Campo: usuário */}
              <div className={`lv-field ${erroUsuario ? 'lv-field--erro' : ''}`}>
                <label htmlFor="lv-usuario" className="lv-label">Usuário</label>
                <div className="lv-input-wrap">
                  <span className="lv-input-icone lv-input-icone--esquerda">
                    <i className="fas fa-user" aria-hidden="true"></i>
                  </span>
                  <input
                    id="lv-usuario"
                    type="text"
                    className="lv-input lv-input--com-icone"
                    placeholder="Seu nome de usuário"
                    autoComplete="username"
                    value={nomeUsuario}
                    onChange={e => { setNomeUsuario(e.target.value); setErroUsuario(''); }}
                    autoFocus
                  />
                </div>
                {erroUsuario && <span className="lv-erro-msg">{erroUsuario}</span>}
                {/* Microinteração de "IA" */}
                <span className={`lv-ia-hint ${mostrando ? 'lv-ia-hint--visivel' : ''}`}>
                  <span className="lv-ia-dot"></span>
                  Identificando colaborador...
                </span>
              </div>

              {/* Campo: senha */}
              <div className={`lv-field ${erroSenha ? 'lv-field--erro' : ''}`}>
                <label htmlFor="lv-senha" className="lv-label">Senha</label>
                <div className="lv-input-wrap">
                  <span className="lv-input-icone lv-input-icone--esquerda">
                    <i className="fas fa-lock" aria-hidden="true"></i>
                  </span>
                  <input
                    id="lv-senha"
                    type={mostrarSenha ? 'text' : 'password'}
                    className="lv-input lv-input--com-icone lv-input--com-toggle"
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    value={senha}
                    onChange={e => { setSenha(e.target.value); setErroSenha(''); }}
                  />
                  <button
                    type="button"
                    className="lv-toggle-senha"
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setMostrarSenha(v => !v)}
                  >
                    <i className={`fas ${mostrarSenha ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
                  </button>
                </div>
                {erroSenha && <span className="lv-erro-msg">{erroSenha}</span>}
              </div>

              {/* Manter conectado */}
              <div className="lv-manter-wrap">
                <label className="lv-toggle-switch" htmlFor="lv-manter">
                  <input
                    id="lv-manter"
                    type="checkbox"
                    checked={manterConectado}
                    onChange={e => setManterConectado(e.target.checked)}
                  />
                  <span className="lv-toggle-track">
                    <span className="lv-toggle-thumb"></span>
                  </span>
                  <span className="lv-toggle-label">Manter conectado</span>
                </label>
                <span className="lv-manter-detalhe">
                  {manterConectado ? 'Acesso salvo por 30 dias' : 'Acesso encerra ao fechar o navegador'}
                </span>
              </div>

              {/* Erro geral */}
              {erroGeral && (
                <div className="lv-erro-geral" role="alert">
                  <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                  {erroGeral}
                </div>
              )}

              {/* Aviso de cooldown inline — aparece conforme o usuário digita */}
              {cooldownInline > 0 && (
                <div className="lv-cooldown-inline" role="status">
                  <span className="lv-cooldown-inline-icone">⏳</span>
                  <span>
                    Acesso suspenso. Tente novamente em{' '}
                    <strong>{formatarTempo(cooldownInline)}</strong>
                  </span>
                </div>
              )}

              <button
                type="submit"
                className="lv-btn-entrar"
                disabled={cooldownInline > 0}
              >
                <span>Entrar</span>
                {cooldownInline <= 0 && <i className="fas fa-arrow-right" aria-hidden="true"></i>}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componente: fundo animado ────────────────────────────────────────────

function TelaDeFundo() {
  return (
    <div className="lv-fundo" aria-hidden="true">
      {/* Grade de pontos animada — evoca malha de tecido */}
      <svg className="lv-fundo-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="lv-malha" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" fill="rgba(110,231,183,0.18)"/>
          </pattern>
          <pattern id="lv-malha-linhas" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <line x1="0" y1="20" x2="40" y2="20" stroke="rgba(110,231,183,0.05)" strokeWidth="0.5"/>
            <line x1="20" y1="0" x2="20" y2="40" stroke="rgba(110,231,183,0.05)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lv-malha-linhas)"/>
        <rect width="100%" height="100%" fill="url(#lv-malha)"/>
      </svg>
      {/* Orbs de luz difusa */}
      <div className="lv-orb lv-orb--1"></div>
      <div className="lv-orb lv-orb--2"></div>
      <div className="lv-orb lv-orb--3"></div>
      {/* Linha diagonal decorativa */}
      <div className="lv-linha-decor lv-linha-decor--1"></div>
      <div className="lv-linha-decor lv-linha-decor--2"></div>
    </div>
  );
}
