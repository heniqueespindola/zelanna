---
data: 2026-09-15
status: backlog
prioridade: alta
fase_mvp: sim
---

# Feature: Bills Dashboard (F07)

## Contexto

Bills Dashboard é a peça de visualização que fecha a Hipótese #3 do wedge inicial (`CLAUDE.md` → Nova tese de valor prioritária): depois de Bills Intelligence (F06, já implementado — histórico por categoria/fornecedor, `price_increase` e `anomaly`), falta um ecrã que responda a "Quanto pago? O que mudou? O que merece atenção?" de forma visual, em vez de uma lista simples. O próprio ticket de F06 já reservava explicitamente este trabalho: `app/(dashboard)/bills.tsx:12` tinha o comentário `TODO: F06/F07`, e a secção "Fora do escopo" de F06 lista literalmente "Bills Dashboard completo (total mensal/anual, gráficos de evolução, comparação por categoria com visualização) — isso é o F07" e "Alteração consistente de valor recorrente como padrão de alerta dedicado ... fica reservada para F07".

Estado actual do repositório (F06 já implementado):

- **`app/(dashboard)/bills.tsx` já não é placeholder** — lê `fetchBills(userId)` + `groupBills()` de `src/lib/bills.ts` e mostra o histórico agrupado por categoria+fornecedor em `BillGroupCard`, com `average6`/`average12`/`latestChangePercent` já calculados. Este ecrã actual é a lista "crua"; o Bills Dashboard pedido aqui é uma visão agregada/visual, não uma substituição — decidir em `/plan` se o dashboard é uma nova secção no mesmo ecrã `bills.tsx` ou um ecrã novo.
- **`groupBills()` (`src/lib/bills.ts`) já calcula por grupo categoria+fornecedor**: lista de bills ordenada por `invoice_date` desc, `latestChangePercent`, `average6`, `average12` — é a base directa para "custo por categoria" e "evolução... por fornecedor" (funcionalidades 2 e 3 pedidas). Não recalcular isto no componente do dashboard.
- **`src/lib/rulesEngine.ts` já cobre `percentageChange`, `isSignificantIncrease` (>10%), `isAnomaly` (>25%) e `average`** — usados por F06 para gerar os insights `price_increase`/`anomaly` já guardados em `insights`. **Não existe ainda nenhuma função para "aumento recorrente"** (subida consistente mês após mês, mesmo que cada subida individual não ultrapasse o threshold de 10%) — `CLAUDE.md` menciona esta regra na secção `## Bills Dashboard` ("Alteração consistente de valor recorrente → alerta") como algo novo, não coberto por F06. É preciso desenhar esta lógica de raiz em `/plan`, mas mantendo o mesmo princípio: cálculo 100% determinístico, LLM só explica (`CLAUDE.md` regra #6).
- **Não existe tabela `events` no `supabase/schema.sql` actual.** `CLAUDE.md` descreve uma tabela `events` no schema de referência ("Eventos — alimenta o Life Calendar"), mas ela nunca chegou a ser criada neste repositório — hoje as renovações próximas são calculadas em runtime por `fetchUpcomingRenewals()` (`src/lib/insights.ts`), que lê directamente `contracts.renewal_date` (sem tabela intermédia), e já é usada no dashboard principal (`app/(dashboard)/index.tsx`) via o card "Upcoming renewals" + `RenewalTimeline`. O pedido desta ficha ("(5) lista de próximas renovações vindas da tabela events") **não tem hoje nenhuma tabela de origem** — decidir em `/plan` se se reutiliza `fetchUpcomingRenewals()` (zero schema novo, consistente com o que já existe) ou se se cria a tabela `events` pela primeira vez (mudança de schema maior, alinhada com `CLAUDE.md` mas sem nenhum consumidor hoje além deste pedido).
- **Não existe nenhuma biblioteca de gráficos instalada** (`package.json` sem `victory-native`, `react-native-svg-charts`, `react-native-gifted-charts`, etc.) — só `react-native-svg` (dependência transitiva/nativa, não uma API de gráficos pronta). É preciso escolher e instalar uma biblioteca compatível com Expo/React Native (não `recharts`, que é web-only) em `/plan`.
- **`bills.billing_period` existe no schema (`'monthly' | 'bimonthly' | 'yearly'`) mas nunca é usado em nenhum cálculo** — a nota de F06 já assinalava isto: "sem lógica de gating na comparação nesta ficha (fica disponível para F07)". Um "total mensal e anual estimado" correcto (funcionalidade 1) precisa de normalizar valores `bimonthly`/`yearly` para um equivalente mensal antes de somar — caso contrário uma fatura anual de seguro infla o total mensal. Decidir a fórmula de normalização em `/plan`.
- **`contracts` não tem `category`** (só `type: 'insurance' | 'utility' | 'subscription' | 'other'`) — a maioria dos dados de bills/categoria vêm de `bills`, não de `contracts`. `contracts` é relevante aqui sobretudo para `renewal_date`/`current_amount` (renovações), tal como já é usado no dashboard principal.
- Filtro por período (mês/trimestre/ano) — não existe hoje nenhuma lógica de filtro temporal em `src/lib/bills.ts` nem em `groupBills()`; é uma funcionalidade nova a desenhar (provavelmente um parâmetro sobre `fetchBills`/`groupBills`, ou um filtro aplicado em memória sobre o array já carregado).
- Paleta pedida (`#324138` verde-floresta para gráficos principais, `#C9A15C` dourado para anomalias/alertas) já existe em `src/constants/theme.ts` como `colors.primary` e `colors.accent` — não hardcodar hex novos no componente, usar os tokens existentes.

**Implicação central:** esta ficha depende de uma decisão sobre biblioteca de gráficos (nenhuma instalada hoje), de decidir a origem das "próximas renovações" (reutilizar `fetchUpcomingRenewals`/`contracts` vs. criar a tabela `events` pela primeira vez), de desenhar de raiz a regra de "aumento recorrente" (não coberta por F06/`rulesEngine.ts`), e de definir a fórmula de normalização de `billing_period` para o total mensal/anual. O agrupamento por categoria/fornecedor e os cálculos de percentagem/média já existem e devem ser reutilizados sem duplicação.

## Comportamento esperado

**Dado que** o utilizador tem faturas guardadas em `bills` para várias categorias
**Quando** abre o Bills Dashboard
**Então** vê o total mensal estimado e o total anual estimado, calculados deterministicamente a partir do valor mais recente de cada grupo categoria/fornecedor, normalizado por `billing_period`

**Dado que** existem faturas em mais do que uma categoria
**Quando** o dashboard é apresentado
**Então** mostra o custo por categoria num gráfico (usando `#324138` como cor principal), agregando o valor mais recente de cada fornecedor dentro da categoria

**Dado que** existe histórico de pelo menos duas faturas para uma categoria/fornecedor
**Quando** o utilizador consulta a evolução
**Então** vê um gráfico de linha da evolução mensal, com opção de ver por fornecedor dentro da mesma categoria

**Dado que** o motor de regras determinístico (`rulesEngine.ts`) já gerou insights `price_increase`/`anomaly` (F06), ou detecta um aumento recorrente (nova regra desta ficha)
**Quando** o dashboard é apresentado
**Então** existe uma secção dedicada de anomalias e aumentos recorrentes, destacada visualmente com `#C9A15C`, reutilizando o texto já gerado por `explain-insight`/`fallbackMessage` — nunca recalculado no componente

**Dado que** existem contratos com `renewal_date` próxima (mesma lógica já usada em `fetchUpcomingRenewals`)
**Quando** o utilizador consulta o Bills Dashboard
**Então** vê a lista de próximas renovações relevantes para bills (seguros, utilities), sem duplicar a lógica já usada no dashboard principal

**Dado que** o utilizador selecciona um período (mês, trimestre, ano)
**Quando** aplica o filtro
**Então** todos os totais, gráficos e comparações apresentados reflectem apenas faturas dentro desse período, sem alterar os dados subjacentes em `bills`

**Dado que** não existem faturas suficientes para uma secção específica (ex: sem histórico para gráfico de evolução, sem anomalias detectadas)
**Quando** o dashboard é apresentado
**Então** essa secção mostra um estado vazio claro, nunca um erro nem um gráfico vazio/quebrado

## Critérios de aceitação

- [ ] Total mensal e total anual estimado calculados deterministicamente (sem estimativa do LLM), com fórmula de normalização de `billing_period` documentada e testável
- [ ] Gráfico de custo por categoria, usando `colors.primary` (`#324138`) do tema existente — sem hex hardcoded
- [ ] Gráfico de evolução mensal com possibilidade de detalhe por fornecedor
- [ ] Secção de anomalias/aumentos recorrentes destacada com `colors.accent` (`#C9A15C`), reutilizando mensagens já geradas por `src/lib/insights.ts` (sem novo caminho de explicação paralelo)
- [ ] Nova regra determinística de "aumento recorrente" implementada em `src/lib/rulesEngine.ts` (não no componente), com critério documentado (ex: nº mínimo de meses consecutivos com subida)
- [ ] Lista de próximas renovações — decisão documentada sobre reutilizar `fetchUpcomingRenewals()`/`contracts` ou criar tabela `events`
- [ ] Filtro por período (mês/trimestre/ano) aplicado sem duplicar consultas a `bills` além do necessário
- [ ] Biblioteca de gráficos escolhida é compatível com Expo/React Native (iOS + Android), instalada e documentada em `package.json`
- [ ] Nenhum cálculo (percentagem, média, total, detecção de anomalia/recorrência) é feito pelo LLM — apenas por `rulesEngine.ts`/`src/lib/bills.ts`
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Reutilização obrigatória:** `groupBills()`, `percentageChange`, `isSignificantIncrease`, `isAnomaly`, `average` (já validados em F06) — esta ficha agrega e visualiza, não recalcula do zero.
- **Ponto mais ambíguo desta ficha: biblioteca de gráficos.** Nenhuma está instalada. Avaliar em `/plan` opções compatíveis com Expo SDK 57 / React Native 0.86 (ex: `victory-native`, `react-native-gifted-charts`) — confirmar suporte a New Architecture/Expo Go vs. dev build antes de decidir.
- **Segundo ponto ambíguo: origem das renovações.** `CLAUDE.md` descreve uma tabela `events` que nunca foi implementada; criar essa tabela agora é uma mudança de schema maior só para este ecrã. Reutilizar `fetchUpcomingRenewals()` é a opção de menor risco e consistente com o dashboard principal, mas não corresponde literalmente ao pedido ("vindas da tabela events") — decidir e documentar em `/plan`.
- **Terceiro ponto ambíguo: regra de "aumento recorrente".** Não existe hoje nenhuma função em `rulesEngine.ts` para isto. Precisa de definição concreta (quantos meses consecutivos de subida, que magnitude mínima por mês) antes de implementar — sem isso não há como manter o cálculo determinístico e testável.
- **Normalização de `billing_period`:** para o total mensal/anual ser correcto, uma fatura `yearly` deve contar como `amount / 12` no total mensal (e `amount` no anual), e uma `bimonthly` como `amount / 2` no mensal — confirmar esta fórmula em `/plan` antes de implementar, e decidir o que fazer quando `billing_period` é `null`.
- **Dados de `contracts`:** usar apenas para renovações (`renewal_date`, `current_amount`) — a categorização por utility fica em `bills.category`, não em `contracts.type`.
- **Filtro de período:** aplicar em memória sobre o resultado de `fetchBills()` (já traz todo o histórico do utilizador) em vez de reconsultar o Supabase por período, para evitar N chamadas de rede ao trocar de filtro — confirmar que o volume de bills por utilizador não justifica paginação nesta fase.

## Fora do escopo

- Descoberta automática de faturas por email (Gmail/Outlook) — Fase 2 do roadmap geral, não esta ficha
- Criação de eventos automáticos na tabela `events` para o Life Calendar, caso essa tabela venha a ser criada aqui — esta ficha só lê/apresenta, não escreve novos eventos
- Cancelamento, negociação ou comparação com fornecedores alternativos — Zelanna Agent (Phase 6), fora do MVP
- Exportação do dashboard (PDF, partilha) — não pedido nesta ficha
- Suporte a múltiplas moedas ou conversão cambial nos valores agregados
- Edição de `bills`/`contracts` a partir do dashboard — o dashboard é só de leitura/visualização

## Próximo passo
/research Que biblioteca de gráficos (compatível com Expo SDK 57 / React Native 0.86, iOS + Android) deve ser usada para os gráficos de categoria e evolução mensal? A lista de próximas renovações deve reutilizar `fetchUpcomingRenewals()`/`contracts` (já existente) ou justifica-se criar agora a tabela `events` descrita em `CLAUDE.md`? E que critério concreto define "aumento recorrente" na nova regra de `rulesEngine.ts`?
