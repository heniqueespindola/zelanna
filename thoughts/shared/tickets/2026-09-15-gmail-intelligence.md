---
data: 2026-09-15
status: backlog
prioridade: baixa
fase_mvp: nao
---

# Feature: Gmail Intelligence — "Find my bills" (F09)

## ⚠️ Aviso de gate (metodologia e roadmap)

Esta ficha corresponde à **Phase 2 — Gmail Intelligence** do `CLAUDE.md` → `## Roadmap`, explicitamente posterior à Phase 1 (MVP Insurance + Bills). `CLAUDE.md` → `## ⚠️ Metodologia` é claro: **"Gate: não avançar para a plataforma completa se o produto for considerado interessante mas não suficientemente valioso para pagar"**, e `## Fase actual de desenvolvimento` regista que **"Phase 0 — Manual Validation continua a não estar feita"**. A mesma secção lista explicitamente, em `## Não construir ainda`: **"Gmail antes da validação"**.

Ao mesmo tempo, o histórico de commits (`Feature 4` a `Feature 8`) e o estado actual do código mostram que Coverage Check (F04), Renewal/Price Increase Detection (F05), Bills Intelligence (F06), Bills Dashboard (F07) e Alerts/Life Calendar (F08) — ou seja, toda a Phase 1 — já estão implementados. Isto não é decisão desta ficha nem motivo para a bloquear (o ticket é criado a pedido), mas **deve ser confirmado antes de `/plan` avançar para implementação real**: confirmar com o founder se a Phase 0 (validação manual, 10–15 participantes, willingness-to-pay) já correu fora deste repositório, ou se esta ficha fica em `backlog` como especificação pronta a implementar apenas depois do gate ser passado. Por isso `prioridade: baixa` e `fase_mvp: nao` nesta ficha — ajustar quando o gate for confirmado.

## Contexto

O wedge inicial do Zelanna (`CLAUDE.md` → `## Nova tese de valor prioritária`) termina hoje no upload manual: o utilizador tira foto/escolhe PDF de uma fatura, o Vision LLM extrai os campos, o utilizador revê e confirma num formulário, e só aí o documento e o bill são guardados. O `CLAUDE.md` já descreve a evolução natural: **"Email Intelligence elimina posteriormente o trabalho manual"** — é isso que esta ficha propõe: substituir "o utilizador anda atrás das faturas" por "o Zelanna encontra-as no Gmail".

Estado actual do repositório relevante para esta ficha:

- **Não existe nenhuma integração Gmail/Google no código.** `grep -rli "gmail\|google"` só encontra referências em `README.md` e `CLAUDE.md` (documentação/planeamento) — nenhum ficheiro de implementação. `package.json` não tem `expo-auth-session`, `expo-web-browser`, nem qualquer SDK OAuth/Google. Esta ficha começa de zero em termos de OAuth.
- **`.env.example` já reserva `GMAIL_CLIENT_SECRET`** (comentado, na secção de secrets de servidor, ao lado de `VISION_LLM_API_KEY`) — confirma que o plano já previa que a troca de código OAuth por tokens aconteceria do lado do servidor (Edge Function), nunca no cliente, consistente com `CLAUDE.md` regra #5 ("Nunca hardcodar chaves de API").
- **O pipeline de extracção (F03) é directamente reutilizável para a funcionalidade (4).** `supabase/functions/extract-document/index.ts` recebe `{ documentPath, mimeType }` — um ficheiro já em Supabase Storage — e devolve `{ document_type, provider, date, amount, expiry_date, category }`, incluindo `category` (água/eletricidade/gás/internet/telemóvel/landline/seguro), já implementado pelo F06. `src/lib/extraction.ts` → `uploadDocument()` já aceita um `base64` opcional (não só um `uri` de ficheiro local) — é exactamente o que é preciso para subir um anexo Gmail (bytes vindos da Gmail API, não do filesystem do dispositivo) para o Storage antes de chamar `extractDocument()`. **Não é preciso alterar a edge function nem o schema de extracção** — o `category` pedido na funcionalidade (6) já é devolvido pelo LLM.
- **O fluxo actual é sempre "human-in-the-loop".** `src/components/documents/DocumentPreviewForm.tsx` é o único sítio do código que chama `saveDocument()`, `saveBill()` e `matchDocumentToContract()` — só depois de o utilizador rever/editar os campos extraídos num formulário e clicar em confirmar. Não existe hoje nenhum caminho que grave documento/bill sem um humano a confirmar cada campo. Esta ficha propõe importação **automática** — é a maior decisão de arquitectura em aberto: decidir em `/plan` se (a) cada candidato encontrado no Gmail continua a passar por um ecrã de revisão (mais seguro, reutiliza `DocumentPreviewForm` tal como está, mas não é "totalmente automático"), ou (b) extrações de alta confiança são gravadas directamente sem revisão (mais próximo do pedido do utilizador, mas exige um novo caminho de código que hoje não existe e critérios explícitos de "confiança suficiente").
- **Não existe nenhuma lógica de deduplicação no repositório.** `saveDocument()`, `saveBill()` e `matchDocumentToContract()` (respectivamente `src/lib/extraction.ts`, `src/lib/bills.ts`, `src/lib/contracts.ts`) inserem sempre uma nova linha — a única coisa parecida com dedup é `matchDocumentToContract()`, que faz *match* de um novo documento a um `contract` existente pelo mesmo `provider_normalized` (para saber se é o mesmo contrato ao longo do tempo), mas isso não evita gravar a mesma fatura duas vezes se o mesmo PDF for processado outra vez. A funcionalidade (5) pedida nesta ficha ("deduplicação contra documents já existentes") **não tem hoje nenhuma base de código para se apoiar** — é o ponto mais ambíguo desta ficha, tal como a origem da categoria foi o ponto mais ambíguo do F06.
- **Não existe tabela para tokens/ligação Gmail, nem para o histórico de emails/anexos já processados.** O schema actual (`supabase/schema.sql`) cobre `users`, `documents`, `assets`, `coverage`, `contracts`, `insights`, `bills`, `events` — nada relacionado com contas de email ligadas, âmbito de OAuth concedido, ou registo de mensagens já pesquisadas/importadas (necessário para (2) e (5)).
- **`n8n` é mencionado em `CLAUDE.md` (`## Stack tecnológica` → Automação) mas não existe nenhuma configuração, pipeline ou ficheiro n8n no repositório.** As duas edge functions existentes (`extract-document`, `explain-insight`) são Supabase Edge Functions simples, chamadas directamente do cliente via `supabase.functions.invoke()` — não há hoje nenhuma orquestração externa. Decidir em `/plan` se a pesquisa/importação Gmail corre como mais uma Edge Function (consistente com o padrão já validado) ou se introduz n8n como seria seria o primeiro uso real dessa peça da stack — sendo a segunda opção uma peça de infraestrutura nova e maior para o MVP.
- **O motor de regras e o padrão de insights (F05/F06/F08) já cobrem por completo a funcionalidade (7).** `generateInsightsForBill({ userId, bill })` e `generateInsightsForContract(...)` (`src/lib/insights.ts`) já calculam aumentos/anomalias e geram os insights persistidos — reutilizáveis sem alteração assim que um `bill`/`contract` for gravado, seja manualmente ou via Gmail.
- **Scopes Gmail e o princípio "nunca ler indiscriminadamente" (`CLAUDE.md`) precisam de tradução técnica concreta.** A Gmail API não tem um scope "só pesquisa por faturas" — o scope mínimo de leitura (`gmail.readonly` ou `gmail.metadata`) concede acesso técnico a toda a caixa de correio; o "acesso mínimo, apenas leitura/pesquisa" tem de ser garantido a nível de aplicação (a app nunca chama `messages.list` sem um `q` dirigido a remetentes/assuntos de faturas, nunca itera a caixa inteira), não a nível do scope OAuth em si. Isto é uma nuance a documentar explicitamente em `/research`, não um bloqueio.

## Comportamento esperado

**Dado que** o utilizador está no ecrã de Documents (ou um novo ponto de entrada equivalente)
**Quando** escolhe "Find my bills" / ligar o Gmail
**Então** é apresentado o ecrã de consentimento OAuth da Google, pedindo apenas o scope de leitura necessário (nunca "acesso total" ao email, nunca scope de escrita/envio), com explicação clara do que vai ser pesquisado

**Dado que** o utilizador autoriza o acesso
**Quando** a app troca o código de autorização por tokens
**Então** essa troca acontece sempre do lado do servidor (Edge Function), nunca no cliente — `GMAIL_CLIENT_SECRET` nunca é exposto na app (`CLAUDE.md` regra #5)

**Dado que** a ligação Gmail está activa
**Quando** o sistema pesquisa a caixa de correio
**Então** usa sempre uma pesquisa dirigida (remetentes e assuntos típicos de faturas/seguros/utilities) — nunca itera ou lê a caixa de correio de forma indiscriminada

**Dado que** a pesquisa dirigida encontra emails com anexos compatíveis (PDF/imagem)
**Quando** o sistema os processa
**Então** cada anexo candidato é identificado e associado ao email de origem, antes de qualquer extracção

**Dado que** existe um anexo candidato
**Quando** é processado
**Então** passa pela mesma pipeline Vision LLM já usada no upload manual (`extract-document`), sem duplicar lógica de extracção

**Dado que** um anexo já foi importado anteriormente (mesmo email/anexo, ou mesma fatura em conteúdo — fornecedor + data + valor)
**Quando** a pesquisa Gmail volta a encontrá-lo (execuções repetidas, threads com o mesmo anexo)
**Então** não é criado um documento/bill duplicado

**Dado que** um anexo é extraído com sucesso e tem fornecedor/categoria identificados
**Quando** é guardado
**Então** é classificado automaticamente por fornecedor/categoria tal como no fluxo manual, sem passo adicional de categorização manual obrigatório

**Dado que** um documento/bill importado via Gmail é gravado
**Quando** o motor de regras corre
**Então** o histórico e os alertas são gerados exactamente pelos mesmos mecanismos já usados no F06/F07/F08 (`generateInsightsForBill`/`generateInsightsForContract`), sem caminho de cálculo paralelo

**Dado que** o utilizador desliga a ligação Gmail
**Quando** a desactivação é confirmada
**Então** os tokens são revogados/apagados e deixa de haver qualquer pesquisa futura na caixa de correio

## Critérios de aceitação

- [ ] Fluxo de autorização OAuth Gmail implementado do zero (não existe nenhuma base no repo): consentimento, scope mínimo de leitura, troca de código por tokens sempre em Edge Function do lado do servidor
- [ ] `GMAIL_CLIENT_SECRET` só é usado em Edge Function, nunca em código cliente/`EXPO_PUBLIC_*`
- [ ] Tokens de acesso/refresh do Gmail nunca são guardados em `AsyncStorage`/local não encriptado — decisão documentada em `/plan` sobre onde/como persistir (ex: tabela própria com RLS, nunca no schema de `users` a olho nu)
- [ ] Pesquisa Gmail usa sempre um `q` dirigido (lista de remetentes/assuntos típicos de faturas/seguros/utilities) — nenhum caminho de código itera a caixa de correio sem filtro
- [ ] Anexos candidatos (PDF/imagem) são subidos ao Supabase Storage reutilizando `uploadDocument()` (`src/lib/extraction.ts`, já aceita `base64`) e extraídos via `extractDocument()` chamando a edge function `extract-document` já existente — sem duplicar a pipeline de extracção
- [ ] Existe uma decisão documentada e implementada sobre deduplicação (ponto mais ambíguo desta ficha): que critério identifica "já importado" (ID do email/anexo Gmail, ou fornecedor+data+valor do documento) e onde é verificado antes de `saveDocument`/`saveBill`
- [ ] Existe uma decisão documentada sobre revisão humana: importação automática directa vs. fila de candidatos para confirmação (reutilizando ou não `DocumentPreviewForm`)
- [ ] Classificação por fornecedor/categoria reutiliza o campo `category` já devolvido por `extract-document` (F06) — nenhuma nova lógica de classificação paralela
- [ ] Histórico (`bills`) e insights (`insights`) gerados a partir de importação Gmail usam `saveBill`, `matchDocumentToContract`, `generateInsightsForBill`, `generateInsightsForContract` já existentes — sem caminho de cálculo/alerta paralelo
- [ ] Utilizador consegue desligar a ligação Gmail a qualquer momento; tokens são revogados/apagados e nenhuma pesquisa futura ocorre
- [ ] `supabase/schema.sql` inclui as tabelas necessárias (ligação Gmail por utilizador, registo de emails/anexos já processados) com RLS por `user_id`
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Maior decisão de arquitectura: revisão humana vs. importação directa.** Hoje, 100% do caminho de gravação (`saveDocument` → `saveBill`/`matchDocumentToContract` → `generateInsightsFor*`) só é chamado a partir de `DocumentPreviewForm.tsx`, depois de o utilizador confirmar campos. Decidir em `/plan`: (a) candidatos Gmail alimentam uma fila e passam pelo mesmo formulário de revisão (menor risco, reutiliza tudo tal como está); ou (b) extrações de alta confiança (todos os campos obrigatórios presentes e não-nulos) são gravadas automaticamente, com um novo caminho de código equivalente a `DocumentPreviewForm.handleConfirm` mas sem UI. A opção (b) é o que a funcionalidade pedida sugere ("importação automática"), mas introduz risco de dados errados entrarem sem revisão — mitigar com um estado "importado automaticamente, não revisto" visível ao utilizador, se for essa a escolha.
- **Deduplicação — sem precedente no código.** Nenhuma das funções de gravação existentes (`saveDocument`, `saveBill`, `matchDocumentToContract`) verifica duplicados antes de inserir. Duas abordagens plausíveis: (1) guardar o `gmail_message_id`/`attachment_id` numa nova tabela de "processados" e nunca reprocessar o mesmo par; (2) comparar fornecedor normalizado + data + valor contra `bills`/`documents` existentes antes de gravar. A opção (1) é mais barata e evita reprocessamento de trabalho já feito (poupa chamadas ao Vision LLM); a opção (2) protege contra o mesmo documento chegar por dois canais (upload manual + Gmail). Provavelmente são precisas as duas, mas a ordem e o design ficam para `/plan`.
- **Scopes Gmail.** `https://www.googleapis.com/auth/gmail.readonly` é o scope mínimo realista para ler corpo/anexos de mensagens específicas via `q`; não existe um scope "só faturas" na Gmail API — a garantia de "nunca ler indiscriminadamente" (`CLAUDE.md`) é aplicada no código (sempre com `q` dirigido), não no scope OAuth em si. Documentar isto claramente no consentimento mostrado ao utilizador.
- **Onde correr a pesquisa/importação.** Duas opções: (a) nova Supabase Edge Function, consistente com o padrão já validado por `extract-document`/`explain-insight` (chamada via `supabase.functions.invoke`, sem infra nova); (b) n8n, mencionado em `CLAUDE.md` mas sem nenhuma configuração existente no repo — seria a primeira utilização real dessa peça da stack, com custo de infraestrutura adicional. Avaliar em `/plan`; a opção Edge Function é a de menor risco/menor infraestrutura nova.
- **Execução periódica ("alertas contínuos").** A pesquisa Gmail para faturas novas precisa de correr sem o utilizador abrir a app manualmente (funcionalidade 7 menciona "geração de alertas contínuos"). Isto implica algum mecanismo de agendamento (cron da Edge Function via `pg_cron`/Supabase Scheduled Functions, ou n8n) que hoje não existe no repositório para nenhuma feature — decidir o mecanismo em `/plan`.
- **Gmail primeiro, Outlook depois** (explícito no pedido e em `CLAUDE.md`) — desenhar a camada de acesso a email (busca de mensagens/anexos) com uma interface mínima que não acople directamente à Gmail API em todo o código, para não bloquear a iteração futura com Outlook, mas sem construir abstração multi-provider agora (`CLAUDE.md` → evitar abstrações prematuras).

## Fora do escopo

- Outlook/Microsoft Graph — fica para uma iteração futura, conforme pedido explicitamente
- Qualquer acção de escrita/envio no Gmail (arquivar, apagar, responder emails) — scope é só leitura/pesquisa
- Zelanna Agent / cancelamento, negociação ou resposta automática a fornecedores (Phase 6, fora do MVP)
- Bills Dashboard e visualizações (F07, já implementado) — esta ficha só alimenta os dados que o F07 já mostra
- Suporte a múltiplas contas Gmail por utilizador (assumir uma conta ligada de cada vez, salvo decisão contrária em `/plan`)
- Qualquer avanço de implementação antes de confirmar o gate da `## ⚠️ Metodologia` (ver aviso no topo desta ficha)

## Próximo passo
/research Que scope OAuth Gmail mínimo é tecnicamente suficiente para pesquisa dirigida + leitura de anexos (sem "acesso total"), e como deve ser desenhado o mecanismo de deduplicação (por `gmail_message_id`/`attachment_id` vs. por conteúdo fornecedor+data+valor) e o de execução periódica, dado que nenhum dos dois tem hoje qualquer precedente no repositório?
