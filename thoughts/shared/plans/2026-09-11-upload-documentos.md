---
data: 2026-09-11
feature: "Upload de Documentos + Extração AI — Preview/Confirmação (F03)"
research: "thoughts/shared/research/2026-09-11-upload-documentos.md"
status: aguarda_verificacao_manual
---

# Spec: Upload de Documentos + Extração AI — Preview/Confirmação (F03)

## Visão Geral

Separa a extracção (Edge Function `extract-document`, sem `insert`) da gravação (accionada pelo cliente só depois de o utilizador confirmar/corrigir os campos num novo ecrã de preview), integra `DocumentUpload` no ecrã `documents.tsx` (hoje placeholder) e trata do ficheiro órfão no Storage quando o utilizador cancela.

## Decisões tomadas (resolvendo "Questões em Aberto" do research)

| Questão | Decisão |
|---|---|
| `insert` directo do cliente vs segunda Edge Function | `insert` directo do cliente autenticado (`saveDocument()` em `src/lib/extraction.ts`) — mesma policy RLS que a Edge Function já usa hoje; sem infraestrutura nova |
| Cleanup do ficheiro no Storage ao cancelar | **Apagar** (`discardDocument()` chama `storage.remove([documentPath])`) — decisão confirmada com o utilizador; evita ficheiros órfãos e custo de storage acumulado |
| Contrato de `DocumentUpload.onExtracted` | **Mantém-se inalterado** — continua a disparar só depois de gravado (`UploadedDocument`, com `id`). O preview/confirmação fica encapsulado dentro de `DocumentUpload` (novo estado `previewing`), pelo que `app/onboarding/step2.tsx` e `app/onboarding/step3.tsx` **não precisam de nenhuma alteração** |
| Onde vive o ecrã de preview | Componente novo `src/components/documents/DocumentPreviewForm.tsx`, renderizado por `DocumentUpload` quando `status === 'previewing'` — não é uma rota/ecrã novo, reutilizável tanto em `documents.tsx` como no onboarding |
| "Drag-and-drop (mobile web)" do pedido original | Fora de âmbito — confirmado no research que não há infraestrutura web no projecto (`CLAUDE.md`: "Sem web"). Os 3 métodos nativos já existentes (`expo-image-picker`/`expo-document-picker`) cobrem a intenção |
| Campo `expiry_date` editável no preview, mas sem coluna própria em `documents` | A tabela `documents` só tem colunas `document_type`/`provider`/`date`/`amount` para os "valores finais corrigidos" — não há onde persistir uma correcção a `expiry_date` sem violar a regra de que `extracted_data` preserva o payload **original**. **Decisão:** adicionar coluna `expiry_date date` a `public.documents` (Fase 1), consistente com o padrão já usado (`onboarding_completed`/`onboarding_goals` foram adicionados da mesma forma) e alinhado com o roadmap próximo (Renewal/Price Increase Detection e Coverage Check dependem de datas de expiração/renovação) |
| Progresso de duas fases (upload vs extracção) | `src/lib/extraction.ts` deixa de ter uma única função `uploadAndExtractDocument`; passa a ter `uploadDocument()` e `extractDocument()` separadas, chamadas sequencialmente por `DocumentUpload`, que muda `status` entre as duas (`'uploading'` → `'extracting'`) |
| Contraste do texto em `Input.tsx` (label/valor sempre brancos) no preview | `Input.tsx` assume fundo escuro (usado hoje só em `(auth)/login.tsx` e `register.tsx`, sobre `colors.bgDarkest`). `DocumentPreviewForm` é reutilizado também no onboarding, sobre `colors.bgLight` (claro) — para não ficar texto branco ilegível, `DocumentPreviewForm` envolve o formulário num cartão com `backgroundColor: colors.primary`, garantindo contraste em qualquer ecrã que o use, sem alterar `Input.tsx` (fora do âmbito desta ficha) |

---

## Fase 1 — Schema

### `supabase/schema.sql`
**Modificações:** depois da definição actual da tabela `public.documents` (linhas 36-46), adicionar:

```sql
alter table public.documents
  add column if not exists expiry_date date;
```

**Critérios de sucesso (manuais):**
- [ ] `supabase db push` (ou execução manual no SQL editor) aplica a alteração sem erro
- [ ] Coluna `expiry_date` visível na tabela `documents` no dashboard Supabase

---

## Fase 2 — Tipos

### `src/types/documents.ts`
**Modificações:**
- Adicionar novo tipo `ExtractionResult`, devolvido pelo par `uploadDocument()`/`extractDocument()` antes de qualquer gravação:
```ts
export interface ExtractionResult {
  documentPath: string;
  mimeType: string;
  extracted: ExtractedDocumentData;
}
```
- Adicionar `expiry_date: string | null` a `UploadedDocument` (reflecte a nova coluna):
```ts
export interface UploadedDocument {
  id: string;
  file_url: string;
  document_type: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiry_date: string | null;
  extracted_data: ExtractedDocumentData;
  created_at: string;
}
```
- `ExtractedDocumentData` e `DocumentType` não mudam.

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros

---

## Fase 3 — Edge Function `extract-document`

### `supabase/functions/extract-document/index.ts`
**Modificações:**
- Remover o bloco de `insert` em `public.documents` (linhas 117-136 actuais).
- Substituir o `return` final por:
```ts
return new Response(JSON.stringify(extracted), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
```
- Manter tudo o resto: autenticação via `supabaseAuthed.auth.getUser()` (continua a ser necessária para rejeitar pedidos não autenticados com `401`, mesmo sem `insert`), download via `supabaseService`, chamada à Anthropic API, `try/catch` de `JSON.parse` com resposta `422` em caso de falha.
- `supabaseAuthed` deixa de ser usado para escrita — mantém-se apenas para o `auth.getUser()`. Não remover a criação do client (ainda necessário).

**Critérios de sucesso (manuais):**
- [ ] `supabase functions deploy extract-document` sem erros
- [ ] Invocação real via app devolve `{ document_type, provider, date, amount, expiry_date }` e **não** cria nenhuma linha em `documents`

---

## Fase 4 — Lib

### `src/lib/extraction.ts`
**Modificações:** substituir `uploadAndExtractDocument()` por quatro funções:

```ts
export async function uploadDocument(params: {
  userId: string;
  uri: string;
  mimeType: string;
  base64?: string;
}): Promise<{ documentPath: string }> {
  const path = `${params.userId}/${Date.now()}-${filenameFromUri(params.uri)}`;
  const fileBody = params.base64
    ? decode(params.base64)
    : await fetch(params.uri).then((res) => res.arrayBuffer());

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, fileBody, { contentType: params.mimeType });
  if (error) throw new Error('Upload failed');

  return { documentPath: path };
}

export async function extractDocument(params: {
  documentPath: string;
  mimeType: string;
}): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke<ExtractedDocumentData>(
    'extract-document',
    { body: params }
  );
  if (error || !data) throw new Error('Extraction failed');
  return { documentPath: params.documentPath, mimeType: params.mimeType, extracted: data };
}

export async function saveDocument(params: {
  userId: string;
  documentPath: string;
  documentType: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiryDate: string | null;
  extracted: ExtractedDocumentData; // payload original — vai para extracted_data tal como veio do LLM
}): Promise<UploadedDocument> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: params.userId,
      file_url: params.documentPath,
      document_type: params.documentType,
      provider: params.provider,
      date: params.date,
      amount: params.amount,
      expiry_date: params.expiryDate,
      extracted_data: params.extracted,
    })
    .select()
    .single();

  if (error || !data) throw new Error('Save failed');
  return data;
}

export async function discardDocument(documentPath: string): Promise<void> {
  await supabase.storage.from('documents').remove([documentPath]);
}
```

- Manter `filenameFromUri()` privada, inalterada.
- Importar `DocumentType`, `ExtractedDocumentData`, `ExtractionResult`, `UploadedDocument` de `@/types/documents`.
- Nenhum outro ficheiro além de `DocumentUpload.tsx`/`DocumentPreviewForm.tsx` importa de `src/lib/extraction.ts` (confirmado no research) — remover `uploadAndExtractDocument` não quebra mais nada.

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros

---

## Fase 5 — Componentes

### `src/components/documents/DocumentTypeSelector.tsx` (NOVO)
**Propósito:** selector de `document_type` em forma de chips (sem dependência de picker nativo — nenhuma lib de select está instalada no projecto).

```tsx
interface Props {
  value: DocumentType | null;
  onChange: (value: DocumentType) => void;
}
export function DocumentTypeSelector({ value, onChange }: Props): JSX.Element;
```

**Conteúdo:**
- Lista fixa das 5 opções: `invoice` ("Invoice"), `warranty` ("Warranty"), `insurance` ("Insurance"), `contract` ("Contract"), `receipt` ("Receipt")
- `View` com `flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs`, um `Pressable` "chip" por opção
- Chip seleccionado: `backgroundColor: colors.primary, borderColor: colors.primary`; não seleccionado: `backgroundColor: colors.surfaceAlt, borderColor: colors.border`; texto sempre `colors.white` (seleccionado com `fontWeight: '700'`)
- Label acima do grupo: `"Document type"`, `fontFamily: fonts.body, fontSize: 14, color: colors.white` (mesmo estilo do `label` de `Input.tsx`, para consistência visual dentro do cartão escuro do preview)

### `src/components/documents/DocumentPreviewForm.tsx` (NOVO)
**Propósito:** ecrã/estado de preview editável, renderizado dentro de `DocumentUpload` quando a extracção termina. Reune correcção de campos, gravação (confirmar) e descarte (cancelar).

```tsx
interface Props {
  userId: string;
  documentPath: string;
  extracted: ExtractedDocumentData;
  onSaved: (doc: UploadedDocument) => void;
  onCancelled: () => void;
}
export function DocumentPreviewForm({ userId, documentPath, extracted, onSaved, onCancelled }: Props): JSX.Element;
```

**Estado interno:**
- `documentType: DocumentType | null` — inicializado a `extracted.document_type`
- `provider: string` — inicializado a `extracted.provider ?? ''`
- `date: string` — inicializado a `extracted.date ?? ''`
- `amount: string` — inicializado a `extracted.amount !== null ? String(extracted.amount) : ''`
- `expiryDate: string` — inicializado a `extracted.expiry_date ?? ''`
- `amountError: string | null`, `error: string | null`, `saving: boolean`, `discarding: boolean`

**Comportamento:**
- Renderiza, dentro de um cartão (`View` com `backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm` — ver "Decisões tomadas" sobre contraste):
  - Título `"Review before saving"` (`fontFamily: fonts.display, color: colors.white`)
  - `<DocumentTypeSelector value={documentType} onChange={setDocumentType} />`
  - `<Input label="Provider" value={provider} onChangeText={setProvider} placeholder="e.g. EDP" />`
  - `<Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />`
  - `<Input label="Amount" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" error={amountError ?? undefined} />`
  - `<Input label="Expiry / renewal date" value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" />`
  - `error` (se existir) em `Text` com `color: colors.critical`
  - Duas `Button` lado a lado (`flexDirection: 'row', gap: spacing.sm`): `"Cancel"` (`variant="primary"`, `loading={discarding}`, `disabled={saving}`, `onPress={handleCancel}`) e `"Confirm"` (`variant="accent"`, `loading={saving}`, `disabled={discarding}`, `onPress={handleConfirm}`)
- `handleConfirm`:
  1. Limpa `amountError`/`error`
  2. Se `amount.trim() !== ''`: `const parsed = Number(amount.replace(',', '.'))`; se `Number.isNaN(parsed)`, `setAmountError('Enter a valid number.')` e `return` (sem gravar); caso contrário usa `parsed`. Se `amount.trim() === ''`, usa `null`
  3. `setSaving(true)`
  4. `try`: chama `saveDocument({ userId, documentPath, documentType, provider: provider.trim() || null, date: date.trim() || null, amount: <valor do passo 2>, expiryDate: expiryDate.trim() || null, extracted })` (nota: `extracted` é o payload **original**, não os valores editados — só os campos principais vão corrigidos para as colunas) → `onSaved(doc)`
  5. `catch`: `setSaving(false)`, `setError('Could not save this document. Please try again.')`
- `handleCancel`:
  1. `setDiscarding(true)`
  2. `try { await discardDocument(documentPath); } catch { /* best-effort — falha de limpeza não bloqueia o utilizador */ }`
  3. `onCancelled()` (chamado sempre, mesmo que o `discardDocument` falhe)

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros

### `src/components/documents/DocumentUpload.tsx`
**Modificações:**
- `Status` passa de `'idle' | 'uploading' | 'extracting' | 'done' | 'error'` para `'idle' | 'uploading' | 'extracting' | 'previewing' | 'done' | 'error'`
- Novo estado `extraction: ExtractionResult | null` (substitui o antigo `result: UploadedDocument | null` durante a fase de preview); manter um segundo estado `savedDoc: UploadedDocument | null` só para o cartão final "Document saved"
- `processAsset()` passa a:
```ts
const processAsset = async (params: { uri: string; mimeType: string; base64?: string }) => {
  if (!user) return;
  setErrorMessage(null);
  setStatus('uploading');
  try {
    const { documentPath } = await uploadDocument({ userId: user.id, ...params });
    setStatus('extracting');
    const result = await extractDocument({ documentPath, mimeType: params.mimeType });
    setExtraction(result);
    setStatus('previewing');
  } catch {
    setStatus('error');
    setErrorMessage('Something went wrong. Please try again.');
  }
};
```
- `handleTakePhoto`/`handleChooseFromLibrary`/`handleChoosePdf` mantêm-se inalterados (continuam a chamar `processAsset`)
- Novo `handleSaved = (doc: UploadedDocument) => { setSavedDoc(doc); setStatus('done'); onExtracted(doc); }` — é aqui, e só aqui, que `onExtracted` é chamado (mantém o contrato actual: só dispara depois de gravado)
- Novo `handleCancelled = () => { setExtraction(null); setStatus('idle'); }` — volta ao ecrã inicial de escolha de método, pronto para novo upload
- Import `uploadDocument, extractDocument` (em vez de `uploadAndExtractDocument`) de `@/lib/extraction`; import `DocumentPreviewForm` de `@/components/documents/DocumentPreviewForm`; import `ExtractionResult` de `@/types/documents`
- JSX:
  - `status === 'idle' || status === 'error'` → botões (inalterado)
  - `status === 'uploading'` → `<Text style={styles.status}>Uploading your document…</Text>` (**antes**: texto único genérico para `uploading`+`extracting`)
  - `status === 'extracting'` → `<Text style={styles.status}>Reading your document…</Text>` (novo bloco — fase distinta)
  - `status === 'error' && errorMessage` → inalterado
  - `status === 'previewing' && extraction && user` → `<DocumentPreviewForm userId={user.id} documentPath={extraction.documentPath} extracted={extraction.extracted} onSaved={handleSaved} onCancelled={handleCancelled} />`
  - `status === 'done' && savedDoc` → mesmo cartão actual, mas lendo directamente de `savedDoc.document_type`/`savedDoc.provider`/`savedDoc.date`/`savedDoc.amount` (hoje lê de `result.extracted_data.*`, que continuava a ser o payload original — como os campos de topo do registo gravado já reflectem as correcções do utilizador, ler daí passa a mostrar os valores **corrigidos**, não os originais)

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros

---

## Fase 6 — Ecrã Documents

### `app/(dashboard)/documents.tsx`
**Modificações:**
- Remover o `Pressable` placeholder (`+ Upload document`) e o comentário `TODO: F03`
- Importar `DocumentUpload` de `@/components/documents/DocumentUpload`
- Renderizar `<DocumentUpload onExtracted={() => {}} />` no lugar do placeholder (sem biblioteca/lista de documentos guardados — fora do âmbito desta ficha; `DocumentUpload` já mostra as 3 opções de captura no seu estado `idle`)
- Remover import `Pressable` e o token `radius` de `@/constants/theme` se deixarem de ser usados no ficheiro (confirmar com `tsc`/lint)
- Remover estilos `uploadButton`/`uploadButtonText` do `StyleSheet`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros

**Critérios de sucesso (manuais):**
- [ ] Ecrã Documents mostra directamente os 3 botões de captura (sem placeholder estático)
- [ ] Fluxo completo num documento real: upload → "Uploading your document…" → "Reading your document…" → preview editável → editar um campo → Confirm → cartão "Document saved" com os valores corrigidos
- [ ] Cancelar no preview volta aos 3 botões de captura, sem linha nova em `documents` (confirmar no dashboard Supabase) e sem ficheiro remanescente no bucket `documents` no path usado

---

## Fase 7 — Verificação de compatibilidade com o Onboarding

Sem alterações a ficheiros — apenas confirmação manual de que o contrato preservado (`onExtracted` só dispara pós-gravação) mantém o fluxo existente a funcionar:

### `app/onboarding/step2.tsx` e `app/onboarding/step3.tsx`
**Sem modificações.** `step2.tsx` continua a usar `<DocumentUpload onExtracted={(doc) => setUploadedDocument(doc)} />` e a activar "Continue" com `disabled={!uploadedDocument}`; `step3.tsx` continua a ler `uploadedDocument.extracted_data` para `generateOnboardingInsight`. Como `onExtracted` só dispara depois do ecrã de preview ser confirmado, o Passo 2 do onboarding passa a exigir a mesma confirmação explícita que `documents.tsx` — não há caminho simplificado/auto-confirmado só para o onboarding.

**Critérios de sucesso (manuais):**
- [ ] Onboarding Passo 2: upload de um documento real mostra agora o ecrã de preview/confirmação (novidade face ao comportamento actual) antes de activar "Continue"
- [ ] Onboarding Passo 3: insight gerado continua a reflectir `extracted_data` (payload original) do documento confirmado no Passo 2

---

## Estratégia de Testes

- **Unit:** sem test runner configurado no projecto (mesma situação já assinalada na spec de onboarding) — validação manual de `uploadDocument`/`extractDocument`/`saveDocument`/`discardDocument` via uso real da app
- **Manual (simulador iOS/Android via Expo Go ou dev build):**
  1. `documents.tsx` → "Choose PDF" com uma factura real → confirmar as duas fases de progresso distintas ("Uploading…" depois "Reading…")
  2. No preview: alterar `document_type` (chip), corrigir `provider`/`amount`, deixar `date`/`expiry_date` como vieram → Confirm → confirmar no Supabase dashboard que `documents.document_type`/`provider`/`amount` reflectem a correcção e `extracted_data` mantém o payload **original** (não editado)
  3. Repetir upload, desta vez cancelar no preview → confirmar que não aparece linha nova em `documents` e que o objecto correspondente desaparece do bucket `documents` no Storage
  4. Amount inválido (ex: "abc") → Confirm → erro inline no campo, sem chamada a `saveDocument`
  5. Forçar erro de extracção (ex: desligar rede depois do upload) → mensagem amigável, botões de captura disponíveis de novo sem perder a necessidade de re-upload (aceitar re-upload nesta versão — sem retry sem novo upload, já que o path anterior não é reaproveitado)
  6. Onboarding Passo 2 → 3 com o novo ecrã de preview no meio, confirmar que o fluxo completo continua a chegar ao dashboard

---

## Notas de Implementação

- **`extracted_data` nunca é editado** — grava sempre o payload tal como devolvido pelo Vision LLM, mesmo que o utilizador corrija `document_type`/`provider`/`date`/`amount`/`expiry_date` nas colunas de topo. É o registo de auditoria da extracção original.
- **RLS inalterado** — `saveDocument()` usa o cliente Supabase normal (sessão do utilizador), que já respeita as mesmas policies que a Edge Function usava; `user_id` vem sempre de `useAuth()` no cliente (nunca de input livre).
- **Sem chave Vision LLM no cliente** — `extractDocument()` continua a só invocar `supabase.functions.invoke('extract-document', ...)`; a chamada à Anthropic API mantém-se inteiramente dentro da Edge Function.
- **Ficheiro órfão no Storage** — só existe uma janela entre `uploadDocument()` e `saveDocument()`/`discardDocument()`; se a app fechar a meio (ex: crash) sem o utilizador confirmar nem cancelar, o ficheiro fica órfão sem cleanup automático nesta versão (aceitável no MVP — sem cron/Edge Function de limpeza periódica).
- **`DocumentPreviewForm` sobre cartão escuro (`colors.primary`)** — decisão para contornar que `Input.tsx` assume texto branco (fora do âmbito desta ficha alterar `Input.tsx`, que é partilhado com `(auth)/login.tsx` e `register.tsx`).
- **Componentes pequenos:** `DocumentTypeSelector.tsx` foi extraído de `DocumentPreviewForm.tsx` propositadamente para manter ambos os ficheiros bem abaixo do limite de 150 linhas do `CLAUDE.md`, e por ser plausivelmente reutilizável numa futura feature de edição de documentos já guardados (fora do âmbito desta ficha).

## Referências

- Research: `thoughts/shared/research/2026-09-11-upload-documentos.md`
- Ticket: `thoughts/shared/tickets/2026-09-11-upload-documentos.md`
- Spec anterior (F03 mínimo, sem preview): `thoughts/shared/plans/2026-09-11-onboarding.md`
- Padrão de card/form a seguir: `src/components/ui/Input.tsx`, `src/components/ui/Button.tsx`
- Policies RLS reutilizadas: `supabase/schema.sql:50-64`, `supabase/storage.sql:1-16`
