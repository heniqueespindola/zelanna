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
