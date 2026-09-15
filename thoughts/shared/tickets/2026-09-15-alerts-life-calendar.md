---
data: 2026-09-15
status: backlog
prioridade: media
fase_mvp: sim
---

# Feature: Alerts e Life Calendar básico (F08)

## Contexto

O wedge inicial (`CLAUDE.md` → Nova tese de valor prioritária) termina em "Alert": Coverage Check (F03), Renewal/Price Increase Detection (F04/F05) e Bills Intelligence + Bills Dashboard (F06/F07) já geram `insights` e sincronizam `events`, mas cada um fica confinado ao seu próprio ecrã — não existe hoje um ecrã único que consolide "o que preciso de saber agora" em toda a app. Esta ficha cria esse ecrã consolidado de alertas e um calendário simples de 60 dias.

Estado actual do repositório, relevante para esta ficha:

- **A tabela `events` já existe** (`supabase/schema.sql:242-267`, colunas `id, user_id, type, due_date, source_id, created_at`, RLS completo com select/insert/update/delete) — ao contrário do que o ticket F07 assumia na altura ("não existe ainda"), ela foi criada entretanto. **Não é preciso criar schema novo para a funcionalidade (1)** — reutilizar `public.events`.
- **`src/lib/events.ts` já lê/escreve `events`, mas de forma limitada:** `syncRenewalEvents()` só grava eventos `type: 'renewal'`, e só para contratos com `type` em `insurance`/`utility` (`BILLS_RELEVANT_CONTRACT_TYPES`, `src/lib/events.ts:9`) — chamado apenas a partir de `fetchUpcomingBillRenewals()` (`src/lib/events.ts:36-46`), usado hoje só no ecrã Bills (`app/(dashboard)/bills.tsx:14,35`). Contratos de tipo `subscription`/`other` nunca geram evento. Os tipos `expiry` e `deadline` de `EventType` (`src/types/events.ts:1`) **nunca são escritos por nenhum código actual** — não há sync a partir de `coverage.end_date` (garantias/seguros a expirar) nem de `assets`/`documents`. Esta ficha precisa de decidir em `/plan` se generaliza `syncRenewalEvents` para todos os `contracts` com `renewal_date` (não só insurance/utility) e se adiciona sync de `expiry` a partir de `coverage` — ou se mantém o alcance actual e documenta a limitação.
- **`fetchUpcomingEvents()` (`src/lib/events.ts:20-29`) filtra com `isExpiringSoon(e.due_date, RENEWAL_THRESHOLD_DAYS)`, e `RENEWAL_THRESHOLD_DAYS = 30`** (`src/lib/insights.ts:27`) — hardcoded a 30 dias. O pedido desta ficha é uma vista de calendário para **60 dias**. `isExpiringSoon(dateISO, thresholdDays = 30)` (`src/lib/rulesEngine.ts:11-14`) já aceita um `thresholdDays` custom, por isso o calendário de 60 dias pode reutilizar a função directamente sem duplicar lógica — mas não pode reutilizar `fetchUpcomingEvents()` tal como está sem ou generalizar o threshold como parâmetro, ou criar uma segunda função de fetch. Decidir a abordagem em `/plan`.
- **`insights` não tem nenhuma coluna de estado (lido/resolvido).** Schema actual (`supabase/schema.sql:177-186`): `id, user_id, contract_id, type, severity, data, message, created_at` (mais `bill_id`, adicionado depois via `alter table` em `supabase/schema.sql:239-240`). Não existe `resolved_at`, `resolved`, `read_at` nem semelhante. A funcionalidade (4) "marcar insight como lido/resolvido" **precisa de uma migração de schema nova** (nova coluna em `insights`). A boa notícia: a policy `update` em `insights` já existe (`supabase/schema.sql:198-200`, `using (auth.uid() = user_id)`), por isso o `UPDATE` via Supabase client funciona assim que a coluna existir — não é preciso tocar em RLS.
- **`InsightType` actual é `'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase'`** (`src/types/insights.ts:3`) — **não existe nenhum tipo `coverage_gap`** nem qualquer insight relacionado com Coverage Check persistido em `insights`. `evaluateCoverage()` (`src/lib/rulesEngine.ts:33-51`) já calcula `gaps` (garantia/seguro em falta ou expirado) mas isto corre **apenas em runtime** dentro do ecrã Coverage (`app/(dashboard)/coverage.tsx` → `fetchCoverageForAsset` + `CoverageResult`), por asset seleccionado, e nunca é guardado como `insight`. **Implicação directa para a funcionalidade (3) desta ficha ("filtro por tipo: coverage, bills, renewal"):** o bucket "coverage" não tem hoje nenhuma linha em `insights` para filtrar — é preciso decidir em `/plan` uma de três opções: (a) começar a persistir `coverage_gap` como novo `InsightType` sempre que `evaluateCoverage()` detectar um gap (implica correr a avaliação para todos os assets do utilizador, não só o seleccionado, provavelmente no load do ecrã de alertas), (b) mapear o filtro "coverage" para os `events` de tipo `expiry` (se vierem a ser sincronizados a partir de `coverage`, ver ponto acima) em vez de `insights`, ou (c) manter o filtro na UI mas aceitar que "coverage" fica vazio nesta ficha até uma ficha futura persistir esses insights. Esta é a decisão mais estrutural da ficha.
- **Mapeamento dos outros dois buckets do filtro é directo:** "renewal" → `insight.type === 'renewal'` (gerado por `generateInsightsForContract`, `src/lib/insights.ts:95+`) e por extensão os `events.type === 'renewal'`; "bills" → `insight.type` em `price_increase | anomaly | recurring_increase` (todos gerados com `bill_id` preenchido, ver `generateInsightsForBill`, `src/lib/insights.ts:141+`).
- **`Badge` (`src/components/ui/Badge.tsx`) e `colors` (`src/constants/theme.ts:18-22`) já têm exactamente as cores pedidas** — `colors.warning = '#C9A15C'` (dourado) e `colors.critical = '#A3402E'` (vermelho subtil), mais `colors.info = '#5B685F'` e `colors.success = '#4A7856'`. `InsightCard` (`src/components/dashboard/InsightCard.tsx`) já usa `<Badge tone={insight.severity} />` para severidade — **reutilizar `Badge`/`InsightCard` tal como estão, não recriar a lógica de cor**. Não é preciso adicionar nenhum token novo ao tema.
- **Não existe tab "Alerts" nem "Calendar" em `app/(dashboard)/_layout.tsx`** — as tabs actuais são `index` (Dashboard), `documents`, `coverage`, `bills`, `settings` (`app/(dashboard)/_layout.tsx:14-18`). É preciso decidir em `/plan` se este ecrã consolidado é uma tab nova (`alerts.tsx`) ou se substitui/expande o `index.tsx` actual (que já mostra "Upcoming renewals" via `RenewalTimeline` + "Recent insights" via `InsightCard`, `app/(dashboard)/index.tsx:29-53` — sobreposição directa com as funcionalidades (1) e (2) desta ficha). Criar uma tab nova arrisca duplicar o que o Dashboard já mostra; expandir o `index.tsx` existente arrisca sobrecarregar o ecrã principal com o calendário de 60 dias. Documentar a decisão em `/plan`.
- **Vista de calendário:** tal como no ticket F07 para gráficos, **não há nenhuma biblioteca de calendário instalada** (`package.json` sem `react-native-calendars` ou equivalente). "Vista de calendário simples" pode ser resolvida sem biblioteca nova (lista agrupada por dia/semana, já no estilo do resto da app) ou com uma biblioteca dedicada — decidir em `/plan` com o mesmo critério do F07 (compatibilidade Expo SDK 57 / New Architecture).

**Implicação central:** esta ficha tem três decisões estruturais por resolver em `/plan` antes de implementar — (1) origem de dados para o filtro "coverage" (não existe hoje nenhum insight persistido desse tipo), (2) generalizar ou não `syncRenewalEvents`/`RENEWAL_THRESHOLD_DAYS` para cobrir todos os contratos e uma janela de 60 dias em vez de 30, e (3) onde vive este ecrã na navegação (tab nova vs. expansão do Dashboard existente, que já cobre parcialmente as funcionalidades 1 e 2). A migração para marcar insights como lidos/resolvidos é schema novo mas isolado (uma coluna), sem estas ambiguidades.

## Comportamento esperado

**Dado que** o utilizador tem eventos futuros em `events` (renovações sincronizadas por `syncRenewalEvents`)
**Quando** abre o ecrã de Alerts/Calendar
**Então** vê a lista de eventos ordenada por `due_date` ascendente, incluindo os que caem fora da janela de 30 dias actualmente aplicada por `fetchUpcomingEvents()` mas dentro dos 60 dias pedidos nesta ficha

**Dado que** existem insights recentes em `insights` (`price_increase`, `renewal`, `anomaly`, `recurring_increase`)
**Quando** o ecrã é apresentado
**Então** cada insight mostra um badge de severidade reutilizando `Badge`/`colors.warning`/`colors.critical` já existentes, sem recalcular cor nem texto no componente novo

**Dado que** o utilizador selecciona o filtro "bills", "renewal" ou "coverage"
**Quando** aplica o filtro
**Então** a lista mostra apenas os insights/eventos do bucket seleccionado, usando o mapeamento documentado em `/plan` (bills → `price_increase`/`anomaly`/`recurring_increase`; renewal → `renewal`; coverage → fonte de dados a decidir, já que não existe hoje nenhum insight persistido desse tipo)

**Dado que** o utilizador marca um insight como lido/resolvido
**Quando** a acção é confirmada
**Então** o estado é persistido na nova coluna de `insights` (via `UPDATE`, permitido pela policy já existente) e o insight deixa de aparecer na lista de "não lidos" por omissão, mas continua acessível nalguma vista de histórico

**Dado que** existem eventos com `due_date` dentro dos próximos 60 dias
**Quando** o utilizador abre a vista de calendário
**Então** vê os eventos agrupados por data (dia ou semana) dentro dessa janela, sem eventos fora do intervalo e sem duplicar a lista já mostrada em "Upcoming renewals" no Dashboard actual

**Dado que** não há eventos nem insights nalgum bucket/filtro
**Quando** o ecrã ou o filtro é apresentado
**Então** mostra um estado vazio claro, nunca um erro

## Critérios de aceitação

- [ ] Lista de eventos de `events` ordenada por `due_date` asc, reutilizando `fetchUpcomingEvents`/`isExpiringSoon` (generalizados para 60 dias, não duplicados)
- [ ] Lista de insights recentes com badge de severidade via `Badge`/`colors.warning`(`#C9A15C`)/`colors.critical`(`#A3402E`) já existentes — sem hex novo, sem lógica de cor duplicada
- [ ] Filtro por tipo (coverage / bills / renewal) com mapeamento documentado para `InsightType`/`EventType`; decisão sobre a origem de dados de "coverage" documentada e implementada (persistir `coverage_gap` como novo insight, mapear para `events.type = 'expiry'`, ou aceitar bucket vazio nesta ficha — decidido em `/plan`)
- [ ] Nova coluna em `insights` (migração em `supabase/schema.sql`) para marcar como lido/resolvido, actualizada via `UPDATE` (RLS já permite)
- [ ] Vista de calendário dos próximos 60 dias, sem biblioteca nova se a lista agrupada por dia/semana for suficiente (decidir em `/plan`)
- [ ] Decisão de navegação documentada: tab nova `alerts`/`calendar` em `app/(dashboard)/_layout.tsx` vs. expansão do `index.tsx` actual — sem duplicar "Upcoming renewals"/"Recent insights" já existentes no Dashboard
- [ ] Nenhum cálculo de severidade, percentagem ou data feito pelo LLM — apenas `rulesEngine.ts`/`src/lib/events.ts`/`src/lib/insights.ts`
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Reutilização obrigatória:** `fetchUpcomingEvents`, `isExpiringSoon`, `daysUntil` (`rulesEngine.ts`), `Badge`, `InsightCard`, `RenewalTimeline` — esta ficha consolida e filtra, não recalcula datas nem severidades do zero.
- **Ponto mais ambíguo: bucket "coverage" do filtro.** Não existe hoje nenhum caminho que persista um insight/evento de coverage gap. `evaluateCoverage()` (`src/lib/rulesEngine.ts:33-51`) já produz `gaps`, mas só corre por asset seleccionado no ecrã Coverage, nunca em lote. Decidir em `/plan` se vale a pena, nesta ficha, correr `evaluateCoverage()` para todos os assets do utilizador no load do ecrã de Alerts (sem persistir) ou se se introduz já a persistência (`coverage_gap` como novo `InsightType`, gerado em algum momento — upload de documento? abertura do ecrã de coverage? cron?). Isto tem impacto directo no esforço da ficha.
- **`RENEWAL_THRESHOLD_DAYS = 30` (`src/lib/insights.ts:27`) é hoje usado tanto para severidade de "renewal soon" como para o filtro de `fetchUpcomingEvents`.** Ao introduzir uma janela de 60 dias só para a vista de calendário, confirmar que não se está a alterar sem querer o threshold usado para gerar o insight `renewal` em si (esse deve manter-se a 30 dias, ou o critério de severidade muda) — são dois usos diferentes do mesmo threshold hoje acoplados na mesma constante.
- **`syncRenewalEvents` só cobre `contracts.type in (insurance, utility)`** (`BILLS_RELEVANT_CONTRACT_TYPES`, `src/lib/events.ts:9`). Um calendário de vida "geral" (não só bills) provavelmente deve incluir também `subscription`/`other` — decidir se generaliza o filtro ou se mantém o alcance actual e documenta a lacuna.
- **Navegação:** o `index.tsx` actual (`app/(dashboard)/index.tsx`) já mostra "Upcoming renewals" e "Recent insights" sem filtro nem paginação — esta ficha não deve duplicar essas queries lado a lado; escolher entre substituir essas secções por versões que apontam para o novo ecrã consolidado, ou mover a lógica para lá e deixar o Dashboard como resumo.
- **Migração da coluna de estado em `insights`:** nome sugerido `resolved_at timestamptz null` (mais simples de indexar "não lidos" com `is null`) em vez de um booleano — decidir em `/plan`, mas manter consistente com o padrão `created_at timestamptz` já usado no resto do schema.

## Fora do escopo

- Persistir novos eventos `expiry`/`deadline` a partir de `assets`/`documents` (garantias de produto, prazos de devolução) — só `coverage`→`renewal` de contratos está coberto hoje; expandir para outras fontes fica para Smart Life Alerts (Phase 5)
- Notificações push/email quando um evento entra na janela de 60 dias — esta ficha é só o ecrã, não o mecanismo de notificação
- Edição/criação manual de eventos pelo utilizador — o calendário é só leitura dos dados já sincronizados
- Vista de calendário mensal completa (grelha tipo agenda) — "simples" nesta ficha significa lista agrupada por data dentro de 60 dias, não um componente de calendário completo
- Geração em lote/cron de `coverage_gap` fora do momento em que o ecrã de Alerts é aberto (se essa opção for escolhida em `/plan`) — automação fica para Phase 5/Zelanna Agent

## Próximo passo
/research O bucket "coverage" do filtro deve persistir `coverage_gap` como novo `InsightType` (e nesse caso, em que momento é gerado — load do ecrã, upload de documento, ou cron?), ou deve reutilizar `evaluateCoverage()` em runtime sem persistência? `syncRenewalEvents`/`RENEWAL_THRESHOLD_DAYS` devem ser generalizados para todos os `contracts` e para uma janela de 60 dias, ou mantém-se o alcance actual (só insurance/utility, 30 dias) e cria-se uma função separada para o calendário? O ecrã de Alerts/Calendar deve ser uma tab nova em `app/(dashboard)/_layout.tsx` ou uma expansão do `index.tsx` actual?
