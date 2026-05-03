# CLAUDE.md — Sistema LV

Este arquivo é lido automaticamente pelo Claude Code ao iniciar. Contém o contexto permanente do projeto: stack, arquitetura, padrões e regras de negócio. **Sempre atualize este arquivo quando uma nova decisão importante for tomada.**

---

## Visão Geral do Projeto

Sistema web interno de gestão industrial para uma confecção. Controla o ciclo completo de produção: Ordens de Produção (OPs), cortes, produção por etapas, arremates, embalagem, estoque, financeiro, pagamentos de funcionários e dashboard de desempenho.

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite 7 |
| Backend | Node.js, Express 5 |
| Banco de dados | PostgreSQL (Neon / Vercel Postgres) |
| Deploy | Vercel (serverless functions em `/api`) |
| Dev local | `npm run dev` (Vite) + `npm run server` (Express na porta 3000) |
| Autenticação | JWT (armazenado no `localStorage` como `token`) |
| Libs UI | react-select, react-tooltip, recharts, FullCalendar, jsPDF |

---

## Arquitetura e Estrutura de Pastas

```
/
├── api/                        # Routers Express (um arquivo por domínio)
├── public/
│   ├── admin/                  # Páginas HTML do painel administrativo
│   ├── dashboard/              # HTML da dashboard do funcionário
│   ├── css/                    # Estilos globais e por página
│   ├── js/                     # JS utilitário legado (auth.js, permissoes.js, etc.)
│   └── src/
│       ├── components/         # Componentes React — TODOS aqui, sem subpastas
│       ├── hooks/              # Custom hooks React
│       ├── pages/              # Páginas React (quando existirem)
│       ├── utils/              # Utilitários JS do frontend
│       └── main-*.jsx          # Entry points React (um por página)
├── server.js                   # Express local (dev)
├── vite.config.js              # Build config — root é /public
├── vercel.json                 # Config de produção (Vercel)
└── CLAUDE.md                   # Este arquivo
```

### Como o Vite está configurado

- **Root do Vite:** `public/` — o dev server serve arquivos a partir daí
- **Build output:** `dist/` na raiz do projeto
- **Multi-page:** o `vite.config.js` usa `globSync` para encontrar todos os `.html` em `public/**` e os trata como entry points do Rollup
- **Proxy dev:** chamadas a `/api/*` são proxiadas para `http://localhost:3000`

### Padrão de entrada React por página

Cada página admin tem um `.html` em `public/admin/` que importa um `main-*.jsx` como módulo. O `.jsx` monta o componente raiz via `ReactDOM.createRoot`. Exemplo: `public/admin/ordens-de-producao.html` → `public/src/main-op.jsx`.

---

## Convenções de Nomenclatura

### Componentes React

**Regra absoluta de localização:** todos os componentes ficam em `public/src/components/`, sem exceção e sem subpastas. O Vite apresenta problemas com subpastas de componentes — esse padrão plano foi adotado desde o início e nunca causou conflito. Jamais criar componentes em outro lugar.

O prefixo do nome do componente é sempre a **abreviação da página/área** à qual ele pertence, em PascalCase. O objetivo é bater o olho no nome e saber imediatamente de qual área ele faz parte.

| Prefixo | Página / Área |
|---|---|
| `OP*` | Ordens de Produção |
| `CPAG*` | Central de Pagamentos |
| `Dash*` | Dashboard do funcionário |
| `Arremate*` | Tela de arremates |
| `Embalagem*` | Embalagem de produtos |
| `Botao*` | Botões com lógica própria |
| `UI*` | ⚠️ Prefixo legado usado para componentes reutilizáveis entre páginas — o nome não é ideal e será revisado progressivamente. Por enquanto, mantê-lo para não quebrar imports existentes. |

**Componentes reutilizados entre páginas:** quando um componente precisar ser usado em mais de uma área, o prefixo deve deixar claro que é compartilhado — a forma exata será definida caso a caso conforme o projeto avança, evoluindo o prefixo `UI*` para algo mais semântico.

### APIs

Arquivos em `api/` com kebab-case. Um arquivo por domínio, usando Express Router. Exemplo: `api/ordens-de-producao.js`.

### Banco de dados

Conexão via `@neondatabase/serverless` / `@vercel/postgres`. String de conexão em `process.env.POSTGRES_URL`. Timezone configurado como UTC no servidor (`process.env.TZ = 'UTC'` em `server.js`).

---

## Padrões de Código

### Autenticação nas APIs

Todo router verifica o JWT via `verificarToken` antes de processar qualquer rota. O token vem no header `Authorization: Bearer <token>`. O payload decodificado fica em `req.usuarioLogado`.

```js
// Padrão de verificação de token nas APIs
router.use(async (req, res, next) => {
    try {
        req.usuarioLogado = verificarToken(req);
        next();
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});
```

### Fetch autenticado no Frontend

```js
const token = localStorage.getItem('token');
const res = await fetch('/api/rota', {
    headers: { 'Authorization': `Bearer ${token}` }
});
```

### Tratamento de erros nas APIs

Usar `try/catch` com `dbClient` obtido via `pool.connect()` e `dbClient.release()` no `finally`. Retornar `res.status(xxx).json({ error: '...' })`.

### Migração JS → React

O projeto foi iniciado com JavaScript puro e está em migração progressiva para React. Toda página nova ou refatorada usa 100% React. **Ao entrar em qualquer área/página para trabalhar, garantir que ela esteja 100% em React antes de avançar com novas features.**

---

## Dispositivos e Responsividade

O sistema é usado majoritariamente em **tablets (80%)**, seguido de celulares (10%) e PCs (10%). Toda interface deve ser projetada com essa prioridade:

1. **Tablet primeiro** — layout, tamanho de botões, espaçamentos e touch targets devem funcionar perfeitamente em telas de ~768–1024px com uso por toque.
2. **Celular** — deve funcionar sem quebrar, mesmo que seja experiência secundária.
3. **PC** — suportado, mas não é o foco principal.
4. Válido para todo sistema da parte admin. A parte de Dashboard ((acesso das costureiras e tiktiks)) deve seguir sempre **mobile first**

Regras práticas:
- Botões de ação devem ter área de toque mínima de 44px de altura
- Evitar hover-only interactions (touch não tem hover)
- Preferir layouts em coluna única ou grid de 2 colunas para cards em tablet
- Modais devem caber na tela sem scroll excessivo em tablets

---

## Fluxo de Trabalho por Área/Página

O desenvolvimento é organizado por **áreas** (cada área = uma página do sistema). Ao iniciar trabalho em uma área, o checklist obrigatório é:

1. **Migração React:** a página está 100% em React? Se não, migrar primeiro.
2. **Limpeza de CSS:** fazer uma passagem no arquivo `.css` da área, removendo classes mortas, regras duplicadas e estilos de código legado que não são mais referenciados — **sem quebrar nada**. Consultar a tabela de status abaixo antes de fazer qualquer limpeza — se já estiver marcada como "limpo", não tocar.
3. **Feature:** só então implementar a nova funcionalidade.

---

## Estrutura Visual Padrão de Páginas

**Regra absoluta:** toda página nova ou refatorada deve seguir esta estrutura. A página de **Ordens de Produção** é a referência visual do sistema — todas as outras devem se parecer com ela, mudando apenas o conteúdo. **Não há exceções.**

### Esqueleto HTML obrigatório (arquivo `.html`)

```html
<body>
    <div class="hamburger-menu">...</div>
    <main id="root" class="gs-card"></main>  <!-- gs-card SEMPRE no main -->
    <script src="/js/carregar-menu-lateral.js" type="module"></script>
    <script src="/src/main-nomepagina.jsx" type="module"></script>
</body>
```

### Esqueleto JSX obrigatório (componente raiz)

```jsx
<>
    <UIHeaderPagina titulo="Nome da Página">
        <button className="gs-btn gs-btn-primario">Ação Principal</button>
        <button className="gs-btn gs-btn-secundario"><i className="fas fa-cog"></i></button>
    </UIHeaderPagina>

    {/* tabs — apenas se a página tiver múltiplas visões */}
    <nav className="gs-tab-nav">...</nav>

    <div className="gs-conteudo-pagina">
        <div className="gs-card">
            {/* seção de conteúdo A */}
        </div>
        <div className="gs-card">
            {/* seção de conteúdo B */}
        </div>
    </div>
</>
```

### Como funciona o espaçamento

O `main.gs-card` tem `padding: 25px` e `margin: 20px`. Dentro dele:
- `gs-cabecalho-pagina` (via UIHeaderPagina) tem `margin` zerado — o padding do card já fornece o recuo
- `gs-conteudo-pagina` tem `padding: 20px 0 0` dentro do main — o lateral vem do card
- `gs-card` interno (seções) tem `padding: 25px` próprio e `margin-bottom: 0` (gap do flex cuida do espaço)

### Classes globais de estrutura (`global-style.css`)

| Classe | Onde usar | Descrição |
|---|---|---|
| `main.gs-card` | `<main id="root">` no HTML | Card de página inteira. Sempre presente. |
| `gs-cabecalho-pagina` | Gerado por `UIHeaderPagina` | Header com título e botões. Não instanciar diretamente. |
| `gs-conteudo-pagina` | Direto no JSX | Wrapper de conteúdo após header/tabs — flex-column, gap 16px |
| `gs-card` | Seções de conteúdo | Card branco elevado — shadow, border-radius, padding 25px |
| `gs-card--compacto` | Seções menores | Variante com padding reduzido (14px 20px) |
| `gs-btn gs-btn-primario` | Botões de ação principal | Cor primária do sistema |
| `gs-btn gs-btn-secundario` | Botões secundários/config | Cinza |

### Regras de aplicação

1. **Todo arquivo `.html` de admin** deve ter `<main id="root" class="gs-card">` — sem exceção.
2. **Todo componente raiz React** deve começar com `UIHeaderPagina` como primeiro filho.
3. **Nunca** colocar conteúdo fora da estrutura `UIHeaderPagina → gs-conteudo-pagina → gs-card`.
4. `op-card-estilizado` em `ordens-de-producao.css` é alias legado de `gs-card`. Novas páginas usam `gs-card` direto.
5. O componente `UIHeaderPagina` fica em `public/src/components/UIHeaderPagina.jsx`.

---

## Status das Áreas

Tabela de controle para evitar retrabalho. Atualizar sempre que uma etapa for concluída.

| Área | Arquivo CSS | React 100% | CSS Limpo | Usa gs-card | Observações |
|---|---|---|---|---|---|
| Login / Index | `login.css` | ✅ | ✅ | N/A | React 100% (27/04). `LoginApp.jsx` único. Tablet-first (2 col), glassmorphism. Token 8h/30d via `manterConectado`. Demitidos → tela de despedida + cooldown crescente. |
| Ordens de Produção | `ordens-de-producao.css` | ✅ | ✅ | ✅ (via alias) | Referência de qualidade para outras áreas |
| Calendário da Empresa | `calendario.css` | ✅ | ✅ | ✅ | Página nova — estrutura padrão aplicada |
| Central de Pagamentos | `central-de-pagamentos.css` | ✅ | ❌ | ❌ | |
| Dashboard Funcionário | `dashboard.css` | ✅ | ❌ | ❌ | Mobile-first, estrutura diferente |
| Arremates | `arremates.css` | ✅ | ❌ | ❌ | |
| Embalagem de Produtos | `embalagem-de-produtos.css` | ❓ | ❌ | ❌ | Verificar migração React |
| Estoque | `estoque.css` | ❓ | ❌ | ❌ | Verificar migração React |
| Financeiro | `financeiro.css` | ❓ | ❌ | ❌ | Verificar migração React |
| Usuários Cadastrados | `usuarios-cadastrados.css` | ✅ | ❌ | ❌ | |
| Home / Admin | `home.css` | ✅ | ❌ | ❌ | |
| Gerenciar Produção | `gerenciar-producao.css` | ❓ | ❌ | ❌ | Verificar migração React |
| Produção Geral | `producao-geral.css` | ✅ | ✅ | ✅ | v1.0 + v2.0 + v3.0 implementados (2026-04-26). Prefixo `PG*`, recharts, filtros client-side, PGMetaTimeline, banner histórico, Pontos Extras |

> ✅ Concluído | ❌ Pendente | ❓ Não verificado — checar antes de trabalhar na área

---

## Componentes de Sistema — Padrões Obrigatórios

### `UIAgenteIA` — Identidade Visual de IA

**Arquivo:** `public/src/components/UIAgenteIA.jsx`

**Regra absoluta:** qualquer funcionalidade que comunique processamento ou análise de IA ao usuário **deve usar este componente**. Não criar novos estilos de robô, terminal de IA, botão de agente ou loader de IA do zero — usar os exports deste arquivo.

**Exports disponíveis:**

| Export | Uso |
|---|---|
| `default UIAgenteIA` | Avatar standalone (círculo gradiente com robô). Tamanhos: `sm` / `md` / `lg`. |
| `BotaoIA` | Botão que aciona/desativa um agente. Props: `estado` (`idle`/`scanning`/`done`), `textoIdle`, `textoScanning`, `textoDone`, `onClick`. |
| `LoaderIA` | Carregamento com avatar + terminal monospace. Props: `fases` (array de `{texto}`), `faseAtual`, `mensagemFinal` (`{tipo, icone, texto}`). |

**Onde já é usado:** PainelDemandas (ChatbotLoader), OPCentralEncerramento (botão "Finalizar OPs"), OPCortesTela (botão "Plano de Corte").

**Identidade visual:**
- Avatar: gradiente `var(--gs-primaria) → #8e44ad`, circular, pulsa quando idle (tamanho lg), gira quando scanning
- Terminal: fundo `#f4f8fb`, fonte `Courier New`, prompt `›` / `✓`, cursor `▌` piscante
- Botão: neutro (cinza) no idle → azul no scanning/done

---

### `UICarregando` — Spinner Universal do Sistema

**Arquivo:** `public/src/components/UICarregando.jsx`

**Regra absoluta:** qualquer carregamento genérico de dados (busca de API, carregamento de página, atualização de aba) **deve usar este componente**. Nunca usar `<div className="spinner">`, textos de "Carregando..." ou implementações ad-hoc.

**⚠️ Diferença crítica com UIAgenteIA:** `UICarregando` é para **dados sendo buscados**. `UIAgenteIA.LoaderIA` é para **agente de IA processando ativamente** (com mensagens contextuais e identidade de robô). Não trocar um pelo outro.

**Props:**

| Prop | Valores | Padrão | Descrição |
|---|---|---|---|
| `variante` | `'bloco'` / `'pagina'` / `'inline'` | `'bloco'` | bloco = centraliza no pai; pagina = tela cheia; inline = compacto sem LV |
| `tamanho` | `'sm'` / `'md'` / `'lg'` | auto por variante | Tamanho do spinner (omitir para usar o padrão da variante) |
| `texto` | string | — | Texto opcional abaixo do spinner |

**Exemplos de uso:**
```jsx
// Aba carregando (mais comum)
{carregando && <UICarregando variante="bloco" />}

// Carregamento inicial de página
if (carregando) return <UICarregando variante="pagina" />;

// Dentro de um botão
<UICarregando variante="inline" />
```

**Para trocar o visual:** editar apenas as classes CSS `.ui-cg-*` em `global-style.css`. A lógica do componente não muda — assim toda a UI atualiza de uma vez.

**Visual:** spinner de dois arcos (azul + roxo, mesmos tons do UIAgenteIA) girando sobre trilha cinza. Letras "LV" em gradiente no centro, com pulso suave. Fundo transparente (herda do container).

---

## Identidade Visual — Borda-Charme

A **borda-charme** é um dos elementos visuais mais marcantes e consistentes do sistema. É uma barra vertical de **6px de largura** posicionada na lateral esquerda de todos os cards de produto e popups. Ela muda de cor para indicar o status ou contexto do item.

**Implementação padrão (todos os cards devem seguir isso):**

```jsx
// No JSX do card:
<div className="meu-card">
    <div className="card-borda-charme"></div>
    {/* restante do conteúdo */}
</div>
```

```css
/* No CSS: o card precisa ter position: relative */
.meu-card {
    position: relative;
    /* ... */
}

.card-borda-charme {
    position: absolute;
    left: 0;
    top: 0;
    width: 6px;
    height: 100%;
    border-radius: 8px 0 0 8px; /* acompanha o border-radius do card */
}

/* Variações de cor por status/contexto */
.card-borda-charme.status-em-aberto   { background-color: var(--cor-status-em-aberto); }
.card-borda-charme.status-produzindo  { background-color: var(--cor-status-produzindo); }
.card-borda-charme.status-finalizado  { background-color: var(--cor-status-finalizado); }
/* etc. */
```

**Regra:** qualquer novo card de produto ou popup criado no sistema **deve incluir a borda-charme**. Ela não é opcional — faz parte da identidade visual estabelecida.

---

## Estrutura de Produtos

### Produto Simples (`is_kit = false`)

É o produto físico que a costureira fabrica na máquina. Toda a lógica produtiva do sistema — OPs, cortes, arremates — opera **exclusivamente sobre produtos simples**.

Campos relevantes:
- `variacoes`: array com um objeto contendo `chave` (geralmente "cor") e `valores` (string com as cores separadas por vírgula).
- `etapas`: fases do processo produtivo. Cada etapa define `processo`, `maquina` e `feitoPor` (costureira, cortador, tiktik, etc.).
- `estrutura`: **sempre vazio e deve ser ignorado.** Foi uma ideia abandonada de registrar matéria-prima durante o desenvolvimento. O campo ainda existe no banco mas não tem significado funcional. Será removido futuramente.

### Kit (`is_kit = true`)

É um agrupamento comercial de produtos simples. **Kits não são fabricados — são montados.** Uma costureira nunca produz um kit; ela produz os produtos simples que depois compõem o kit.

Campos relevantes:
- `grade`: array de variações do kit. Cada item da grade tem seu próprio `sku`, `imagem`, `variacao` (nome temático, ex: "Tudo Preto") e `composicao` — que lista quais produtos simples entram, em quais variações e em quais quantidades.
- `etapas`: sempre vazio `[]`. Kits não têm etapas produtivas.

### Onde cada tipo aparece no sistema

| Área | Produto Simples | Kit |
|---|---|---|
| Ordens de Produção | ✅ Sempre | ❌ Nunca |
| Arremates | ✅ Sempre | ❌ Nunca |
| Cortes | ✅ Sempre | ❌ Nunca |
| Embalagem de Produtos | ✅ Como componente | ✅ Como produto final montado |

Um kit só entra em cena na tela de **Embalagem de Produtos**, onde os produtos simples já arrematados são montados conforme a composição definida na `grade` do kit.

---

## Regras de Negócio Críticas

### OPs — Ordens de Produção

#### Saldo Fantasma

Uma OP é criada com uma `quantidade` estimada, mas pode ser **finalizada** com uma quantidade diferente (`quantidade_real_produzida`). A diferença entre a quantidade da abertura e a `quantidade_real_produzida` é chamada de **saldo fantasma** — esse valor **não existe fisicamente**, não foi produzido nem arrematado, e deve ser **sempre ignorado** em cálculos de estoque e arremate.

```
saldo_fantasma = quantidade_abertura - quantidade_real_produzida
// Deve ser descartado. Não representa nada físico.
```

#### Saldo de Arremate

O saldo disponível para arremate de uma OP é:
```
saldo_arremate_op = quantidade_real_produzida - total_ja_arrematado
// Só considerar se saldo_arremate_op > 0
```

O campo `saldo_op` que possa existir no banco **não deve ser usado** — ele inclui o saldo fantasma e causa erros.

#### Estratégia "Bulk Data" (Performance)

Para calcular saldos de múltiplos produtos ao mesmo tempo, **não fazer N+1 queries**. O padrão adotado é:

1. Buscar em paralelo (`Promise.all`) todos os dados brutos necessários: OPs finalizadas, arremates, sessões ativas, saldos de estoque, produtos, itens arquivados.
2. Criar `Map`s JavaScript para acesso O(1).
3. Calcular toda a lógica de negócio em memória no Node.js.
4. Retornar o resultado montado.

Esse padrão existe em `api/arremates.js` e deve ser replicado onde houver necessidade de cálculos cruzados de OPs.

---

## Informações de Deploy

- **Produção:** Vercel (serverless). As funções em `api/` viram serverless functions automaticamente via `vercel.json`.
- **Variáveis de ambiente necessárias:** `POSTGRES_URL`, `JWT_SECRET`, `CRON_SECRET` e outras definidas no `.env` (não comitar o `.env`).
- **Build:** `npm run build` gera o `dist/` que o Vercel serve.
- **Vercel Cron Jobs (plano Pro):** configurados em `vercel.json` → `"crons"`. Dois jobs ativos:
  - `GET /api/cron/arquivar-concluidas` — `48 2 * * *` (2h48 UTC, diário) — arquiva demandas concluídas
  - `GET /api/cron/registrar-intervalos` — `*/5 10-20 * * *` (a cada 5min, 10h–20h UTC = 7h–17h SP) — detecta S1/S2 e grava intervalos no `ponto_diario` independente de qualquer supervisor estar com a tela aberta. Auth via header `Authorization: Bearer CRON_SECRET`.

### Ambientes (Staging)

O projeto tem dois ambientes configurados no Vercel desde 2026-05-01:

| Ambiente | Branch git | URL | Banco |
|---|---|---|---|
| Produção | `main` | URL principal do projeto | `sistema_lv_db` (Neon, sa-east-1) |
| Staging | `staging` | `sistema-lv-git-staging-lojas-variara.vercel.app` | `sistema-lv-staging` (Neon, us-east-1) |

**Fluxo de trabalho atual:** desenvolvimento direto na `main` (push → produção). O staging existe para quando for necessário testar mudanças arriscadas antes de ir à produção.

**Para usar o staging quando necessário:**
```bash
git checkout staging      # muda para o trilho de teste
# ... faz as alterações ...
git push origin staging   # publica no ambiente de preview (banco de staging)
git checkout main
git merge staging
git push origin main      # manda para produção
git checkout staging      # volta ao staging para continuar
```

**Utilitários de staging em `_planejamento/`:**
- `gerar-schema-staging.js` — exporta schema da produção → `schema-staging.sql`
- `testar-staging.js` — compara tabelas e colunas entre produção e staging
- `seed-staging.js` — cria usuário admin de teste no staging (login: `admin_staging` / `staging123`)

**Banner visual:** quando `VITE_ENV=staging`, o componente `UIHeaderPagina` exibe um banner laranja fixo no topo de todas as páginas admin. Em produção, `VITE_ENV=production` — banner não aparece.

---

## Funcionalidades Implementadas — OPs (referência)


### Correção crítica — Finalização e Arremate (PUT `/api/ordens-de-producao`)
- Ao finalizar uma OP, o PUT **sempre recalcula `etapas`** a partir da tabela `producoes`
- Isso garante que `etapa.quantidade` no JSON salvo reflita o real produzido, não o valor estimado
- Sem essa correção, OPs finalizadas em lote não chegavam à fila de arremates (quantidade era 0)

### OPEtapasModal — Redesign
- Removido accordion; etapas agora são blocos abertos (`EtapaBloco`)
- Borda-charme via `::before` no CSS baseado na classe de status do modal
- Progresso calculado com base na **última etapa** (não soma de todas)
- Usa `mostrarConfirmacao` do sistema (não `window.confirm`)

---


## Versionamento

O projeto usa **SemVer** (`MAJOR.MINOR.PATCH`). A versão fica em `package.json` e é injetada no build pelo Vite como `__APP_VERSION__`, exibida no rodapé do menu lateral.

**Fluxo de release (PowerShell — rodar separado):**
```bash
# 1. Atualizar changelog-data.js com as novidades (admin e/ou dashboard)
# 2. Commitar todas as alterações:
git add .
git commit -m "feat: descrição do que mudou"
# 3. Bumpar a versão (escolher um):
npm version patch   # bug fix:      1.21.0 → 1.21.1
npm version minor   # feature nova: 1.21.0 → 1.22.0
npm version major   # breaking:     1.21.0 → 2.0.0
# 4. Push (dois comandos separados no PowerShell):
git push
git push --tags
# 5. Vercel faz o deploy automaticamente
```

### Versioning por audiência — como funciona

O arquivo `public/js/utils/changelog-data.js` é a **fonte de verdade** das notas de versão. Cada entrada tem dois campos independentes:

- `admin` — novidades para o painel administrativo (linguagem técnica/funcional)
- `dashboard` — novidades para as funcionárias (linguagem simples)

Deixar um dos campos como `[]` significa que aquela versão não teve mudanças para aquela audiência — ela simplesmente não aparece no modal daquele público.

**Admin (`UIHeaderPagina` / menu lateral):** exibe `__APP_VERSION__` do `package.json`. O modal mostra todas as entradas com `admin.length > 0`, marcando a primeira como "Atual".

**Dashboard (`DashVersionFooter`):** exibe a versão da **última entrada com conteúdo de dashboard** — completamente independente do `__APP_VERSION__`. Isso evita que o rodapé da dashboard mude a cada release admin. O badge "Atual" vai sempre para a entrada mais recente com conteúdo de dashboard (`idx === 0` no array filtrado).

> **Regra prática:** ao fazer um release só de admin (sem novidades para funcionárias), deixe `dashboard: []`. O rodapé da dashboard não vai mudar. Quando houver novidade para as funcionárias, preencha o campo `dashboard` — aí sim o rodapé delas atualiza.

Repositório: `https://github.com/juancbx1/sistema-lv`

---

## Usuário de Teste (Dashboard)

Para testar a dashboard dos funcionários sem usar senha real, existem duas formas:

### Opção A — Usuário de teste fixo

Existe um usuário de teste no banco com `is_test = TRUE`.

- **Login:** `teste` | **Senha:** `teste123`
- **Tipo:** costureira | **Nome:** Funcionário Teste
- Este usuário é **filtrado automaticamente** em todas as listagens de funcionários da interface (queries já incluem `AND (is_test IS FALSE OR is_test IS NULL)`)
- Migration SQL em `_planejamento/migration-is-test-usuario.sql`

### Opção B — Impersonação pelo Admin (recomendada para testes com dados reais)

Na tela de **Usuários Cadastrados**, admins com permissão `gerenciar-permissoes` veem um botão laranja (`fa-eye`) em cada card de costureira/tiktik ativo. Ao clicar:

1. Backend gera um JWT de impersonação com validade de **2h** (`POST /api/usuarios/:id/impersonar`)
2. A dashboard abre em **nova aba** com `?impersonando=TOKEN` na URL
3. O token é movido para `sessionStorage` da nova aba — o token do admin em outras abas **não é afetado**
4. Um **banner laranja** fica fixo no topo da dashboard indicando o modo admin
5. Fechar a aba encerra a sessão automaticamente (sessionStorage é por aba)

**Arquivos envolvidos:**
- `api/usuarios.js` → `POST /:id/impersonar`
- `public/src/components/UserCardView.jsx` → botão laranja
- `public/src/components/UserCard.jsx` → `handleImpersonar`
- `public/src/main-dashboard.jsx` → detecção do token e banner
- `public/js/utils/auth.js` e `api-utils.js` → preferem `sessionStorage.impersonation_token`

---

## Observações para o Claude

- Ao criar novos componentes React, seguir o padrão de prefixo por domínio e colocar **sempre** em `public/src/components/` — nunca em subpastas.
- Ao criar novas rotas de API, adicionar o import e o `app.use` correspondente no `server.js`.
- **Nunca usar `saldo_op` diretamente** — calcular sempre a partir de `quantidade_real_produzida - total_ja_arrematado`.
- O arquivo `regra de negocio das OP.txt` na raiz contém exemplos concretos das regras de OP com dados reais do banco.
- Ao tomar uma decisão arquitetural importante ou implementar uma regra de negócio nova, **atualizar este CLAUDE.md**.
- A pasta `_planejamento/` na raiz contém planos detalhados por funcionalidade (spec, checklist, decisões). **Sempre ler o arquivo relevante antes de começar a implementar qualquer coisa**. Arquivos existentes: `central-de-alertas.md`, `horario-empregados.md`, `producao-geral.md`, `organizacao-sistemica.md`.
- **Nunca usar `is_test` users em cálculos, listagens ou relatórios** — o filtro já está nas queries principais, mas atentar ao criar novas queries que listem funcionários.

---