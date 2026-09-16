---
data: 2026-09-16
feature: "Emergency Pack (F12)"
status: completo
---

# Research: Emergency Pack (F12)

## Questão de Pesquisa

Como agregar dados de `contracts` (`type='insurance'`) e `coverage` (`type='insurance'`, por `asset_id`) numa secção "Insurance" coerente para o Emergency Pack, que funções `fetchX` já existem para Assets (fora de `src/lib/estate.ts`), e qual a abordagem mínima viável para "partilha controlada" sem mecanismo de acesso real de terceiros (share sheet nativo vs. alternativa), dado o estado actual do F11 (Digital Estate) em produção.

## Sumário

**Assets vive em `src/lib/coverage.ts`, não numa `src/lib/assets.ts` própria** — `fetchAssets`, `createAsset`, `updateAsset`, `deleteAsset`, mais `fetchCoverageForUser`/`fetchCoverageForAsset`, `fetchMaintenanceForAsset`, `fetchClaimsForAsset` estão todos ali. **"Insurance" está hoje espalhado por duas tabelas sem ligação entre si** — `contracts` (type='insurance', por utilizador, sem asset associado) e `coverage` (type='insurance'/'warranty'/'extension', sempre ligado a um `asset_id`) — e **`contracts` não tem nenhuma secção correspondente em `EstateSection`**, o que é o gap mais importante encontrado: o modelo de permissões do F11 (`trusted_person_permissions.section`) nunca foi estendido para cobrir contratos, só cobre `coverage`. Para "partilha controlada" sem mecanismo de acesso real de terceiros, o padrão mínimo viável é gerar o PDF localmente e usar o share sheet nativo (`expo-sharing`, ainda não instalado) — não existe hoje nenhuma biblioteca de PDF/partilha no projecto, nem nenhum precedente de export/share no código.

## Ficheiros Relevantes da Codebase

- `src/lib/coverage.ts` — apesar do nome, é o ficheiro que contém TODO o CRUD de Assets (`fetchAssets:18`, `createAsset:108`, `updateAsset:143`, `deleteAsset:157`), Coverage (`fetchCoverageForAsset:28`, `fetchCoverageForUser:37`, `createCoverage:162`), Maintenance (`fetchMaintenanceForAsset:203`) e Claims (`fetchClaimsForAsset:238`). Não existe `src/lib/assets.ts`.
- `src/lib/contracts.ts` — `fetchContracts(userId):19` devolve todos os contratos do utilizador (inclui `type='insurance'`, mas também `'utility'|'subscription'|'other'`); não tem função dedicada a filtrar só seguros.
- `src/lib/estate.ts` — todo o CRUD do F11: `fetchDigitalAssets:25`, `fetchFinancialAssets:80`, `fetchTrustedPeople:133`, `fetchPermissionsForTrustedPerson:196`, `grantPermission:205`/`revokePermission:215`, `fetchAccessLogForTrustedPerson:226`/`logSimulatedAccess:236`, `fetchEstateInstructions:248`/`upsertEstateInstructions:258`, `fetchEstateDocuments:280` (filtra `documents.is_estate_document = true`), `setDocumentEstateFlag:291`.
- `src/types/estate.ts` — `EstateSection` (linha ~46) é a union fechada usada tanto pelas permissões como pela UI de toggle: `'digital_assets' | 'financial_assets' | 'important_documents' | 'assets' | 'coverage' | 'instructions'`. **Não inclui `'contracts'` nem `'insurance'`.**
- `src/components/estate/PermissionToggleList.tsx` — lista fixa `SECTIONS` (linha 12) que espelha `EstateSection` 1:1, com labels: Digital Assets, Financial Assets, Important Documents, **Warranty Vault** (valor `'assets'`), Coverage, Instructions. É aqui que qualquer secção nova de permissão (ex: para incluir contratos/insurance no Emergency Pack) teria de ser adicionada, em paralelo com o enum TypeScript e o `SECTION_LABEL` de `app/(dashboard)/estate/trusted-people/[id].tsx:31-38`.
- `app/(dashboard)/estate/index.tsx` — padrão de hub com cards por secção + contagem (`Promise.all` de vários `fetchX` em `useFocusEffect`) — bom modelo a replicar no ecrã Emergency Pack para a lista de secções seleccionáveis.
- `app/(dashboard)/estate/trusted-people/[id].tsx` — padrão de ecrã de detalhe com `SECTION_LABEL` (linha 31), toggle de permissões (`PermissionToggleList`) e botão "Log test view" por secção concedida — mesmo padrão de UI que a partilha controlada do Emergency Pack deve seguir (limitar as opções às secções já com permissão).
- `app/(dashboard)/assets/index.tsx` e `app/(dashboard)/coverage.tsx` — ambos importam de `@/lib/coverage`, confirmando que é o ficheiro certo a reaproveitar para Assets/Coverage no agregador do Emergency Pack.
- `src/hooks/useAuth.tsx` — hook padrão `useAuth()` → `{ user, session, loading }`, usado em todos os ecrãs para obter `user.id`.
- `supabase/schema.sql:36-67` — tabela `documents`: `is_estate_document` (via `alter table` mais recente, confirmado em `src/types/documents.ts:32`), `contract_id`, `bill_id`, `asset_id` — liga documentos a cada domínio.
- `supabase/schema.sql:228-238` — tabela `contracts`: `provider`, `provider_normalized` (coluna gerada, lowercase/trim), `type`, `start_date`, `renewal_date`, `current_amount`. RLS directa `auth.uid() = user_id` (padrão simples).
- `supabase/schema.sql:425-593` — todo o bloco de tabelas F11 (`digital_assets`, `financial_assets`, `trusted_people`, `trusted_person_permissions`, `estate_access_log`, `estate_instructions`) com RLS.
- `package.json` — confirma ausência de `expo-print`/`expo-sharing`/`react-native-share`; só `expo-file-system` (~57.0.7) entre libs de ficheiros. Expo SDK 57 confirmado (`expo: ~57.0.21`).

## Padrões de Implementação Existentes

**Padrão de fetch simples (owner-side, filtro directo por `user_id`)** — usar para Digital Assets, Financial Assets, Trusted Contacts, Instructions, Contracts:

```typescript
export async function fetchDigitalAssets(userId: string): Promise<DigitalAsset[]> {
  const { data, error } = await supabase
    .from('digital_assets')
    .select(DIGITAL_ASSET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load digital assets');
  return data ?? [];
}
```
(`src/lib/estate.ts:25`)

**Padrão de fetch sem filtro explícito de `user_id` (confia em RLS via join)** — usado para `coverage`, que não tem `user_id` próprio, só `asset_id`:

```typescript
export async function fetchCoverageForUser(): Promise<CoverageRecord[]> {
  const { data, error } = await supabase.from('coverage').select(COVERAGE_COLUMNS);
  if (error) throw new Error('Could not load coverage');
  return data ?? [];
}
```
(`src/lib/coverage.ts:37`) — a RLS de `coverage` restringe via `exists (select 1 from assets where assets.id = coverage.asset_id and assets.user_id = auth.uid())`, por isso não precisa de `.eq('user_id', ...)`. O agregador do Emergency Pack para "Insurance" deve combinar `fetchContracts(userId).filter(c => c.type === 'insurance')` com `fetchCoverageForUser().filter(c => c.type === 'insurance')`.

**Padrão de hub com contagens por secção (`useFocusEffect` + `Promise.all`)** — o ecrã Emergency Pack deve seguir exactamente este padrão:

```typescript
useFocusEffect(
  useCallback(() => {
    if (!user) return;
    Promise.all([
      fetchDigitalAssets(user.id),
      fetchFinancialAssets(user.id),
      fetchEstateDocuments(user.id),
      fetchTrustedPeople(user.id),
      fetchEstateInstructions(user.id),
    ]).then(([digitalAssets, financialAssets, documents, trustedPeople, instructions]) => {
      setCounts({ ... });
    });
  }, [user])
);
```
(`app/(dashboard)/estate/index.tsx`)

**Padrão de gate de permissão granular (presença de linha = acesso; ausência = sem acesso)**:

```typescript
export async function grantPermission(trustedPersonId: string, section: EstateSection): Promise<TrustedPersonPermission> { ... }
export async function revokePermission(trustedPersonId: string, section: EstateSection): Promise<void> { ... }
```
(`src/lib/estate.ts:205,215`) — o Emergency Pack deve reaproveitar `fetchPermissionsForTrustedPerson(trustedPersonId)` para calcular as secções elegíveis para partilha com uma trusted person específica, filtrando a lista de secções seleccionáveis no ecrã de partilha a exactamente essas.

## Tabelas/Queries Supabase Relevantes

| Secção do Emergency Pack | Tabela(s) | Função `fetchX` existente | Tem `EstateSection` correspondente? |
|---|---|---|---|
| Assets (Warranty Vault) | `assets`, `maintenance`, `claims` | `fetchAssets`, `fetchMaintenanceForAsset`, `fetchClaimsForAsset` (`src/lib/coverage.ts`) | Sim — `'assets'` |
| Important Documents | `documents` (`is_estate_document=true`) | `fetchEstateDocuments` (`src/lib/estate.ts:280`) | Sim — `'important_documents'` |
| Insurance | `coverage` (`type='insurance'`) + `contracts` (`type='insurance'`) | `fetchCoverageForUser` (`src/lib/coverage.ts:37`) + `fetchContracts` (`src/lib/contracts.ts:19`) | **Parcial** — `coverage` tem secção `'coverage'`; `contracts` **não tem nenhuma secção** |
| Properties | `financial_assets` (`type='property'`) | `fetchFinancialAssets` (`src/lib/estate.ts:80`), filtrar no cliente | Indirecto — herda `'financial_assets'` (não há secção própria "properties") |
| Digital Assets | `digital_assets` | `fetchDigitalAssets` (`src/lib/estate.ts:25`) | Sim — `'digital_assets'` |
| Trusted Contacts | `trusted_people` | `fetchTrustedPeople` (`src/lib/estate.ts:133`) | **Não** — não existe secção `'trusted_people'` (decisão a tomar: provavelmente correcto excluir do pacote partilhado, ver ficha) |
| Instructions | `estate_instructions` | `fetchEstateInstructions` (`src/lib/estate.ts:248`) | Sim — `'instructions'` |

**RLS de todas as tabelas envolvidas é owner-side simples** (`auth.uid() = user_id`, directa ou via join), consistente com o resto do schema — nenhuma tabela nova precisa de policy diferente para a geração do pacote em si, só para uma eventual tabela de tracking (`emergency_pack_shares`, sugerida na ficha).

## APIs Externas Relevantes

- **Nenhuma API externa nova é necessária.** O Emergency Pack é composição/formatação de dados já persistidos (`CLAUDE.md` regra #6 — determinístico, sem LLM).
- **`expo-print`** (não instalado) — gera PDF a partir de HTML/JS, API `Print.printToFileAsync({ html })`. Confirmar versão compatível com Expo SDK 57 antes de adicionar a `package.json` (mesmo padrão de versionamento `~57.x.x` das restantes libs Expo já instaladas).
- **`expo-sharing`** (não instalado) — `Sharing.shareAsync(uri)`, share sheet nativo iOS/Android para o ficheiro gerado por `expo-print`. Par natural de `expo-print` (é o padrão oficial Expo para "generate PDF → share it").
- Sem precedente no código actual de uso de nenhuma das duas — será a primeira introdução deste padrão no projecto.

## Code Snippets de Referência

**`EstateSection` (`src/types/estate.ts`)** — a union fechada que gate-keeps tudo o que uma trusted person pode ver, e que não inclui contratos:

```typescript
export type EstateSection =
  | 'digital_assets'
  | 'financial_assets'
  | 'important_documents'
  | 'assets'
  | 'coverage'
  | 'instructions';
```

**Mapeamento de secção → label, duplicado em dois sítios** (`app/(dashboard)/estate/trusted-people/[id].tsx:31` e `src/components/estate/PermissionToggleList.tsx:12`) — qualquer secção nova tem de ser adicionada nos dois sítios (e no enum) em sincronia:

```typescript
const SECTION_LABEL: Record<EstateSection, string> = {
  digital_assets: 'Digital Assets',
  financial_assets: 'Financial Assets',
  important_documents: 'Important Documents',
  assets: 'Warranty Vault',
  coverage: 'Coverage',
  instructions: 'Instructions',
};
```

## Questões em Aberto

1. **`EstateSection` não cobre `contracts`.** Para o Emergency Pack apresentar uma secção "Insurance" única e para a partilha controlada respeitar permissões granulares também para contratos de seguro (não só `coverage` ligado a assets), é preciso decidir em `/plan`: (a) estender `EstateSection` com um novo valor (ex: `'contracts'` ou renomear `'coverage'` para um conceito mais amplo de "Insurance" que englobe ambos) — implica migração de dados de permissões já concedidas e alterar `PermissionToggleList`/`SECTION_LABEL` em dois sítios; ou (b) tratar "Insurance" no pacote como reaproveitando só a secção `'coverage'` já existente, mostrando contratos de seguro apenas na vista do dono (nunca partilhados), o que é mais simples mas incompleto face ao pedido original ("insurance" como categoria a incluir no export).
2. **Trusted Contacts dentro do próprio pacote partilhado** — faz sentido incluir a lista de trusted people no pacote entregue a UMA trusted person específica? Arriscar expor outras trusted people a alguém que já é uma delas. Não há `EstateSection` para isto, o que sugere que a intenção original do F11 já era não partilhar esta secção — mas fica por confirmar em `/plan`.
3. **Properties sem tabela própria** — `financial_assets.type='property'` não tem morada/área/valor. Confirmar em `/plan` se isto é aceitável para esta fase ou se justifica campos adicionais em `financial_assets` (ex: `address text`) antes de aparecer no pacote como secção "Properties" autónoma.
4. **Mecanismo de partilha real** — confirma-se que não há nenhum precedente de share/export no código; a abordagem mínima viável é `expo-print` + `expo-sharing` (share sheet nativo), sem portal/link Zelanna. Isto está alinhado com a limitação já conhecida do F11 (accesso real de trusted people não implementado, `estate_access_log` só populado manualmente via `logSimulatedAccess`).
5. **Onde regista o "last shared"/"last regenerated"** — não existe hoje nenhuma tabela de tracking de exports. Decidir em `/plan` se compensa criar `emergency_pack_shares` (proposta na ficha) já nesta fase ou se fica para uma iteração posterior, dado que o MVP core (gerar + exportar) não depende disto.
