---
data: 2026-09-15
status: backlog
prioridade: media
fase_mvp: nao
---

# Feature: Warranty Vault (F10)

## Contexto

Warranty Vault é a Phase 3 do roadmap (`CLAUDE.md` → Roadmap), explicitamente fora do wedge inicial (Coverage Check / Renewal Detection / Bills Intelligence). O `CLAUDE.md` é directo sobre o posicionamento: "Não vender como 'mais um warranty tracker' — o valor está na relação Asset → Purchase → Invoice → Warranty → Protection → Maintenance." Esta ficha não introduz conceitos novos de schema do zero — ela **completa** o que o F04 (Coverage Check) já deixou parcialmente construído e assinalado como fora do seu escopo.

Estado actual do repositório (F04, F08 e F05 já implementados):

- **`assets` e `coverage` já existem em `supabase/schema.sql`** (linhas 69–139), com RLS completo. `assets` tem `name`, `category`, `brand`, `model`, `serial_number`, `purchase_date`, `purchase_price` — mas **não tem `seller`/vendedor nem `return_deadline`**, ambos pedidos explicitamente nesta ficha e no `CLAUDE.md` → Warranty Vault ("vendedor, return deadline"). `coverage` tem `type`/`provider`/`start_date`/`end_date` mas nenhuma tabela para `maintenance` ou `claims` — **não existem no schema**.
- **A criação de assets hoje só existe via `createAssetFromDocument()`** (`src/lib/coverage.ts:52`), invocada por `CreateAssetFromDocumentForm` (`src/components/coverage/`). Este fluxo é deliberadamente mínimo (nome, categoria, uma única cobertura) e foi construído no F04 só para desbloquear o Coverage Check — a ficha do F04 documenta isto explicitamente: *"CRUD completo de assets (produto/modelo, número de série, vendedor, maintenance, claims) — isso é o F10, Warranty Vault completo, Phase 3"* (`thoughts/shared/tickets/2026-09-15-coverage-check.md:91`). **Não existe hoje nenhum ecrã ou função para editar um asset já criado, editar/eliminar um registo de `coverage` existente, ou criar um asset manualmente sem partir de um documento.**
- `src/lib/insights.ts` → `generateCoverageGapInsights()` já gera um insight `coverage_gap` (upsert por `asset_id, type, coverage_type`) mas **só para os estados `missing` e `expired`** (`evaluateCoverage()` em `src/lib/rulesEngine.ts:41` só devolve gaps para cobertura fora de vigor). **Não existe hoje nenhum insight/alerta para o estado `expiring_soon`** — o ecrã Coverage Check mostra o badge dourado "Expiring soon" em runtime, mas isso nunca aparece na lista de Alerts nem gera um evento no Life Calendar. É exactamente o que esta ficha pede: "alertas automáticos de expiração de garantia... via o rules engine".
- **`return_deadline` não existe em lado nenhum** — nem no schema, nem em `CoverageType` (`'warranty' | 'insurance' | 'extension'`), nem em `InsightType`, nem em `rulesEngine.ts`. É um conceito totalmente novo introduzido por esta ficha.
- **`events`/Life Calendar (F08) só cobre renovações de `contracts`.** `src/lib/events.ts` tem `syncRenewalEvents()`, `fetchLifeCalendarEvents()` e `joinEventsWithContracts()` todos hardcoded a `contracts`/`ContractRenewalEvent`, apesar de `events.source_id` já ser genérico por comentário no schema ("referência a contracts/coverage/assets"). Ligar expiração de warranty/return deadline ao Life Calendar implica generalizar este join, não apenas inserir linhas em `events`.
- `src/types/insights.ts` → `InsightType` é `'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase' | 'coverage_gap'` — sem tipo para "warranty a expirar em breve" nem "return deadline a expirar".
- Não existe nenhum ecrã de detalhe de asset (`app/(dashboard)/coverage.tsx` só lista/selecciona assets para o Coverage Check, não mostra a relação completa). Não existe pasta `app/(dashboard)/assets/` nem `src/components/assets/` — a estrutura de pastas do `CLAUDE.md` já assinala isto: "assets/ (Warranty Vault, fase 3)... ainda por criar".
- O tab bar (`app/(dashboard)/_layout.tsx`) tem `index`, `documents`, `coverage`, `bills`, `alerts`, `settings` — sem tab para Assets/Warranty Vault.

**Implicação central:** esta ficha não é "criar Warranty Vault do zero" — é decidir em `/plan` até que ponto generalizar o CRUD de asset/coverage já parcialmente construído no F04 (reutilizando `Asset`, `CoverageRecord`, `evaluateCoverage`, `getCoverageStatus`) versus construir componentes novos dedicados a assets fora do fluxo do Coverage Check, e decidir o schema mínimo para `maintenance`/`claims`/`return_deadline` que ainda não existe.

## Comportamento esperado

**Dado que** o utilizador não tem nenhum asset registado
**Quando** abre o Warranty Vault
**Então** vê um estado vazio com opção de criar um asset manualmente (sem depender de já ter um documento carregado, ao contrário do fluxo actual do F04)

**Dado que** o utilizador está a criar ou editar um asset
**Quando** preenche o formulário
**Então** pode indicar produto/modelo, marca, número de série, preço, data de compra, vendedor (campo novo) — persistido em `assets`

**Dado que** o utilizador está num asset existente
**Quando** adiciona uma cobertura
**Então** pode registar warranty period (`start_date`/`end_date` em `coverage`, `type='warranty'`), return deadline (campo/registo novo, por decidir em `/plan` se é coluna em `assets` ou tipo em `coverage`) e insurance/extension (`coverage`, `type='insurance'|'extension'`)

**Dado que** o utilizador está num asset existente
**Quando** regista uma manutenção
**Então** fica um registo de maintenance associado ao `asset_id` (data, descrição, custo opcional) — tabela nova, schema mínimo a decidir em `/plan`

**Dado que** o utilizador está num asset existente
**Quando** regista uma claim (participação de sinistro/garantia accionada)
**Então** fica um registo de claim associado ao `asset_id` e opcionalmente à `coverage` usada (data, descrição, estado, resultado) — tabela nova, schema mínimo a decidir em `/plan`

**Dado que** uma cobertura (`warranty`/`insurance`/`extension`) de um asset está a expirar dentro do threshold (`isExpiringSoon`, 30 dias, mesmo default do resto da app)
**Quando** o rules engine avalia o asset (reutilizando `getCoverageStatus`/`evaluateCoverage` de `src/lib/rulesEngine.ts`)
**Então** é criado automaticamente um insight/alerta (aparece em `app/(dashboard)/alerts.tsx`) — hoje isto **não acontece**, só o estado `missing`/`expired` gera insight

**Dado que** um asset tem um return deadline a expirar dentro do threshold
**Quando** o rules engine avalia o asset
**Então** é criado automaticamente um insight/alerta equivalente, com o mesmo padrão de severidade (`warning` dentro do threshold, `critical` nos últimos 7 dias, como já acontece em `generateInsightsForContract` para `renewal`)

**Dado que** existe um alerta de expiração de warranty ou return deadline
**Quando** o utilizador abre o Life Calendar (Alerts screen, secção "Next 60 days")
**Então** o evento aparece ao lado dos renewals de contratos já existentes — implica generalizar `fetchLifeCalendarEvents`/`joinEventsWithContracts` (hoje hardcoded a `contracts`) para também juntar eventos de origem `assets`/`coverage`

**Dado que** o utilizador abre a vista de detalhe de um asset
**Quando** o ecrã carrega
**Então** mostra a relação completa: dados de compra (Purchase), documento de origem se existir (Invoice, via `documents.asset_id`), coberturas activas/expiradas (Warranty/Protection), manutenções (Maintenance) e claims — numa única vista, não em ecrãs separados sem contexto

**Dado que** o Coverage Check (F04) já lê `assets`/`coverage` via `fetchAssets`/`fetchCoverageForAsset`
**Quando** um asset é criado/editado pelo Warranty Vault
**Então** o Coverage Check continua a funcionar sem alterações — o Warranty Vault estende os dados que o F04 já consome, não substitui `src/lib/coverage.ts`

## Critérios de aceitação

- [ ] `supabase/schema.sql`: `assets` ganha `seller text` e um campo para return deadline (nome e localização — coluna em `assets` vs. registo em `coverage`/tabela dedicada — decidido em `/plan`)
- [ ] `supabase/schema.sql`: tabelas novas `maintenance` e `claims` com RLS via `asset_id` (mesmo padrão de `coverage`: policy com `exists (select 1 from assets where assets.id = maintenance.asset_id and assets.user_id = auth.uid())`)
- [ ] CRUD completo de `assets`: criar, editar, eliminar — hoje só existe `createAssetFromDocument` (criação mínima); função de edição/eliminação ainda não existe em `src/lib/coverage.ts`
- [ ] CRUD completo de `coverage`: hoje só existe criação (dentro de `createAssetFromDocument`); esta ficha adiciona editar/eliminar registos de `coverage` já existentes (explicitamente fora do escopo do F04)
- [ ] Criação de asset manual, sem depender de um documento existente (hoje o único caminho é `CreateAssetFromDocumentForm`, que exige um documento em `documentsWithoutAsset`)
- [ ] Registo de maintenance e claims associados a um `asset_id`, com formulário e listagem próprios
- [ ] Novo tipo de insight (`InsightType` em `src/types/insights.ts`) para warranty/insurance/extension a expirar em breve — distinto de `coverage_gap` (que hoje só cobre `missing`/`expired`), reutilizando `getCoverageStatus`/`isExpiringSoon` de `src/lib/rulesEngine.ts`
- [ ] Novo tipo de insight para return deadline a expirar em breve, com o mesmo padrão de severidade usado em `generateInsightsForContract` (`warning` dentro do threshold, `critical` nos últimos 7 dias)
- [ ] Os dois insights novos aparecem em `app/(dashboard)/alerts.tsx` e respeitam `resolveInsight`/`filterInsightsByBucket` já existentes (decidir em `/plan` se entram no filtro `'coverage'` existente ou se `AlertsFilter` ganha um novo bucket)
- [ ] `src/lib/events.ts`: `fetchLifeCalendarEvents` passa a incluir eventos de expiração de warranty/return deadline a par dos renewals de `contracts` — a generalização de `joinEventsWithContracts` (hoje hardcoded a `Contract`) é decidida em `/plan`
- [ ] Vista de detalhe do asset (ecrã novo, ex: `app/(dashboard)/assets/[id].tsx` ou equivalente) mostra Purchase, documento de origem (se existir via `documents.asset_id`), coberturas, maintenance e claims associados, numa vista só
- [ ] Coverage Check (F04) continua a funcionar sem alterações a `src/lib/coverage.ts` que quebrem `fetchAssets`/`fetchCoverageForAsset`/`fetchDocumentsWithoutAsset` já usados por `app/(dashboard)/coverage.tsx`
- [ ] Motor de cálculo (estado de cobertura, dias até expirar, severidade) permanece 100% determinístico — nenhuma chamada ao LLM para decidir se um asset está coberto ou se um alerta deve disparar (`CLAUDE.md` regra #6)
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Reutilização vs. novo CRUD:** `src/lib/coverage.ts` já tem `fetchAssets`, `fetchCoverageForAsset`, `fetchCoverageForUser`, `createAssetFromDocument`. Esta ficha deve estender este ficheiro (ou criar `src/lib/assets.ts` dedicado, se `/plan` decidir separar Warranty Vault de Coverage Check) com `updateAsset`, `deleteAsset`, `createAsset` (manual, sem documento), `updateCoverage`, `deleteCoverage`. Decidir nomenclatura/organização em `/plan` para não duplicar `ASSET_COLUMNS`/`COVERAGE_COLUMNS`.
- **`return_deadline`: onde vive?** Duas opções razoáveis: (a) coluna `return_deadline date` em `assets` (simples, um valor por asset); (b) mais um `type` em `coverage` (ex: `'return_window'`), reaproveitando `start_date`/`end_date`. A opção (a) é mais simples mas foge ao padrão "tudo o que tem uma janela de datas vive em `coverage`"; a opção (b) reaproveita `evaluateCoverage`/`getCoverageStatus` sem alterações mas exigiria ajustar `CoverageType` e a UI do Coverage Check (que hoje só trata `warranty`/`insurance`/`extension`) para não confundir "return deadline" com "estás protegido". Decidir em `/plan`.
- **Padrão de insight a seguir:** `generateCoverageGapInsights()` usa `upsert` com `onConflict: 'asset_id,type,coverage_type'` e um índice único parcial (`insights_coverage_gap_unique`, `supabase/schema.sql:251`) para evitar duplicar o mesmo alerta em execuções sucessivas. O novo insight de "expiring soon" deve seguir o mesmo padrão de upsert idempotente — decidir em `/plan` se reutiliza a mesma unique constraint (ajustando `type` para incluir o novo valor) ou se precisa de uma nova.
- **Generalizar `events.ts` é o ponto de maior risco de regressão.** `ContractRenewalEvent`, `joinEventsWithContracts`, `fetchLifeCalendarEvents` e `fetchUpcomingBillRenewals` estão todos acoplados a `Contract`. `LifeCalendar` (`src/components/dashboard/LifeCalendar.tsx`) e `AlertsScreen` consomem `ContractRenewalEvent[]` directamente. Introduzir eventos de origem `assets` implica ou (a) generalizar o tipo para uma união discriminada (`{ event, source: 'contract', contract } | { event, source: 'asset', asset, coverage }`) ou (b) criar um tipo paralelo e fundir as duas listas antes de passar a `LifeCalendar`. Mapear isto com cuidado em `/research`/`/plan` para não quebrar o F08 já em produção.
- **`InsightType`, `InsightData`, `Insight.data`** (`src/types/insights.ts`) são uniões fechadas — adicionar os dois tipos novos implica estender `InsightType`, criar `WarrantyExpiringInsightData`/`ReturnDeadlineInsightData` e o `fallbackMessage()`/`explainInsight` em `src/lib/insights.ts` para os novos casos (edge function `explain-insight` também pode precisar de tratar o novo `type`, ver `supabase/functions/explain-insight/`).
- **Migração de dados:** como `coverage.status` já existe no schema mas "não usado pela app (calculado em runtime)" (comentário em `supabase/schema.sql:107`), manter a mesma filosofia para `maintenance`/`claims` — nenhum campo de estado pré-calculado que possa divergir do rules engine.
- **UI/tema:** reutilizar `colors.success` (`#4A7856`, já adicionado ao tema pelo F04) para "Covered"/maintenance em dia, `colors.warning` (`#C9A15C`) para "expiring soon", `colors.critical` (`#A3402E`) para expirado/deadline passado — não introduzir cores novas.
- **Tab bar:** decidir em `/plan` se o Warranty Vault fica dentro do tab "Coverage" existente (ex: um sub-ecrã "My Assets" antes de escolher um asset para o Coverage Check) ou se ganha tab próprio — impacto directo em `app/(dashboard)/_layout.tsx` e na navegação do Coverage Check actual.

## Fora do escopo

- Coverage Check em si (F04) — já implementado; esta ficha só estende os dados que ele consome
- Renewal/Price Increase Detection (F05) e Bills Intelligence (F06) — não tocados por esta ficha
- Valorização automática de mercado do asset (ex: API externa de preços) — explicitamente adiado no `CLAUDE.md` → "Não construir ainda"
- Digital Estate / Trusted People / Emergency Pack (F11+, Phase 4) — Warranty Vault é um pré-requisito de dados, não inclui partilha com terceiros
- Extracção automática de campos de maintenance/claims a partir de documentos via Vision LLM — nesta ficha o registo é manual; ligação a `documents`/`extracted_data` fica para trabalho futuro
- Notificações push nativas — os alertas entram na lista de Alerts/Life Calendar já existente (F08), não implica nova infraestrutura de push
- Reestruturar `events.ts`/Life Calendar para suportar fontes arbitrárias de forma genérica — apenas a extensão mínima para incluir asset/coverage/return-deadline a par de contracts

## Próximo passo
/research Que forma mínima de schema (`return_deadline`, `maintenance`, `claims`) e que generalização mínima de `src/lib/events.ts` (hoje acoplado a `Contract`) permitem satisfazer os alertas automáticos de warranty/return-deadline e a vista de detalhe do asset, sem reescrever o Life Calendar (F08) ou duplicar o CRUD já existente em `src/lib/coverage.ts` (F04)?
