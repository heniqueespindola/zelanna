---
data: 2026-09-11
feature: "Upload de Documentos + Extração AI (F03)"
status: completo
---

# Research: Upload de Documentos + Extração AI (F03)

## Questão de Pesquisa

Do ticket `thoughts/shared/tickets/2026-09-11-upload-documentos.md` (`## Próximo passo`):

> Qual o padrão recomendado em Supabase Edge Functions + React Native/Expo para separar "extrair e devolver dados" de "gravar após confirmação do utilizador" (evitar insert directo na Edge Function), e como tratar de forma segura o ficheiro já carregado no Storage quando o utilizador cancela antes de confirmar o preview?

## Sumário

A tabela `documents` já tem uma policy RLS `"Users can insert own documents" ... with check (auth.uid() = user_id)` (`supabase/schema.sql:54-56`), e o bucket Storage `documents` já tem policies de `select`/`insert`/`delete` restritas à pasta `{user_id}/...` do próprio utilizador (`supabase/storage.sql`). Isto significa que **não é preciso criar uma segunda Edge Function** para gravar o documento nem para apagar o ficheiro: o cliente autenticado (`src/lib/supabase.ts`) já tem permissão RLS para fazer `insert` directo em `documents` e `remove()` directo no seu próprio ficheiro no Storage. O único ajuste necessário é na Edge Function `extract-document` (`supabase/functions/extract-document/index.ts:117-136`), que hoje faz o `insert` ela própria — deve passar a devolver apenas o JSON extraído (`extracted`), sem tocar na tabela `documents`.

Ponto crítico transversal: `DocumentUpload.tsx` é **partilhado** entre o ecrã `documents.tsx` (ainda placeholder) e o Passo 2 do onboarding (`app/onboarding/step2.tsx:6,21`) — qualquer alteração ao contrato do componente (props, timing do `onExtracted`) tem de manter ambos os fluxos a funcionar.

## Ficheiros Relevantes da Codebase

- `supabase/functions/extract-document/index.ts:37-142` — Edge Function actual: autentica utilizador, descarrega ficheiro do Storage com o service role, chama a Anthropic Messages API com o conteúdo em base64, faz `parse` do JSON devolvido e **insere directamente** em `documents` (linhas 117-129) antes de devolver o registo gravado ao cliente
- `src/lib/extraction.ts:16-40` — `uploadAndExtractDocument()`: sobe o ficheiro para `documents/{userId}/{timestamp}-{filename}` no Storage e invoca a Edge Function `extract-document`, devolvendo directamente o que a função responder (hoje, o registo já gravado)
- `src/components/documents/DocumentUpload.tsx:1-124` — componente de UI com estados `idle | uploading | extracting | done | error`; `processAsset()` (linhas 23-36) chama `uploadAndExtractDocument` e, ao terminar, invoca `onExtracted(doc)` — usado tanto em `documents.tsx` (por integrar) como em `app/onboarding/step2.tsx:21`
- `app/onboarding/step2.tsx:6,11,21` — consumidor actual de `DocumentUpload`; guarda o resultado em `useOnboarding().setUploadedDocument` e só avança para o Passo 3 quando `uploadedDocument` existe (linha 25) — depende de `onExtracted` disparar com o documento já "pronto"
- `app/(dashboard)/documents.tsx:1-16` — ecrã ainda placeholder (`TODO: F03`), não importa `DocumentUpload`
- `src/types/documents.ts:1-20` — `DocumentType`, `ExtractedDocumentData` (`document_type`, `provider`, `date`, `amount`, `expiry_date`), `UploadedDocument` (inclui `id`, `file_url`, `created_at` — campos que só existem depois de gravado na BD)
- `supabase/schema.sql:36-64` — tabela `documents` e as 4 policies RLS (select/insert/update/delete, todas `auth.uid() = user_id`)
- `supabase/storage.sql:1-16` — bucket `documents` (privado) e policies RLS de storage por pasta `(storage.foldername(name))[1] = auth.uid()::text` para insert/select/delete
- `src/lib/supabase.ts:12-19` — cliente Supabase único (anon key, sessão persistida em `AsyncStorage`) usado em todo o lado no cliente — é este cliente, já autenticado, que teria permissão RLS para fazer o `insert` final e o `remove()` de limpeza
- `src/components/ui/Input.tsx` e `src/components/ui/Button.tsx` — componentes UI reutilizáveis já existentes para construir o ecrã de preview editável (Input já suporta `label`, `value`, `onChangeText`, `error`, `keyboardType`)
- `src/constants/theme.ts:1-22` — tokens de cor, incluindo `critical: '#A3402E'` (já usado por `DocumentUpload.tsx:104` e `Input.tsx:64,69` para estados de erro) — não consta da tabela de cores do `CLAUDE.md` mas já está definido no ficheiro

## Padrões de Implementação Existentes

Estado actual do fluxo (upload → extracção → gravação num único passo, sem confirmação):

```ts
// src/lib/extraction.ts:16-40
export async function uploadAndExtractDocument({ userId, uri, mimeType, base64 }) {
  const path = `${userId}/${Date.now()}-${filenameFromUri(uri)}`;
  const fileBody = base64 ? decode(base64) : await fetch(uri).then((res) => res.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, fileBody, { contentType: mimeType });
  if (uploadError) throw new Error('Upload failed');

  const { data, error: invokeError } = await supabase.functions.invoke<UploadedDocument>(
    'extract-document',
    { body: { documentPath: path, mimeType } }
  );
  if (invokeError || !data) throw new Error('Extraction failed');
  return data; // já é o registo GRAVADO, devolvido pela Edge Function
}
```

```ts
// supabase/functions/extract-document/index.ts:117-136
const { data: inserted, error: insertError } = await supabaseAuthed
  .from('documents')
  .insert({
    user_id: user.id,
    file_url: documentPath,
    document_type: extracted.document_type,
    provider: extracted.provider,
    date: extracted.date,
    amount: extracted.amount,
    extracted_data: extracted,
  })
  .select()
  .single();
// ...
return new Response(JSON.stringify(inserted), { status: 200, ... });
```

Note-se que a função já usa `supabaseAuthed` (cliente construído com o `Authorization` header do pedido, não o service role) para o `insert` — ou seja, o `insert` já passa pelas policies RLS normais. Isto confirma que o mesmo `insert` pode ser feito directamente do cliente React Native (que usa o mesmo mecanismo de sessão autenticada via `src/lib/supabase.ts`), sem qualquer diferença de permissões.

Padrão de consumo em ecrã (onboarding, a replicar/adaptar em `documents.tsx`):

```tsx
// app/onboarding/step2.tsx:21,23-27
<DocumentUpload onExtracted={(doc) => setUploadedDocument(doc)} />
<Button title="Continue" disabled={!uploadedDocument} onPress={() => router.push('/onboarding/step3')} />
```

## Tabelas/Queries Supabase Relevantes

**`public.documents`** (`supabase/schema.sql:36-64`):
```sql
create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  file_url text not null,
  document_type text,
  provider text,
  date date,
  amount numeric,
  extracted_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "Users can view own documents" on public.documents for select using (auth.uid() = user_id);
create policy "Users can insert own documents" on public.documents for insert with check (auth.uid() = user_id);
create policy "Users can update own documents" on public.documents for update using (auth.uid() = user_id);
create policy "Users can delete own documents" on public.documents for delete using (auth.uid() = user_id);
```
→ o `insert` final (pós-confirmação) e um eventual `delete`/`update` de correcção podem ser feitos directamente do cliente autenticado, sem Edge Function nem service role.

**Storage bucket `documents`** (`supabase/storage.sql`):
```sql
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;

create policy "Users can upload to own folder" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can view own folder" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete own folder" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
```
→ existe já policy de `delete` por pasta de utilizador — o cliente pode chamar `supabase.storage.from('documents').remove([path])` directamente se o utilizador cancelar no preview, sem precisar do service role nem de nova Edge Function.

Não há tabela intermédia de "rascunho"/staging — o path do ficheiro no Storage (`documentPath`) é o único estado partilhado entre a fase de extracção e a fase de gravação enquanto o utilizador ainda não confirmou.

## APIs Externas Relevantes

- **Supabase Storage JS client** (`@supabase/supabase-js@2.109.0`, já na dependência): `.storage.from(bucket).upload()`, `.download()`, `.remove()` — todos usados ou disponíveis para uso directo do cliente autenticado, sujeitos às policies RLS de `storage.objects` acima.
- **Supabase Edge Functions**: `supabase.functions.invoke()` já usado em `src/lib/extraction.ts:32-35`; o padrão actual passa `Authorization` automaticamente (sessão activa do cliente), que é o que a função usa para construir `supabaseAuthed` (`supabase/functions/extract-document/index.ts:41-45`).
- **Anthropic Messages API (Vision)**: `supabase/functions/extract-document/index.ts:81-99` já chama `https://api.anthropic.com/v1/messages` com `model: 'claude-sonnet-5'`, content blocks `{ type: 'image', source: { type: 'base64', ... } }` para fotos e `{ type: 'document', source: { type: 'base64', ... } }` para PDF, chave lida de `Deno.env.get('ANTHROPIC_API_KEY')` (nunca no cliente — cumpre a regra do `CLAUDE.md`). Este research não encontrou necessidade de alterar esta chamada para responder à questão colocada (separação extract/save) — é ortogonal.
- **expo-image-picker (~57.0.17)** e **expo-document-picker (~57.0.2)** — já instalados e usados em `DocumentUpload.tsx` para os 3 métodos de captura (foto, galeria, PDF).

## Code Snippets de Referência

Padrão recomendado (a implementar em `/plan`), com base no que já existe:

1. `extract-document` deixa de fazer `insert`; passa a devolver apenas `extracted` (o `ExtractedDocumentData`) + o `documentPath` recebido, para o cliente saber a que ficheiro do Storage o preview se refere.
2. `uploadAndExtractDocument()` (`src/lib/extraction.ts`) devolve `{ documentPath, mimeType, extracted }` em vez de um `UploadedDocument` já gravado.
3. Novo passo no cliente (ecrã/estado de preview) mostra `extracted` em inputs editáveis (reutilizando `Input.tsx`), com um selector para `document_type`.
4. Ao confirmar: cliente chama `supabase.from('documents').insert({ user_id, file_url: documentPath, ...camposCorrigidos, extracted_data: extracted })` directamente — mesma policy RLS que a Edge Function já usa hoje.
5. Ao cancelar: cliente chama `supabase.storage.from('documents').remove([documentPath])` — mesma policy RLS de delete já existente em `storage.sql`.

## Questões em Aberto

- **Contrato de `DocumentUpload.onExtracted`:** hoje dispara com o documento já gravado (`UploadedDocument`, com `id`/`created_at`). Se a extracção deixar de gravar, o tipo devolvido muda para dados ainda não persistidos (sem `id`). Isto afecta `app/onboarding/step2.tsx:11,21,25`, que guarda `uploadedDocument` em `useOnboarding` e usa a sua presença para activar o botão "Continue" — decidir em `/plan` se o onboarding também passa a exigir confirmação explícita do preview antes do "Continue", ou se mantém um caminho simplificado (auto-confirmar) só para esse fluxo.
- **Onde vive o ecrã/estado de preview:** um componente novo (`components/documents/DocumentPreviewForm.tsx`?) chamado depois de `DocumentUpload`, ou o próprio `DocumentUpload` ganha um modo `previewing` adicional ao seu `Status` actual (`idle | uploading | extracting | done | error`)? A ficha pede reutilização em `documents.tsx`; o onboarding também precisa do mesmo componente — decisão de composição a tomar em `/plan`.
- **Cleanup no cancelamento é obrigatório ou "nice to have" no MVP?** Tecnicamente possível sem nova infraestrutura (policy já existe), mas é trabalho extra vs. aceitar ficheiros órfãos por agora — o ticket já assinala isto como decisão em aberto.
- **"Drag-and-drop (mobile web)"** do pedido original — confirmado no ticket como provável imprecisão face ao `CLAUDE.md` ("Sem web"); este research não encontrou nenhuma infraestrutura web no projecto (sem Next.js, sem ficheiros `.web.tsx`), o que reforça a leitura de que os 3 métodos nativos já implementados (`expo-image-picker`/`expo-document-picker`) cobrem a intenção do pedido.
- **Indicador de progresso de duas fases:** `DocumentUpload.tsx` já tem os estados `uploading`/`extracting` no tipo, mas o JSX (linhas 69-71) usa o mesmo texto para ambos — mudança de UI pequena, não head de arquitectura, mas deve ser incluída no Spec.
