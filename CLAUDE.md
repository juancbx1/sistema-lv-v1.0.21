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

> ✅ Concluído | ❌ Pendente | ❓ Não verificado — checar antes de trabalhar na área

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

---

## Funcionalidades Implementadas — OPs (referência)

### Finalização em Lote (`OPModalLote.jsx`)
- FAB fixo no centro-inferior da tela aparece quando `modoSelecao` está ativo
- Botão "Selecionar" na toolbar entra em modo de seleção
- "Selecionar Todas Prontas" faz fetch com `limit=999` para pegar OPs de todas as páginas, filtra as elegíveis (`status-pronta-finalizar`) e armazena em `opsTodasElegiveis`
- A finalização usa `Promise.allSettled` — uma falha não cancela as outras
- OPs com produção parcial na última etapa recebem badge "Parcial" no modal e o sistema registra a diferença como perda/quebra

### Radar de Tempo (`api/ordens-de-producao.js` — GET `/`)
- Calculado no bulk data após a seção "N+1 killer"
- Busca OPs finalizadas a partir de 2026-01-01, agrupa por `produto_id`, calcula média de horas
- Só ativa o radar se houver ≥ 5 OPs finalizadas do mesmo produto (amostra mínima para ser relevante)
- OPs canceladas retornam `radar: null` (ignoradas)
- Faixas: `normal` (<1.5× média), `atencao` (1.5×–3×), `critico` (>3×)
- Campo `data_entrega` na tabela `ordens_de_producao` = **data de criação** da OP (naming histórico)

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

## Funcionalidades Implementadas — Arremates (referência)

### ArremateCard — Redesign (tablet-first)
- Layout flex coluna, não mais grid de 3 colunas
- Borda-charme de 6px na esquerda (`.card-borda-charme`)
- Corpo em linha: imagem 64×64px + `.arremate-card-info` com `min-width: 0` (evita compressão em tablets)
- Badge de saldo (`.arremate-saldo-badge`): `position: absolute; right: 14px; top: 50%` — nunca empurra o layout
- Check de seleção (`.arremate-check-icone`): substitui o badge no mesmo lugar quando `isSelected`
- Banner "Em andamento" (`.arremate-em-trabalho-banner`): na base do card, em vez de `padding-top: 48px`

---

## Observações para o Claude

- Ao criar novos componentes React, seguir o padrão de prefixo por domínio e colocar **sempre** em `public/src/components/` — nunca em subpastas.
- Ao criar novas rotas de API, adicionar o import e o `app.use` correspondente no `server.js`.
- **Nunca usar `saldo_op` diretamente** — calcular sempre a partir de `quantidade_real_produzida - total_ja_arrematado`.
- O arquivo `regra de negocio das OP.txt` na raiz contém exemplos concretos das regras de OP com dados reais do banco.
- Ao tomar uma decisão arquitetural importante ou implementar uma regra de negócio nova, **atualizar este CLAUDE.md**.
- A pasta `_planejamento/` na raiz contém planos detalhados por funcionalidade (spec, checklist, decisões). **Sempre ler o arquivo relevante antes de começar a implementar qualquer coisa**. Arquivos existentes: `central-de-alertas.md`, `horario-empregados.md`, `producao-geral.md`.

---

## Funcionalidades Implementadas — Ponto Dinâmico (referência)

### Visão geral
Sistema de jornada inteligente para costureiras e tiktiks. O ponto é registrado **reativamente** (ao finalizar tarefa), não por relógio fixo. Nenhuma ação manual do supervisor é necessária no fluxo normal.

### Arquivos envolvidos
| Arquivo | Responsabilidade |
|---|---|
| `api/usuarios.js` | `determinarStatusFinalServidor()` — única fonte de verdade de status; `atualizarStatusUsuarioDB()` — atualiza status + timestamp no banco |
| `api/producao.js` | GET `/status-funcionarios` — bulk fetch com `ponto_diario` + `dias_trabalho` + `sessoes_hoje`; chama `determinarStatusFinalServidor`. POST `/sugestao-tarefa` — scoring de atribuição inteligente |
| `api/producoes.js` | `detectarIntervaloAoFinalizar()` — detecta almoço/pausa ao finalizar tarefa (step 9 do PUT `/finalizar`). PUT `/finalizar` aceita e salva `pausa_manual_ms` |
| `api/cron.js` | `GET /registrar-intervalos` — cron server-side (a cada 5min, 7h30–17h35 SP). Detecta S1/S2 cruzamentos e grava horários AGENDADOS no `ponto_diario` via COALESCE. Roda independente de qualquer browser aberto. `GET /arquivar-concluidas` — arquiva demandas diariamente. |
| `api/ponto.js` | `POST /excecao` (saída antecipada/atraso), `POST /liberar-intervalo` (liberar para almoço/pausa — v1.8: pula UPDATE de status se funcionário está PRODUZINDO; COALESCE: não sobrescreve entradas já gravadas pelo cron), `POST /desfazer-liberacao` (v1.8: reseta status para LIVRE neutro para que auto-calc redetecte ALMOCO/PAUSA) |
| `OPStatusCard.jsx` | Card do funcionário ativo: cronômetro ciente da jornada (`calcularTempoEfetivo`), pausa manual (`pausaManualFrozenMsRef` + `pausaManualAcumuladoMsRef`), tolerância S3 em tempo real, botão liberar intervalo, menu ⋮, modal ⓘ com `LinhaDoTempoDia` + `ModalInfoTimeline`. v1.8: render de card bloqueado quando ALMOCO/PAUSA+sem tarefa; footer bloqueado quando PRODUZINDO+cronoPausadoAuto |
| `OPPainelAtividades.jsx` | Grid principal (ativos) + seção de inativos; `handleFinalizarTarefa(funcionario, pausaManualMs)`. v1.8: timer 60s de detecção S1/S2, Web Audio API (beep), popup de alerta de intervalo, popup "Desfazer liberação" com countdown 10s, ALMOCO/PAUSA no grid principal |
| `OPTelaSelecaoEtapa.jsx` | Lista de tarefas para atribuição + card de sugestão inteligente (MELHORIA-07) |
| `OPTelaConfirmacaoQtd.jsx` | Confirmação de quantidade com aviso de ultrapassagem de S3 (MELHORIA-08) |
| `OPAtribuicaoModal.jsx` | Modal de atribuição — passa `tpp` para `OPTelaConfirmacaoQtd` |
| `UserCardEdicao.jsx` | Chips de dias da semana na seção "Jornada" da edição de usuário |
| `UserCardView.jsx` | Exibição dos chips de dias na visualização do card de usuário |
| `public/css/ordens-de-producao.css` | Classes `.oa-inativos-*`, `.bs-*`, `.cracha-*`, `.op-status-*`, `.bs-timeline-*`, `.op-sugestao-*`, `.op-atrib-aviso-horario`, `.op-btn-pausar-timer` |

---

### Nomenclatura dos horários (padrão do sistema)

| Campo no banco | Nome no sistema | Label no modal ⓘ |
|---|---|---|
| `horario_entrada_1` | E1 | Entrada (E1) |
| `horario_saida_1` | S1 | Almoço (S1 → E2) |
| `horario_entrada_2` | E2 | Almoço (S1 → E2) |
| `horario_saida_2` | S2 | Pausa (S2 → E3) |
| `horario_entrada_3` | E3 | Pausa (S2 → E3) |
| `horario_saida_3` | S3 | Saída (S3) |

---

### Tabela `ponto_diario`
Migration necessária (SQL em `_planejamento/horario-empregados.md`). Um registro por funcionário por dia (UNIQUE funcionario_id + data).

| Campo | Significado |
|---|---|
| `horario_real_s1` | Hora real em que o almoço começou (detectada ao finalizar tarefa) |
| `horario_real_e2` | Retorno previsto do almoço = `horario_real_s1` + duração (E2-S1) |
| `horario_real_s2` | Hora real em que a pausa começou |
| `horario_real_e3` | Retorno previsto da pausa = `horario_real_s2` + duração (E3-S2) |
| `horario_real_s3` | Hora real de saída antecipada (exceção manual) |
| `horario_real_e1` | Hora real de chegada atrasada (exceção manual) |

---

### Coluna `dias_trabalho` na tabela `usuarios`
- Tipo: `JSONB`. Formato: `{"0": false, "1": true, "2": true, "3": true, "4": true, "5": true, "6": false}` (0=Dom, 1=Seg, ..., 6=Sáb)
- Padrão (fallback quando null): `{"1":true,"2":true,"3":true,"4":true,"5":true}` (Seg–Sex)
- **SQL migration pendente** (executar manualmente no banco):
  ```sql
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dias_trabalho JSONB DEFAULT '{"1":true,"2":true,"3":true,"4":true,"5":true}';
  ```
- Editável em `UserCardEdicao.jsx` (chips clicáveis). Salvo via `PUT /api/usuarios` com o campo `dias_trabalho` como objeto JS (pg serializa JSONB nativamente — **não usar JSON.stringify**)

---

### Status possíveis e onde vivem

| Status | Fonte | Onde aparece |
|---|---|---|
| `PRODUZINDO` | `api/producao.js` (tem sessão ativa) | Grid principal do painel |
| `LIVRE` | `determinarStatusFinalServidor` | Grid principal |
| `LIVRE_MANUAL` | Supervisor via menu ⋮ | Grid principal (renderizado como LIVRE) |
| `ALMOCO` | `detectarIntervaloAoFinalizar` ou cálculo auto | **Grid principal (card bloqueado)** — v1.8 |
| `PAUSA` | `detectarIntervaloAoFinalizar` ou cálculo auto | **Grid principal (card bloqueado)** — v1.8 |
| `PAUSA_MANUAL` | Supervisor (obsoleto — opção removida do menu) | Grid principal (card bloqueado) |
| `FORA_DO_HORARIO` | `determinarStatusFinalServidor` (auto) | Seção de inativos |
| `FALTOU` | Supervisor via menu ⋮ | Seção de inativos |
| `ALOCADO_EXTERNO` | Supervisor via menu ⋮ | Seção de inativos |

**Nota**: `PAUSA_MANUAL` foi removida do menu ⋮ (opção "Iniciar Pausa" excluída em v1.5) pois gerava bugs com o sistema automático de detecção de pausa. O status ainda existe no banco e no código de renderização para não quebrar funcionários que possam tê-lo, mas não é mais criado.

---

### Bugs corrigidos — histórico (importante para debugging futuro)

| Bug | Causa raiz | Correção |
|---|---|---|
| BUG-15b (v1.7) | "Almoço fantasma" no intervalo E2→S2 — mesmo após o fix original de BUG-15, o sistema jogava funcionários para `ALMOCO` quando finalizavam tarefa longa no meio da tarde (ex: 14:35 com S1=13:00 / E2=14:00 / S2=16:00). Banner "Em almoço" aparecia por segundos e sumia, poluindo o painel. Três casos simultâneos reportados em produção em 2026-04-16 (Francisco, Milena, Silvana) | `detectarIntervaloAoFinalizar` CASO 1 cobria toda a janela `[S1, S2)` — até ~3h depois do horário agendado. Finalização de tarefa às 14:30-15:30 entrava em CASO 1 e criava `horario_real_s1` + `horario_real_e2` retroativos com `horaAtual` como `s1` → quase imediatamente o E2 dinâmico já ficou no passado → `ALMOCO` → re-cálculo volta para `LIVRE` | **3 camadas de correção:** **(a)** `TOLERANCIA_ATRASO_INTERVALO_MIN = 30` em `api/producoes.js` — CASOS 1 e 2 só registram se `horaAtual <= S + 30min`. **(b)** Rede de segurança pós-E2/E3 em `api/producao.js GET /status-funcionarios` — se `agora >= E2` e não há `horario_real_s1`, grava fallback com horários AGENDADOS (COALESCE idempotente, pula `FALTOU`/`ALOCADO_EXTERNO`, requer evidência de atividade hoje). **(c)** Frontend `OPStatusCard`: botão "Liberar intervalo" aparece em `[S-20, S)` com 2 fases (antecipacao/iminente). A partir de S o timer de 60s do painel assume. **(d) Regra operacional de chão de fábrica:** deu S1/S2, o empregado vai imediatamente — regra máxima, sem exceção. |
| CARD-REDESIGN (v1.7) | Supervisores reclamavam do card do empregado: foto ocupava muito espaço, nome pequeno, sem imagem do produto em produção, botões pequenos demais para "dedos grossos" em tablet | Card tinha 3 seções verticais (banda + identidade + corpo) que somavam ~140px antes do conteúdo útil; cronômetro era pequeno; produto era mostrado só por texto | **(a)** Topo unificado (`.cracha-topo`): banda colorida + avatar 52px overlap + nome proeminente + "ROLE · Nível X" em uma única faixa de ~68px. **(b)** Corpo em PRODUZINDO: imagem da variação 64×64 (via `LATERAL JOIN jsonb_to_recordset(p.grade)` em `api/producao.js`) + nome da variação (removido nome do produto — é redundante com a imagem). **(c)** Duas métricas grandes lado a lado: quantidade `1.6rem bold` + cronômetro `HH:MM:SS`. **(d)** Botões `.cracha-btn` +20% (min-height 48px, padding 12×14, font 0.92rem). |
| BUG-26 | Saída antecipada registrava com sucesso mas o card ficava como PRODUZINDO/LIVRE por ~1 minuto | `determinarStatusFinalServidor` linha 92: `horaAtualStr > saidaFinal` com operador estritamente maior — quando a poll imediata pós-registro roda no mesmo minuto do `horario_real_s3`, a comparação `'09:35' > '09:35'` retorna FALSE → empregado aparece como LIVRE até o minuto seguinte. Desfazer funcionava imediatamente porque usava o S3 agendado distante. | Trocado `>` por `>=`: `horaAtualStr >= saidaFinal` → no minuto exato da saída o empregado já é FORA_DO_HORARIO |
| BUG-25 | Saída antecipada exigia 4-5 tentativas no tablet | Popup de motivo retornava `null` quando supervisor fechava/cancelava → `if (motivoDigitado === null) return` cancelava a ação inteira, mesmo o supervisor já tendo confirmado no popup anterior. No tablet o teclado cobre a tela e o supervisor clica no X achando que está apenas fechando o teclado | Tratado `null` como string vazia: `motivo = motivoDigitado ?? ''`. O único ponto de cancelamento válido é o popup de confirmação ("Confirmar saída antecipada?") |
| CRON-INDEPENDENTE (v1.8) | Intervalos só eram registrados quando algum supervisor tinha o Painel de Atividades aberto. Se ninguém abrisse a página durante o expediente, o `ponto_diario` ficava vazio — e quando alguém abria, a rede de segurança gravava todos os intervalos com o horário atual (ex: todos os funcionários com `horario_real_s1 = '19:08'` porque foi a hora em que a página foi aberta). | Novo cron server-side `GET /api/cron/registrar-intervalos` em `api/cron.js`, registrado em `vercel.json` com `*/5 10-20 * * *`. Grava sempre os **horários agendados** (não `now()`), usa COALESCE para não sobrescrever entradas existentes, e adiciona guarda interna 07h30–17h35 SP. O `POST /liberar-intervalo` em `api/ponto.js` também ganhou COALESCE para que o timer de 60s do frontend não sobrescreva o que o cron já gravou corretamente. |
| INTERVALO-OBRIGATÓRIO (v1.8) | Almoço e pausa passaram a ser **obrigatórios e imediatos**: quando S1/S2 chega, o sistema bloqueia o card e exige que o funcionário saia do trabalho — não é apenas um aviso. Mudanças coordenadas em 5 camadas: **(a)** Rede de segurança backend dispara em S1/S2 (antes: E2/E3) — garante que `ponto_diario` já tem `horario_real_s1`/`s2` na primeira poll após o horário, permitindo congelamento imediato. **(b)** `POST /liberar-intervalo` não altera status nem sessão se funcionário está PRODUZINDO (`isProduzindo = !!id_sessao_trabalho_atual`) — só grava `ponto_diario`. O frontend congela via `calcularTempoEfetivo`. **(c)** `OPPainelAtividades`: timer de 60s checa S1/S2 crossing por funcionário; ao detectar, chama `liberarIntervaloSilencioso`, exibe popup de alerta (com beep Web Audio 880→660→440 Hz) e sincroniza painel. `alertadosRef` evita alertas duplicados na sessão. ALMOCO/PAUSA ficam no grid principal (não em inativos). **(d)** `OPStatusCard`: render alternativo para ALMOCO/PAUSA+sem tarefa = card cinza bloqueado com ícone grande, hora de retorno e botão "Liberar para trabalho". Para PRODUZINDO+`cronoPausadoAuto=true`: footer bloqueado com "Retoma às HH:MM", botões Finalizar/Cancelar ocultos. **(e)** Popup "Desfazer liberação" com countdown 10s: supervisor que clicar "Liberar para trabalho" por engano tem 10s para desfazer — `POST /api/ponto/desfazer-liberacao` reseta status para LIVRE neutro; `ponto_diario` preserva `horario_real_s1`/`s2` intacto, então `determinarStatusFinalServidor` re-detecta ALMOCO/PAUSA automaticamente na próxima poll. |
| CONTROLE-INTERVALO-PRODUZINDO (v1.9) | Supervisores não conseguiam controlar manualmente o intervalo de funcionários em status PRODUZINDO: o botão "Liberar para almoço/pausa" não aparecia antes do horário, e o botão "Liberar para trabalho" não aparecia quando o contador estava congelado. | **(a)** `OPStatusCard` `useEffect` de `intervaloProximo`: condição expandida de `=== 'LIVRE'` para `=== 'LIVRE' || === 'PRODUZINDO'` — botão de antecipação agora aparece nas mesmas janelas `[S-20, S)` para PRODUZINDO. **(b)** Seção PRODUZINDO no `renderBody()`: botão `op-btn-liberar-intervalo` renderizado quando `intervaloProximo` e `!cronoPausadoAuto` — chama `onLiberarIntervalo` (endpoint já tratava PRODUZINDO corretamente desde v1.8). **(c)** Footer PRODUZINDO + `cronoPausadoAuto`: botão "Liberar para Trabalho" adicionado abaixo do "Retoma às HH:MM" — chama `onLiberarParaTrabalho(funcionario, cronoPausadoMotivo)` passando o motivo ('ALMOCO'/'PAUSA'). **(d)** `OPPainelAtividades.handleLiberarParaTrabalho`: detecta `isProduzindo` pelo `status_atual`; se true, chama `POST /api/ponto/retomar-trabalho` (seta e2/e3=agora, não toca status/sessão); popup desfazer recebe `origem: 'PRODUZINDO'`. **(e)** `OPPainelAtividades.handleDesfazerLiberacao`: roteia por `origem` — 'PRODUZINDO' chama `POST /api/ponto/desfazer-retomada` (reseta e2/e3=NULL → `calcularTempoEfetivo` recongelará); demais chamam `desfazer-liberacao` (comportamento v1.8). **(f)** Dois novos endpoints em `api/ponto.js`: `POST /retomar-trabalho` e `POST /desfazer-retomada`. |

---

#### ⚠️ Regra anti-regressão — `ehLivreManual` (BUG recorrente — ocorreu 3+ vezes)

**`ehLivreManual` deve vencer TODOS os checks de janela em `determinarStatusFinalServidor`**, sem exceção. O padrão correto é:

```javascript
if (alguma_condicao_restritiva) {
    if (ehLivreManual) return STATUS.LIVRE; // supervisor autorizou — sempre vence
    return STATUS.FORA_DO_HORARIO; // (ou ALMOCO, PAUSA, etc.)
}
```

**Nunca escrever** `return STATUS.FORA_DO_HORARIO` (ou qualquer status restritivo) diretamente sem checar `ehLivreManual` antes. Isso se aplica a:
- Check de `dias_trabalho` (folga) — já corrigido em BUG-08
- Check de janela de almoço (S1→E2) — já corrigido em BUG-07
- Check de janela de pausa (S2→E3) — já corrigido em BUG-07
- Check de janela de expediente (`horaAtual < E1 || horaAtual > S3`) — corrigido em BUG-17

Se adicionar um novo check de janela no futuro, **incluir o override `ehLivreManual` imediatamente**.

---

## Funcionalidades Implementadas — Dashboard do Funcionário (referência)

### Visão geral
Tela pessoal do empregado (costureiras e tiktiks). **Mobile-first** (95% dos acessos via smartphone) — estilos base em 375px, escalonando via `@media (min-width: ...)`. Diferente do restante do sistema que é tablet-first.

Conceito de **ciclo fiscal**: começa no dia 21 e termina no dia 20 do mês seguinte. Pagamentos no 5º dia útil de cada mês (exibido como label, sem data exata até ter calendário de feriados).

### Arquivos envolvidos

| Arquivo | Responsabilidade |
|---|---|
| `api/dashboard.js` | Backend principal — ciclo fiscal, acumulado, cofre, ritmo IA. Response inclui `periodo: { inicio, fim }`, `acumulado.eventosCalendario`, `acumulado.diasUteisRealDoEmpregadoNoCiclo`, `pagamentoPendente.dataPagamentoFormatada` |
| `public/js/utils/periodos-fiscais.js` | `getPeriodoFiscalAtual`, `gerarBlocosSemanais`, `contarDiasUteis(inicio, fim)` — aceita strings `'YYYY-MM-DD'` ou objetos Date; usa `T12:00:00` local para evitar UTC midnight |
| `public/src/main-dashboard.jsx` | Componente raiz — passa `diasTrabalho={dados.usuario?.dias_trabalho}` para `DashDesempenhoModal` |
| `public/src/components/DashHeader.jsx` | Header: avatar, nome, nível, botões cofre/desempenho/pagamentos |
| `public/src/components/DashProjecaoCiclo.jsx` | Card de projeção aspiracional do ciclo. 6 estados, nudge inteligente, `diasRestantes` via `contarDiasUteis` |
| `public/src/components/DashFocoHoje.jsx` | Card "Foco de Hoje" — chips de meta (bronze/prata/ouro), barra de progresso, badge de nível. Prop `diasUteisNoCiclo` para calcular "Potencial este ciclo" com dias reais do empregado |
| `public/src/components/DashRitmoIA.jsx` | Card "Análise de Ritmo" — pts/h atual vs. histórico do mesmo dia da semana. Page Visibility API |
| `public/src/components/DashRankingCard.jsx` | Ranking anônimo semanal por tipo (costureira/tiktik). Some quando ≤1 participante |
| `public/src/components/DashAtividadesLista.jsx` | Lista/histórico de lançamentos + inclui `DashTabelaPontos` |
| `public/src/components/DashTabelaPontos.jsx` | Tabela colapsável de pontos por processo/produto. Modal usa `ReactDOM.createPortal` |
| `public/src/components/DashDesempenhoModal.jsx` | Modal "Extrato Detalhado" — passa `eventosCalendario`, `diasTrabalho` e `diasDetalhes` para `DashTabelaCiclo` |
| `public/src/components/DashTabelaCiclo.jsx` | 3 partes: chips de métricas + calendário do ciclo (grade 7 colunas) + cards semanais. Ver seção abaixo. |
| `public/src/components/DashCofreModal.jsx` | Modal "Cofre de Resgate" — ícone `fa-vault`, 2 resgates/semana, mínimo 500pts/dia |
| `public/src/components/DashPagamentosModal.jsx` | Modal "Próximo Pagamento" — exibe data exata (`dataPagamentoFormatada`) quando disponível, senão "5º dia útil de [mês]" |
| `public/src/components/DashPerfilModal.jsx` | Modal de perfil — não mexer |

**Arquivos órfãos deletados em 2026-04 (12-H):**
`DashTermometro.jsx`, `DashSaldoCard.jsx`, `DashBlocosSemanais.jsx`, `DashPontosAnel.jsx`, `DashMetaSlider.jsx`, `DashCicloResumo.jsx`

### Regras de negócio — Cofre de Resgate

| Regra | Valor |
|---|---|
| Limite de resgates | **2 por semana (Seg–Dom calendário, não bloco do ciclo)** |
| Produção mínima para resgatar | **500 pts no dia do resgate** |
| Saldo zerado | Todo dia 21 (início de novo ciclo) |
| Auditoria | `usos_neste_ciclo` ainda incrementa para histórico, mas o limite ativo é semanal |

Semana calendário (Seg–Dom) foi escolhida intencionalmente para evitar exploit: se usasse blocos do ciclo, o empregado poderia usar 2 resgates nos dias 19–20 e mais 2 nos dias 21–22 (novo ciclo) — 4 resgates em 4 dias.

### Regras de negócio — Ritmo IA (`GET /ritmo-atual`)

- Requer mínimo de **30 minutos** de sessão no dia para calcular ritmo atual
- Média histórica calculada sobre os **6 últimos mesmos dias da semana** (ex: últimas 6 terças), estimando 8h de expediente
- Costureiras: sessões em `sessoes_trabalho_producao`; Tiktiks: sessões em `sessoes_trabalho_arremate`
- Retorna `{ naoEDiaDeTrabalho: true }` quando hoje não é dia de trabalho do empregado — card some silenciosamente
- Usa **Page Visibility API**: polling pausa quando aba está em segundo plano, retoma ao ganhar foco
- **Guard obrigatório:** previsão só é calculada quando `ritmoAtual > 0`. Se for 0, `pontosRestantes / 0 = Infinity` → `new Date(Infinity)` = "Invalid Date". (Corrigido em 2026-04)

### Ranking Anônimo (`GET /api/dashboard/ranking-semana` + `DashRankingCard.jsx`)

- Agrupa pontos da semana Seg–Dom (fuso SP) por tipo de usuário (`costureira` / `tiktik`)
- Participam: mesmo `tipo`, `data_admissao IS NOT NULL`, `data_demissao IS NULL`
- IDs de outros usuários nunca são enviados ao frontend — anonimização por posição
- **Times pequenos (≤ 8):** todos os membros são exibidos, sem recorte
- **Times grandes (> 8):** janela deslizante de #1 fixo + 2 acima + empregado + 2 abaixo; separador quando há gap
- Card some silenciosamente quando `totalParticipantes <= 1` ou erro de fetch

### Calendário do Ciclo (`DashTabelaCiclo.jsx` — Parte 2)

Grade 7 colunas (Dom→Sáb) com bolinhas coloridas por nível de meta. Integrado ao calendário da empresa.

**Props recebidas:**
- `blocos` — blocos semanais do ciclo
- `diasDetalhes` — array de `{ data, pontos, ganho, nivelMeta }` — `nivelMeta` calculado no backend
- `eventosCalendario` — array de `{ data, tipo, descricao }` com `visivel_dashboard = true` do `calendario_empresa`
- `diasTrabalho` — objeto JSONB `{"0":false,"1":true,...}` do `usuarios.dias_trabalho` do empregado

**Cores das bolinhas:**
| Cor | Constante | Significado |
|---|---|---|
| `#F9A825` | `CORES_META.ouro` | Meta Ouro batida |
| `#78909C` | `CORES_META.prata` | Meta Prata batida |
| `#A1887F` | `CORES_META.bronze` | Meta Bronze batida |
| `#EF9A9A` | `CORES_META.nao_bateu` | Dia trabalhado, sem meta |
| `#E0E0E0` | `COR_SEM_PROD` | Dia útil sem produção |
| `#B0BEC5` | `COR_FOLGA` | Folga (fora da jornada) ou feriado/folga empresa |
| `#F5F5F5` | `COR_FUTURO` | Dia futuro |

**Lógica de folga:** um dia é considerado folga se `diasTrabalho[dow] !== true` OU se a data está em `eventosCalendario` com tipo `feriado_nacional`, `feriado_regional` ou `folga_empresa`. Feriados sempre sobrescrevem dias úteis — a empresa nunca trabalha em feriados.

**Evento no calendário:** dias com evento exibem um ponto azul (`#1565c0`) abaixo da bolinha. Ao clicar, abre um popup centralizado (`position: fixed`, `z-index: 2000`) mostrando a data por extenso, o tipo do evento (badge) e a descrição. Somente visualização — nenhuma edição possível.

**Regra de visibilidade de eventos:** `calendario_empresa` tem campo `visivel_dashboard boolean`. **NUNCA** exibir eventos com `visivel_dashboard = false` para empregados — em todas as queries da dashboard, obrigatório filtrar `AND visivel_dashboard = true`.

**`nivelMeta` no backend (`api/dashboard.js`):** calculado em `historicoDias` dentro de `auditarCofrePontos`. Última posição do array de metas = `'ouro'`, penúltima (se ≥3 níveis) = `'prata'`, demais = `'bronze'`. Pontos > 0 sem meta = `'nao_bateu'`. Pontos = 0 = `null`.

### Regras de negócio — Dias Úteis e Pagamento (2026-04)

**`diasUteisNoCiclo`** — dias Seg–Sex do ciclo excluindo feriados/folgas visíveis na dashboard (`visivel_dashboard = true`, `funcionario_id IS NULL`). Retornado em `acumulado.diasUteisNoCiclo`.

**`diasUteisRealDoEmpregadoNoCiclo`** — usa `usuarios.dias_trabalho` (JSONB) + mesmos feriados. Cada empregado pode ter jornada diferente. Retornado em `acumulado.diasUteisRealDoEmpregadoNoCiclo`. Usado em `DashFocoHoje` para calcular "Potencial este ciclo".

**Data exata do pagamento** (`dataPagamentoFormatada`) — calculada no backend (seção 10 de `api/dashboard.js`): 5º dia útil do mês de pagamento usando CLT Art. 459 (Seg–Sab contam, domingo não), excluindo feriados visíveis. Retornada em `pagamentoPendente.dataPagamentoFormatada` (string por extenso, ex: "segunda-feira, 05 de maio de 2025"). `DashPagamentosModal` exibe essa data quando disponível.

**`pagamentoPendente` — lógica de fallback (2026-04):** se `totalGanhoPeriodo > 0`, mostra ciclo atual. Se for 0 (ex: primeiro dia do novo ciclo) e `valorCicloAnterior > 0`, mostra o ciclo anterior. Evita o modal aparecer vazio no primeiro dia do ciclo.

---
