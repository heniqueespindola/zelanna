---
data: 2026-09-15
status: backlog
prioridade: alta
fase_mvp: sim
---

# Feature: Renewal / Price Increase Detection (F05)

## Contexto

Renewal / Price Increase Detection é a Hipótese #2 do wedge inicial (`CLAUDE.md` → Nova tese de valor prioritária, dificuldade 3/10): quando aparecem duas faturas/contratos do mesmo fornecedor, comparar valores e datas e alertar sobre aumento e renovação próxima — sempre com cálculo determinístico, nunca estimado pelo LLM (`CLAUDE.md` regra #6). Depois do Coverage Check (F04), é a segunda peça do wedge `INSURANCE + BILLS → UNDERSTAND → COMPARE → ALERT` e a que introduz o primeiro insight guardado em `insights` com explicação gerada por LLM.

Estado actual do repositório:

- `src/lib/rulesEngine.ts` **já tem o essencial do motor de cálculo**: `percentageChange(current, previous)`, `isSignificantIncrease(current, previous, thresholdPercent=10)`, `isAnomaly(current, average, thresholdPercent=25)`, `average(values)`, além de `daysUntil`/`isExpiringSoon` (já usadas pelo F04). São genéricas e directamente reutilizáveis — não recalcular percentagens/médias fora deste ficheiro.
- **Não existe nenhuma tabela `contracts` em `supabase/schema.sql`.** O schema aplicado só tem `users`, `documents`, `assets`, `coverage`. A tabela `contracts` descrita em `CLAUDE.md` (`provider`, `type`, `start_date`, `renewal_date`, `current_amount`) é o local natural para guardar o histórico por fornecedor que esta ficha pede — hoje não há onde persistir isso.
- **Não existe nenhuma tabela `insights` em `supabase/schema.sql`.** O pedido pede explicitamente para guardar `type='price_increase'` ou `'renewal'` — sem esta tabela não há onde persistir o resultado.
- **Não existe nenhuma tabela `events` em `supabase/schema.sql`** (Life Calendar, F08) — fora do escopo directo desta ficha, mas o "alerta antecipado" pedido (ex: 17 dias antes) pressupõe nalgum ponto um evento de renovação; decidir em `/plan` se esta ficha já cria a linha em `events` ou se isso fica só para F08.
- `documents` (schema actual) tem `provider` (texto livre extraído pelo Vision LLM), `document_type`, `date`, `amount`, `expiry_date`, `asset_id` — mas **não tem nenhuma noção de "mesmo contrato ao longo do tempo"**. Duas faturas da mesma seguradora hoje são duas linhas independentes em `documents`, sem campo que as agrupe. O "matching de fornecedor/entidade sobre metadados estruturados" pedido no ticket depende de decidir *onde* esse agrupamento vive: (a) uma nova tabela `contracts` para a qual `documents` passa a apontar (`contract_id`), ou (b) matching em runtime só por `provider` (+ `document_type`/categoria) sem nova FK. `CLAUDE.md` já modela isto como `contracts`, por isso a opção (a) é a mais alinhada — decidir em `/plan`.
- `provider` é texto livre gerado pelo Vision LLM (ver `EXTRACTION_SYSTEM_PROMPT` em `supabase/functions/extract-document/index.ts`) — duas faturas da mesma seguradora podem sair como `"Fidelidade"` e `"Fidelidade Companhia de Seguros"`. Não há normalização/matching fuzzy nenhum hoje. Matching exacto (case-insensitive) vai falhar silenciosamente em casos reais — decidir em `/research`/`/plan` se vale a pena normalizar (ex: trim + lowercase apenas) ou se o utilizador confirma manualmente o match a um contrato existente ao carregar um novo documento (mais simples, mais determinístico, sem heurística de texto).
- **Não existe nenhuma edge function de explicação de insight.** `supabase/functions/extract-document/index.ts` é a única function e serve só para extrair dados de um documento (não para gerar linguagem natural a partir de números já calculados). Esta ficha precisa de uma nova function (ex: `explain-insight`) que recebe os números já calculados pelo `rulesEngine.ts` (aumento absoluto, percentual, dias até renovação) e devolve só a frase em linguagem natural — nunca deve receber os documentos brutos nem fazer nenhum cálculo.
- `app/(dashboard)/bills.tsx` e `app/(dashboard)/index.tsx` são placeholders com `TODO: F06/F07` e `TODO: F08` respectivamente — o card "Upcoming renewals" no dashboard já existe visualmente (`"No renewals tracked yet."`) mas não lê nenhuma tabela; é o local natural para mostrar o resultado desta ficha, mas o TODO no código atribui essa área a F08 (Alerts e Life Calendar), não a F05. Decidir em `/plan` se F05 já liga esse card ou se fica reservado para F08.
- Não existe nenhum ecrã dedicado a "Renewals" nem componente em `src/components/` para o resultado desta ficha — não há pasta equivalente a `src/components/coverage/` (F04) para renewals/price-increase.
- Não existem hooks além de `useAuth` e `useOnboarding` (`src/hooks/`) — não há `useContracts`/`useRenewals`/`useInsights`.

**Implicação central:** esta ficha depende de duas tabelas novas (`contracts`, `insights`) que ainda não existem, de uma nova edge function de explicação (separada da de extracção), e de uma decisão de matching fornecedor→contrato que hoje não tem nenhuma estrutura de dados de suporte. É preciso decidir o mínimo necessário — sem antecipar o Life Calendar completo (F08) nem o Bills Dashboard completo (F06/F07), que dependem de categorias (água, luz, gás, etc.) fora do escopo desta ficha.

## Comportamento esperado

**Dado que** o utilizador carrega um novo documento com `provider` e `amount` preenchidos
**Quando** já existe um `contract`/documento anterior com o mesmo fornecedor (matching determinístico, critério a definir em `/plan`)
**Então** o sistema associa o novo documento ao histórico existente desse fornecedor, em vez de tratá-lo como um contrato novo

**Dado que** existem pelo menos dois valores (`amount`) para o mesmo fornecedor/contrato, em datas diferentes
**Quando** o motor de regras compara o valor mais recente com o anterior
**Então** calcula aumento absoluto (`current - previous`) e percentual (`percentageChange`, já existente em `rulesEngine.ts`) de forma 100% determinística — nunca uma estimativa do LLM

**Dado que** o aumento percentual excede o threshold definido (ex: >10%, usando `isSignificantIncrease` já existente)
**Quando** o resultado é calculado
**Então** é gerado um insight `type='price_increase'` com os valores absolutos e percentuais no campo `data` (jsonb)

**Dado que** um contrato tem uma `renewal_date` conhecida (calculada a partir do documento mais recente, ex: `expiry_date`)
**Quando** a data actual está dentro do threshold de alerta antecipado (ex: 17 dias, parametrizável — não fixo a 30 como o F04)
**Então** é gerado um insight `type='renewal'` com os dias restantes e a data exacta

**Dado que** um insight de `price_increase` ou `renewal` foi calculado pelo motor determinístico
**Quando** o insight é apresentado ao utilizador
**Então** a frase em linguagem natural (ex: "O teu seguro automóvel renova daqui a 17 dias. O valor aumentou 14% face ao período anterior.") é gerada por uma chamada LLM que recebe **apenas os números já calculados** (fornecedor, dias até renovação, percentagem, valores) — nunca os documentos brutos nem o cálculo em si

**Dado que** o insight foi gerado (números + mensagem em linguagem natural)
**Quando** é persistido
**Então** é guardado em `insights` com `type` (`'price_increase'` | `'renewal'`), `severity`, `data` (jsonb com os números) e `message` (texto do LLM)

**Dado que** a chamada ao LLM de explicação falha ou está indisponível
**Quando** o insight já foi calculado deterministicamente
**Então** o insight é guardado com uma mensagem de fallback determinística (ex: template com os números), nunca fica bloqueado por dependência de rede externa

**Dado que** não existe nenhum segundo documento/valor para um fornecedor
**Quando** o motor de regras corre
**Então** não gera nenhum insight de `price_increase` (não há histórico para comparar) — só passa a existir depois de dois pontos de dados

## Critérios de aceitação

- [ ] `supabase/schema.sql` inclui a tabela `contracts` (RLS por `user_id`) conforme `CLAUDE.md`, ou a ficha documenta explicitamente por que fica fora do escopo e que estrutura mínima é usada em vez disso
- [ ] `supabase/schema.sql` inclui a tabela `insights` (RLS por `user_id`) conforme `CLAUDE.md`
- [ ] Critério de matching fornecedor/contrato é determinístico e documentado (ex: normalização simples de texto, ou confirmação explícita do utilizador) — nunca inferido pelo LLM
- [ ] Cálculo de aumento absoluto e percentual usa `percentageChange`/`isSignificantIncrease` já existentes em `src/lib/rulesEngine.ts` — sem duplicar a lógica
- [ ] Cálculo de dias até renovação reutiliza `daysUntil` já existente em `src/lib/rulesEngine.ts`, com threshold parametrizável (não hardcoded a 30 dias como o F04)
- [ ] Nova edge function (ex: `supabase/functions/explain-insight/`) recebe apenas os números já calculados (nunca documentos brutos) e devolve só a mensagem em linguagem natural, seguindo o padrão de autenticação/estrutura de `supabase/functions/extract-document/index.ts`
- [ ] Se a chamada LLM de explicação falhar, existe uma mensagem de fallback determinística (template), e o insight não deixa de ser guardado
- [ ] Insight é guardado em `insights` com `type` (`'price_increase'` | `'renewal'`), `severity`, `data` (jsonb) e `message`
- [ ] Nenhum insight de `price_increase` é gerado com menos de dois pontos de dados para o mesmo fornecedor/contrato
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Reutilização confirmada de `rulesEngine.ts`:** `percentageChange`, `isSignificantIncrease` (default 10%), `isAnomaly` (default 25%, mais relevante para F06 Bills Intelligence do que para esta ficha) e `average` já existem e cobrem o cálculo central. Não recriar esta lógica no componente ou na edge function.
- **Dependência de schema não resolvida (`contracts` + `insights`):** nenhuma das duas tabelas existe hoje. Decidir em `/plan` os campos mínimos de `contracts` (o schema de `CLAUDE.md` já dá um ponto de partida: `provider`, `type`, `start_date`, `renewal_date`, `current_amount`) e se `documents` precisa de uma coluna `contract_id` (paralelo ao `asset_id` já adicionado para o F04) para ligar documentos ao histórico do fornecedor.
- **Matching de fornecedor é o ponto mais ambíguo desta ficha.** `provider` é texto livre gerado pelo Vision LLM, sem normalização. Duas variantes do mesmo nome (ex: "Fidelidade" vs "Fidelidade Companhia de Seguros") vão falhar num matching exacto. Avaliar em `/research`: normalização simples (trim + lowercase, talvez remoção de sufixos comuns tipo "Lda"/"S.A.") vs. exigir que o utilizador associe explicitamente um novo documento a um contrato existente (mais lento, mas 100% determinístico e sem falsos positivos/negativos de texto).
- **Separação estrita entre cálculo e explicação:** seguindo `CLAUDE.md` regra #6 e a arquitectura de IA (`## Arquitectura de IA`), a nova edge function de explicação deve receber um payload já normalizado (ex: `{ provider, type: 'price_increase'|'renewal', previousAmount, currentAmount, percentageChange, daysUntilRenewal }`) — nunca amount/datas brutas por calcular, e nunca o documento original. Isto evita que o LLM "recalcule" ou invente números.
- **Threshold de alerta antecipado diferente do F04.** O exemplo do pedido é 17 dias (vs. 30 dias default de `isExpiringSoon` usado no Coverage Check). Confirmar em `/plan` se o threshold é fixo, configurável por tipo de contrato (seguro vs. subscrição), ou configurável pelo utilizador — e se isso implica estender `isExpiringSoon`/`getCoverageStatus` ou criar uma função equivalente dedicada a renovações de contrato.
- **Ligação ao dashboard existente:** `app/(dashboard)/index.tsx` já tem um card "Upcoming renewals" com `TODO: F08`. Decidir em `/plan` se esta ficha já popula esse card (lendo `insights`/`contracts`) ou se isso fica reservado para F08 (Alerts e Life Calendar) — evitar implementar duas vezes a mesma leitura de dados.
- **Sem tabela `events` ainda.** O "alerta antecipado" pedido não precisa necessariamente de uma linha em `events` para funcionar (pode ser calculado em runtime a partir de `contracts.renewal_date` sempre que o ecrã carrega) — mas se o objectivo for notificações/push, isso depende de F08. Nesta ficha, assumir que o alerta é mostrado quando o utilizador abre a app, não como notificação proactiva.
- **`amount` em `documents` não distingue moeda/periodicidade.** Se um fornecedor mudar de fatura mensal para anual (ou vice-versa), a comparação direta de `amount` entre dois documentos ficaria incorrecta. Assumir por agora que a comparação só é válida entre documentos com a mesma periodicidade (`billing_period`, campo que só existe hoje na tabela `bills` do `CLAUDE.md`, ainda não criada) — decidir em `/plan` se esta ficha precisa de capturar isso já ou se fica assumido como "mesma periodicidade" sem validação.

## Fora do escopo

- Bills Intelligence completo (histórico de água, luz, gás, internet, telemóvel com categorias e gráficos) — isso é o F06/F07, que depende da tabela `bills` (ainda não criada) e de categorias que não existem em `documents`
- Detecção de anomalia por média móvel (`isAnomaly`, threshold 25% face à média de 6 meses) — reutilizável no futuro, mas esta ficha cobre apenas comparação entre duas faturas consecutivas (aumento/renovação), não histórico de N meses
- Notificações push ou eventos automáticos no Life Calendar — isso é o F08 (Alerts e Life Calendar); esta ficha só calcula e mostra o insight quando o utilizador abre a app
- Normalização avançada de fornecedor (fuzzy matching, NLP, deduplicação automática entre nomes muito diferentes do mesmo fornecedor) — usar apenas normalização simples ou confirmação manual do utilizador
- Cancelamento, negociação ou comparação com alternativas de mercado — isso é o Zelanna Agent (Phase 6), explicitamente fora do MVP
- Suporte a múltiplas moedas ou conversão cambial nos valores comparados

## Próximo passo
/research Que estrutura mínima de `contracts` (schema, RLS, e ligação a `documents` via `contract_id`) é suficiente para agrupar documentos do mesmo fornecedor ao longo do tempo, e que critério de matching de `provider` é suficientemente determinístico para evitar falsos positivos/negativos sem exigir normalização de texto complexa?
