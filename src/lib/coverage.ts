import { supabase } from '@/lib/supabase';
import type { Asset, AssetCategory } from '@/types/assets';
import type { CoverageRecord, CoverageType } from '@/types/coverage';
import type { DocumentType, UploadedDocument } from '@/types/documents';

const ASSET_COLUMNS =
  'id, user_id, name, category, brand, model, serial_number, purchase_date, purchase_price, created_at';
const COVERAGE_COLUMNS = 'id, asset_id, type, provider, start_date, end_date, created_at';

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
