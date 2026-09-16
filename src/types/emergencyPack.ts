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
