---
data: 2026-09-15
status: backlog
prioridade: alta
fase_mvp: sim
---

# Feature: Coverage Check (F04)

## Contexto

Coverage Check é a Hipótese #1 do wedge inicial (`CLAUDE.md` → Nova tese de valor prioritária, dificuldade 3/10): cruzar garantia + seguro/extensão de um asset e responder "estou coberto?" com uma regra determinística sobre datas, não uma estimativa do LLM. É a feature que a Phase 0 valida como "Aha Moment" mais barato de construir, por isso o ecrã real (não apenas o placeholder actual) é prioridade alta.

Estado actual do repositório:

- `app/(dashboard)/coverage.tsx` é um placeholder — só título, subtítulo e um comentário `TODO: F04`. Não lê nenhuma tabela.
- `src/components/coverage/` existe mas está **vazia** — nenhum `CoverageCheckForm`/`CoverageResult` foi criado.
- `src/lib/rulesEngine.ts` já tem `daysUntil()` e `isExpiringSoon(dateISO, thresholdDays=30)`, usadas hoje só para o insight de onboarding (`generateOnboardingInsight`). São directamente reutilizáveis para a regra "a expirar em breve" desta ficha — evitar duplicar a lógica de datas.
- **`supabase/schema.sql` só tem as tabelas `users` e `documents`.** As tabelas `assets` e `coverage` descritas em `CLAUDE.md` → Schema da base de dados **não existem ainda no schema aplicado**. Esta ficha depende directamente de ambas (o pedido é explícito: "identificar garantia ativa, seguro associado e extensão/AppleCare ligados ao asset via tabela coverage").
- Não existe nenhum ecrã, hook (`useAssets`, `useCoverageCheck`) ou tipo (`src/types/assets.ts`, `src/types/coverage.ts`) para assets — a estrutura de pastas do `CLAUDE.md` já assinala isto: "assets/ (Warranty Vault, fase 3) ... ainda por criar". O CRUD completo de assets é o F10 (Phase 3), fora do escopo desta ficha.
- `documents` (schema actual) **não tem `asset_id`** — não há forma de ligar um documento já extraído a um asset sem alterar o schema.
- `src/constants/theme.ts` tem `colors.warning` (`#C9A15C`, dourado) e `colors.critical` (`#A3402E`) mas **não tem uma cor de confirmação/sucesso** — o pedido pede explicitamente "um verde de confirmação para 'coberto'", que ainda não existe como token.

**Implicação central:** o pedido assume implicitamente que já existem assets com coverage associada. Como isso não existe no MVP actual, esta ficha precisa de decidir o mínimo necessário para o utilizador chegar a um asset com dados de cobertura — seja criando `assets`/`coverage` no schema agora, seja definindo um fluxo mínimo de "criar asset a partir de um documento" sem construir o Warranty Vault completo (F10) antes da hora.

## Comportamento esperado

**Dado que** o utilizador não tem nenhum asset registado
**Quando** abre o ecrã Coverage Check
**Então** vê um estado vazio claro com opção de criar um asset a partir de um documento já carregado (não redirecciona silenciosamente nem mostra um ecrã em branco)

**Dado que** o utilizador tem pelo menos um asset
**Quando** abre o ecrã Coverage Check
**Então** vê uma lista/selector de assets para escolher qual verificar

**Dado que** o utilizador seleccionou um asset
**Quando** o ecrã carrega os registos de `coverage` ligados a esse `asset_id`
**Então** identifica separadamente garantia (`type='warranty'`), seguro (`type='insurance'`) e extensão/AppleCare (`type='extension'`) activos

**Dado que** existe pelo menos uma cobertura ligada ao asset
**Quando** a data actual é comparada com `start_date`/`end_date` de cada cobertura (regra determinística, reutilizando `daysUntil`/`isExpiringSoon` de `src/lib/rulesEngine.ts`)
**Então** cada cobertura é classificada como `coberto` (dentro do período), `a expirar em breve` (dentro do threshold, ex: 30 dias) ou `não coberto` (fora do período ou inexistente) — nunca uma estimativa do LLM

**Dado que** o asset tem pelo menos uma cobertura activa
**Quando** o resultado é mostrado
**Então** aparece um badge verde de confirmação "Covered" com a cobertura mais relevante (a que expira mais tarde, ou a mais específica — ex: seguro sobre garantia genérica)

**Dado que** uma cobertura está dentro do threshold de expiração
**Quando** o resultado é mostrado
**Então** aparece um badge dourado (`#C9A15C`) "Expiring soon" com a data exacta e os dias restantes

**Dado que** nenhuma cobertura está activa para o asset
**Quando** o resultado é mostrado
**Então** aparece um estado "Not covered", sem badge de confirmação nem dourado, e a próxima acção sugerida é adicionar uma cobertura

**Dado que** o asset tem cobertura parcial (ex: garantia expirada mas sem seguro registado, ou vice-versa)
**Quando** o resultado é mostrado
**Então** o ecrã indica explicitamente que documentos/coberturas estão em falta para completar a protecção (ex: "No insurance on file for this asset")

**Dado que** existe uma cobertura activa ou a expirar
**Quando** o resultado é mostrado
**Então** aparece a entidade/fornecedor (`coverage.provider`) e a próxima acção recomendada com data concreta (ex: "Renew by 12/03"), nunca uma recomendação vaga

## Critérios de aceitação

- [ ] `supabase/schema.sql` inclui as tabelas `assets` e `coverage` conforme `CLAUDE.md` (com RLS por `user_id`/via `asset_id`), ou a ficha documenta explicitamente por que ficam fora do escopo e o que assume no lugar
- [ ] `app/(dashboard)/coverage.tsx` deixa de ser placeholder: lista assets do utilizador, permite seleccionar um, e mostra o resultado de cobertura
- [ ] Estado vazio (sem assets) oferece caminho claro para criar um asset a partir de um documento já em `documents`
- [ ] Componentes `CoverageCheckForm` e `CoverageResult` criados em `src/components/coverage/` (hoje vazio), cada um <150 linhas
- [ ] Regra de datas (activo / a expirar em breve / não coberto) é 100% determinística, reutilizando ou estendendo `daysUntil`/`isExpiringSoon` de `src/lib/rulesEngine.ts` — nenhuma chamada ao LLM para decidir o estado de cobertura
- [ ] Threshold de "a expirar em breve" é consistente com o resto da app (30 dias, mesmo default de `isExpiringSoon`)
- [ ] Badge "Covered" usa uma cor de confirmação (verde) adicionada a `colors` em `src/constants/theme.ts` — nunca um hexadecimal solto no componente
- [ ] Badge "Expiring soon" usa `colors.warning` (`#C9A15C`) já existente em `src/constants/theme.ts`
- [ ] Resultado mostra sempre a próxima acção recomendada com data concreta quando aplicável (ex: "Renew by 12/03"), nunca apenas o estado
- [ ] Resultado mostra a entidade/fornecedor da cobertura relevante (`coverage.provider`)
- [ ] Coberturas em falta (garantia sem seguro, ou nenhuma cobertura) são comunicadas de forma específica, não um genérico "not covered"
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Dependência de schema não resolvida:** `assets` e `coverage` não existem em `supabase/schema.sql` hoje — apenas `users` e `documents`. Esta ficha não pode ser implementada sem primeiro decidir se cria estas duas tabelas agora (adiantando parte do F10/Warranty Vault) ou se usa uma versão mínima (ex: `assets` só com `id`, `user_id`, `name`, sem os campos completos de Warranty Vault do F10 como `brand`/`model`/`serial_number`). Decidir em `/plan` — mas o `/research` desta ficha deve mapear exactamente que campos mínimos de `assets`/`coverage` o Coverage Check precisa, para não construir o F10 completo prematuramente.
- **"Cria um a partir de um documento" é o ponto mais ambíguo do pedido.** Não existe hoje nenhuma acção de "promover" um `document` (ex: uma fatura de garantia extraída) a `asset` + `coverage`. Isto implica nova UI de criação de asset mínima, potencialmente pré-preenchida a partir de `extracted_data` de um documento (`provider`, `date`, `expiry_date` já existem em `ExtractedDocumentData`, ver `src/types/documents.ts`). Definir em `/plan` o mínimo necessário sem duplicar o CRUD completo do F10.
- **`documents` não tem `asset_id`.** Se a criação de asset a partir de um documento for implementada, `documents` provavelmente precisa de uma coluna `asset_id` opcional para manter a ligação Document → Asset — avaliar em `/plan` face ao modelo `CLAUDE.md` (Asset → Purchase → Invoice → Warranty → Insurance → Maintenance → Contract → Cost → Owner → Estate).
- **Falta token de cor "confirmação/sucesso" em `src/constants/theme.ts`.** Hoje só existem `info` (`#5B685F`), `warning` (`#C9A15C`) e `critical` (`#A3402E`) na secção "Severidade de alertas" — nenhum verde. A paleta oficial do `CLAUDE.md` não lista um verde de confirmação dedicado (os verdes existentes, `#131E15`/`#324138`/`#5B685F`, são a escala neutra/de marca, não uma cor semântica de sucesso). Decidir em `/plan` que verde usar (ex: derivar de `#324138` mais claro, ou introduzir um novo token `success`) — não inventar um hex ad-hoc dentro do componente.
- **Reutilização de `rulesEngine.ts`:** `daysUntil()` e `isExpiringSoon()` já existem e cobrem o essencial da regra de datas desta ficha. Considerar extrair uma função dedicada `getCoverageStatus(coverage): 'active' | 'expiring_soon' | 'expired'` no mesmo ficheiro, reutilizando as duas funções existentes, para manter o motor de cálculo centralizado (`CLAUDE.md` regra #6 — motor de cálculo sempre determinístico).
- **Múltiplas coberturas activas para o mesmo asset:** se existir garantia activa e seguro activo em simultâneo, decidir em `/plan` a regra de precedência para o "badge principal" mostrado (ex: mostrar o mais específico, ou listar ambos lado a lado em vez de eleger um único resultado).
- **Sem campo de contacto/telefone no schema actual.** O pedido pede para "indicar entidade/contacto relevante" — hoje `coverage.provider` (texto livre) é o único campo disponível; não há campo estruturado de contacto (telefone/email/URL). Assumir que "entidade/contacto" = mostrar `provider` nesta ficha, sem adicionar novos campos de contacto ao schema (fora do escopo, ver abaixo).

## Fora do escopo

- CRUD completo de assets (produto/modelo, número de série, vendedor, maintenance, claims) — isso é o F10, Warranty Vault completo, Phase 3
- Ligação automática de coverage a partir da extracção de documentos (ex: o Vision LLM identificar sozinho que um documento é uma garantia e associá-la a um asset existente) — nesta ficha a associação é sempre uma acção explícita do utilizador
- Edição/eliminação de registos de `coverage` já existentes — esta ficha é apenas leitura + criação mínima ligada à criação de asset
- Campos estruturados de contacto (telefone, email, URL) para a entidade de cobertura — usar `provider` (texto) por agora
- Notificações push ou eventos automáticos no Life Calendar a partir do resultado de cobertura — isso pertence ao F08 (Alerts e Life Calendar)
- Comparação de preços entre seguros/coberturas — isso é o F05 (Renewal / Price Increase Detection)

## Próximo passo
/research Que campos mínimos de `assets` e `coverage` (schema, RLS) são suficientes para o Coverage Check funcionar sem antecipar o CRUD completo do Warranty Vault (F10), e qual o fluxo mais simples para "criar asset a partir de um documento" reutilizando os campos já extraídos em `ExtractedDocumentData` (`provider`, `date`, `expiry_date`)?
