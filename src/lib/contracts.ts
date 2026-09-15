import { supabase } from '@/lib/supabase';
import type { DocumentType } from '@/types/documents';
import type { Contract, ContractType } from '@/types/contracts';

const CONTRACT_COLUMNS =
  'id, user_id, provider, type, start_date, renewal_date, current_amount, created_at';

export function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

export function mapDocumentTypeToContractType(docType: DocumentType | null): ContractType | null {
  if (docType === 'insurance') return 'insurance';
  if (docType === 'invoice') return 'utility';
  if (docType === 'contract') return 'subscription';
  return null;
}

export async function fetchContracts(userId: string): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load contracts');
  return data ?? [];
}

async function findContractByProvider(userId: string, providerNormalized: string): Promise<Contract | null> {
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('user_id', userId)
    .eq('provider_normalized', providerNormalized)
    .maybeSingle();
  if (error) throw new Error('Could not look up contract');
  return data;
}

export interface ContractMatchResult {
  contract: Contract;
  previousAmount: number | null;
}

export async function matchDocumentToContract(params: {
  userId: string;
  documentId: string;
  documentType: DocumentType | null;
  provider: string | null;
  amount: number | null;
  date: string | null;
  expiryDate: string | null;
}): Promise<ContractMatchResult | null> {
  const contractType = mapDocumentTypeToContractType(params.documentType);
  if (!contractType || !params.provider) return null;

  const providerNormalized = normalizeProvider(params.provider);
  const existing = await findContractByProvider(params.userId, providerNormalized);

  if (!existing) {
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        user_id: params.userId,
        provider: params.provider,
        type: contractType,
        start_date: params.date,
        renewal_date: params.expiryDate,
        current_amount: params.amount,
      })
      .select(CONTRACT_COLUMNS)
      .single();
    if (error || !data) throw new Error('Could not create contract');
    await supabase.from('documents').update({ contract_id: data.id }).eq('id', params.documentId);
    return { contract: data, previousAmount: null };
  }

  const previousAmount = existing.current_amount;
  const { data, error } = await supabase
    .from('contracts')
    .update({
      renewal_date: params.expiryDate ?? existing.renewal_date,
      current_amount: params.amount ?? existing.current_amount,
    })
    .eq('id', existing.id)
    .select(CONTRACT_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update contract');
  await supabase.from('documents').update({ contract_id: data.id }).eq('id', params.documentId);
  return { contract: data, previousAmount };
}
