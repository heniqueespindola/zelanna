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
