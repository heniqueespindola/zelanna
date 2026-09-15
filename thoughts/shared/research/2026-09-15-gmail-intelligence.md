---
data: 2026-09-15
feature: "Gmail Intelligence — Find my bills (F09)"
status: completo
---

# Research: Gmail Intelligence — "Find my bills" (F09)

## Questão de Pesquisa

Do ticket `thoughts/shared/tickets/2026-09-15-gmail-intelligence.md`: que scope OAuth Gmail mínimo é tecnicamente suficiente para pesquisa dirigida + leitura de anexos (sem "acesso total"); como deve ser desenhado o mecanismo de deduplicação (por `gmail_message_id`/`attachment_id` vs. por conteúdo fornecedor+data+valor) e o de execução periódica — dado que nenhum destes três pontos tem hoje qualquer precedente no repositório.

## Sumário

Não existe hoje nenhuma base de código para OAuth, pesquisa Gmail, deduplicação ou agendamento — esta é uma feature 100% nova, mas cada uma das suas peças tem um padrão já validado no repositório para seguir (edge function autenticada, `uploadDocument`/`extractDocument` reutilizáveis, `generateInsightsForBill`/`generateInsightsForContract` reutilizáveis) ou uma biblioteca/serviço já pronto a usar em vez de construído de raiz (`expo-auth-session` para OAuth no Expo, `pg_cron`/Supabase Cron para agendamento). O achado mais importante da pesquisa externa é que **ler o corpo/anexos de emails exige o scope `gmail.readonly`, classificado por Google como "restricted"**, o que obriga a uma avaliação de segurança CASA Tier 2 anual por um laboratório terceiro aprovado pela Google — 6 a 12 semanas no primeiro ciclo, com custo recorrente — antes de a app poder sair do modo "testing" do Google Cloud Console. Isto é uma condicionante real para um founder solo bootstrapped e deve ser confrontado explicitamente antes de `/plan`.

## Ficheiros Relevantes da Codebase

- `src/lib/extraction.ts:10-27` — `uploadDocument({ userId, uri, mimeType, base64? })`: já aceita bytes em `base64` (não só ficheiro local), exactamente o que é preciso para subir um anexo Gmail (que chega como bytes da Gmail API, não como URI de ficheiro no dispositivo) para o bucket `documents` do Supabase Storage.
- `src/lib/extraction.ts:29-43` — `extractDocument({ documentPath, mimeType })`: chama a edge function `extract-document` via `supabase.functions.invoke`; reutilizável sem alteração para anexos Gmail depois de estarem no Storage.
- `src/lib/extraction.ts:45-72` — `saveDocument(...)`: insere uma linha em `documents`; hoje só é chamado a partir de `DocumentPreviewForm.tsx` depois de confirmação humana.
- `src/components/documents/DocumentPreviewForm.tsx:37-115` (`handleConfirm`) — **único caminho de código que grava dados**: `saveDocument` → (se `document_type` é `invoice`/`insurance`, `category` e `amount` presentes) `saveBill` → `generateInsightsForBill` → `matchDocumentToContract` → `generateInsightsForContract`. Este é o pipeline completo a replicar (com ou sem UI de revisão) para importação Gmail.
- `src/lib/bills.ts:8-32` (`saveBill`) — insere sempre uma nova linha em `bills`, sem nenhuma verificação de duplicado; depois actualiza `documents.bill_id`.
- `src/lib/contracts.ts:29-91` (`findContractByProvider`, `matchDocumentToContract`) — único padrão de "não duplicar" que existe hoje no código, mas é *matching* de contrato por `provider_normalized` (para saber que documentos pertencem ao mesmo contrato ao longo do tempo), não deduplicação de documento — dois PDFs idênticos processados duas vezes criam duas linhas em `contracts`... não, criam uma actualização do mesmo contrato (porque o match é por fornecedor), mas criam sempre duas linhas em `documents` e, se ambos tiverem `category`, duas linhas em `bills`. Confirma que **não existe hoje nenhuma protecção contra reprocessar o mesmo email/anexo duas vezes**.
- `src/lib/insights.ts:171-282` (`generateInsightsForContract`, `generateInsightsForBill`) — motor de insights já validado (F05/F06/F08); reutilizável sem alteração para dados vindos do Gmail.
- `supabase/functions/extract-document/index.ts:9-28` — schema de extracção já inclui `category` (F06); Vision LLM já classifica água/eletricidade/gás/internet/telemóvel/landline/seguro. Nenhuma alteração necessária a esta função para a funcionalidade de classificação automática pedida no F09.
- `supabase/functions/explain-insight/index.ts:58-77` — **padrão de autenticação a replicar em qualquer nova edge function**: recebe `Authorization` header do cliente, cria um client Supabase com a `ANON_KEY` + esse header, chama `auth.getUser()` para validar a sessão antes de processar. Qualquer edge function nova para OAuth Gmail (troca de código, refresh, pesquisa) deve seguir o mesmo padrão para saber a que `user_id` associar os tokens.
- `src/lib/supabase.ts:1-19` — cliente Supabase configurado com `AsyncStorage` para sessão, `autoRefreshToken: true`. Confirma que a sessão do Supabase (login do próprio Zelanna) é independente da ligação Gmail — não há hoje nenhuma integração com providers OAuth externos no client Supabase.
- `src/hooks/useAuth.tsx:20-66` — auth do Zelanna é email/password (`signInWithPassword`/`signUp`), não usa `signInWithOAuth` nem nenhum provider social. Confirma que ligar o Gmail é uma operação distinta do login da app, não um "sign in with Google".
- `supabase/storage.sql:1-14` — bucket `documents` privado, políticas RLS por pasta `auth.uid()`. Anexos Gmail sobem para este mesmo bucket via `uploadDocument`, sem alterações necessárias.
- `supabase/schema.sql:1-282` — schema completo actual (`users`, `documents`, `assets`, `coverage`, `contracts`, `insights`, `bills`, `events`). Nenhuma tabela para ligação a providers externos, tokens OAuth, ou registo de mensagens/anexos já processados.
- `.env.example:6-10` — já reserva `GMAIL_CLIENT_SECRET` como secret de servidor (comentado, ao lado de `VISION_LLM_API_KEY`), confirmando que o desenho original já previa troca de código OAuth do lado do servidor.
- `app.json:8,13,20` — `"scheme": "zelanna"`, `bundleIdentifier`/`package`: `com.mocruz.zelanna`. O deep link scheme `zelanna://` já está configurado — necessário como redirect URI para o fluxo OAuth nativo via `expo-auth-session`/`expo-web-browser`.
- `package.json` — **nenhuma dependência OAuth existe** (`expo-auth-session`, `expo-web-browser`, `@react-native-google-signin/google-signin` — nenhuma delas está instalada). `@supabase/supabase-js` está em `^2.109.0`, versão recente que suporta `signInWithOAuth`/`linkIdentity` com scopes adicionais (ver secção de APIs externas).
- `grep -rli "gmail\|google\|n8n"` (fora de `node_modules`) só encontra referências em `README.md`/`CLAUDE.md` (planeamento) — confirma que toda a integração é código novo, incluindo o próprio n8n mencionado na stack mas nunca configurado.

## Padrões de Implementação Existentes

**Padrão "upload → extract → save → insight" (a replicar para Gmail):**

```ts
// src/components/documents/DocumentPreviewForm.tsx:53-104 (resumido)
const doc = await saveDocument({ userId, documentPath, documentType, provider, date, amount, expiryDate, extracted });

if ((doc.document_type === 'invoice' || doc.document_type === 'insurance') && category && doc.provider && doc.amount !== null) {
  const bill = await saveBill({ userId, documentId: doc.id, provider: doc.provider, category, invoiceDate: doc.date, billingPeriod, amount: doc.amount });
  const billInsights = await generateInsightsForBill({ userId, bill });
}

const match = await matchDocumentToContract({ userId, documentId: doc.id, documentType: doc.document_type, provider: doc.provider, amount: doc.amount, date: doc.date, expiryDate: doc.expiry_date });
if (match) {
  await generateInsightsForContract({ userId, contract: match.contract, previousAmount: match.previousAmount, includePriceIncrease: !bill });
}
```

Para importação automática, este bloco (menos a leitura de `category`/`billingPeriod` de um formulário) é o que uma nova função `importGmailCandidate(...)` (ou equivalente) precisa de replicar — reutilizando exactamente as mesmas funções (`saveDocument`, `saveBill`, `matchDocumentToContract`, `generateInsightsForBill`, `generateInsightsForContract`), nunca duplicando a lógica.

**Padrão de edge function autenticada (a replicar para qualquer função Gmail):**

```ts
// supabase/functions/explain-insight/index.ts:58-77
const authHeader = req.headers.get('Authorization') ?? '';
const supabaseAuthed = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  global: { headers: { Authorization: authHeader } },
});
const { data: { user } } = await supabaseAuthed.auth.getUser();
if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, ... });
```

**Padrão de normalização de fornecedor (reutilizável para dedup/matching por fornecedor):**

```ts
// src/lib/contracts.ts:8-10
export function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}
```
Já usado em `bills.provider_normalized`/`contracts.provider_normalized` como coluna gerada (`supabase/schema.sql:148,210`).

## Tabelas/Queries Supabase Relevantes

Tabelas existentes reutilizáveis sem alteração de schema: `documents` (incluindo `bill_id`, `contract_id`, `asset_id`), `bills`, `contracts`, `insights` (incluindo `bill_id`), `events`.

Tabelas que **não existem e são necessárias** para esta feature (nenhuma migration existente cobre isto):
1. Ligação Gmail por utilizador — algo como `gmail_connections` (`user_id`, tokens/refs de acesso e refresh, `scope` concedido, `connected_at`, `revoked_at`) — RLS `auth.uid() = user_id`, seguindo o padrão de todas as outras tabelas do schema.
2. Registo de mensagens/anexos Gmail já processados — necessário tanto para deduplicação (não reprocessar o mesmo anexo) como para não voltar a chamar o Vision LLM sobre o mesmo ficheiro. Colunas plausíveis: `user_id`, `gmail_message_id`, `gmail_attachment_id`, `document_id` (nullable, se se tornou um documento), `status` (`imported` | `skipped` | `duplicate`), `created_at`. Confirmar unicidade `(user_id, gmail_message_id, gmail_attachment_id)`.

Nenhuma das políticas RLS existentes (`supabase/schema.sql`) cobre tokens de terceiros — importante que a nova tabela de tokens nunca seja legível pelo cliente sem necessidade (avaliar se o token de acesso/refresh deve ficar apenas acessível a Edge Functions via `service_role`, com a tabela sem policy de `select` para o `anon`/`authenticated` role, ou com RLS que impede o cliente de ler as colunas de token directamente).

## APIs Externas Relevantes

### Gmail API — scopes

- `gmail.readonly` é classificado por Google como **scope "restricted"**: exige verificação da app **e** uma avaliação de segurança CASA (Tier 2) por um laboratório terceiro aprovado pela Google, repetida anualmente. Para o primeiro ciclo, o processo completo costuma demorar 6–12 semanas. ([Google CASA — deepstrike.io](https://deepstrike.io/blog/google-casa-security-assessment-2025), [Gmail API Scopes Explained — Unipile](https://www.unipile.com/gmail-api-scopes-guide/))
- `gmail.metadata` é **também classificado como "restricted"** (exige a mesma verificação/CASA), mas tem uma pegada de dados mais estreita — não dá acesso ao corpo da mensagem nem aos anexos, só a metadados (remetente, assunto, labels, headers). **Não é suficiente para a funcionalidade (4) do ticket** (extrair dados do anexo via Vision LLM), porque não expõe o conteúdo do anexo. ([Gmail API Scopes Explained — Unipile](https://www.unipile.com/gmail-api-scopes-guide/))
- Não existe nenhum scope Gmail "só pesquisa, sem ler conteúdo" que permita simultaneamente pesquisar por `q` e descarregar anexos — para cumprir a funcionalidade (3)/(4) do ticket (identificar e extrair anexos), `gmail.readonly` é o scope mínimo tecnicamente necessário, e implica CASA obrigatoriamente.
- Scopes "sensitive" (ex: `gmail.send`) só exigem verificação de app, sem CASA — mas não são relevantes aqui porque o F09 é só leitura.
- Antes de submeter para verificação/CASA, a app pode continuar em modo **"Testing"** no Google Cloud Console com uma lista fixa de até 100 utilizadores de teste, sem precisar de CASA — suficiente para validar o fluxo com os 10–15 participantes da Phase 0/early beta, mas não para lançamento público.

Sources: [Gmail API Service Account & Domain-Wide Delegation: The 2026 Guide — Unipile](https://www.unipile.com/gmail-api-service-account-domain-wide-delegation/) · [Google CASA - Cloud Application Security Assessment 2026 — deepstrike.io](https://deepstrike.io/blog/google-casa-security-assessment-2025) · [Gmail API Scopes Explained — Unipile](https://www.unipile.com/gmail-api-scopes-guide/) · [How We Passed Google CASA Tier 2 in a Weekend — Orbis](https://meetorbis.com/blog/how-we-passed-google-casa-tier-2-with-claude) · [Gmail API Integration Guide: OAuth, Scopes, and CASA — Explosion](https://www.explosion.com/210203/gmail-api-integration-guide-oauth-scopes-and-casa/) · [Restricted Scopes — Google Cloud Platform Console Help](https://support.google.com/cloud/answer/13464325?hl=en) · [Gmail API Scopes — developers.google.com](https://developers.google.com/workspace/gmail/api/auth/scopes)

### Gmail API — quotas

- `messages.list` custa 5 unidades de quota; `users.getProfile` custa 1 unidade; `messages.send` custa 100 (não relevante, F09 é só leitura).
- Limite por utilizador: 15.000 unidades/minuto. Limite por projecto: 1.200.000 unidades/minuto. A escala prevista para o Zelanna nesta fase (pesquisas periódicas por utilizador, poucas vezes por dia) está muito longe destes limites — não é um risco técnico nesta fase.

Sources: [Gmail API Limits in 2026 — Unipile](https://www.unipile.com/gmail-api-limits/) · [Usage limits — developers.google.com](https://developers.google.com/workspace/gmail/api/reference/quota)

### OAuth no Expo/React Native — não reinventar a roda

- `expo-auth-session` (não instalado ainda) é a biblioteca oficial do Expo para fluxos OAuth com browser externo (RFC 8252 — external browser tab, nunca WebView embutida). Com `expo-auth-session/providers/google` e `responseType: 'code'`, o PKCE é activado automaticamente — cobre a troca segura de código por token sem expor o `client_secret` no dispositivo.
- Duas abordagens possíveis para o tipo de cliente OAuth Google:
  - **Cliente OAuth tipo "Web application"** (o que `.env.example` já sugere, com `GMAIL_CLIENT_SECRET`): a troca do código de autorização por tokens exige o `client_secret` e deve acontecer **sempre no servidor** (Edge Function), nunca no cliente — consistente com o padrão já usado para `ANTHROPIC_API_KEY` em `explain-insight`.
  - **Cliente OAuth tipo "iOS"/"Android" (nativo)**: não usa `client_secret` — PKCE por si só protege a troca, que pode acontecer directamente no dispositivo. Mais simples, mas mantém o refresh token no dispositivo (via `expo-secure-store`, já uma dependência do projecto) em vez de centralizado no servidor.
  - A decisão entre as duas fica para `/plan`; a primeira opção é mais consistente com a arquitectura já validada (secrets nunca no cliente, edge functions autenticadas) e mantém os tokens de refresh no servidor, mais fácil de revogar/auditar centralmente (`CLAUDE.md` → `## Segurança`, audit logs, least privilege).
- Para identidade/login social "nativo" (não é o caso aqui — o Zelanna já tem o seu próprio login email/password), Google recomenda `@react-native-google-signin/google-signin`; não é aplicável directamente porque o F09 não é "sign in with Google", é "conceder acesso de leitura ao Gmail a uma conta já autenticada no Zelanna".

Sources: [AuthSession — Expo documentation](https://docs.expo.dev/versions/latest/sdk/auth-session/) · [Authentication with OAuth or OpenID providers — Expo Documentation](https://docs.expo.dev/guides/authentication/) · [Native vs. Browser OAuth in Expo — Clerk](https://clerk.com/articles/native-vs-browser-oauth-in-expo-a-decision-guide-for-social-login)

### Alternativa a avaliar: Supabase Auth `linkIdentity`/`signInWithOAuth` com scopes Gmail

- O `@supabase/supabase-js` já instalado (`^2.109.0`) suporta `signInWithOAuth`/`linkIdentity` com `provider: 'google'`, `options: { scopes: 'https://www.googleapis.com/auth/gmail.readonly', queryParams: { access_type: 'offline', prompt: 'consent' } }`, devolvendo `provider_token`/`provider_refresh_token` na sessão. Isto delegaria o ecrã de consentimento e a troca inicial de código à infraestrutura de auth já usada pelo projecto, evitando construir esse pedaço de raiz.
- **Limitação confirmada:** o Supabase **não faz o refresh automático do `provider_token`** usando o `provider_refresh_token` — a app continua a precisar de código próprio (edge function) para chamar o endpoint de token da Google e renovar o acesso quando expira. Ou seja, esta alternativa só substitui a parte de "consentimento + troca inicial", não elimina a necessidade de uma edge function própria para refresh/pesquisa.
- Nota da comunidade: nem sempre é trivial combinar "sign in with Google" (identidade) com "conceder scope Gmail" (permissão de API) através do mesmo fluxo/cliente OAuth — há relatos de precisarem de dois clientes/dois ecrãs de consentimento separados consoante o caso de uso. Como o Zelanna não usa Google como método de login, este ponto é menos crítico aqui, mas vale confirmar em `/plan` se `linkIdentity` (que assume que o Supabase já geriria a ligação da identidade Google ao utilizador) é desejável face a implementar OAuth Gmail totalmente à parte do sistema de auth do Supabase (mais isolado, mais controlo, mas mais código próprio).

Sources: [Sign in with Google — Supabase Docs](https://supabase.com/docs/guides/auth/social-login/auth-google) · [Social login — Supabase Docs](https://supabase.com/docs/guides/auth/social-login) · [Unable to refresh provider_token — gotrue-js#806](https://github.com/supabase/gotrue-js/issues/806) · [Assistance Required for OAuth Scopes with Supabase Authentication — supabase discussion #30924](https://github.com/orgs/supabase/discussions/30924)

### Execução periódica — Supabase Cron / pg_cron

- `pg_cron` (com `pg_net` para chamadas HTTP) vem activado por omissão em todos os projectos Supabase (free/pro/team) desde 2026, e permite agendar jobs que chamam directamente uma Edge Function via HTTP POST, com granularidade até 1 segundo (na prática, minutos/horas fazem mais sentido aqui). "Supabase Cron" é a UI hospedada sobre o mesmo mecanismo.
- Isto resolve a funcionalidade (7)/"alertas contínuos" sem introduzir n8n (mencionado em `CLAUDE.md` mas nunca configurado no repo) — usar `pg_cron`/Supabase Cron para invocar periodicamente uma nova edge function de pesquisa Gmail é consistente com o padrão de infraestrutura já existente (tudo em Supabase Edge Functions) e não adiciona um serviço externo novo.

Sources: [Supabase Cron — Schedule Recurring Jobs in Postgres](https://supabase.com/modules/cron) · [Scheduling Edge Functions — Supabase Docs](https://supabase.com/docs/guides/functions/schedule-functions) · [Cron — Supabase Docs](https://supabase.com/docs/guides/cron)

## Code Snippets de Referência

Ver secção "Padrões de Implementação Existentes" acima — os dois blocos citados (`DocumentPreviewForm.handleConfirm` e a autenticação de `explain-insight`) são os dois padrões a replicar directamente.

## Questões em Aberto

1. **CASA/verificação Google é viável agora?** `gmail.readonly` (necessário para ler anexos) é "restricted" e exige avaliação CASA Tier 2 anual por laboratório terceiro, 6–12 semanas no primeiro ciclo, com custo recorrente. Antes de submeter, a app pode operar em modo "Testing" com até 100 utilizadores de teste sem CASA — compatível com a Phase 0/early beta, mas não com lançamento público. Isto reforça o aviso já registado no ticket sobre o gate de metodologia: **decidir com o founder se se avança já com o scope `gmail.readonly` (modo Testing, ≤100 utilizadores, sem custo de CASA) como MVP interno, adiando a submissão de verificação/CASA para quando houver sinal de mercado**, ou se a feature fica em `backlog` até essa decisão de negócio estar tomada.
2. **Tipo de cliente OAuth Google:** "Web application" (troca de código sempre em Edge Function, `GMAIL_CLIENT_SECRET` nunca no cliente, tokens centralizados no servidor) vs. "iOS/Android nativo" (sem `client_secret`, PKCE apenas, tokens guardados no dispositivo via `expo-secure-store`). A primeira opção é mais alinhada com o padrão de segurança já usado no resto do projecto (secrets e lógica sensível sempre em Edge Functions); decidir em `/plan`.
3. **Usar `supabase.auth.linkIdentity`/`signInWithOAuth` com scopes Gmail, ou construir OAuth totalmente à parte com `expo-auth-session`?** A primeira opção poupa o ecrã de consentimento/troca inicial mas ainda exige lógica própria de refresh (Supabase não faz refresh automático do `provider_token`) e pode complicar-se por o Zelanna não usar Google como login. Decidir em `/plan` com base em quanto código próprio cada opção realmente poupa.
4. **Desenho exacto da deduplicação.** Confirmado que não há nenhum precedente no código: nem `saveDocument`, nem `saveBill`, nem `matchDocumentToContract` verificam duplicados hoje. Decidir a chave de deduplicação (registo de `gmail_message_id`+`attachment_id` processados — mais barato, evita chamadas repetidas ao Vision LLM — vs. comparação por `provider_normalized`+`invoice_date`+`amount` contra `bills`/`documents` existentes — protege também contra o mesmo documento entrar por upload manual e por Gmail) e se ambos os mecanismos são precisos em conjunto.
5. **Revisão humana vs. importação automática directa.** Hoje 100% do caminho de gravação só é accionado depois de confirmação humana em `DocumentPreviewForm`. Decidir se candidatos Gmail passam pelo mesmo ecrã (reutilização total, menor risco) ou se há um caminho novo de gravação automática para extrações de alta confiança (mais próximo do pedido "importação automática", mas exige critério explícito de confiança e um novo caminho de código sem UI).
6. **Onde/como guardar os tokens Gmail.** Nova tabela (`gmail_connections` ou equivalente) com RLS — decidir se o `access_token`/`refresh_token` fica acessível ao cliente (mesmo que só ao próprio utilizador via RLS) ou se só é legível por Edge Functions com `service_role`, nunca directamente pelo app móvel — a segunda opção é mais alinhada com `CLAUDE.md` → `## Segurança` (least privilege), já que o cliente nunca precisa de ler o token Gmail directamente, só de accionar a pesquisa via edge function.
