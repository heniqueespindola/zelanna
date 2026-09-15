---
data: 2026-09-15
feature: "Bills Dashboard (F07)"
status: completo
---

# Research: Bills Dashboard (F07)

## Questão de Pesquisa

Do ticket `thoughts/shared/tickets/2026-09-15-bills-dashboard.md` → "Próximo passo":
1. Que biblioteca de gráficos (compatível com Expo SDK 57 / React Native 0.86, iOS + Android) deve ser usada para os gráficos de categoria e evolução mensal?
2. A lista de próximas renovações deve reutilizar `fetchUpcomingRenewals()`/`contracts` (já existente) ou justifica-se criar agora a tabela `events` descrita em `CLAUDE.md`?
3. Que critério concreto define "aumento recorrente" na nova regra de `rulesEngine.ts`?

## Sumário

Não existe hoje nenhuma biblioteca de gráficos instalada nem lógica de "aumento recorrente" ou tabela `events` no repositório — as três questões do ticket são genuinamente novas, sem nada para reaproveitar directamente. Em compensação, `groupBills()` (`src/lib/bills.ts`) já produz exactamente os dados agregados (por categoria+fornecedor, com `average6`/`average12`/`latestChangePercent`) que um dashboard visual precisa, e `rulesEngine.ts` já tem `percentageChange`/`isSignificantIncrease`/`isAnomaly`/`average` prontos a reutilizar. A pesquisa externa aponta `react-native-gifted-charts` (svg-based, compatível com Expo Go, sem dev build) como opção de menor atrito face a `victory-native` (Skia-based, exige dev build/EAS); e o roadmap do próprio `FEATURES.md` mostra que a tabela `events` está reservada explicitamente para **F08** (não F07), o que é um argumento forte contra criá-la aqui.

## Ficheiros Relevantes da Codebase

- `src/lib/bills.ts` — `fetchBills(userId)`, `groupBills(bills)` já calculam histórico agrupado por categoria+fornecedor com `average6`, `average12`, `latestChangePercent`; é a base de dados agregados para os gráficos de categoria e evolução (funcionalidades 1, 2, 3 do ticket).
- `src/lib/rulesEngine.ts:61-79` — `percentageChange`, `isSignificantIncrease` (threshold 10%, default), `isAnomaly` (threshold 25%, default), `average` — motor determinístico já validado por F05/F06; não existe nenhuma função de "aumento recorrente" (subida consistente ao longo de vários períodos).
- `src/lib/insights.ts` — `fetchRecentInsights(userId, limit)`, `generateInsightsForBill`, `generateInsightsForContract` já geram/persistem `price_increase`/`anomaly`/`renewal` com `message` já explicado (LLM + `fallbackMessage` determinístico). O dashboard deve **ler** estes insights, nunca recalcular ou re-explicar.
- `src/lib/insights.ts:193-202` — `fetchUpcomingRenewals(userId)` lê `contracts` directamente (sem tabela `events`) e filtra por `isExpiringSoon(renewal_date, 30)`; já usada no dashboard principal (`app/(dashboard)/index.tsx`) via `RenewalTimeline`.
- `app/(dashboard)/bills.tsx` — ecrã actual de F06: `useFocusEffect` → `fetchBills` + `groupBills` → lista de `BillGroupCard`. É a lista "crua"; o dashboard visual pedido aqui é uma camada nova, a decidir em `/plan` se fica no mesmo ecrã (nova secção acima da lista) ou num ecrã irmão.
- `app/(dashboard)/index.tsx` — padrão de referência directo para agregar múltiplas fontes num ecrã: `Promise.all([fetchUpcomingRenewals(user.id), fetchRecentInsights(user.id)])` dentro de `useFocusEffect`, cards com `colors.surfaceAlt` de fundo.
- `src/components/dashboard/RenewalTimeline.tsx` — lista simples de `Contract[]` com `daysUntil()`; padrão a seguir (ou reutilizar directamente) para a secção "próximas renovações" do dashboard de bills.
- `src/components/dashboard/InsightCard.tsx` — `TYPE_LABELS` (`price_increase`/`renewal`/`anomaly`) + `Badge` colorido por `severity`; reutilizável tal e qual para a secção de anomalias/aumentos do dashboard.
- `src/components/bills/BillGroupCard.tsx` — já usa `Badge` com `tone={change > 10 ? 'warning' : 'info'}` sobre `latestChangePercent`; mesmo padrão de "destaque visual por magnitude" a replicar nos gráficos.
- `src/constants/theme.ts` — `colors.primary = '#324138'`, `colors.accent = '#C9A15C'` já são os tokens exactos pedidos no ticket para gráficos principais e anomalias/alertas; `colors.warning` também já é `'#C9A15C'` (mesmo valor que `accent`).
- `package.json` — sem nenhuma dependência de gráficos; `react-native-svg@15.15.4` já instalado (dependência nativa que a maioria das bibliotecas de gráficos usa como base).
- `supabase/schema.sql` — schema actual completo (`users`, `documents`, `assets`, `coverage`, `contracts`, `insights`, `bills`); **não existe** tabela `events`.
- `FEATURES.md:137-148` (F08 — "Alerts e Life Calendar básico") — descreve explicitamente "(1) lista de eventos da tabela `events` (renovações, expirações, deadlines) ordenada por data" como parte do **F08**, não do F07. Sinal directo de que a tabela `events` está reservada para essa ficha seguinte, não para o Bills Dashboard.

## Padrões de Implementação Existentes

**Agregação por categoria/fornecedor já pronta (`src/lib/bills.ts`):**
```ts
export interface BillGroup {
  category: BillCategory;
  provider: string;
  bills: Bill[]; // desc by invoice_date
  latestChangePercent: number | null;
  average6: number | null;
  average12: number | null;
}

export function groupBills(bills: Bill[]): BillGroup[] {
  // agrupa por `${category}::${normalizeProvider(provider)}`,
  // calcula latestChangePercent (percentageChange sobre os 2 mais recentes),
  // average6/average12 via `average()` de rulesEngine.ts quando há histórico suficiente
}
```

**Motor determinístico já validado (`src/lib/rulesEngine.ts:61-79`):**
```ts
export function percentageChange(current: number, previous: number): number {
  return ((current - previous) / previous) * 100;
}
export function isSignificantIncrease(current: number, previous: number, thresholdPercent = 10): boolean {
  return percentageChange(current, previous) > thresholdPercent;
}
export function isAnomaly(current: number, average: number, thresholdPercent = 25): boolean {
  return percentageChange(current, average) > thresholdPercent;
}
export function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
```
Não existe hoje nenhuma função equivalente para "N períodos consecutivos com subida" — teria de ser nova, seguindo o mesmo estilo (pura, testável, sem I/O).

**Padrão de ecrã com múltiplas fontes agregadas (`app/(dashboard)/index.tsx`):**
```tsx
useFocusEffect(
  useCallback(() => {
    if (!user) return;
    Promise.all([fetchUpcomingRenewals(user.id), fetchRecentInsights(user.id)]).then(
      ([loadedRenewals, loadedInsights]) => {
        setRenewals(loadedRenewals);
        setInsights(loadedInsights);
      }
    );
  }, [user])
);
```
O Bills Dashboard provavelmente segue o mesmo padrão, acrescentando `fetchBills(user.id)` (já existente) à lista de `Promise.all`.

**Renovações sem tabela `events` (`src/lib/insights.ts:193-202`):**
```ts
export async function fetchUpcomingRenewals(userId: string): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select('id, user_id, provider, type, start_date, renewal_date, current_amount, created_at')
    .eq('user_id', userId)
    .not('renewal_date', 'is', null)
    .order('renewal_date', { ascending: true });
  if (error) throw new Error('Could not load renewals');
  return (data ?? []).filter((c) => c.renewal_date && isExpiringSoon(c.renewal_date, RENEWAL_THRESHOLD_DAYS));
}
```

## Tabelas/Queries Supabase Relevantes

- **`bills`** (criada em F06): `id, user_id, provider, provider_normalized (generated), category, invoice_date, billing_period, amount, created_at`. RLS por `user_id`. `billing_period` (`'monthly' | 'bimonthly' | 'yearly'`) existe na coluna mas **não é lido em nenhum cálculo actual** — nem em `groupBills`, nem em `generateInsightsForBill`.
- **`contracts`**: `id, user_id, provider, provider_normalized (generated), type ('insurance'|'utility'|'subscription'|'other'), start_date, renewal_date, current_amount, created_at`. Sem `category` — não distingue água/eletricidade/etc., só é relevante aqui para renovações (`renewal_date`, `current_amount`).
- **`insights`**: `id, user_id, contract_id, bill_id, type ('price_increase'|'renewal'|'anomaly'), severity, data (jsonb), message, created_at`. Já cobre tudo o que a secção de "anomalias e aumentos" precisa — falta apenas decidir se "aumento recorrente" é um `type` novo (ex: `'recurring_increase'`) ou é apresentado só no dashboard sem persistir em `insights` (mudança de schema vs. cálculo em runtime).
- **`events`**: **não existe** no `schema.sql` actual, apesar de descrita em `CLAUDE.md` (secção "Schema da base de dados") como `id, user_id, type ('renewal'|'expiry'|'deadline'), due_date, source_id, created_at`. `FEATURES.md` reserva esta tabela explicitamente para F08 ("Alerts e Life Calendar básico"), a ficha seguinte no roadmap.

## APIs Externas Relevantes

Nenhuma API de IA/pagamento é relevante aqui (sem extracção, sem Stripe, sem Gmail) — a única pesquisa externa desta ficha é sobre bibliotecas de gráficos para React Native/Expo:

| Biblioteca | Base técnica | Expo Go | Dev build/EAS necessário | Estado (2026) |
|---|---|---|---|---|
| `victory-native` (XL) | `@shopify/react-native-skia` + `react-native-reanimated` + `react-native-gesture-handler` | ❌ Não funciona em Expo Go | ✅ Sim — precisa de custom dev build/EAS Build | Rewrite activo, GPU-accelerated, mais pesado em dependências nativas |
| `react-native-gifted-charts` | `react-native-svg` (já instalado, v15.15.4) + `expo-linear-gradient` (não instalado) | ✅ Funciona em Expo Go | ❌ Não | Actualizado recentemente, moveu `react-native-svg`/gradient para peer deps para melhor compatibilidade com Expo; boa relação funcionalidade/esforço |
| `react-native-chart-kit` | `react-native-svg` | ✅ Funciona em Expo Go | ❌ Não | Mais antigo, API mais simples/rígida, popularidade estável mas menos activamente evoluído que gifted-charts |

Nenhuma fonte encontrada confirma ou nega explicitamente compatibilidade total com React 19.2/RN 0.86 New Architecture para nenhuma das três — a Expo SDK 57 exige que "every native module in the tree" seja compatível com a New Architecture (Legacy Architecture foi descontinuada a partir da SDK 55). `react-native-svg` (dependência comum às três) já está instalado e a funcionar no projecto (usado nos ícones/UI actuais), o que reduz o risco de incompatibilidade para as opções svg-based.

Sources:
- [Expo SDK 57 — Expo changelog](https://expo.dev/changelog/sdk-57)
- [Expo SDK 57 Upgrade Guide: React Native 0.86 Migration](https://paddyb.com/tutorials/expo-sdk-57-upgrade-guide.html)
- [GitHub - FormidableLabs/victory-native-xl](https://github.com/FormidableLabs/victory-native-xl)
- [Victory Native Charts Tutorial 2026 | React Native Relay](https://reactnativerelay.com/article/react-native-charts-victory-native-interactive-data-visualizations-expo)
- [react-native-gifted-charts - npm](https://www.npmjs.com/package/react-native-gifted-charts)
- [react-native-chart-kit vs react-native-gifted-charts | npm trends](https://npmtrends.com/react-native-chart-kit-vs-react-native-gifted-charts)

## Code Snippets de Referência

**Badge por severidade/magnitude, já usado em `BillGroupCard.tsx` e `InsightCard.tsx` — replicável na legenda/destaque dos gráficos:**
```tsx
<Badge
  label={`${group.latestChangePercent > 0 ? '+' : ''}${group.latestChangePercent.toFixed(1)}%`}
  tone={group.latestChangePercent > 10 ? 'warning' : 'info'}
/>
```

**Tokens de cor exactos pedidos no ticket, já existentes em `src/constants/theme.ts`:**
```ts
export const colors = {
  primary: '#324138', // pedido para gráficos principais
  accent: '#C9A15C',  // pedido para anomalias/alertas — igual a colors.warning
  // ...
} as const;
```

## Questões em Aberto

1. **Biblioteca de gráficos:** `react-native-gifted-charts` parece o caminho de menor atrito (Expo Go, base `react-native-svg` já instalada, só falta `expo-linear-gradient`), face a `victory-native` que obriga a dev build/EAS mesmo para testar em desenvolvimento. Confirmar em `/plan` se o projecto está disposto a exigir dev build (o `CLAUDE.md` já assume EAS Build para produção, mas hoje o fluxo de dev descrito nos outros ficheiros de research é `npx expo start` simples).
2. **Origem das renovações:** o roadmap (`FEATURES.md`, F08) reserva a tabela `events` para a ficha seguinte — criá-la agora em F07 antecipa trabalho de F08 sem um segundo consumidor imediato. Reutilizar `fetchUpcomingRenewals()`/`contracts` (zero schema novo, já validado no dashboard principal) parece a opção de menor risco, mas fica por decidir formalmente em `/plan`.
3. **Critério de "aumento recorrente":** não há nenhuma definição hoje (nem em `CLAUDE.md`, que só diz "Alteração consistente de valor recorrente → alerta" sem números). Precisa de: (a) quantos períodos consecutivos de subida activam o alerta, (b) se cada subida individual precisa de um mínimo (ex: >0%) ou se pode ser qualquer subida por menor que seja, (c) se o `type` de insight é novo (`'recurring_increase'`, exigindo migração a `insights.type`/`Insight`/`explain-insight`) ou se é uma secção só de apresentação no dashboard sem persistir insight novo.
4. **Normalização de `billing_period` para o total mensal/anual:** hoje nenhuma função lê esta coluna. Fórmula a validar em `/plan` (ex: `yearly` → `amount/12` no total mensal e `amount` no anual; `bimonthly` → `amount/2` no mensal); decidir também o que fazer com `billing_period: null` (assumir `monthly` por omissão, ou excluir do total?).
5. **Filtro por período (mês/trimestre/ano):** sem precedente no código. A decisão mais simples (filtrar em memória sobre `fetchBills()`, que já traz todo o histórico do utilizador) evita reconsultas ao Supabase por troca de filtro, mas fica por confirmar em `/plan` se o volume esperado de bills por utilizador (dezenas, não milhares) torna isto aceitável sem paginação.
6. **Onde vive o dashboard:** nova secção no `app/(dashboard)/bills.tsx` actual (acima da lista de `BillGroupCard`) ou ecrã dedicado novo — a decidir em `/plan`, sem que isto tenha sido pedido explicitamente no ticket.
