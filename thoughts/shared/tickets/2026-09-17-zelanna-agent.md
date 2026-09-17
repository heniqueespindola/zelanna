---
data: 2026-09-17
status: backlog
prioridade: baixa
fase_mvp: nao
---

# Feature: Zelanna Agent (F14)

## Contexto

Corresponde a `CLAUDE.md` → `## Roadmap` → **Phase 6 — Zelanna Agent**: *"Encontrar contratos a renovar nos próximos 60 dias, encontrar alternativas mais baratas, preparar cancelamento/alteração, pedir autorização explícita, executar apenas após aprovação."* É a última fase do roadmap e a **única feature de todo o Zelanna que executa acções externas** — todas as fichas anteriores (F04–F13) são explicitamente leitura/análise e adiam qualquer acção para esta ficha:

- `thoughts/shared/tickets/2026-09-15-renewal-price-increase-detection.md:93`, `2026-09-15-bills-dashboard.md:85`, `2026-09-15-bills-intelligence.md:107`, `2026-09-15-gmail-intelligence.md:98`, `2026-09-15-digital-estate.md:94` e `2026-09-16-life-intelligence-avancada.md:80` referem todos "Zelanna Agent (Phase 6)" como o destino de cancelamento/negociação/comparação com alternativas — **F14 é essa ficha**, é a primeira vez que este trabalho é definido em vez de apenas referenciado.
- `CLAUDE.md` → `## Roadmap` lista explicitamente como "Não construir ainda": *"autonomous AI agent"* — e a secção `## Arquitectura de IA` repete: *"Não construir um agente autónomo no MVP."* F14 não é excepção a esta regra — é a ficha que, quando chegar a sua vez, define um agente que **prepara mas nunca age sem aprovação explícita por acção**, nunca autónomo.
- **Gate explícito do próprio pedido:** "Não construir antes das fases anteriores estarem validadas e estáveis." Nenhuma fase de Phase 1–5 está hoje validada em produção com utilizadores reais — `CLAUDE.md` → `## Fase actual de desenvolvimento` confirma que a **Phase 0 (validação manual) continua por fazer**. Esta ficha define o âmbito e as decisões em aberto; não autoriza início de implementação.

**O que já existe no schema/codebase e que F14 reaproveita, não recria:**

- `contracts` (`supabase/schema.sql:228-238`) já tem `renewal_date`; `RENEWAL_THRESHOLD_DAYS = 30` (`src/lib/insights.ts:45`) e `fetchUpcomingRenewals()` (`src/lib/insights.ts:610-618`) já encontram contratos a renovar em breve — mas o threshold actual é **30 dias**, não os **60 dias** pedidos nesta ficha para "encontrar contratos a renovar". Decisão em aberto: parametrizar a janela por consumidor (`RENEWAL_THRESHOLD_DAYS` fica para alertas informativos F05/F08, F14 usa uma janela própria de 60 dias) ou reutilizar a mesma constante — ver `## Notas técnicas`.
- `events` (`supabase/schema.sql:346-354`) e `src/lib/events.ts` já alimentam o Life Calendar com eventos de renovação — F14 pode consultar esta tabela em vez de recalcular datas de renovação.
- `estate_access_log` (`supabase/schema.sql:544-571`) é o único precedente de audit log no schema actual — regista `trusted_person_id`, `section`, `accessed_at`, RLS restrita ao dono. F14 precisa de um padrão equivalente mas mais rico (acção, estado de aprovação, resultado), não desta tabela directamente.
- **Não existe hoje nenhuma integração de pesquisa de mercado/alternativas de fornecedores** — `CLAUDE.md` → `## Roadmap` lista *"external market valuation APIs"* em "Não construir ainda", e é o mesmo tipo de dependência externa que a funcionalidade 2 desta ficha ("pesquisar alternativas mais baratas") exigiria. Sem esta integração, "encontrar alternativas mais baratas" não tem fonte de dados determinística nem LLM-verificável.
- **Não existe hoje nenhum canal de acção externa** — sem integração de email transaccional, sem API de fornecedores/seguradoras para submeter cancelamento/alteração. `supabase/functions/` (`gmail-connect`, `gmail-sync`, etc.) só lê Gmail para importar anexos (`CLAUDE.md`: *"Nunca ler indiscriminadamente a caixa de correio"*); não há precedente de a app enviar algo em nome do utilizador.

## Comportamento esperado

**Dado que** o utilizador tem um ou mais `contracts` com `renewal_date` dentro dos próximos 60 dias
**Quando** o utilizador abre o ecrã/secção do Zelanna Agent
**Então** vê uma lista desses contratos, ordenada por proximidade da data de renovação, sem qualquer acção já tomada

**Dado que** um contrato identificado está prestes a renovar
**Quando** o Zelanna Agent pesquisa alternativas para esse tipo de contrato/fornecedor (fonte de dados a definir em `/research`)
**Então** apresenta ao utilizador as alternativas encontradas (se existirem) como informação, nunca como uma substituição já decidida

**Dado que** o utilizador escolhe agir sobre um contrato (cancelar ou pedir alteração)
**Quando** o Zelanna Agent prepara o rascunho da comunicação
**Então** mostra o rascunho completo ao utilizador para revisão, com um pedido de autorização explícito e específico a essa acção — nunca uma autorização genérica ou reutilizável para acções futuras

**Dado que** o utilizador aprova explicitamente uma acção
**Quando** o Zelanna Agent a executa
**Então** a acção é registada em audit log (quem aprovou, quando, o quê, resultado) antes ou imediatamente depois da execução, e o utilizador vê a confirmação do resultado

**Dado que** o utilizador não aprova, ignora, ou fecha o ecrã sem responder
**Quando** qualquer tempo passa
**Então** nenhuma acção é executada — não há timeout que converta silêncio em aprovação implícita

## Critérios de aceitação

- [ ] Esta ficha **não implementa código** nesta fase — o critério de aceitação de F14 enquanto ficha de backlog é ficar pronta para `/research` quando o gate (fases anteriores validadas e estáveis, ver `## Contexto`) estiver cumprido
- [ ] Quando o gate for cumprido e a implementação avançar, os critérios seguintes aplicam-se e devem ser confirmados em `/plan`:
  - [ ] Nenhuma acção externa (cancelamento, alteração, contacto com fornecedor) é executada sem um registo de aprovação explícita, específico a essa acção, imutável após criado
  - [ ] Toda a execução é precedida de rascunho apresentado ao utilizador — nunca há execução directa sem pré-visualização
  - [ ] Toda a acção (proposta, aprovação, execução, resultado) fica registada em audit log com RLS restrita ao próprio utilizador, seguindo o padrão de `estate_access_log`
  - [ ] Não existe nenhum mecanismo de "aprovação por defeito"/timeout/silêncio-implica-sim
  - [ ] A pesquisa de contratos a renovar em 60 dias e a descoberta de alternativas usam sempre o motor determinístico existente (`rulesEngine.ts`, `isExpiringSoon`/`daysUntil`) para datas — o LLM nunca decide datas ou calcula, só explica (regra #6 do `CLAUDE.md`)
  - [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Gate de entrada não é apenas "código pronto"** — o pedido original é explícito: "Não construir antes das fases anteriores estarem validadas e estáveis." Isto inclui a Phase 0 (validação manual, ainda por fazer segundo `CLAUDE.md` → `## Fase actual de desenvolvimento`) e as Phases 1–5 em uso real. `/research` para esta ficha só deve avançar para desenho técnico quando esse gate for revisto explicitamente com o utilizador — não é uma decisão que este ticket tome sozinho.
- **Janela de 60 dias vs. `RENEWAL_THRESHOLD_DAYS = 30` existente** (`src/lib/insights.ts:45`): decidir em `/research` se F14 introduz uma constante própria (ex: `AGENT_RENEWAL_WINDOW_DAYS = 60`) ou se altera o valor partilhado — alterar o valor partilhado teria impacto directo nos alertas de renovação já em produção (F05/F08), pelo que a opção mais segura é uma constante nova e isolada.
- **Fonte de "alternativas mais baratas" é a maior incógnita técnica desta ficha** — não há hoje nenhuma API de comparação de preços/fornecedores integrada, e o mercado português de utilities/seguros não tem uma API pública unificada conhecida. Opções a avaliar em `/research`: (a) LLM com web search para sugerir fornecedores conhecidos, sempre como sugestão não verificada e nunca como preço determinístico; (b) base de dados curada manualmente por categoria (alto esforço de manutenção); (c) adiar esta funcionalidade especificamente e lançar F14 só com (1) detecção de renovação + (3)-(6) preparação/aprovação/execução/audit para outras acções (ex: apenas cancelamento, sem comparação).
- **Canal de execução real** (enviar email de cancelamento, submeter formulário a um fornecedor) não tem nenhum precedente no codebase — `supabase/functions/gmail-*` só importa, nunca envia. Definir em `/research` se a "execução" da fase inicial de F14 é enviar um email em nome do utilizador (via Gmail API com scope de envio, exigindo novo consentimento OAuth explícito, distinto do scope actual de leitura), gerar um rascunho para o utilizador copiar/enviar manualmente (execução manual, sem scope novo), ou usar outro canal — cada opção tem implicações de segurança e permissões diferentes (`CLAUDE.md` → `## Segurança`: least privilege).
- **Modelo de audit log**: `estate_access_log` é o único precedente (`supabase/schema.sql:544-571`), mas regista só "visualização" (`section`, `accessed_at`). F14 precisa de mais estado: proposta → aprovação → execução → resultado, possivelmente como uma nova tabela `agent_actions` (ou nome equivalente) com `status` ('proposed' | 'approved' | 'executed' | 'rejected' | 'failed'), `contract_id`, `action_type`, `draft_content`, `approved_at`, `executed_at`, `result` — a definir em `/plan`.
- **Reaproveitar sempre o motor determinístico existente** para datas e cálculos (`daysUntil`/`isExpiringSoon` de `src/lib/rulesEngine.ts`) — regra #6 do `CLAUDE.md` aplica-se tanto a esta ficha como a todas as anteriores.

## Fora do escopo

- **Qualquer implementação de código nesta fase** — esta ficha define o problema; o pedido original é explícito que não se deve construir antes das fases anteriores estarem validadas e estáveis
- **Qualquer execução automática sem aprovação explícita por acção** — nunca há modo "automático"/"confiar sempre neste tipo de acção"/aprovação em lote sem revisão individual
- **Execução fora do fluxo prepara→apresenta→aprova→executa→regista** — não há atalho para nenhuma das 6 funcionalidades pedidas
- **Verificação automática de morte/incapacidade** — já excluído em `CLAUDE.md` → "Não construir ainda": *"automatic death verification"*; sem relação com esta ficha mas reforça o mesmo princípio de nunca agir sem confirmação humana directa
- **Gestão de credenciais/pagamento em nome do utilizador** — Zelanna nunca guarda passwords/credenciais bancárias (`CLAUDE.md` → `## O que NÃO ser`); "preparar cancelamento" nunca inclui autenticar-se em nome do utilizador em portais de fornecedores
- **Definir aqui a fonte de dados de "alternativas mais baratas"** — decisão explicitamente adiada para `/research` (ver `## Notas técnicas`)

## Próximo passo
/research Confirmar com o utilizador que o gate de entrada (Phase 0 validada + Phases 1–5 estáveis em uso real) está cumprido antes de avançar; caso esteja, definir a fonte de dados para "alternativas mais baratas" (LLM com web search vs. base curada vs. adiar), o canal de execução real (envio de email via Gmail API com novo scope vs. rascunho para envio manual) e o modelo de dados do audit log (nova tabela `agent_actions` com estados proposed/approved/executed/rejected/failed).
