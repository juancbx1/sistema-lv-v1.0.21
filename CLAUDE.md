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

## Status das Áreas

Tabela de controle para evitar retrabalho. Atualizar sempre que uma etapa for concluída.

| Área | Arquivo CSS | React 100% | CSS Limpo | Observações |
|---|---|---|---|---|
| Ordens de Produção | `ordens-de-producao.css` | ✅ | ✅ | Referência de qualidade para outras áreas |
| Central de Pagamentos | `central-de-pagamentos.css` | ✅ | ❌ | |
| Dashboard Funcionário | `dashboard.css` | ✅ | ❌ | |
| Arremates | `arremates.css` | ✅ | ❌ | React 100% confirmado. CSS tem classes legadas ainda não limpas |
| Embalagem de Produtos | `embalagem-de-produtos.css` | ❓ | ❌ | Verificar migração React |
| Estoque | `estoque.css` | ❓ | ❌ | Verificar migração React |
| Financeiro | `financeiro.css` | ❓ | ❌ | Verificar migração React |
| Usuários Cadastrados | `usuarios-cadastrados.css` | ✅ | ❌ | |
| Home / Admin | `home.css` | ✅ | ❌ | |
| Gerenciar Produção | `gerenciar-producao.css` | ❓ | ❌ | Verificar migração React |

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
- **Variáveis de ambiente necessárias:** `POSTGRES_URL`, `JWT_SECRET`, e outras definidas no `.env` (não comitar o `.env`).
- **Build:** `npm run build` gera o `dist/` que o Vercel serve.

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
| `api/ponto.js` | `POST /excecao` (saída antecipada/atraso) e `POST /liberar-intervalo` (liberar antecipado para almoço/pausa) |
| `OPStatusCard.jsx` | Card do funcionário ativo: cronômetro ciente da jornada (`calcularTempoEfetivo`), pausa manual (`pausaManualFrozenMsRef` + `pausaManualAcumuladoMsRef`), tolerância S3 em tempo real, botão liberar intervalo, menu ⋮, modal ⓘ com `LinhaDoTempoDia` + `ModalInfoTimeline` |
| `OPPainelAtividades.jsx` | Grid principal (ativos) + seção de inativos; `handleFinalizarTarefa(funcionario, pausaManualMs)` |
| `OPTelaSelecaoEtapa.jsx` | Lista de tarefas para atribuição + card de sugestão inteligente (MELHORIA-07) |
| `OPTelaConfirmacaoQtd.jsx` | Confirmação de quantidade com aviso de ultrapassagem de S3 (MELHORIA-08) |
| `OPAtribuicaoModal.jsx` | Modal de atribuição — passa `tpp` para `OPTelaConfirmacaoQtd` |
| `UserCardEdicao.jsx` | Chips de dias da semana na seção "Jornada" da edição de usuário |
| `UserCardView.jsx` | Exibição dos chips de dias na visualização do card de usuário |
| `public/css/ordens-de-producao.css` | Classes `.oa-inativos-*`, `.bs-*`, `.cracha-*`, `.op-status-*`, `.bs-timeline-*`, `.op-sugestao-*`, `.op-atrib-aviso-horario`, `.op-btn-pausar-timer` |

---

### Fluxo completo de status — como funciona

#### 1. Atualização periódica (polling)
O frontend (`OPPainelAtividades.jsx`) chama `GET /api/producao/status-funcionarios` a cada foco de aba e nos eventos de ação. A API:
1. Busca todos os funcionários (costureiras + tiktiks) do banco com sessões ativas agregadas
2. Busca `ponto_diario` de hoje para todos eles em paralelo
3. Para cada funcionário, chama `determinarStatusFinalServidor(row, pontoDiario)` que recalcula o status com base no horário atual e no ponto do dia
4. Se tem sessão EM_ANDAMENTO → força `PRODUZINDO` (independente do que a função retornou)
5. Retorna o objeto com `status_atual` calculado + horários de jornada + `ponto_hoje`

#### 2. Detecção automática de almoço/pausa (`detectarIntervaloAoFinalizar`)
Chamada no `PUT /api/producoes/finalizar` (step 9), após concluir a sessão. Regras:
- Se `horaAtualSP >= S1_agendado` E almoço não registrado hoje → status = `ALMOCO`, grava `horario_real_s1` + `horario_real_e2` no `ponto_diario`
- Se `horaAtualSP >= S2_agendado` E pausa não registrada E almoço já passou → status = `PAUSA`, grava `horario_real_s2` + `horario_real_e3`
- Caso contrário → status = `LIVRE`

#### 3. `determinarStatusFinalServidor` — lógica de prioridades (CRÍTICO)
Função exportada de `api/usuarios.js`. É chamada SOMENTE pelo `GET /status-funcionarios`. Nunca duplicar essa lógica em outro lugar.

```
Prioridade 1 — PRODUZINDO
  → Se status_atual = 'PRODUZINDO': retorna PRODUZINDO (mas na prática a API de producao.js
    faz override para PRODUZINDO quando existe sessão ativa, então esse step raramente é
    atingido com esse valor no banco)

Prioridade 2 — Status manuais com data (valem APENAS no dia em que foram definidos)
  → Cobre: FALTOU, ALOCADO_EXTERNO, LIVRE_MANUAL
  → Compara status_data_modificacao (data SP) com hoje (data SP)
  → Se bate: retorna o status (LIVRE_MANUAL → LIVRE)
  → Se não bate (dia anterior): cai para cálculo automático

Prioridade 3 — PAUSA_MANUAL (sem expiração — persiste até supervisor liberar)

Prioridade 4 — Cálculo automático
  Verifica dias_trabalho ANTES de qualquer outra coisa:
    → Se hoje não é dia de trabalho (ex: domingo):
        → Se ehLivreManual = true → LIVRE (supervisor autorizou folga atípica)
        → Senão → FORA_DO_HORARIO
  Verifica janela de horário (E1 a S3):
    → Fora da janela → FORA_DO_HORARIO
  Verifica janela de almoço (S1 a E2 — usa ponto_diario quando disponível):
    → Na janela + ehLivreManual → LIVRE (supervisor antecipou retorno)
    → Na janela → ALMOCO
  Verifica janela de pausa (S2 a E3 — usa ponto_diario quando disponível):
    → Na janela + ehLivreManual → LIVRE (supervisor antecipou retorno)
    → Na janela → PAUSA
  Dentro do horário de trabalho → LIVRE
```

**REGRA CRÍTICA**: `ehLivreManual` deve ser declarado ANTES de qualquer early return no passo 4. Se declarado depois do check `if (!diasTrabalhoEfetivo[diaKey])`, o override de folga nunca é alcançado. (BUG-08 — corrigido em v1.5)

---

### Regras de negócio críticas

| Regra | Detalhe |
|---|---|
| **Duração do almoço** | Calculada como `E2 - S1` do cadastro do funcionário (fallback 60min). **Nunca hardcodar `+ 60`** |
| **Duração da pausa** | Calculada como `E3 - S2` do cadastro do funcionário (default 15min) |
| **Retorno dinâmico** | `horario_real_e2` / `horario_real_e3` no `ponto_diario` — substitui o horário agendado no cálculo de "Retorno previsto" |
| **Tolerância S3** | Badge visual em PRODUZINDO quando ultrapassa S3. Sem consequências sistêmicas. Limite informativo: 20min |
| **Botão "Liberar para intervalo"** | Aparece 25min antes do S1 ou S2 SOMENTE se o intervalo do dia ainda não foi registrado (`!ponto_hoje?.horario_real_s1` / `horario_real_s2`). Separado do `.cracha-footer` para não comprimir "Atribuir Tarefa" |
| **LIVRE_MANUAL** | Supervisor "libera" um funcionário inativo para trabalhar. Vence: dias de folga, janela de almoço, janela de pausa, janela de expediente (antes E1 ou depois S3 — permite horas extras autorizadas). Corrigido em BUG-17. |
| **FALTOU / ALOCADO_EXTERNO** | Valem apenas no dia em que foram definidos. No dia seguinte, o cálculo automático assume |
| **PAUSA_MANUAL** | Persiste indefinidamente (até supervisor liberar com LIVRE_MANUAL). Único status sem expiração |
| **Saída antecipada** | Registra `horario_real_s3` no `ponto_diario`. Muda status para FORA_DO_HORARIO. Cancela sessão ativa se houver |
| **Chegada atrasada** | Registra `horario_real_e1` no `ponto_diario`. Muda status para LIVRE |

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
| `ALMOCO` | `detectarIntervaloAoFinalizar` ou cálculo auto | Seção de inativos |
| `PAUSA` | `detectarIntervaloAoFinalizar` ou cálculo auto | Seção de inativos |
| `PAUSA_MANUAL` | Supervisor (obsoleto — opção removida do menu) | Seção de inativos |
| `FORA_DO_HORARIO` | `determinarStatusFinalServidor` (auto) | Seção de inativos |
| `FALTOU` | Supervisor via menu ⋮ | Seção de inativos |
| `ALOCADO_EXTERNO` | Supervisor via menu ⋮ | Seção de inativos |

**Nota**: `PAUSA_MANUAL` foi removida do menu ⋮ (opção "Iniciar Pausa" excluída em v1.5) pois gerava bugs com o sistema automático de detecção de pausa. O status ainda existe no banco e no código de renderização para não quebrar funcionários que possam tê-lo, mas não é mais criado.

---

### Menu ⋮ do OPStatusCard — ações disponíveis

| Status do funcionário | Ações no menu |
|---|---|
| LIVRE / LIVRE_MANUAL / PRODUZINDO | Marcar Falta · Alocar em Outro Setor · Saída Antecipada |
| Qualquer outro (ALMOCO, PAUSA, etc.) | Liberar para Trabalho (LIVRE_MANUAL) |
| FORA_DO_HORARIO | Liberar para Trabalho (LIVRE_MANUAL) · Chegada Atrasada (ATRASO) |

---

### Bugs corrigidos — histórico (importante para debugging futuro)

| Bug | Causa raiz | Correção |
|---|---|---|
| BUG-01 | Status do dia anterior persistia | `statusManuaisFortes` em `api/producao.js` re-aplicava status do DB após `determinarStatusFinalServidor` | Bloco removido |
| BUG-02 | Almoço hardcoded em 60min | `+ 60` hardcoded em `api/producoes.js` e `api/ponto.js` | Calculado via `E2 - S1` delta |
| BUG-03 | Timestamp `status_data_modificacao` quebrava no edge case midnight-3h SP | `(NOW() AT TIME ZONE 'SP')` salva naive local em coluna timestamptz → PostgreSQL interpreta como UTC → ao ler de volta como Date, a data SP fica -3h errada. Entre meia-noite e 3h SP a data do dia anterior é retornada | Defensive parsing: `typeof === 'string' ? substring(0,10) : new Date(rawTs).toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'})` |
| BUG-04 | `dias_trabalho` não persistia após F5 | GET `/api/usuarios` não incluía `u.dias_trabalho` no SELECT | Adicionado ao SELECT |
| BUG-05 | PUT `/api/usuarios` não salvava `dias_trabalho` corretamente | `JSON.stringify()` antes de passar para pg — pg serializa JSONB nativamente | Removido o `JSON.stringify` |
| BUG-06 | Botão "Liberar para almoço" reaparecia após retorno do almoço | `intervaloProximo` não checava se `ponto_hoje.horario_real_s1` já existia | Adicionado guard `!ponto_hoje?.horario_real_s1` |
| BUG-07 | LIVRE_MANUAL não liberava funcionário em dia de almoço (horário exato) | Comparação `>` estrita no limite da janela | Mudado para `>=` |
| BUG-08 | LIVRE_MANUAL não liberava funcionário em dia de folga | `ehLivreManual` declarado APÓS early return `if (!diasTrabalhoEfetivo[diaKey]) return FORA_DO_HORARIO` — o override nunca era alcançado | `ehLivreManual` movido para ANTES do check de `diasTrabalhoEfetivo` |
| BUG-09 | Saída antecipada sem feedback imediato (~30s delay) | `buscarDadosPainel()` chamado após fetch, mas sem atualização local prévia | Atualização otimista em `handleExcecao`: estado muda para `FORA_DO_HORARIO` imediatamente, `buscarDadosPainel` sincroniza depois |
| BUG-10 | Impossível desfazer saída antecipada lançada por engano | Não havia endpoint nem UI para isso | `POST /api/ponto/desfazer-saida` + `handleDesfazerSaida` + botão "Desfazer Saída" nos inativos. SQL: `saida_desfeita`, `saida_desfeita_em`, `saida_desfeita_por` na tabela `ponto_diario` |
| BUG-11 | Botão "Liberar" aparecia para funcionário com saída antecipada | Sem distinção entre FORA_DO_HORARIO por horário vs. saída antecipada | Card de inativo verifica `ponto_hoje.horario_real_s3 && !ponto_hoje.saida_desfeita` → mostra "Desfazer Saída" ou "Liberar" condicionalmente |
| BUG-12 | `atualizarStatusUsuarioDB` engolia erros silenciosamente | `catch` só logava, não relançava — callers recebiam `200 OK` mesmo quando o banco falhou | `throw error` adicionado no catch — callers já têm try/catch e retornam 500 |
| BUG-13 | Horário de saída antecipada gerado no tablet (relógio pode estar errado) | `handleExcecao` calculava `new Date()` no navegador e enviava para a API | `api/ponto.js POST /excecao`: para SAIDA_ANTECIPADA, ignora o `horario` do body e calcula `new Date()` no servidor |
| BUG-16 | FORA_DO_HORARIO após turno encerrado mostrava "Retorno: 07:30 (atrasado 880 min)" | `getInfoInativo` atribuía `retorno = horario_entrada_1` sem checar se o turno já acabou — E1 era tratado como retorno atrasado | Verificação `horaAtual < e1` antes de atribuir retorno: só exibe "Entra às E1" quando ainda não chegou. Após S3 → `retorno = null` |
| BUG-14 | LIVRE_MANUAL destruído ao finalizar tarefa durante janela de almoço — criava loop infinito supervisor libera → finaliza → sistema volta ALMOCO | Step 9 de `api/producoes.js` sobrescrevia status incondicionalmente; `detectarIntervaloAoFinalizar` também criava registro de almoço mesmo com override ativo | Lê `status_atual` do banco antes de detectar intervalo; se for `LIVRE_MANUAL`, preserva e pula a detecção |
| BUG-15 | Pausa exibida como "Almoço" quando funcionária não almoçou via sistema | `detectarIntervaloAoFinalizar` CASO 1 sem limite superior: `horaAtual >= S1 && !horario_real_s1` era verdadeiro também às 16h (hora da pausa) | Adicionado guard `horaAtualSP < s2Agendado` no CASO 1 — se já passou do S2, pula almoço e vai direto ao CASO 2 (pausa) |
| BUG-17 | LIVRE_MANUAL não libera funcionário após S3 — horas extras não funcionam | `determinarStatusFinalServidor` linha 92: `if (horaAtual > saidaFinal) return FORA_DO_HORARIO` sem checar `ehLivreManual` — override de overtime nunca atingido | Adicionado `if (ehLivreManual) return STATUS.LIVRE` dentro do bloco de janela de expediente, padrão idêntico ao já existente para almoço/pausa |
| BUG-18 | Badge `toleranciaS3` só aparecia na próxima poll do servidor, não em tempo real | `useMemo` com `new Date()` interno só recalcula quando as dependências (horários) mudam, não quando o relógio passa de S3 | Convertido para `useState + useEffect + setInterval(30000)` — recalcula a cada 30s independente de re-render |
| BUG-19 | Cronômetro desconectado da jornada — acumulava tempo de almoço/pausa como se fosse trabalho | Timer era um `setInterval` simples sem nenhuma consciência de intervalos do dia | Nova função `calcularTempoEfetivo(dataInicio, pontoHoje)` que desconta almoço/pausa via `ponto_diario` em tempo real. Pausa manual do supervisor via `pausaManualFrozenMsRef` + `pausaManualAcumuladoMsRef`. `api/producao.js` agora inclui `sessoes_hoje` no payload |
| BUG-20 | Cronômetro acumulava tempo de pausa manual ao retomar | `tempoManualPausadoMsRef` congelava o display, mas ao retomar `calcularTempoEfetivo` recalculava desde `data_inicio` sem conhecer a pausa → exibia tempo real acumulado | Dois refs: `pausaManualFrozenMsRef` (display congelado) + `pausaManualAcumuladoMsRef` (offset permanente). `handleRetomarTimer` calcula `drift = efetivoBruto - frozenMs` e acumula. `atualizar()` subtrai o acumulado do resultado |
| BUG-21 | `POST /producao/sugestao-tarefa` falhava com dois erros de tipo em queries diferentes | (a) `numero` em `ordens_de_producao` é `character varying` mas query usava `ANY($1::int[])` → `character varying = integer`; (b) `funcionario_id` em `sessoes_trabalho_producao` é INTEGER mas tentativa de correção adicionou `::text` → `integer = text` | (a) Trocado para `ANY($1::text[])` com `String(n)` no map lookup; (b) Removido o cast — `WHERE funcionario_id = $1` sem cast |
| BUG-23 | Blocos azuis (sessões de produção) não apareciam na Linha do Tempo do Dia | `json_build_object` retornava timestamp completo (`"2026-04-14T16:00:00"`); a função `n()` em `LinhaDoTempoDia` extrai `substring(0,5)` esperando `"HH:MM"`, obtendo `"2026-"` → `toMin` retornava NaN → segmentos silenciosamente ignorados | Trocado para `to_char(data_inicio AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')` na query — retorna diretamente `"HH:MM"` |
| BUG-24 | Tarefa sugerida aparecia duplicada — uma vez no card dourado e outra na lista normal abaixo | `tarefasPaginadas` era derivado de `listaFinalFiltrada` sem excluir a sugestão já exibida | Novo `useMemo` `listaParaExibir` que filtra a tarefa sugerida da lista quando o card de sugestão está visível (`!termoFiltro && sugestao`). Paginação e contagens passaram a usar `listaParaExibir` |
| BUG-22 | Pausa manual do cronômetro não era persistida no banco — tempo de espera inflava produtividade histórica | `PUT /finalizar` não recebia nem salvava o tempo de pausa manual; `sessoes_trabalho_producao` não tinha coluna para isso | Nova coluna `pausa_manual_ms INTEGER DEFAULT 0` na tabela. `OPStatusCard` passa `pausaManualAcumuladoMsRef.current` para `onFinalizarTarefa`, que chega via `OPPainelAtividades` até o `PUT /finalizar`. API salva no UPDATE. **SQL migration obrigatória:** `ALTER TABLE sessoes_trabalho_producao ADD COLUMN IF NOT EXISTS pausa_manual_ms INTEGER DEFAULT 0;` |

---

### Tabela `ponto_diario` — campos adicionados em v1.6

| Campo | Significado |
|---|---|
| `saida_desfeita` | `BOOLEAN DEFAULT FALSE` — true quando o supervisor desfez a saída |
| `saida_desfeita_em` | `TIMESTAMPTZ` — quando foi desfeita |
| `saida_desfeita_por` | `TEXT` — nome do supervisor que desfez (+ motivo opcional) |

> Quando `saida_desfeita = true`, o campo `horario_real_s3` é preservado para auditoria mas **ignorado** pelo `determinarStatusFinalServidor` ao calcular `saidaFinal`.

---

### `determinarStatusFinalServidor` — única fonte de verdade de status

**Nunca duplicar esta lógica.** Nunca fazer override do resultado em `api/producao.js` ou em qualquer outro lugar. Todo status manual que precisa persistir faz isso via `atualizarStatusUsuarioDB()` que grava no banco com timestamp — e `determinarStatusFinalServidor` lerá esse valor na próxima chamada.

A única exceção é o override para `PRODUZINDO` em `api/producao.js` quando há sessão ativa — isso é intencional e não é uma duplicação de lógica, é uma regra de negócio diferente (sessão ativa sempre bate PRODUZINDO, independente do status do banco).

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

## Funcionalidades Implementadas — Central de Alertas (referência)

### Visão geral
- Componente principal: `public/src/components/AlertasFAB.jsx` (sino flutuante presente em todas as páginas admin)
- API: `api/alertas.js` — endpoints `/verificar-status`, `/configuracoes`, `/dias-trabalho`, `/historico`
- Config UI: `public/src/pages/ConfigAlertas/` (ConfigAlertasPage, AlertaCard, DiasTrabalhoCard, HorariosCard)
- Documentação completa: `_planejamento/central-de-alertas.md` (v2.4)

### Tipos de alerta — nomenclatura correta (não alterar sem migration de banco)

| Constante | Significado |
|---|---|
| `DEMANDA_NORMAL` | Demanda criada sem prioridade (antes chamada incorretamente de `DEMANDA_NOVA` até v2.3) |
| `DEMANDA_PRIORITARIA` | Demanda criada com prioridade = 1 |
| `OCIOSIDADE_COSTUREIRA` / `OCIOSIDADE_ARREMATE` | Funcionário sem tarefa além do gatilho |
| `LENTIDAO_COSTUREIRA` / `LENTIDAO_CRITICA_ARREMATE` | Tarefa com >120% do tempo TPP estimado |
| `DEMANDA_NAO_INICIADA` | Demanda prioritária parada há mais do gatilho configurado |
| `META_BATIDA_ARREMATE` | Evento positivo — tiktik bateu a meta diária |

### Regras críticas da Central de Alertas

- **Nunca hardcodar portão de horário no frontend.** O controle de expediente fica exclusivamente em `api/alertas.js` (timezone SP, lido do banco). O frontend só usa a `janelaPollRef` (carregada do banco como `janela_polling`) para economizar chamadas à API.
- **Alertas de evento** (`DEMANDA_NORMAL`, `DEMANDA_PRIORITARIA`, `META_BATIDA_ARREMATE`) sempre disparam — não são bloqueados pelo horário de expediente. Só os **alertas de tempo** (ociosidade, lentidão, demanda não iniciada) respeitam o calendário.
- **LENTIDAO_COSTUREIRA** usa TPP da tabela `tempos_padrao_producao` com chave composta `produto_id + processo`. Sem TPP cadastrado, o alerta não dispara (só loga `console.warn`).
- **Polling:** a cada 4 minutos, `AlertasFAB` chama `GET /api/alertas/verificar-status`. Backoff de 5 erros consecutivos (reseta ao voltar à aba). Janela de polling configurável em "Configurar Alertas".
