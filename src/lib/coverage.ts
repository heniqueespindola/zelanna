import { supabase } from '@/lib/supabase';
import type { Asset, AssetCategory, Claim, ClaimStatus, Maintenance } from '@/types/assets';
import type { CoverageRecord, CoverageType } from '@/types/coverage';
import type { DocumentType, UploadedDocument } from '@/types/documents';

const ASSET_COLUMNS =
  'id, user_id, name, category, brand, model, serial_number, purchase_date, purchase_price, seller, return_deadline, created_at';
const COVERAGE_COLUMNS = 'id, asset_id, type, provider, start_date, end_date, created_at';
const MAINTENANCE_COLUMNS = 'id, asset_id, date, description, cost, created_at';
const CLAIM_COLUMNS = 'id, asset_id, coverage_id, date, description, status, result, created_at';

export function mapDocumentTypeToCoverageType(docType: DocumentType | null): CoverageType | null {
  if (docType === 'warranty') return 'warranty';
  if (docType === 'insurance') return 'insurance';
  return null;
}

export async function fetchAssets(userId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load assets');
  return data ?? [];
}

export async function fetchCoverageForAsset(assetId: string): Promise<CoverageRecord[]> {
  const { data, error } = await supabase
    .from('coverage')
    .select(COVERAGE_COLUMNS)
    .eq('asset_id', assetId);
  if (error) throw new Error('Could not load coverage');
  return data ?? [];
}

export async function fetchCoverageForUser(): Promise<CoverageRecord[]> {
  const { data, error } = await supabase.from('coverage').select(COVERAGE_COLUMNS);
  if (error) throw new Error('Could not load coverage');
  return data ?? [];
}

export async function fetchDocumentsWithoutAsset(userId: string): Promise<UploadedDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .is('asset_id', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load documents');
  return data ?? [];
}

export async function createAssetFromDocument(params: {
  userId: string;
  documentId: string;
  name: string;
  category: AssetCategory | null;
  coverageType: CoverageType;
  provider: string | null;
  startDate: string | null;
  endDate: string | null;
  purchaseAmount: number | null;
}): Promise<{ asset: Asset; coverage: CoverageRecord }> {
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .insert({
      user_id: params.userId,
      name: params.name,
      category: params.category,
      purchase_date: params.startDate,
      purchase_price: params.purchaseAmount,
    })
    .select(ASSET_COLUMNS)
    .single();
  if (assetError || !asset) throw new Error('Could not create asset');

  const { data: coverage, error: coverageError } = await supabase
    .from('coverage')
    .insert({
      asset_id: asset.id,
      type: params.coverageType,
      provider: params.provider,
      start_date: params.startDate,
      end_date: params.endDate,
    })
    .select(COVERAGE_COLUMNS)
    .single();
  if (coverageError || !coverage) throw new Error('Could not create coverage record');

  await supabase.from('documents').update({ asset_id: asset.id }).eq('id', params.documentId);

  return { asset, coverage };
}

export async function fetchAssetById(assetId: string): Promise<Asset | null> {
  const { data, error } = await supabase.from('assets').select(ASSET_COLUMNS).eq('id', assetId).maybeSingle();
  if (error) throw new Error('Could not load asset');
  return data;
}

export async function fetchDocumentForAsset(assetId: string): Promise<UploadedDocument | null> {
  const { data, error } = await supabase.from('documents').select('*').eq('asset_id', assetId).maybeSingle();
  if (error) throw new Error('Could not load document');
  return data;
}

export async function createAsset(params: {
  userId: string;
  name: string;
  category: AssetCategory | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  seller: string | null;
  returnDeadline: string | null;
}): Promise<Asset> {
  const { data, error } = await supabase
    .from('assets')
    .insert({
      user_id: params.userId,
      name: params.name,
      category: params.category,
      brand: params.brand,
      model: params.model,
      serial_number: params.serialNumber,
      purchase_date: params.purchaseDate,
      purchase_price: params.purchasePrice,
      seller: params.seller,
      return_deadline: params.returnDeadline,
    })
    .select(ASSET_COLUMNS)
    .single();
  if (error || !data) {
    console.error('createAsset error:', error);
    throw new Error('Could not create asset');
  }
  return data;
}

export async function updateAsset(
  assetId: string,
  params: Partial<Omit<Asset, 'id' | 'user_id' | 'created_at'>>
): Promise<Asset> {
  const { data, error } = await supabase
    .from('assets')
    .update(params)
    .eq('id', assetId)
    .select(ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update asset');
  return data;
}

export async function deleteAsset(assetId: string): Promise<void> {
  const { error } = await supabase.from('assets').delete().eq('id', assetId);
  if (error) throw new Error('Could not delete asset');
}

export async function createCoverage(params: {
  assetId: string;
  type: CoverageType;
  provider: string | null;
  startDate: string | null;
  endDate: string | null;
}): Promise<CoverageRecord> {
  const { data, error } = await supabase
    .from('coverage')
    .insert({
      asset_id: params.assetId,
      type: params.type,
      provider: params.provider,
      start_date: params.startDate,
      end_date: params.endDate,
    })
    .select(COVERAGE_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create coverage record');
  return data;
}

export async function updateCoverage(
  coverageId: string,
  params: Partial<{ type: CoverageType; provider: string | null; start_date: string | null; end_date: string | null }>
): Promise<CoverageRecord> {
  const { data, error } = await supabase
    .from('coverage')
    .update(params)
    .eq('id', coverageId)
    .select(COVERAGE_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update coverage record');
  return data;
}

export async function deleteCoverage(coverageId: string): Promise<void> {
  const { error } = await supabase.from('coverage').delete().eq('id', coverageId);
  if (error) throw new Error('Could not delete coverage record');
}

export async function fetchMaintenanceForAsset(assetId: string): Promise<Maintenance[]> {
  const { data, error } = await supabase
    .from('maintenance')
    .select(MAINTENANCE_COLUMNS)
    .eq('asset_id', assetId)
    .order('date', { ascending: false });
  if (error) throw new Error('Could not load maintenance');
  return data ?? [];
}

export async function createMaintenance(params: {
  assetId: string;
  date: string | null;
  description: string | null;
  cost: number | null;
}): Promise<Maintenance> {
  const { data, error } = await supabase
    .from('maintenance')
    .insert({
      asset_id: params.assetId,
      date: params.date,
      description: params.description,
      cost: params.cost,
    })
    .select(MAINTENANCE_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create maintenance record');
  return data;
}

export async function deleteMaintenance(maintenanceId: string): Promise<void> {
  const { error } = await supabase.from('maintenance').delete().eq('id', maintenanceId);
  if (error) throw new Error('Could not delete maintenance record');
}

export async function fetchClaimsForAsset(assetId: string): Promise<Claim[]> {
  const { data, error } = await supabase
    .from('claims')
    .select(CLAIM_COLUMNS)
    .eq('asset_id', assetId)
    .order('date', { ascending: false });
  if (error) throw new Error('Could not load claims');
  return data ?? [];
}

export async function createClaim(params: {
  assetId: string;
  coverageId: string | null;
  date: string | null;
  description: string | null;
  status: ClaimStatus;
}): Promise<Claim> {
  const { data, error } = await supabase
    .from('claims')
    .insert({
      asset_id: params.assetId,
      coverage_id: params.coverageId,
      date: params.date,
      description: params.description,
      status: params.status,
    })
    .select(CLAIM_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create claim');
  return data;
}

export async function updateClaim(
  claimId: string,
  params: Partial<{ status: ClaimStatus; result: string | null }>
): Promise<Claim> {
  const { data, error } = await supabase
    .from('claims')
    .update(params)
    .eq('id', claimId)
    .select(CLAIM_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update claim');
  return data;
}

export async function deleteClaim(claimId: string): Promise<void> {
  const { error } = await supabase.from('claims').delete().eq('id', claimId);
  if (error) throw new Error('Could not delete claim');
}
