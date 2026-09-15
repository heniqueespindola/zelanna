---
data: 2026-09-11
status: backlog
prioridade: alta
fase_mvp: sim
---

# Feature: Upload de Documentos + Extração AI (F03)

## Contexto

Esta é a feature central do MVP (`FEATURES.md` → F03): sem upload + extração fiável não há dados para alimentar Coverage Check (F04), Renewal/Price Increase Detection (F05) nem Bills Intelligence. É também a dependência técnica do Passo 2 do onboarding (ticket `2026-09-11-onboarding.md`).

Já existe implementação parcial no repositório, criada fora do fluxo `/plan` → `/implement` desta ficha:

- `src/components/documents/DocumentUpload.tsx` — UI com "Take photo" / "Choose from library" / "Choose PDF" (via `expo-image-picker` e `expo-document-picker`), estados `idle | uploading | extracting | done | error`
- `src/lib/extraction.ts` — `uploadAndExtractDocument()`: sobe o ficheiro para o bucket `documents` do Supabase Storage e invoca a Edge Function
- `supabase/functions/extract-document/index.ts` — Edge Function que autentica o utilizador, descarrega o ficheiro do Storage, chama a API da Anthropic (Vision) e **insere directamente** o resultado na tabela `documents`
- `supabase/storage.sql` — bucket `documents` (privado) com policies RLS por pasta de utilizador (`{user_id}/...`)
- `src/types/documents.ts` — tipos `DocumentType`, `ExtractedDocumentData`, `UploadedDocument`
- `app/(dashboard)/documents.tsx` — ecrã ainda placeholder, com `TODO: F03` — **não** importa `DocumentUpload`, ou seja, o componente existe mas não está integrado no ecrã real

**Duas lacunas importantes face ao pedido desta ficha:**

1. **Falta o passo de preview/confirmação editável antes de guardar.** Hoje a Edge Function extrai e grava (`insert`) num único passo — o utilizador só vê o resultado depois de já estar guardado, e `DocumentUpload.tsx` mostra os campos extraídos em modo leitura, sem inputs para corrigir. O pedido desta ficha é explícito: "ecrã de preview/confirmação onde o utilizador revê e corrige os campos extraídos **antes de guardar**". Isto implica separar extracção (devolve dados, não grava) de gravação (passo explícito accionado pelo utilizador após confirmar/editar).
2. **"Drag-and-drop... (mobile web)" não é coerente com a stack actual.** O `CLAUDE.md` define a distribuição como "iOS (App Store) + Android (Google Play). Sem web." Drag-and-drop é uma metáfora de interacção web/desktop; em React Native + Expo o equivalente nativo é câmara, galeria e ficheiro (o que `DocumentUpload.tsx` já cobre com `expo-image-picker`/`expo-document-picker`). A decidir em `/research`/`/plan`: interpretar "drag-and-drop" como pedido de um ecrã web fora do escopo actual (não construir), ou como uma forma informal de pedir "múltiplas formas de entrada de ficheiro" — já coberta pelos 3 métodos existentes.

## Comportamento esperado

**Dado que** o utilizador está no ecrã Documents
**Quando** carrega em "+ Upload document"
**Então** vê as opções de captura disponíveis (tirar foto, escolher da galeria, escolher PDF)

**Dado que** o utilizador escolheu um ficheiro ou tirou uma foto
**Quando** o upload para o Supabase Storage está em curso
**Então** vê um indicador de progresso claro para a fase de upload, distinto da fase seguinte de extracção

**Dado que** o upload terminou
**Quando** a Edge Function está a interpretar o documento com o Vision LLM
**Então** o indicador de progresso muda para reflectir a fase de "a interpretar documento" (não apenas um único estado genérico "uploading & reading")

**Dado que** a extracção terminou com sucesso
**Quando** os campos (document_type, provider, date, amount e outros campos relevantes como expiry_date) são devolvidos
**Então** o utilizador vê um ecrã de preview com esses campos em **inputs editáveis**, não em texto estático, incluindo o tipo de documento classificado automaticamente (invoice/warranty/insurance/contract/receipt) como um selector que pode ser corrigido

**Dado que** o utilizador está no ecrã de preview
**Quando** corrige um ou mais campos e confirma
**Então** o documento é gravado em `documents` (Supabase) com os valores finais (corrigidos) e `extracted_data` a preservar o payload original devolvido pelo LLM

**Dado que** o utilizador está no ecrã de preview
**Quando** cancela em vez de confirmar
**Então** o documento **não** é gravado em `documents`, mas o ficheiro pode permanecer no Storage (a decidir: apagar ficheiro órfão vs manter para retry — ver Notas técnicas)

**Dado que** a extracção falha (Vision LLM indisponível, resposta não interpretável, ficheiro corrompido)
**Quando** o erro ocorre
**Então** o utilizador vê uma mensagem amigável e pode tentar novamente sem perder o ficheiro já carregado (evitar novo upload desnecessário)

**Dado que** qualquer chamada ao Vision LLM é necessária
**Quando** o pedido é feito
**Então** acontece sempre a partir da Edge Function (`extract-document`), nunca com a chave da Vision LLM no cliente

## Critérios de aceitação

- [ ] `app/(dashboard)/documents.tsx` integra `DocumentUpload` (ou o fluxo revisto), substituindo o placeholder actual
- [ ] Fluxo de upload cobre pelo menos: tirar foto, escolher da galeria, escolher ficheiro PDF (drag-and-drop fora do escopo — ver Notas técnicas)
- [ ] Upload do ficheiro para o bucket `documents` do Supabase Storage, respeitando as policies RLS já definidas em `supabase/storage.sql` (pasta por `user_id`)
- [ ] Chamada à Edge Function `extract-document` devolve os campos extraídos **sem gravar automaticamente** em `documents` — a gravação passa a ser accionada apenas depois da confirmação do utilizador
- [ ] Ecrã de preview/confirmação com inputs editáveis para: document_type (selector com as 5 opções), provider, date, amount, e restantes campos relevantes (ex: expiry_date)
- [ ] Classificação automática do tipo de documento pré-preenche o selector, mas o utilizador pode alterar antes de confirmar
- [ ] Indicador de progresso distingue pelo menos duas fases: "a enviar ficheiro" (upload) e "a interpretar documento" (extracção)
- [ ] Ao confirmar, o registo é gravado em `documents` com `extracted_data` em `jsonb` a conter o payload extraído original (mesmo que o utilizador tenha corrigido os campos principais)
- [ ] Erros de upload e de extracção mostram mensagem amigável e permitem retry sem perder o ficheiro já enviado
- [ ] Nenhuma chave da Vision LLM (`ANTHROPIC_API_KEY`) é referenciada ou exposta no código cliente — chamada sempre via Edge Function
- [ ] Paleta e tipografia via tokens de `src/constants/theme.ts` (`colors`, `fonts`), nunca hexadecimais soltos
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Mudança de arquitectura na Edge Function:** `supabase/functions/extract-document/index.ts` hoje faz `insert` directo na tabela `documents` (linhas 117–129). Para suportar o passo de confirmação, esta função deve passar a devolver apenas os dados extraídos (sem gravar), e um segundo passo — nova chamada RPC/insert directo do cliente autenticado, ou uma segunda Edge Function `save-document` — grava o registo final já com as correcções do utilizador. Decisão de design (insert directo do cliente vs segunda Edge Function) a resolver em `/plan`.
- **Ficheiro órfão no Storage se o utilizador cancelar:** se o utilizador sobe o ficheiro, a extracção corre, mas ele cancela no preview sem confirmar, o ficheiro já está no bucket `documents` sem registo correspondente na tabela. Decidir em `/plan`: apagar o ficheiro do Storage ao cancelar, ou aceitar o resíduo (mais simples, mas gera custo de storage e ficheiros órfãos ao longo do tempo).
- **"Drag-and-drop... (mobile web)" no pedido original não é coerente com "Sem web" do `CLAUDE.md`** (stack = React Native + Expo, iOS + Android). Assumir por omissão que o pedido se refere aos métodos de entrada nativos já cobertos por `expo-image-picker`/`expo-document-picker` (câmara, galeria, ficheiro) — não construir uma superfície web separada. Confirmar esta leitura em `/research` antes de `/plan`.
- **Progresso de duas fases:** `DocumentUpload.tsx` já tem os estados `uploading` e `extracting` no tipo `Status`, mas o JSX actual (linha 69–71) trata-os com o mesmo texto genérico "Uploading & reading your document…". Separar visualmente as duas fases é uma alteração pequena e localizada.
- **`document_type`, `provider`, `date`, `amount`, `expiry_date`** já são os campos devolvidos pela Edge Function (`ExtractedDocumentData` em `src/types/documents.ts` e no schema da função) — o ecrã de preview deve reutilizar este tipo, apenas passando de apresentação estática para inputs controlados.
- **Reaproveitamento no onboarding:** o Passo 2 do onboarding (`2026-09-11-onboarding.md`) depende desta mesma pipeline de upload/extracção — qualquer alteração à assinatura de `uploadAndExtractDocument()` ou ao contrato da Edge Function tem impacto directo nesse ticket.
- **`colors.critical`** é usado em `DocumentUpload.tsx` (linha 104) para o estado de erro mas não consta da tabela de tokens do `CLAUDE.md` — confirmar que já foi adicionado a `src/constants/theme.ts` e, se não, adicioná-lo em vez de usar um hexadecimal solto.

## Fora do escopo

- Upload múltiplo/em lote (vários documentos de uma vez) — um documento de cada vez nesta ficha
- Descoberta automática de documentos via email (Gmail/Outlook) — fase 2, fora do wedge inicial
- Superfície de upload web/drag-and-drop fora da app React Native — produto é iOS + Android apenas (ver `CLAUDE.md` → Stack tecnológica)
- Edição de documentos já guardados (biblioteca de documentos, correcção posterior) — apenas a correcção no momento do preview inicial faz parte desta ficha
- Deduplicação de documentos repetidos — relevante apenas quando a importação por email existir (Phase 2)
- OCR/extração de documentos manuscritos ou de baixa qualidade — assumir documentos digitais/fotografados com qualidade razoável

## Próximo passo
/research Qual o padrão recomendado em Supabase Edge Functions + React Native/Expo para separar "extrair e devolver dados" de "gravar após confirmação do utilizador" (evitar insert directo na Edge Function), e como tratar de forma segura o ficheiro já carregado no Storage quando o utilizador cancela antes de confirmar o preview?
