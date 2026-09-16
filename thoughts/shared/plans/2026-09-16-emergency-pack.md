---
data: 2026-09-16
feature: "Emergency Pack (F12)"
research: "thoughts/shared/research/2026-09-16-emergency-pack.md"
status: completo
---

# Spec: Emergency Pack (F12)

## Visão Geral

Um único ecrã novo (`app/(dashboard)/estate/emergency-pack/`) agrega dados já persistidos (Assets, Important Documents, Insurance, Properties, Digital Assets, Instructions) num pacote estruturado exportável como PDF (`expo-print` + `expo-sharing`, share sheet nativo). O mesmo ecrã serve dois modos: **pessoal** (o dono vê tudo) e **partilha com uma trusted person** (toggles limitados às secções já permitidas em `trusted_person_permissions`). Sem tabela nova, sem migração SQL, sem LLM — só agregação e formatação determinística de dados já existentes.

## Decisões tomadas nesta spec

Todas as questões em aberto do research foram decididas (confirmadas pelo utilizador em `/plan`):

1. **`EstateSection` estende-se com `'contracts'`** (novo valor de enum TypeScript). A coluna `trusted_person_permissions.section` é `text` sem `CHECK` constraint (`supabase/schema.sql:514`) — **não há migração SQL a fazer**, só o ficheiro de tipos e os dois sítios de UI que espelham o enum.
2. **Ecrã único, não dois.** Em vez de uma rota separada para "o meu pacote" e outra para "partilhar com X", há uma única rota `app/(dashboard)/estate/emergency-pack/index.tsx` com um selector "Share with" opcional: sem pessoa seleccionada = modo pessoal (todas as secções disponíveis); com pessoa seleccionada = toggles restritos às secções permitidas para essa pessoa. Reduz duplicação de lógica de fetch/preview/export.
3. **"Insurance" (secção do pacote) requer AMBAS as permissões `coverage` E `contracts`** quando partilhado com uma trusted person — porque a secção mistura duas tabelas (`coverage` ligado a assets + `contracts` tipo seguro standalone) sob um único toggle. Não existe partilha "parcial" de Insurance nesta fase: se faltar uma das duas permissões, o toggle "Insurance" fica indisponível para essa pessoa.
4. **"Properties" (secção do pacote) reaproveita a permissão `financial_assets` já existente** — não é preciso nenhum `EstateSection` novo, porque Properties é sempre um subconjunto filtrado (`type = 'property'`) de `financial_assets`, e conceptualmente já é gerido pela mesma permissão.
5. **Trusted Contacts nunca entra no pacote partilhado** — não existe `EmergencyPackSection` para isto; a lista de trusted people só é visível para o próprio dono nas secções `estate/trusted-people`, nunca exportada/partilhada.
6. **Sem tabela de tracking (`emergency_pack_shares`).** "Regenerate" = re-executar o fetch e reconstruir o preview a partir do estado actual; não há cache nem "last shared" persistido nesta fase. Os dados são sempre buscados de novo em cada `useFocusEffect` do ecrã.
7. **Nenhuma secção vem pré-seleccionada** (`selectedSections` começa vazio `[]`), nos dois modos — replica a regra do F11 de nunca assumir acesso/inclusão total por defeito.
8. **Fontes Avenir/Lato no PDF são "best-effort"** — o HTML do `expo-print` referencia `'Avenir'`/`'Lato'` com fallback `sans-serif`; não embebe ficheiros de fonte via `@font-face`/base64 nesta fase (fora de escopo, feature já é `prioridade: baixa`).
9. **`fetchEmergencyPackData` busca sempre todas as fontes de dados**, independentemente de quais secções o utilizador vai seleccionar — simplifica o hook (uma chamada em vez de fetch condicional por toggle) e o custo é irrelevante à escala de um único utilizador. Também é necessário para o lookup de nome do asset nas linhas de `coverage` da secção Insurance.

---

## Ficheiros a Criar

### `src/types/emergencyPack.ts`

**Propósito:** tipos do agregador do Emergency Pack — não reutiliza `EstateSection` directamente porque as secções do pacote não têm correspondência 1:1 com as permissões (ver decisões #3, #4).

**Conteúdo:**
```typescript
import type { Asset, Claim, Maintenance } from './assets';
import type { CoverageRecord } from './coverage';
import type { Contract } from './contracts';
import type { DigitalAsset, EstateInstructions, FinancialAsset } from './estate';
import type { UploadedDocument } from './documents';

export type EmergencyPackSection =
  | 'assets'
  | 'important_documents'
  | 'insurance'
  | 'properties'
  | 'digital_assets'
  | 'instructions';

export interface EmergencyPackAssetEntry {
  asset: Asset;
  maintenance: Maintenance[];
  claims: Claim[];
}

export interface EmergencyPackInsuranceData {
  coverage: CoverageRecord[];
  contracts: Contract[];
}

export interface EmergencyPackData {
  assets: EmergencyPackAssetEntry[];
  assetNamesById: Record<string, string>;
  important_documents: UploadedDocument[];
  insurance: EmergencyPackInsuranceData;
  properties: FinancialAsset[];
  digital_assets: DigitalAsset[];
  instructions: EstateInstructions | null;
}
```

### `src/lib/emergencyPack.ts`

**Propósito:** agregação determinística dos dados (reaproveita `fetchX` de `src/lib/coverage.ts`, `src/lib/contracts.ts`, `src/lib/estate.ts` — não duplica nenhuma query) e cálculo de secções permitidas por trusted person.

**Conteúdo:**
```typescript
import { fetchAssets, fetchClaimsForAsset, fetchCoverageForUser, fetchMaintenanceForAsset } from '@/lib/coverage';
import { fetchContracts } from '@/lib/contracts';
import {
  fetchDigitalAssets,
  fetchEstateDocuments,
  fetchEstateInstructions,
  fetchFinancialAssets,
  fetchPermissionsForTrustedPerson,
} from '@/lib/estate';
import type { EstateSection } from '@/types/estate';
import type { EmergencyPackData, EmergencyPackSection } from '@/types/emergencyPack';

export const EMERGENCY_PACK_SECTIONS: EmergencyPackSection[] = [
  'assets',
  'important_documents',
  'insurance',
  'properties',
  'digital_assets',
  'instructions',
];

const SECTION_REQUIRED_PERMISSIONS: Record<EmergencyPackSection, EstateSection[]> = {
  assets: ['assets'],
  important_documents: ['important_documents'],
  insurance: ['coverage', 'contracts'],
  properties: ['financial_assets'],
  digital_assets: ['digital_assets'],
  instructions: ['instructions'],
};

export async function fetchEmergencyPackData(userId: string): Promise<EmergencyPackData> {
  const [assets, documents, coverage, contracts, financialAssets, digitalAssets, instructions] = await Promise.all([
    fetchAssets(userId),
    fetchEstateDocuments(userId),
    fetchCoverageForUser(),
    fetchContracts(userId),
    fetchFinancialAssets(userId),
    fetchDigitalAssets(userId),
    fetchEstateInstructions(userId),
  ]);

  const assetEntries = await Promise.all(
    assets.map(async (asset) => ({
      asset,
      maintenance: await fetchMaintenanceForAsset(asset.id),
      claims: await fetchClaimsForAsset(asset.id),
    }))
  );

  return {
    assets: assetEntries,
    assetNamesById: Object.fromEntries(assets.map((a) => [a.id, a.name])),
    important_documents: documents,
    insurance: {
      coverage: coverage.filter((c) => c.type === 'insurance'),
      contracts: contracts.filter((c) => c.type === 'insurance'),
    },
    properties: financialAssets.filter((f) => f.type === 'property'),
    digital_assets: digitalAssets,
    instructions,
  };
}

export function countForSection(data: EmergencyPackData, section: EmergencyPackSection): number {
  switch (section) {
    case 'assets': return data.assets.length;
    case 'important_documents': return data.important_documents.length;
    case 'insurance': return data.insurance.coverage.length + data.insurance.contracts.length;
    case 'properties': return data.properties.length;
    case 'digital_assets': return data.digital_assets.length;
    case 'instructions': return data.instructions?.content.trim() ? 1 : 0;
  }
}

export async function fetchPermittedPackSections(trustedPersonId: string): Promise<EmergencyPackSection[]> {
  const permissions = await fetchPermissionsForTrustedPerson(trustedPersonId);
  const granted = new Set(permissions.map((p) => p.section));
  return EMERGENCY_PACK_SECTIONS.filter((section) =>
    SECTION_REQUIRED_PERMISSIONS[section].every((required) => granted.has(required))
  );
}
```

**Nota:** `fetchClaimsForAsset`/`fetchMaintenanceForAsset` dentro de `assets.map(async ...)` corre em paralelo (não sequencial) porque `Array.prototype.map` dispara todas as promises antes do `Promise.all` implícito do `await Promise.all(...)` externo — mantém o padrão N+1 já usado nos ecrãs existentes de assets, aceitável à escala de dados de um único utilizador.

### `src/lib/emergencyPackPdf.ts`

**Propósito:** construção do HTML (tema Zelanna) e geração/partilha do PDF via `expo-print`/`expo-sharing`. Escapa todo o texto vindo de dados do utilizador antes de o injectar no HTML (provider, notes, name, etc. são texto livre — sem escaping o PDF gerado localmente pode ter HTML quebrado ou, no limite, ser usado para injectar markup arbitrário no documento exportado).

**Conteúdo:**
```typescript
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors } from '@/constants/theme';
import type { EmergencyPackData, EmergencyPackSection } from '@/types/emergencyPack';

const SECTION_LABEL: Record<EmergencyPackSection, string> = {
  assets: 'Assets',
  important_documents: 'Important Documents',
  insurance: 'Insurance',
  properties: 'Properties',
  digital_assets: 'Digital Assets',
  instructions: 'Instructions',
};

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTable(rows: string[][], headers: string[]): string {
  if (rows.length === 0) return '<p class="empty">No records.</p>';
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
  return `<table>${head}${body}</table>`;
}

function renderSection(section: EmergencyPackSection, data: EmergencyPackData): string {
  switch (section) {
    case 'assets':
      return data.assets
        .map((entry) => {
          const a = entry.asset;
          const header = `<h3>${escapeHtml(a.name)}</h3><p class="meta">${escapeHtml(a.category)} · ${escapeHtml(a.brand)} ${escapeHtml(a.model)} · SN ${escapeHtml(a.serial_number)}</p><p class="meta">Purchased ${escapeHtml(a.purchase_date)} for ${escapeHtml(a.purchase_price)} from ${escapeHtml(a.seller)} · Return deadline ${escapeHtml(a.return_deadline)}</p>`;
          const maintenance = renderTable(
            entry.maintenance.map((m) => [escapeHtml(m.date), escapeHtml(m.description), escapeHtml(m.cost)]),
            ['Date', 'Description', 'Cost']
          );
          const claims = renderTable(
            entry.claims.map((c) => [escapeHtml(c.date), escapeHtml(c.description), escapeHtml(c.status), escapeHtml(c.result)]),
            ['Date', 'Description', 'Status', 'Result']
          );
          return `${header}<p class="subhead">Maintenance</p>${maintenance}<p class="subhead">Claims</p>${claims}`;
        })
        .join('<hr/>');
    case 'important_documents':
      return renderTable(
        data.important_documents.map((d) => [escapeHtml(d.provider), escapeHtml(d.document_type), escapeHtml(d.date), escapeHtml(d.amount)]),
        ['Provider', 'Type', 'Date', 'Amount']
      );
    case 'insurance': {
      const coverageTable = renderTable(
        data.insurance.coverage.map((c) => [
          escapeHtml(data.assetNamesById[c.asset_id] ?? c.asset_id),
          escapeHtml(c.type),
          escapeHtml(c.provider),
          escapeHtml(c.start_date),
          escapeHtml(c.end_date),
        ]),
        ['Asset', 'Type', 'Provider', 'Start', 'End']
      );
      const contractsTable = renderTable(
        data.insurance.contracts.map((c) => [escapeHtml(c.provider), escapeHtml(c.start_date), escapeHtml(c.renewal_date), escapeHtml(c.current_amount)]),
        ['Provider', 'Start', 'Renewal', 'Amount']
      );
      return `<p class="subhead">Coverage linked to assets</p>${coverageTable}<p class="subhead">Insurance contracts</p>${contractsTable}`;
    }
    case 'properties':
      return renderTable(
        data.properties.map((p) => [escapeHtml(p.name), escapeHtml(p.institution), escapeHtml(p.notes)]),
        ['Name', 'Institution', 'Notes']
      );
    case 'digital_assets':
      return renderTable(
        data.digital_assets.map((d) => [escapeHtml(d.name), escapeHtml(d.type), escapeHtml(d.location), escapeHtml(d.credentials_location)]),
        ['Name', 'Type', 'Location', 'Credentials location']
      );
    case 'instructions':
      return `<p>${escapeHtml(data.instructions?.content ?? 'No instructions written.')}</p>`;
  }
}

export function buildEmergencyPackHtml(data: EmergencyPackData, sections: EmergencyPackSection[], ownerName: string): string {
  const body = sections.map((s) => `<h2>${escapeHtml(SECTION_LABEL[s])}</h2>${renderSection(s, data)}`).join('');
  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      body { font-family: 'Lato', 'Helvetica Neue', sans-serif; background: ${colors.bgLight}; color: ${colors.black}; padding: 24px; }
      h1 { font-family: 'Avenir', 'Helvetica Neue', sans-serif; color: ${colors.primary}; }
      h2 { font-family: 'Avenir', 'Helvetica Neue', sans-serif; color: ${colors.primary}; border-bottom: 2px solid ${colors.accent}; padding-bottom: 4px; margin-top: 28px; }
      h3 { font-size: 15px; margin-bottom: 2px; }
      .meta, .empty { font-size: 12px; color: ${colors.surfaceAlt}; }
      .subhead { font-weight: 700; font-size: 13px; margin-top: 10px; margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
      th, td { padding: 6px 8px; border-bottom: 1px solid ${colors.border}; text-align: left; font-size: 12px; }
      hr { border: none; border-top: 1px solid ${colors.border}; margin: 16px 0; }
    </style>
  </head><body>
    <h1>Zelanna Emergency Pack</h1>
    <p class="meta">Generated for ${escapeHtml(ownerName)} on ${new Date().toLocaleDateString()}</p>
    ${body}
  </body></html>`;
}

export async function generateEmergencyPackPdf(html: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

export async function shareEmergencyPackPdf(uri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
```

### `src/components/estate/EmergencyPackSectionList.tsx`

**Propósito:** lista de toggles do pacote com contagem por secção, seguindo visualmente `PermissionToggleList` mas com `Badge` de contagem em vez de "Shared"/"No access", e greying-out de secções não permitidas quando há uma trusted person seleccionada.

**Conteúdo:**
```typescript
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import type { EmergencyPackData, EmergencyPackSection } from '@/types/emergencyPack';
import { EMERGENCY_PACK_SECTIONS, countForSection } from '@/lib/emergencyPack';

const SECTION_LABEL: Record<EmergencyPackSection, string> = {
  assets: 'Assets',
  important_documents: 'Important Documents',
  insurance: 'Insurance',
  properties: 'Properties',
  digital_assets: 'Digital Assets',
  instructions: 'Instructions',
};

interface Props {
  data: EmergencyPackData;
  selected: EmergencyPackSection[];
  permitted: EmergencyPackSection[] | null; // null = sem restrição (modo pessoal)
  onToggle: (section: EmergencyPackSection) => void;
}

export function EmergencyPackSectionList({ data, selected, permitted, onToggle }: Props) {
  return (
    <View style={styles.list}>
      {EMERGENCY_PACK_SECTIONS.map((section) => {
        const isSelected = selected.includes(section);
        const isAllowed = permitted === null || permitted.includes(section);
        const count = countForSection(data, section);
        return (
          <Pressable
            key={section}
            style={[styles.row, !isAllowed && styles.rowDisabled]}
            onPress={() => isAllowed && onToggle(section)}
          >
            <View>
              <Text style={styles.label}>{SECTION_LABEL[section]}</Text>
              {!isAllowed ? <Text style={styles.noPermission}>No permission granted for this person</Text> : null}
            </View>
            <Badge label={isSelected ? `${count} included` : `${count} available`} tone={isSelected ? 'success' : 'info'} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowDisabled: { opacity: 0.4 },
  label: { fontFamily: fonts.body, fontSize: 15, color: colors.white },
  noPermission: { fontFamily: fonts.body, fontSize: 12, color: colors.border, marginTop: 2 },
});
```

### `src/components/estate/EmergencyPackTrustedPersonPicker.tsx`

**Propósito:** chips horizontais "Just for me" + uma por trusted person activa, para alternar o modo pessoal/partilha.

**Conteúdo:**
```typescript
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { TrustedPerson } from '@/types/estate';

interface Props {
  people: TrustedPerson[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function EmergencyPackTrustedPersonPicker({ people, selectedId, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Pressable style={[styles.chip, selectedId === null && styles.chipActive]} onPress={() => onSelect(null)}>
        <Text style={styles.chipText}>Just for me</Text>
      </Pressable>
      {people.map((person) => (
        <Pressable
          key={person.id}
          style={[styles.chip, selectedId === person.id && styles.chipActive]}
          onPress={() => onSelect(person.id)}
        >
          <Text style={styles.chipText}>{person.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontFamily: fonts.body, color: colors.white, fontWeight: '600' },
});
```

### `app/(dashboard)/estate/emergency-pack/_layout.tsx`

**Propósito:** Stack layout, cópia exacta do padrão de `app/(dashboard)/estate/trusted-people/_layout.tsx`.

**Conteúdo:**
```typescript
import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function EmergencyPackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgDarkest },
      }}
    />
  );
}
```

### `app/(dashboard)/estate/emergency-pack/index.tsx`

**Propósito:** ecrã único — selector de trusted person, toggles de secção, preview textual, export.

**Conteúdo (estrutura, não código completo — implementar seguindo os padrões de `app/(dashboard)/estate/index.tsx` e `trusted-people/[id].tsx`):**
- `useLocalSearchParams<{ trustedPersonId?: string }>()` — se presente, inicializa `selectedTrustedPersonId` com este valor (entrada vinda de "Share Emergency Pack" no detalhe da trusted person).
- Estado: `user` (via `useAuth`), `people: TrustedPerson[]`, `data: EmergencyPackData | null`, `selectedTrustedPersonId: string | null`, `permitted: EmergencyPackSection[] | null`, `selectedSections: EmergencyPackSection[]` (inicial `[]`), `previewOpen: boolean`, `exporting: boolean`.
- `refresh()` (chamado em `useFocusEffect`, é também a acção "Regenerate"): `Promise.all([fetchTrustedPeople(user.id).then(p => p.filter(x => x.status === 'active')), fetchEmergencyPackData(user.id)])` → `setPeople`, `setData`. Se `selectedTrustedPersonId` estiver definido, chama também `fetchPermittedPackSections(selectedTrustedPersonId)` → `setPermitted` e filtra `selectedSections` para a intersecção com o resultado (remove secções que deixaram de ser permitidas — implementa o AC "secção revogada desaparece do pacote nessa regeneração").
- `handleSelectPerson(id: string | null)`: `setSelectedTrustedPersonId(id)`; se `id` não nulo, `fetchPermittedPackSections(id)` → `setPermitted` + filtra `selectedSections`; se `id` nulo, `setPermitted(null)` (sem filtrar `selectedSections`, modo pessoal permite tudo).
- `handleToggle(section)`: ignora se `permitted !== null && !permitted.includes(section)`; caso contrário adiciona/remove de `selectedSections`.
- `handleExport()`: guarda `exporting=true`; `const ownerName = user.email ?? 'Zelanna user'`; `const html = buildEmergencyPackHtml(data, selectedSections, ownerName)`; `const uri = await generateEmergencyPackPdf(html)`; `await shareEmergencyPackPdf(uri)`; `try/catch` com `Alert.alert('Could not export', error.message)`; `finally setExporting(false)`.
- Render: título "Emergency Pack", subtítulo, `EmergencyPackTrustedPersonPicker`, `EmergencyPackSectionList`, botão "Regenerate" (`variant="primary"`, chama `refresh()`), botão "Preview" (`variant="primary"`, toggla `previewOpen`; quando aberto mostra uma lista simples de `selectedSections.map(s => Text: label + count)` abaixo — pré-visualização "estruturada" mínima, sem reimplementar o HTML completo), botão "Export PDF" (`variant="accent"`, `disabled={selectedSections.length === 0 || exporting}`, `loading={exporting}`).
- Se `data === null || !user`: `<Text>Loading…</Text>`.

## Ficheiros a Modificar

### `src/types/estate.ts`

- [ ] Linha 54-60: estender a union `EstateSection` com `'contracts'`:
  ```typescript
  export type EstateSection =
    | 'digital_assets'
    | 'financial_assets'
    | 'important_documents'
    | 'assets'
    | 'coverage'
    | 'contracts'
    | 'instructions';
  ```

### `src/components/estate/PermissionToggleList.tsx`

- [ ] Linha 13-20: adicionar entrada ao array `SECTIONS`, imediatamente a seguir a `coverage` (mantém o agrupamento "seguros" visualmente contíguo):
  ```typescript
  { value: 'contracts', label: 'Insurance Contracts' },
  ```

### `app/(dashboard)/estate/trusted-people/[id].tsx`

- [ ] Linha 30-37: adicionar `contracts: 'Insurance Contracts'` a `SECTION_LABEL` (mesmo valor de label usado em `PermissionToggleList`, para consistência):
  ```typescript
  const SECTION_LABEL: Record<EstateSection, string> = {
    digital_assets: 'Digital Assets',
    financial_assets: 'Financial Assets',
    important_documents: 'Important Documents',
    assets: 'Warranty Vault',
    coverage: 'Coverage',
    contracts: 'Insurance Contracts',
    instructions: 'Instructions',
  };
  ```
- [ ] Import: adicionar `useRouter` já está importado (linha 3) — reaproveitar.
- [ ] Na secção `Permissions` (depois de `PermissionToggleList`, linha ~140), adicionar um botão "Share Emergency Pack", visível apenas quando `granted.length > 0`:
  ```typescript
  {granted.length > 0 ? (
    <Button
      title="Share Emergency Pack"
      variant="primary"
      onPress={() => router.push(`/estate/emergency-pack?trustedPersonId=${person.id}`)}
    />
  ) : null}
  ```

### `app/(dashboard)/estate/index.tsx`

- [ ] Linha 48-54 (`cards` array): adicionar um card novo antes de `instructions` (ou depois de `trusted_people` — ordem sugerida: Digital Assets, Financial Assets, Important Documents, Trusted People, **Emergency Pack**, Instructions):
  ```typescript
  { key: 'emergency_pack', title: 'Emergency Pack', route: '/estate/emergency-pack', countLabel: 'Export & share' },
  ```
  (Não precisa de contagem calculada — `countLabel` fixo, ao contrário dos outros cards.)

### `package.json`

- [ ] Adicionar `expo-print` e `expo-sharing` a `dependencies`. **Não hardcodar números de versão** — correr `npx expo install expo-print expo-sharing` no terminal, que resolve automaticamente as versões `~57.x.x` compatíveis com o Expo SDK 57 já usado no projecto (mesmo padrão de todas as libs `expo-*` já em `package.json`).

### `supabase/schema.sql`

- [ ] **Nenhuma alteração necessária.** `trusted_person_permissions.section` (linha 514) é `text` sem `CHECK` constraint — o comentário inline na linha 514 pode opcionalmente ser actualizado para incluir `'contracts'` na lista de valores documentados, mas isto é cosmético, não funcional:
  ```sql
  section text not null,   -- 'digital_assets' | 'financial_assets' | 'important_documents' | 'assets' | 'coverage' | 'contracts' | 'instructions'
  ```

---

## Fases de Implementação

### Fase 1: Tipos + permissão `contracts` — desbloqueia tudo o resto
**Ficheiros:**
- Modificar `src/types/estate.ts` (enum `EstateSection`)
- Modificar `src/components/estate/PermissionToggleList.tsx`
- Modificar `app/(dashboard)/estate/trusted-people/[id].tsx` (`SECTION_LABEL`)
- Modificar `src/components/estate/AccessLogList.tsx` (`SECTION_LABEL` — não estava na spec original, mas é `Record<EstateSection, string>` e quebra `tsc` sem esta entrada)
- Opcional: comentário em `supabase/schema.sql:514`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros
- [x] `expo lint` passa sem warnings (2 erros pré-existentes em `login.tsx`/`step3.tsx`, não relacionados com esta fase)

**Critérios de sucesso (manuais):**
- [ ] No ecrã de detalhe de uma trusted person, "Insurance Contracts" aparece na lista de permissões e pode ser concedido/revogado (toggle funciona, persiste após reload)

### Fase 2: Instalar dependências + agregador de dados
**Ficheiros:**
- `npx expo install expo-print expo-sharing`
- Criar `src/types/emergencyPack.ts`
- Criar `src/lib/emergencyPack.ts`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros
- [x] `package.json` tem `expo-print` (`~57.0.2`) e `expo-sharing` (`~57.0.20`)

**Critérios de sucesso (manuais):**
- [x] `expo-doctor` — 19/21 checks passam; as 2 falhas (drift de patch version em `expo`/`expo-image-picker`/`expo-router`/`expo-secure-store`/`expo-splash-screen`, e o aviso de app config fields por causa das pastas nativas) são pré-existentes e não mencionam `expo-print`/`expo-sharing` — confirmado por `git diff package.json`, que só acrescenta as duas dependências novas nas versões correctas

### Fase 3: Geração de HTML/PDF
**Ficheiros:**
- Criar `src/lib/emergencyPackPdf.ts`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros

**Critérios de sucesso (manuais):**
- [x] Chamar `buildEmergencyPackHtml` manualmente (ex: num teste ad-hoc no simulador) com dados de um utilizador com pelo menos 1 asset, 1 documento, 1 coverage, 1 contrato de seguro, 1 financial asset tipo `property`, 1 digital asset e instructions preenchidas — o HTML resultante não deve ter tags por fechar nem texto de utilizador a quebrar a estrutura (testar com um `name`/`notes` que contenha `<`, `>`, `&`, aspas) — verificado via script Node ad-hoc (fora do simulador, já que este ambiente não tem acesso a um) que reimplementa `escapeHtml`/`renderTable`/`buildEmergencyPackHtml` e injecta `<script>`, `<tag>`, `&`, `"`, `'` em todos os campos de texto livre (name, notes, provider, description, content); confirmado que tudo aparece escapado (`&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#39;`) e as tags emitidas pelo próprio template ficam balanceadas

### Fase 4: Componentes de UI
**Ficheiros:**
- Criar `src/components/estate/EmergencyPackSectionList.tsx`
- Criar `src/components/estate/EmergencyPackTrustedPersonPicker.tsx`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros
- [x] Ambos os ficheiros ≤ 150 linhas (61 e 40 linhas)

### Fase 5: Ecrã Emergency Pack + navegação
**Ficheiros:**
- Criar `app/(dashboard)/estate/emergency-pack/_layout.tsx`
- Criar `app/(dashboard)/estate/emergency-pack/index.tsx`
- Modificar `app/(dashboard)/estate/index.tsx` (card novo)
- Modificar `app/(dashboard)/estate/trusted-people/[id].tsx` (botão "Share Emergency Pack")

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros
- [x] `expo lint` passa sem warnings (2 erros pré-existentes em `login.tsx`/`step3.tsx`, não relacionados)

**Critérios de sucesso (manuais):**
- [ ] A partir do hub Digital Estate, o card "Emergency Pack" abre o ecrã novo
- [ ] Modo pessoal ("Just for me"): todas as 6 secções aparecem disponíveis com contagem correcta; nenhuma vem pré-seleccionada
- [ ] Seleccionar 2-3 secções, premir "Export PDF" → share sheet nativo abre com um PDF válido (abrir noutra app confirma conteúdo correcto e organizado por secção)
- [ ] A partir do detalhe de uma trusted person com pelo menos "Coverage" e "Instructions" concedidos (mas não "Insurance Contracts" nem "Financial Assets"): botão "Share Emergency Pack" navega para o ecrã já com essa pessoa seleccionada no picker; secção "Insurance" aparece desactivada/cinzenta (falta `contracts`); "Instructions" está disponível; "Properties" desactivada (falta `financial_assets`)
- [ ] Revogar "Coverage" dessa trusted person, voltar ao ecrã de Emergency Pack (ou premir "Regenerate") → "Insurance" deixa de estar disponível; se estava seleccionada, é automaticamente removida de `selectedSections`
- [ ] Conceder também "Insurance Contracts" a essa pessoa → secção "Insurance" fica disponível após "Regenerate"

**Nota:** estes critérios manuais requerem correr no simulador iOS/Android (este ambiente não tem acesso a um) — pendentes de verificação pelo utilizador.

---

## Estratégia de Testes

- **Unit:** não há suite de testes configurada no projecto (confirmar em `package.json` — não existe script `test`); esta ficha não introduz uma. Validação é via `tsc --noEmit` + `expo lint` + testes manuais no simulador (ver critérios por fase).
- **Manual:** ver critérios de sucesso manuais da Fase 5 — cobre modo pessoal, modo partilha, filtragem por permissão dupla (Insurance), e revogação dinâmica.

## Notas de Implementação

- **Separação cálculo/LLM não se aplica aqui** — o Emergency Pack não introduz nenhum cálculo (percentagens, médias, comparações); é composição/formatação pura de dados já persistidos, conforme `CLAUDE.md` regra #6 e confirmado no research (`## APIs Externas Relevantes`).
- **RLS:** nenhuma tabela nova, nenhuma policy nova. Todas as queries usadas por `fetchEmergencyPackData` já são owner-side (directo por `user_id` ou via join, ver research `## Tabelas/Queries Supabase Relevantes`) — a app nunca lê dados de outro utilizador, mesmo no modo "partilha", porque quem gera o pacote é sempre a sessão autenticada do dono (`auth.uid()`), nunca a trusted person (que continua sem mecanismo de acesso real, herdado do F11).
- **Nunca incluir segredos:** `digital_assets.credentials_location` é intencionalmente incluído no pacote — é um *ponteiro* para onde a credencial está guardada (ex: "Google account — credentials stored in 1Password"), nunca a credencial em si; o campo já respeita a regra do `CLAUDE.md` porque a tabela nunca armazenou segredos reais (ver F11).
- **`expo-print`/`expo-sharing` não têm precedente no código** — primeira introdução deste padrão. Se `expo-doctor` reportar incompatibilidade de versão após `npx expo install`, não fazer downgrade manual — investigar antes de prosseguir.
- **Armadilha a evitar:** não escapar o HTML injectado a partir de `provider`, `name`, `notes`, `content` (texto livre introduzido pelo utilizador ou extraído por Vision LLM) quebra o layout do PDF na melhor hipótese, e permite HTML/markup arbitrário no documento exportado na pior — `escapeHtml` em `src/lib/emergencyPackPdf.ts` é obrigatório em **todo** o texto interpolado, não só nos campos "óbvios".
- **Fora do escopo desta fase** (herdado do ticket): tabela `emergency_pack_shares`/tracking de "last shared"; mecanismo real de acesso da trusted person (magic link/conta própria); export além de PDF (ex: ZIP com documentos originais); notificação automática à trusted person; fonte Avenir/Lato embebida no PDF.

## Referências

- Research: `thoughts/shared/research/2026-09-16-emergency-pack.md`
- Ticket: `thoughts/shared/tickets/2026-09-16-emergency-pack.md`
- Padrão de hub com contagens: `app/(dashboard)/estate/index.tsx`
- Padrão de toggle de permissões: `src/components/estate/PermissionToggleList.tsx`
- Padrão de ecrã de detalhe + permissões: `app/(dashboard)/estate/trusted-people/[id].tsx`
- Padrão de CRUD/fetch reaproveitado: `src/lib/coverage.ts`, `src/lib/contracts.ts`, `src/lib/estate.ts`
