---
data: 2026-09-15
status: backlog
prioridade: alta
fase_mvp: sim
---

# Feature: Bills Intelligence (F06)

## Contexto

Bills Intelligence é a Hipótese #3 do wedge inicial (`CLAUDE.md` → Nova tese de valor prioritária, dificuldade 4–5/10): transformar faturas de utilities (água, eletricidade, gás, internet, telemóvel, telefone, seguros) em histórico, comparação mensal e alertas de aumento/anomalia — sempre com cálculo determinístico, nunca estimado pelo LLM (`CLAUDE.md` regra #6). É a terceira peça do wedge `INSURANCE + BILLS → UNDERSTAND → COMPARE → ALERT`, depois do Coverage Check (F04) e do Renewal/Price Increase Detection (F05), ambos já implementados. O próprio placeholder em `app/(dashboard)/bills.tsx:12` já reserva este trabalho como `F06/F07`, com F06 = histórico/comparação (esta ficha) e F07 = Bills Dashboard (gráficos, "quanto pago" — fora do escopo aqui).

Estado actual do repositório (F04 e F05 já implementados — commits "Feature 4"/"Feature 5"):

- **Não existe nenhuma tabela `bills` em `supabase/schema.sql`.** Hoje existem `users`, `documents`, `assets`, `coverage`, `contracts`, `insights`. A tabela `bills` descrita em `CLAUDE.md` (`provider`, `category`, `invoice_date`, `billing_period`, `amount`) é o local natural para o histórico por categoria que esta ficha pede — não há onde persistir isso hoje.
- **Não existe nenhum campo de categoria de bill em lado nenhum do schema ou da extracção.** `ExtractedDocumentData` (`src/types/documents.ts`) e o `EXTRACTION_SYSTEM_PROMPT` em `supabase/functions/extract-document/index.ts` só produzem `document_type: 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt'` — não existe nenhuma noção de "água" vs "eletricidade" vs "gás" vs "internet" vs "telemóvel" vs "telefone" vs "seguro". A funcionalidade (1) do pedido ("categorização automática... a partir dos documents extraídos") **não tem hoje nenhum dado de origem**: é preciso decidir em `/plan` se a categoria passa a ser extraída pelo Vision LLM (estender o schema de extracção — continua a ser "extracção/interpretação", não "cálculo", por isso está alinhado com `CLAUDE.md` → `## Arquitectura de IA`) ou se é inferida em runtime por regras determinísticas sobre `provider`/`document_type` (ex: palavras-chave). A primeira opção é a mais robusta (o LLM já vê o conteúdo do documento); a segunda é mais determinística mas exige uma lista de fornecedores/keywords mantida à mão.
- `contracts.type` (schema actual) já tem um valor `'utility'`, mas é um bucket único — não distingue água de eletricidade de gás. Não é suficiente para o histórico por categoria pedido nesta ficha; confirma que `bills` precisa de ser uma tabela própria, como já está modelada em `CLAUDE.md`, e não uma extensão de `contracts`.
- `src/lib/rulesEngine.ts` **já cobre o essencial do cálculo pedido nas funcionalidades (3) e (5)**: `percentageChange(current, previous)`, `isSignificantIncrease(current, previous, thresholdPercent=10)` — corresponde exactamente à regra ">110% da fatura anterior → alerta de aumento" pedida — e `isAnomaly(current, average, thresholdPercent=25)` — corresponde exactamente à regra ">125% da média de 6 meses → alerta de anomalia". `average(values)` também já existe para calcular a média de 6/12 meses. **Não recriar esta lógica**; falta apenas reunir o histórico por categoria/fornecedor e alimentar estas funções com as séries correctas.
- `src/lib/insights.ts` e `src/types/insights.ts` (F05) já implementam o padrão de insight: `InsightType = 'price_increase' | 'renewal'`, `saveInsight()` chama a edge function `explain-insight` (já existe, `supabase/functions/explain-insight/`) com os números já calculados e usa `fallbackMessage()` como fallback determinístico se a chamada LLM falhar. **Este padrão é directamente reutilizável** para os novos tipos de insight de bills (ex: `'anomaly'`, reaproveitando `'price_increase'` para o aumento de fatura). Mas `insights.contract_id` (schema actual) só referencia `contracts`, não `bills` — é preciso decidir em `/plan` se se adiciona uma coluna `bill_id` nullable (paralela a `contract_id`) ou se se generaliza a tabela para um par `source_type`/`source_id`. Adicionar `bill_id` é a opção mais consistente com o padrão já usado (F05 acrescentou `contract_id` da mesma forma).
- `app/(dashboard)/bills.tsx` é hoje um placeholder puro (título + subtítulo + comentário `TODO: F06/F07`) — não lê nenhuma tabela, não tem nenhum componente.
- Não existe `src/lib/bills.ts`, `src/types/bills.ts`, `src/hooks/useBills.ts`, nem pasta `src/components/bills/` (existe `src/components/coverage/` e `src/components/dashboard/` como referência de padrão a seguir — ex: `CoverageCheckForm.tsx` + `fetchAssets`/`fetchCoverageForAsset` em `src/lib/coverage.ts`, e o ecrã `app/(dashboard)/coverage.tsx` que os liga via `useFocusEffect`).
- O dashboard principal (`app/(dashboard)/index.tsx`) já lê `fetchUpcomingRenewals` e `fetchRecentInsights` de `src/lib/insights.ts` e renderiza com `RenewalTimeline`/`InsightCard` — os insights de bills gerados por esta ficha **aparecerão automaticamente** nesse card "Recent insights" sem alterações adicionais ao dashboard, desde que sejam guardados na mesma tabela `insights` com o mesmo formato.
- `provider` continua a ser texto livre do Vision LLM, sem normalização própria — mas `contracts` já resolve isto com uma coluna gerada `provider_normalized` (`lower(trim(provider))`, ver `supabase/schema.sql`). Se `bills` precisar do mesmo agrupamento por fornecedor ao longo do tempo, o padrão já validado em F05 é reutilizável directamente (mesma coluna gerada).
- Não existe nenhuma biblioteca de gráficos instalada (`package.json` sem `victory`/`recharts`/etc.) — consistente com o facto de "gráficos" ser explicitamente F07 (Bills Dashboard), não esta ficha.

**Implicação central:** esta ficha depende de uma tabela `bills` nova (schema + RLS), de uma decisão sobre onde nasce a categoria (extracção LLM vs. regra determinística) — que é a parte mais ambígua e a que mais falta de estrutura tem hoje —, e de uma pequena extensão ao padrão de insights já validado em F05 (`bill_id`, tipo `'anomaly'`). O cálculo de percentagens/médias e o padrão de explicação por LLM com fallback já existem e devem ser reutilizados sem duplicação.

## Comportamento esperado

**Dado que** um documento é extraído com `document_type='invoice'` (ou `'contract'`, no caso de seguros recorrentes)
**Quando** o conteúdo do documento corresponde a uma categoria de utility (água, eletricidade, gás, internet, telemóvel, telefone, seguro)
**Então** o sistema atribui automaticamente uma categoria (`bills.category`) de forma determinística — nunca uma "melhor adivinha" não documentada; se a categoria vier do Vision LLM, é um campo extraído como qualquer outro (nunca calculado); se não for possível determinar a categoria com confiança, fica `null` e o utilizador pode corrigir manualmente

**Dado que** uma fatura foi categorizada e tem `provider` e `amount`
**Quando** é guardada
**Então** passa a existir uma linha em `bills` (categoria, fornecedor, data da fatura, `amount`), associada ao utilizador

**Dado que** existem pelo menos duas faturas na mesma categoria e fornecedor, em meses diferentes
**Quando** o motor de regras compara o valor mais recente com o do mês anterior
**Então** calcula a evolução mensal (absoluta e percentual, usando `percentageChange` já existente em `rulesEngine.ts`) de forma 100% determinística

**Dado que** existem pelo menos seis faturas históricas na mesma categoria/fornecedor
**Quando** o motor de regras corre
**Então** calcula a média dos últimos 6 meses e, se existirem, dos últimos 12 meses (usando `average` já existente), sempre determinístico

**Dado que** a fatura mais recente excede 110% da fatura anterior (usando `isSignificantIncrease`, threshold=10, já existente)
**Quando** o resultado é calculado
**Então** é gerado um insight de alerta de aumento (reaproveitando `type='price_increase'` já usado em F05, ou equivalente), com os valores absolutos e percentuais no campo `data` (jsonb)

**Dado que** a fatura mais recente excede 125% da média dos últimos 6 meses (usando `isAnomaly`, threshold=25, já existente)
**Quando** o resultado é calculado
**Então** é gerado um insight `type='anomaly'` com o valor pago, a média de referência e o desvio

**Dado que** um insight de aumento ou anomalia foi calculado pelo motor determinístico
**Quando** o insight é apresentado ao utilizador
**Então** a frase em linguagem natural (ex: "A tua eletricidade aumentou 11,8% nos últimos 12 meses.", "Pagaste €23 acima da tua média dos últimos seis meses.") é gerada reutilizando a edge function `explain-insight` já existente, que recebe apenas os números já calculados — nunca os documentos brutos nem o cálculo em si

**Dado que** a chamada à edge function `explain-insight` falha ou está indisponível
**Quando** o insight já foi calculado deterministicamente
**Então** o insight é guardado com uma mensagem de fallback determinística (reaproveitando o padrão `fallbackMessage()` de `src/lib/insights.ts`), nunca fica bloqueado por dependência de rede externa

**Dado que** existe menos de uma fatura anterior (mês) ou menos de seis faturas históricas (anomalia) para uma categoria/fornecedor
**Quando** o motor de regras corre
**Então** não gera nenhum insight de evolução mensal ou de anomalia para essa categoria/fornecedor — só passa a existir depois de haver histórico suficiente

**Dado que** o utilizador abre o ecrã Bills
**Quando** existem faturas guardadas em `bills`
**Então** vê o histórico agrupado por categoria e fornecedor (não é preciso gráfico — isso é F07), incluindo a evolução mensal calculada

## Critérios de aceitação

- [ ] `supabase/schema.sql` inclui a tabela `bills` (RLS por `user_id`) com pelo menos `provider`, `category`, `invoice_date`, `billing_period`, `amount`, conforme `CLAUDE.md`
- [ ] Existe uma decisão documentada e implementada para a origem da categoria (`bills.category`): extracção pelo Vision LLM (extensão do schema de `extract-document`) ou regra determinística sobre `provider`/`document_type` — nunca uma classificação "inventada" pelo LLM no momento de gerar o insight
- [ ] Cálculo de evolução mensal (absoluta e percentual) usa `percentageChange`/`isSignificantIncrease` já existentes em `src/lib/rulesEngine.ts` — sem duplicar a lógica
- [ ] Cálculo de média de 6/12 meses usa `average` já existente em `src/lib/rulesEngine.ts` — sem duplicar a lógica
- [ ] Alerta de aumento (>110% da fatura anterior) e alerta de anomalia (>125% da média de 6 meses) são gerados exactamente com os thresholds já suportados por `isSignificantIncrease`/`isAnomaly` (nada hardcoded fora destas funções)
- [ ] Insights de bills reutilizam o padrão já existente em `src/lib/insights.ts` (`saveInsight` + `explain-insight` + `fallbackMessage`) — sem criar um segundo caminho de explicação paralelo
- [ ] Insight é guardado em `insights` com `type` (`'price_increase'` | `'anomaly'`), `severity`, `data` (jsonb) e `message`, associado à fatura/categoria de origem (nova FK `bill_id`, ou decisão alternativa documentada)
- [ ] Nenhum insight de evolução mensal é gerado com menos de duas faturas para a mesma categoria/fornecedor; nenhum insight de anomalia é gerado com menos de seis faturas históricas
- [ ] `app/(dashboard)/bills.tsx` deixa de ser placeholder puro e mostra o histórico de bills por categoria/fornecedor (sem gráficos — isso é F07)
- [ ] Os insights de bills aparecem no card "Recent insights" do dashboard (`app/(dashboard)/index.tsx`) sem alterações a esse ecrã, por reutilizarem a mesma tabela `insights`
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Reutilização confirmada de `rulesEngine.ts`:** `percentageChange`, `isSignificantIncrease` (default 10%) e `isAnomaly` (default 25%) já implementam exactamente as duas regras de alerta pedidas nesta ficha — o comentário em `src/lib/insights.ts` (F05) já assinalava que `isAnomaly` era "mais relevante para F06 Bills Intelligence do que para esta ficha". `average` cobre o cálculo de médias de 6/12 meses. Não recriar nada disto no componente ou na edge function.
- **Ponto mais ambíguo desta ficha: origem da categoria.** Não existe hoje nenhum dado de categoria em `documents`/`ExtractedDocumentData`. Duas abordagens plausíveis a decidir em `/research`/`/plan`:
  1. Estender `EXTRACTION_SYSTEM_PROMPT` (`supabase/functions/extract-document/index.ts`) para devolver também `category: 'agua' | 'eletricidade' | 'gas' | 'internet' | 'telemovel' | 'telefone' | 'seguro' | null`, guardado directamente em `bills.category` no momento da extracção. Mantém-se alinhado com `CLAUDE.md` → `## Arquitectura de IA` (LLM extrai/interpreta, nunca calcula) e é mais robusto porque o LLM vê o conteúdo real do documento.
  2. Inferir a categoria em runtime a partir de `provider`/`document_type` com uma tabela de keywords mantida no código (ex: "EDP", "Galp" → eletricidade/gás). Totalmente determinístico e sem custo de API adicional, mas frágil a fornecedores não previstos e exige manutenção manual da lista.
  A opção 1 é a mais consistente com o resto da arquitectura (extracção já é feita pelo Vision LLM para todos os outros campos); a opção 2 é mais simples de implementar sem tocar na edge function existente. Decidir e documentar a escolha em `/plan`.
- **Relação entre `bills` e `documents`.** Tal como `documents.asset_id` (F04) e `documents.contract_id` (F05) já ligam documentos a entidades de domínio, esta ficha provavelmente precisa de `documents.bill_id` (nullable, `on delete set null`) para saber que documento originou cada linha de `bills` — decidir em `/plan` se cada fatura de utility cria sempre uma linha em `bills`, ou se só cria quando a categoria é determinada com confiança.
- **`insights.contract_id` não cobre bills.** A tabela `insights` (schema actual) só tem `contract_id`. Adicionar `bill_id` nullable (mesmo padrão) é a opção mais simples e consistente com o que já existe; generalizar para `source_type`/`source_id` seria mais "correcto" a longo prazo mas é uma mudança maior de schema para uma tabela já em uso por F05 — avaliar custo/benefício em `/plan`, mas a opção `bill_id` paralelo é o caminho de menor risco.
- **Agrupamento por fornecedor ao longo do tempo.** `contracts.provider_normalized` (coluna gerada `lower(trim(provider))`) já resolve variações triviais de capitalização/espaços para o mesmo problema em F05. Reutilizar o mesmo padrão em `bills` se for necessário agrupar por fornecedor (ex: "EDP" vs "EDP Comercial") — não introduzir fuzzy matching/NLP (ver `## Fora do escopo`).
- **Periodicidade da fatura (`billing_period`).** Uma comparação mês-a-mês só é válida se as faturas tiverem a mesma periodicidade (mensal). `CLAUDE.md` já prevê o campo `billing_period` em `bills`; decidir em `/plan` se esta ficha já valida/normaliza isso (ex: ignorar comparação se `billing_period` mudar) ou se assume por agora que todas as faturas de utilities são mensais.
- **Reutilização confirmada do padrão de insight (F05):** `saveInsight()`, `explainInsight()` e `fallbackMessage()` em `src/lib/insights.ts` já implementam exactamente o fluxo "calcula determinístico → chama `explain-insight` → fallback se falhar → persiste". Estender estas funções (ou criar equivalentes específicas para bills que reutilizem a mesma edge function) em vez de duplicar o padrão.
- **Padrão de UI a seguir:** `app/(dashboard)/coverage.tsx` + `src/lib/coverage.ts` + `src/components/coverage/` é o exemplo mais próximo de "ecrã que lê uma entidade de domínio nova e mostra resultado calculado" — seguir a mesma estrutura (`useFocusEffect` + funções `fetch*` em `src/lib/bills.ts` + componentes em `src/components/bills/`) em vez de inventar um padrão novo.

## Fora do escopo

- Bills Dashboard completo (total mensal/anual, gráficos de evolução, comparação por categoria com visualização) — isso é o F07, que depende desta ficha mas não está coberto aqui; não existe biblioteca de gráficos instalada e não deve ser adicionada nesta ficha
- Descoberta automática de faturas por email (Gmail/Outlook) — isso é a Fase 2 (Email Intelligence), fora do MVP actual; esta ficha assume upload/forward manual como em F04/F05
- Normalização avançada de fornecedor (fuzzy matching, NLP, deduplicação entre nomes muito diferentes do mesmo fornecedor) — usar apenas normalização simples (`lower(trim(...))`, já validado em `contracts`)
- Suporte a múltiplas moedas ou conversão cambial nos valores comparados
- Alteração consistente de valor recorrente como padrão de alerta dedicado (ex: "subida silenciosa mês após mês") — `CLAUDE.md` menciona esta regra na secção `## Bills Dashboard`, não em `## Bills Intelligence`; fica reservada para F07
- Eventos automáticos no Life Calendar (`events`) a partir de renovações de bills — não existe ainda tabela `events`; esta ficha só gera e mostra insights quando o utilizador abre a app
- Cancelamento, negociação ou comparação com fornecedores alternativos — isso é o Zelanna Agent (Phase 6), explicitamente fora do MVP

## Próximo passo
/research Deve a categoria de bill (`água`, `eletricidade`, `gás`, `internet`, `telemóvel`, `telefone`, `seguro`) ser extraída pelo Vision LLM como uma extensão do schema de `extract-document` (paralelo a `document_type`), ou inferida em runtime por uma regra determinística sobre `provider`/`document_type`? E que estrutura mínima liga `bills` a `documents` e a `insights` (colunas `bill_id`) sem duplicar o padrão já validado por `contracts`/`contract_id` em F05?
