---
data: 2026-09-11
status: backlog
prioridade: alta
fase_mvp: sim
---

# Feature: Onboarding (3 ecrãs — objectivo, primeiro documento, primeiro insight)

## Contexto

O onboarding é o fluxo mais importante do MVP porque é onde se produz o "Aha Moment" que a Phase 0 (`## ⚠️ Metodologia`, CLAUDE.md) pretende validar: mostrar ao utilizador, ainda na primeira abertura da app, um insight real gerado a partir de um documento que ele próprio carregou (data de expiração de garantia, alerta de renovação, etc.).

Este fluxo já existe como placeholder em `app/onboarding/step1.tsx` a `step3.tsx` (navegação e tema prontos, lógica por implementar — ver `TODO: F02` nos ficheiros). É bloqueado por `## Feature: Autenticação` (ticket `2026-09-11-autenticacao.md`), que ainda está em `backlog`: o onboarding assume um utilizador autenticado antes de decidir se mostra onboarding ou vai directo para `(dashboard)`.

O onboarding só deve aparecer **na primeira abertura** — em aberturas seguintes, o utilizador autenticado vai directo para `(dashboard)`.

## Comportamento esperado

**Dado que** um utilizador acabou de criar conta (ou abre a app pela primeira vez após registo)
**Quando** a app carrega
**Então** vê o ecrã `onboarding/step1` com boas-vindas e indicador de progresso "1/3"

**Dado que** o utilizador está no Passo 1
**Quando** selecciona um ou mais objectivos principais (proteger ativos / controlar despesas / preparar digital estate — multi-select, pelo menos uma opção obrigatória para avançar)
**Então** o botão "Continue" fica activo e navega para `onboarding/step2` ("2/3")

**Dado que** o utilizador está no Passo 2
**Quando** carrega o primeiro documento (fatura, seguro ou garantia — foto ou PDF)
**Então** vê feedback de upload em curso, seguido de um preview em tempo real dos dados extraídos (Vision LLM) — ex: fornecedor, tipo de documento, datas, valor — antes de avançar

**Dado que** a extracção do Passo 2 foi concluída
**Quando** o utilizador confirma/avança
**Então** navega para `onboarding/step3` ("3/3")

**Dado que** o utilizador está no Passo 3
**Quando** o ecrã carrega
**Então** vê o primeiro insight gerado a partir do documento carregado (ex: "A tua garantia expira a 12 de Março de 2027" ou "Este contrato renova daqui a 20 dias"), destacado a dourado (`#C9A15C`) sobre fundo névoa (`#DBE0DF`)

**Dado que** o utilizador termina o Passo 3
**Quando** carrega em "Continuar para o Dashboard" (ou equivalente)
**Então** é redireccionado para `(dashboard)` e o onboarding não volta a aparecer em sessões futuras

**Dado que** o utilizador fecha a app a meio do onboarding (ex: no Passo 2) e reabre mais tarde
**Quando** a app arranca
**Então** retoma no mesmo passo onde ficou (ou reinicia no Passo 1 — decisão a validar, ver `## Notas técnicas`)

## Critérios de aceitação

- [ ] `app/onboarding/step1.tsx`: selecção multi-select do objectivo principal (proteger ativos / controlar despesas / preparar digital estate), pelo menos uma opção seleccionada para o botão "Continue" ficar activo, indicador de progresso "1/3"
- [ ] `app/onboarding/step2.tsx`: upload de documento (fatura, seguro ou garantia) via `expo-image-picker`/`expo-document-picker`, envio para Supabase Storage, chamada à extracção Vision LLM, preview em tempo real dos campos extraídos (loading state enquanto processa), indicador de progresso "2/3"
- [ ] `app/onboarding/step3.tsx`: geração e apresentação do primeiro insight a partir dos dados extraídos no Passo 2 (usar o rules engine determinístico, nunca o LLM a calcular — ver `## Arquitectura de IA` do CLAUDE.md), destaque visual em dourado `#C9A15C`, indicador de progresso "3/3"
- [ ] Indicador de progresso consistente e reutilizável nos 3 ecrãs (componente único, não duplicado por ecrã)
- [ ] Fundo `#DBE0DF` (névoa) aplicado via token `colors.bgLight` de `src/constants/theme.ts` — nunca hexadecimais soltos
- [ ] Insight final do Passo 3 usa `colors.accent` (`#C9A15C`) para destaque — via token, não hardcoded
- [ ] Onboarding mostrado apenas na primeira abertura: estado persistido (ex: flag `onboarding_completed` associada ao utilizador) consultado antes de decidir entre onboarding e `(dashboard)`
- [ ] Utilizador que sai do onboarding a meio e reabre a app é encaminhado de acordo com a decisão tomada em `## Notas técnicas` (retomar passo vs reiniciar)
- [ ] Após concluir o Passo 3, navegação para `(dashboard)` e onboarding marcado como concluído (não reaparece)
- [ ] Erros de upload/extracção no Passo 2 mostram mensagem amigável e permitem tentar novamente sem perder o progresso do Passo 1
- [ ] Tipografia consistente com o resto da app: `fonts.display` (Avenir) para títulos, `fonts.body` (Lato) para corpo/labels
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Dependência bloqueadora:** esta feature assume um utilizador autenticado (`useAuth`, ver ticket `2026-09-11-autenticacao.md`, ainda em `backlog`). Não é possível persistir `onboarding_completed` nem associar o documento carregado a um `user_id` real sem essa fase estar concluída primeiro.
- **Passo 2 depende da pipeline de extracção Vision LLM** (`## Arquitectura de IA`) ainda não implementada no scaffold (`src/lib/extraction.ts` por criar, ver estrutura de pastas do CLAUDE.md). Esta ficha assume que a extracção básica (fornecedor, tipo, datas, valor) já está disponível como função reutilizável — se não estiver, o Passo 2 fica bloqueado e deve ser tratado como dependência explícita antes de `/plan`.
- **Passo 3 depende do rules engine determinístico** (`src/lib/rulesEngine.ts` por criar) para calcular o insight (ex: dias até expiração/renovação) — o LLM apenas explica o resultado em linguagem natural, nunca calcula (regra crítica do CLAUDE.md).
- **Persistência do estado de onboarding:** decidir onde guardar `onboarding_completed` — campo na tabela `users` (schema actual do CLAUDE.md não tem este campo, pode ser necessário adicionar) vs. tabela/flag separada. Esta decisão afecta o schema Supabase e deve ser resolvida em `/plan`.
- **Retomar vs reiniciar onboarding interrompido:** decisão de produto a validar — se o utilizador fechar a app a meio do Passo 2 (ex: antes de terminar o upload), decidir se reabre no mesmo passo (guardando progresso parcial) ou reinicia sempre no Passo 1. Abordagem mais simples para o MVP: reiniciar sempre no Passo 1 se `onboarding_completed` for `false`, sem guardar estado intermédio — a confirmar antes de `/plan`.
- **Documento carregado no onboarding vs biblioteca de documentos:** confirmar se o documento carregado no Passo 2 fica também visível em `documents.tsx` (biblioteca geral) após o onboarding terminar — expectável que sim, dado que é o mesmo registo em `documents`.
- **Multi-select do Passo 1:** os objectivos seleccionados (proteger ativos / controlar despesas / digital estate) são apenas para personalização futura (ex: priorizar cards no dashboard) ou têm impacto funcional imediato nesta ficha? Por omissão, assumir que ficam apenas guardados para uso futuro — nenhuma lógica condicional nos Passos 2/3 depende da selecção.

## Fora do escopo

- Onboarding com mais de um documento carregado — apenas o primeiro documento é processado nesta ficha
- Personalização do dashboard com base nos objectivos seleccionados no Passo 1 — apenas guardar a selecção, sem lógica condicional
- Skip/pular onboarding — o fluxo é sempre completo nesta primeira versão
- Suporte a múltiplos tipos de documento em simultâneo no Passo 2 (ex: carregar fatura + garantia juntas para simular Coverage Check completo) — apenas um documento, um insight simples
- Reenvio/edição manual de campos extraídos incorrectamente (correcção de extracção) — fica para a feature de biblioteca de documentos
- Internacionalização (pt-PT, es-ES, fr-FR, de-DE) — copy apenas em inglês nesta ficha, conforme "Produto English-first" do CLAUDE.md, i18n preparado noutra fase

## Próximo passo
/research Como implementar upload de documento com preview de extracção em tempo real em Expo (SDK 57) — Supabase Storage + chamada a Vision LLM — e qual o padrão recomendado para persistir e consultar o estado "onboarding_completed" por utilizador antes do redirect em `app/index.tsx`?
