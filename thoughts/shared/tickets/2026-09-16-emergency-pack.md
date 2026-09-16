---
data: 2026-09-16
status: backlog
prioridade: baixa
fase_mvp: nao
---

# Feature: Emergency Pack (F12)

## Contexto

Emergency Pack é referido no `CLAUDE.md` → "Módulos posteriores" como: *"export organizado (assets, documentos, seguros, propriedades, digital assets, trusted contacts, instructions) para situações de emergência"* — e a própria ficha do Digital Estate (F11) já o deixa explicitamente fora do seu escopo: *"esta ficha só constrói os dados que o Emergency Pack viria a exportar"* (`thoughts/shared/tickets/2026-09-15-digital-estate.md:90`). **F12 é o próximo número de feature disponível** — F03 a F11 já têm ficha própria em `thoughts/shared/tickets/`.

**F11 (Digital Estate) já está implementado**, ao contrário do que a sua própria ficha assumia como "greenfield" — confirmado por pesquisa em `supabase/schema.sql`, `src/types/`, `src/lib/` e `app/(dashboard)/estate/`:

- Tabelas existentes: `digital_assets`, `financial_assets`, `trusted_people`, `trusted_person_permissions` (`section`: `'digital_assets'|'financial_assets'|'important_documents'|'assets'|'coverage'|'instructions'`), `estate_access_log`, `estate_instructions` (`supabase/schema.sql:425-593`).
- Tipos em `src/types/estate.ts`: `DigitalAsset`, `FinancialAsset`, `TrustedPerson`, `TrustedPersonPermission`, `EstateAccessLogEntry`, `EstateInstructions`.
- CRUD completo em `src/lib/estate.ts`, incluindo `fetchEstateDocuments`/`setDocumentEstateFlag` (documentos marcados via `documents.is_estate_document`, `src/types/documents.ts:32`) e `grantPermission`/`revokePermission`/`logSimulatedAccess`.
- Ecrãs em `app/(dashboard)/estate/`: `index.tsx` (hub), `digital-assets.tsx`, `financial-assets.tsx`, `important-documents.tsx`, `instructions.tsx`, `trusted-people/`.
- **Mecanismo real de acesso de terceiros continua por construir** (ver `estate-digital` → Notas técnicas): `estate_access_log` só é populado por `logSimulatedAccess`, chamado manualmente do lado do dono — não existe hoje nenhuma conta/magic link para uma trusted person aceder de facto aos dados. Isto é relevante para esta ficha porque "partilha controlada com uma trusted person" (ponto 3 do pedido) herda a mesma limitação.

**Não existe hoje nenhum conceito de "properties" (imóveis) como entidade própria.** `'property'` só existe como valor de `FinancialAssetType` (`src/types/estate.ts` → `FinancialAsset.type`), sem morada, área, ou outros campos próprios de um imóvel — a ficha do `CLAUDE.md` menciona "propriedades" como categoria separada de "digital assets", mas no schema actual um imóvel seria só um `financial_asset` com `type: 'property'`. Esta ficha não cria uma tabela `properties` nova (fora do wedge, sem pedido explícito) — assume-se que "properties" no export mapeia para os `financial_assets` com `type = 'property'`, e isto deve ficar explícito no `/research`/`/plan` como decisão, não como omissão silenciosa.

**Também não existe uma tabela `insurance` própria** — seguros vivem em dois sítios distintos e não totalmente sobrepostos: `contracts` com `type = 'insurance'` (`src/types/contracts.ts`) e `coverage` com `type = 'insurance'`, ligado a um `asset_id` (`src/types/coverage.ts`). O Emergency Pack de "insurance" tem de agregar ambos.

**Não existe nenhuma biblioteca de geração de PDF instalada.** `package.json` só tem `expo-file-system` — falta `expo-print` (gera PDF a partir de HTML) e `expo-sharing` (partilhar/exportar o ficheiro gerado) para a opção "PDF ou vista estruturada" pedida.

## Comportamento esperado

**Dado que** o utilizador tem dados em várias secções (assets, documentos, coverage/seguros, `financial_assets` com `type='property'`, `digital_assets`, `trusted_people`, `estate_instructions`)
**Quando** abre o ecrã Emergency Pack
**Então** vê uma lista de secções disponíveis para incluir, cada uma com toggle e contagem de itens (ex: "Assets — 4 registered", "Important Documents — 2 registered"), seguindo o padrão visual do hub de Digital Estate (`app/(dashboard)/estate/index.tsx`)

**Dado que** o utilizador seleccionou as secções a incluir
**Quando** confirma a geração
**Então** o Zelanna produz um documento/pacote organizado a partir dos dados já existentes (sem extracção nem cálculo novo — só agregação e formatação determinística dos registos já persistidos) e mostra uma pré-visualização estruturada antes de exportar

**Dado que** o utilizador quer um ficheiro portátil
**Quando** escolhe exportar
**Então** obtém um PDF (via `expo-print` + `expo-sharing`, share sheet nativo iOS/Android) com as secções seleccionadas, organizadas por categoria

**Dado que** o utilizador quer partilhar o pacote com uma trusted person específica
**Quando** selecciona essa pessoa e confirma a partilha
**Então** só as secções para as quais essa trusted person já tem permissão activa em `trusted_person_permissions` ficam disponíveis para selecção — nunca uma secção sem permissão prévia, mesmo que o dono tente incluí-la manualmente

**Dado que** os dados subjacentes mudam (novo asset, documento marcado como estate, permissão revogada)
**Quando** o utilizador volta ao Emergency Pack de uma trusted person já partilhado anteriormente
**Então** existe uma opção explícita "Regenerate" que reconstrói o pacote a partir do estado actual — não fica um PDF estático desactualizado sem indicação

**Dado que** uma trusted person deixou de ter uma permissão de secção (revogada em `app/(dashboard)/estate/trusted-people`)
**Quando** o utilizador regenera ou volta a rever um pacote já partilhado com essa pessoa
**Então** a secção revogada desaparece do pacote nessa regeneração — o sistema nunca assume acesso permanente a algo já removido

## Critérios de aceitação

- [ ] Novo ecrã Emergency Pack (decidir em `/plan` se vive em `app/(dashboard)/estate/` como sub-ecrã, dado que já referencia Digital Estate directamente, ou como entrada própria em `more.tsx` a par de "Digital Estate")
- [ ] Selecção de secções a incluir: Assets (`src/lib/assets` — a confirmar nome exacto em `/research`), Important Documents (`fetchEstateDocuments`), Insurance/Coverage (agregação de `contracts` tipo `'insurance'` + `coverage`), Properties (`financial_assets` com `type = 'property'`), Digital Assets (`fetchDigitalAssets`), Trusted Contacts (`fetchTrustedPeople`), Instructions (`fetchEstateInstructions`) — cada secção com toggle independente, nenhum "select all" pré-activado (mesma regra de F11: nunca acesso/inclusão total por defeito)
- [ ] Geração de vista estruturada (ecrã de pré-visualização) a partir dos dados já existentes, sem nova extracção AI nem cálculo — motor de agregação determinístico, seguindo `CLAUDE.md` regra #6
- [ ] Export para PDF via `expo-print` (novo, adicionar a `package.json`) + `expo-sharing` (novo) — share sheet nativo, sem upload para servidor externo
- [ ] Partilha controlada com uma trusted person específica: lista de secções disponíveis para partilha limitada às que já têm registo activo em `trusted_person_permissions` para essa `trusted_person_id`; nunca partilhar uma secção sem permissão prévia concedida no ecrã de Trusted People
- [ ] Acção "Regenerate" — reconstrói o pacote/preview a partir do estado actual dos dados e das permissões vigentes nesse momento (sem cache de uma versão anterior a ser reaproveitada silenciosamente)
- [ ] Ao regenerar, secções cuja permissão foi entretanto revogada deixam de constar do pacote dessa trusted person
- [ ] Nenhum campo de password, seed phrase, private key, banking credential ou recovery code entra no pacote gerado (`CLAUDE.md` → "O que NÃO ser") — o pacote reflecte fielmente os dados já existentes (que já respeitam esta regra) sem adicionar nenhum campo novo de segredo
- [ ] RLS: geração e partilha do pacote correm sempre autenticadas como o dono (`auth.uid()`); nenhuma rota nova concede acesso directo à base de dados a uma trusted person (decidir em `/plan` como a trusted person recebe de facto o ficheiro partilhado — ver `## Notas técnicas`, mesma questão em aberto do F11)
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Maior questão em aberto herdada do F11 — como a trusted person recebe o pacote partilhado:** esta ficha não resolve o mecanismo de acesso real de terceiros (continua sem magic link/conta própria, ver `thoughts/shared/tickets/2026-09-15-digital-estate.md:80`). "Partilha controlada" nesta fase pode legitimamente significar: o dono gera o PDF localmente e usa o share sheet nativo (`expo-sharing`) para o enviar manualmente (email, WhatsApp, AirDrop) a essa trusted person — não um link/portal Zelanna que a trusted person acede directamente. Decidir explicitamente em `/plan` para não ficar implícito.
- **Fonte de dados por secção** (a confirmar exactamente em `/research`, nomes de funções podem variar):
  - Assets → provavelmente `src/lib/assets.ts` (a confirmar se existe; Warranty Vault F10 estendeu `assets`/`maintenance`/`claims`)
  - Important Documents → `fetchEstateDocuments(userId)` (`src/lib/estate.ts:280`), já filtra por `is_estate_document = true`
  - Insurance → `contracts` (`type = 'insurance'`) + `coverage` (`type = 'insurance'`, ligado a `asset_id`) — duas tabelas distintas, é preciso decidir se o Emergency Pack as apresenta como secção única "Insurance" ou mantém a distinção contrato vs. cobertura por asset
  - Properties → `financial_assets` filtrado por `type = 'property'` (não existe tabela própria — ver `## Contexto`)
  - Digital Assets → `fetchDigitalAssets(userId)` (`src/lib/estate.ts:25`)
  - Trusted Contacts → `fetchTrustedPeople(userId)` (`src/lib/estate.ts:133`) — decidir se a secção "Trusted Contacts" dentro do pacote inclui a própria lista de trusted people (útil num pacote de emergência: "estas são as pessoas de confiança do titular") ou se é sempre excluída do pacote partilhado com uma trusted person (evita listar outras trusted people a alguém que já é uma delas — considerar em `/plan`)
  - Instructions → `fetchEstateInstructions(userId)` (`src/lib/estate.ts:248`)
- **Bibliotecas novas a instalar:** `expo-print` (HTML → PDF) e `expo-sharing` (share sheet). Confirmar compatibilidade com Expo SDK 57 em `/research` antes de adicionar a `package.json`.
- **Reaproveitar em vez de duplicar:** o motor de agregação desta ficha não deve reimplementar queries já existentes em `src/lib/estate.ts` — deve compor as funções `fetchX` já existentes (mesma filosofia do F11, que reaproveitou `documents`/`DocumentType` em vez de duplicar o pipeline de upload).
- **Tema/cores:** o PDF gerado deve usar `colors`/`fonts` de `src/constants/theme.ts` (paleta verde-carvão/dourado do Zelanna) em vez de um template HTML genérico — reforça a identidade de marca mesmo num documento exportado.
- **Regenerar vs. versionar:** "versão actualizável" no pedido original é interpretado nesta ficha como *regenerar a partir do estado actual* (sem histórico de versões antigas guardado), não como um sistema de versionamento com histórico — decidir em `/plan` se faz sentido guardar apenas a data da última geração por trusted person (ex: campo `last_generated_at` numa tabela nova `emergency_pack_shares`, ligando `trusted_person_id` a secções incluídas e timestamp) para a UI poder mostrar "last shared 3 days ago" e detectar quando os dados mudaram desde a última partilha.

## Fora do escopo

- **Mecanismo real de acesso/portal para a trusted person visualizar o pacote directamente na app** — continua dependente da mesma questão em aberto do F11 (magic link vs. conta própria); esta ficha entrega geração + export local + partilha manual via share sheet nativo
- **Tabela `properties` própria** com morada, área, valor de mercado, etc. — fora do escopo; "properties" mapeia para `financial_assets` com `type = 'property'` nesta fase
- **Notificações automáticas** à trusted person quando o pacote é partilhado ou regenerado — fora do escopo
- **Verificação automática de morte/inatividade** para accionar geração ou envio automático do pacote — explicitamente adiado no `CLAUDE.md` → "Não construir ainda"
- **Histórico/versionamento completo de pacotes gerados** — esta ficha usa "regenerar" (estado actual), não um arquivo de versões anteriores (ver `## Notas técnicas`)
- **Exportação para além de PDF** (ex: ZIP com documentos originais anexados) — nesta fase o pacote é o documento estruturado, não inclui os PDFs/fotografias originais de cada documento
- **Armazenamento de qualquer segredo** (passwords, seed phrases, private keys, banking credentials, recovery codes) no pacote — nunca, herda a regra do F11/`CLAUDE.md`

## Próximo passo
/research Como agregar dados de `contracts` (`type='insurance'`) e `coverage` (`type='insurance'`, por `asset_id`) numa secção "Insurance" coerente para o Emergency Pack, que funções `fetchX` já existem para Assets (fora de `src/lib/estate.ts`), e qual a abordagem mínima viável para "partilha controlada" sem mecanismo de acesso real de terceiros (share sheet nativo vs. alternativa) dado o estado actual do F11 em produção.
