---
data: 2026-09-16
status: backlog
prioridade: media
fase_mvp: nao
---

# Feature: Life Intelligence Avançada (F13)

## Contexto

Esta ficha corresponde quase literalmente à `CLAUDE.md` → `## Roadmap` → **Phase 5 — Life Intelligence**: *"Anomaly detection avançada, renewal detection, cost analysis, protection gaps, unused subscriptions, duplicate insurance, missing documentation, proactive recommendations."* Não há nenhuma menção a "Life Intelligence" em nenhum outro ficheiro de `thoughts/shared/tickets/` — o `CLAUDE.md` é a única referência anterior. **F13 é o próximo número de feature disponível** (F03–F12 já têm ficha própria; confirmado por `thoughts/shared/tickets/*.md`).

**O motor de insights já existe e está em produção — esta ficha estende, não cria de raiz:**

- A tabela `insights` (`supabase/schema.sql:261-344`) já suporta `type` (`'price_increase'|'renewal'|'anomaly'|'recurring_increase'|'coverage_gap'|'coverage_expiring'|'return_deadline'`), `severity`, `data jsonb`, `message`, e colunas de scoping opcionais `contract_id`/`bill_id`/`asset_id`/`coverage_type`/`resolved_at`, com índices únicos (`insights_coverage_gap_unique`, `insights_asset_scoped_unique`) que permitem geração idempotente via upsert. RLS já restringe tudo a `auth.uid() = user_id`.
- `src/lib/rulesEngine.ts` já é o motor determinístico central (regra #6 do `CLAUDE.md`): `evaluateCoverage()` (core do Coverage Check F04, produz `gaps` para warranty/insurance em falta ou expirada), `isSignificantIncrease`/`isAnomaly`/`isRecurringIncrease`/`average`/`monthlyEquivalent`/`annualEquivalent` (F05/F06/F08), `daysUntil`/`isExpiringSoon`/`expiringSeverity`.
- `src/lib/insights.ts` (457 linhas) já implementa o padrão completo de geração: `saveInsight` (INSERT + explicação via edge function `explain-insight`, com fallback determinístico), `upsertCoverageGapInsight`/`upsertAssetScopedInsight` (upsert idempotente), `generateCoverageGapInsights`, `generateCoverageExpiringInsights`, `generateReturnDeadlineInsights`, `generateInsightsForContract`, `generateInsightsForBill`, e fetchers (`fetchRecentInsights`, `fetchAllInsights`, `resolveInsight`, `filterInsightsByBucket`).
- `app/(dashboard)/alerts.tsx` já é o ecrã de insights: ao abrir, chama as funções `generateX Insights`, depois `fetchAllInsights` + `fetchLifeCalendarEvents`, com filtro por bucket (`AlertsFilter`: `'all'|'coverage'|'bills'|'renewal'`), acção de resolver insight, toggle "show resolved", e secção `LifeCalendar` (próximos 60 dias). `src/components/dashboard/InsightCard.tsx` renderiza cada insight a partir de um mapa `TYPE_LABELS: Record<InsightType, string>`.
- `src/lib/bills.ts` já tem agregação de custos reutilizável: `groupBills` (agrupa por categoria+fornecedor, calcula `latestChangePercent`/`average6`/`average12`), `calculateBillTotals` (totais mensal/anual), `calculateCategoryTotals` (por categoria), consumidos por `app/(dashboard)/bills.tsx` (`BillsSummaryCard`, `CategoryBreakdownChart`, `BillEvolutionChart`).

**Esta ficha NÃO cria uma tabela nova, um ecrã novo, nem um motor paralelo.** Adiciona novos `InsightType` a `src/types/insights.ts`, novas funções puras a `rulesEngine.ts`, novas `generateXInsights()` a `insights.ts` (reaproveitando `saveInsight`/upsert), e liga-as ao pipeline já existente de `alerts.tsx`/`InsightCard`/`AlertsFilter`.

**Três das quatro deteções pedidas não têm nenhum campo/sinal existente no schema para as suportar directamente** — isto é uma decisão de `/research`+`/plan`, não uma omissão desta ficha:
- **Unused subscriptions**: `contracts` (`supabase/schema.sql:228-238`) não tem `status`/`is_active`, nem qualquer sinal de "última utilização" ou "última cobrança". `type='subscription'` é só um valor de enum sem nenhuma lógica associada (confirmado — zero usos no repositório além da própria definição do tipo).
- **Duplicate insurance**: `coverage` (`supabase/schema.sql:104-113`) tem `asset_id`+`type` mas **não tem campo `risk`/`category`** para distinguir "duas apólices sobre o mesmo risco" de "duas apólices legítimas sobre activos diferentes". Seguros ao nível de contrato (`contracts.type='insurance'`, ex: seguro de vida/saúde, sem `asset_id`) não têm nenhuma forma de agrupamento por risco.
- **Missing documentation**: `documents` já tem FKs nullable `asset_id`/`contract_id`/`bill_id` (mas não `coverage_id`) — o padrão `fetchDocumentsWithoutAsset` (`src/lib/coverage.ts:43`) já faz esta query do lado dos assets e deve ser generalizado, não duplicado.
- **Protection gaps**: `evaluateCoverage()` já produz `gaps`, e `assets.purchase_price` (`supabase/schema.sql:69-102`) pode servir de proxy para "valor" — mas é preço de compra, não valor de mercado actual (`thoughts/shared/tickets/2026-09-15-warranty-vault.md:101` já adia explicitamente "valorização automática de mercado" para fora do escopo actual).

## Comportamento esperado

**Dado que** o utilizador tem um contrato `type='subscription'` sem nenhum asset ou coverage associado e sem evidência de utilização recente (heurística a definir em `/research`, ver `## Notas técnicas`)
**Quando** o utilizador abre o ecrã Alerts
**Então** vê um novo insight `unused_subscription` (severidade `info` ou `warning`) a explicar que este contrato pode não estar a ser utilizado, sem qualquer acção automática de cancelamento

**Dado que** existe mais do que uma cobertura `type='insurance'` associada ao mesmo `asset_id`, ou mais do que um `contract` `type='insurance'` identificado como cobrindo o mesmo risco
**Quando** o utilizador abre o ecrã Alerts
**Então** vê um insight `duplicate_insurance` a listar as apólices em conflito, para o utilizador decidir se quer cancelar uma

**Dado que** um asset não tem nenhuma `coverage` do tipo `warranty` registada, ou um `contract` não tem nenhum `document` associado (`documents.contract_id is null`)
**Quando** o utilizador abre o ecrã Alerts
**Então** vê um insight `missing_documentation` a indicar o que falta documentar

**Dado que** um asset com `purchase_price` acima de um limiar (a definir em `/plan`) não tem nenhuma `coverage` activa (via `evaluateCoverage`)
**Quando** o utilizador abre o ecrã Alerts
**Então** vê um insight `protection_gap` — reaproveitando o mesmo `evaluateCoverage()` já usado pelo Coverage Check (F04) e por `generateCoverageGapInsights`, com um filtro adicional de valor

**Dado que** o utilizador tem custos espalhados por `bills` (utilities) e `contracts` (seguros, subscrições)
**Quando** o utilizador abre uma vista de cost analysis consolidada (dentro de `app/(dashboard)/bills.tsx` ou dashboard principal, a decidir em `/plan`)
**Então** vê o total por categoria e período combinando ambas as fontes, reaproveitando `calculateCategoryTotals`/`calculateBillTotals`/`groupBills` de `src/lib/bills.ts` em vez de um motor de agregação novo

**Dado que** o motor de regras gera qualquer um destes novos insights
**Quando** o insight é apresentado ao utilizador
**Então** aparece na tabela `insights` e no ecrã Alerts como um insight normal (mesmo `InsightCard`, mesma acção "resolve") — **nunca como uma acção automática executada pelo sistema**; o utilizador decide sempre o próximo passo (cancelar, contactar seguradora, adicionar documento, etc.)

## Critérios de aceitação

- [ ] `src/types/insights.ts`: adicionar `'unused_subscription' | 'duplicate_insurance' | 'missing_documentation' | 'protection_gap'` a `InsightType`, com a respectiva interface de `data` para cada um (seguindo o padrão de `CoverageGapInsightData` etc.)
- [ ] `supabase/schema.sql`: se necessário, `alter table insights` para novas colunas de scoping (ex: `contract_id` já existe; confirmar em `/plan` se é preciso adicionar índice único novo para idempotência de cada novo tipo, seguindo o padrão de `insights_asset_scoped_unique`)
- [ ] `src/lib/rulesEngine.ts`: novas funções puras e determinísticas — heurística de unused subscription, heurística de duplicate insurance (por `asset_id`+`type` em `coverage`, no mínimo), filtro de valor sobre `evaluateCoverage()` para protection gap — sem qualquer chamada a LLM para o cálculo (regra #6 do `CLAUDE.md`)
- [ ] `src/lib/insights.ts`: novas `generateUnusedSubscriptionInsights`, `generateDuplicateInsuranceInsights`, `generateMissingDocumentationInsights`, `generateProtectionGapInsights`, reaproveitando `saveInsight`/padrão de upsert já existente para idempotência
- [ ] Cost analysis consolidada: nova função (local a decidir em `/plan`) que combina `bills` + `contracts.current_amount` por categoria/período, reaproveitando `calculateCategoryTotals`/`groupBills` em vez de duplicar a lógica de agregação
- [ ] `app/(dashboard)/alerts.tsx`: chamar as novas funções `generateX Insights` no mesmo ponto onde já chama `generateCoverageGapInsights` etc.
- [ ] `src/components/dashboard/InsightCard.tsx`: estender `TYPE_LABELS` com os 4 novos tipos
- [ ] `src/components/dashboard/AlertsFilter.tsx` + `filterInsightsByBucket`: decidir em `/plan` se os novos tipos entram num bucket existente (`'coverage'` para `protection_gap`/`missing_documentation`) ou se justificam um bucket novo (ex: `'subscriptions'`)
- [ ] Nenhum insight desta ficha desencadeia qualquer acção automática (cancelamento, contacto com fornecedor, alteração de contrato) — apenas apresentação informativa, igual aos insights já existentes
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Heurística de "unused subscription" — decisão em aberto para `/research`:** não existe nenhum campo de utilização, última cobrança, ou estado activo/cancelado em `contracts`. Opções a avaliar: (a) contrato `type='subscription'` sem nenhum `document` associado nos últimos N meses (proxy fraco — a ausência de fatura recente pode só significar que o utilizador não fez upload, não que não usa); (b) contrato `type='subscription'` sem nenhum `asset`/`coverage` associado (proxy só faz sentido para subscrições ligadas a um bem físico, não para streaming/software); (c) não implementar esta deteção nesta fase e documentar como falso positivo conhecido. Esta ficha não resolve a heurística — fica explicitamente para `/research`.
- **Heurística de "duplicate insurance" — decisão em aberto:** sem campo `risk`/`category` em `coverage`, o caso mais seguro e sem falsos positivos é limitar a detecção a `coverage` com o mesmo `asset_id` e `type='insurance'` (duas coberturas de seguro sobre o mesmo asset é inequivocamente uma duplicação). Duplicação entre `contracts` do tipo `insurance` sem `asset_id` (ex: dois seguros de saúde) exigiria um campo novo de categorização de risco — avaliar em `/plan` se vale a pena adicionar `coverage.risk_category`/`contracts.insurance_category` ou se fica fora do escopo desta fase.
- **Threshold de "asset de valor" para protection gap:** `assets.purchase_price` é o único proxy de valor disponível (sem valorização de mercado, por decisão já tomada no F10). Definir o limiar (fixo, ex: >€500, ou relativo, ex: top N% dos assets do utilizador) em `/plan`.
- **Missing documentation para `coverage`:** ao contrário de `assets`/`contracts`/`bills`, a tabela `documents` não tem coluna `coverage_id` — não há forma directa de saber que documento comprova uma warranty/seguro específico. Generalizar o padrão `fetchDocumentsWithoutAsset` pode cobrir "asset sem warranty" (via `coverage` ausente) e "contract sem documento" (via `documents.contract_id is null`), mas "coverage sem documento comprovativo" fica sem suporte de schema nesta fase — decidir em `/plan` se justifica adicionar a FK ou se fica fora do escopo.
- **Reaproveitar sempre o padrão de upsert idempotente** (`upsertCoverageGapInsight`/`upsertAssetScopedInsight` em `src/lib/insights.ts:115,182`) para os novos tipos — evita duplicar insights a cada vez que `alerts.tsx` é reaberto, exactamente como os tipos existentes já fazem.
- **Cost analysis consolidada é hoje duas fontes desconexas** (`bills` via `src/lib/bills.ts`, `contracts.current_amount` sem nenhuma agregação equivalente) — esta ficha é a primeira a unificá-las; confirmar em `/plan` onde vive esta vista (extensão de `app/(dashboard)/bills.tsx` vs. novo separador no dashboard principal).

## Fora do escopo

- **Qualquer acção automática** (cancelamento de subscrição, contacto com seguradora, alteração de contrato) — os insights desta ficha são sempre informativos; execução fica para o **Zelanna Agent (Phase 6)**, e só com autorização explícita do utilizador
- **Valorização automática de mercado de assets** — protection gap usa `purchase_price`, não uma API externa de preços (já adiado no F10)
- **Novo campo `risk`/`category` em `coverage`/`contracts`** — só se `/plan` decidir que é necessário; esta ficha não assume essa alteração de schema à partida
- **Nova coluna `coverage_id` em `documents`** — mesma lógica; decisão de `/plan`, não pré-definida aqui
- **Sinal real de utilização de subscrição** (ex: integração com o serviço para saber se foi usado nos últimos 30 dias) — fora de alcance, a app não tem esse tipo de acesso; qualquer deteção de "unused" é heurística e sujeita a falsos positivos, nunca apresentada como certeza
- **Geração automática em background/cron** destes insights fora do momento em que `alerts.tsx` é aberto — segue o mesmo modelo dos insights já existentes (geração no focus do ecrã), automação fica para Phase 5/Zelanna Agent conforme já decidido em `thoughts/shared/tickets/2026-09-15-alerts-life-calendar.md:80`

## Próximo passo
/research Definir a heurística determinística para "unused subscription" dado que `contracts` não tem nenhum sinal de utilização/última cobrança/estado activo, decidir se "duplicate insurance" fica limitado a `coverage` com o mesmo `asset_id` (sem falsos positivos) ou se justifica um campo novo de categorização de risco para cobrir `contracts.type='insurance'` sem asset associado, e confirmar o limiar de valor de `assets.purchase_price` a usar em "protection gap".
