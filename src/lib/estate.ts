import { supabase } from '@/lib/supabase';
import type {
  DigitalAsset,
  DigitalAssetType,
  EstateAccessLogEntry,
  EstateInstructions,
  EstateSection,
  FinancialAsset,
  FinancialAssetType,
  TrustedPerson,
  TrustedPersonPermission,
  TrustedPersonStatus,
} from '@/types/estate';
import type { UploadedDocument } from '@/types/documents';

const DIGITAL_ASSET_COLUMNS = 'id, user_id, name, type, location, credentials_location, notes, created_at';
const FINANCIAL_ASSET_COLUMNS = 'id, user_id, name, type, institution, notes, created_at';
const TRUSTED_PERSON_COLUMNS = 'id, user_id, name, relationship, email, phone, status, created_at';
const PERMISSION_COLUMNS = 'id, trusted_person_id, section, created_at';
const ACCESS_LOG_COLUMNS = 'id, trusted_person_id, section, accessed_at';
const INSTRUCTIONS_COLUMNS = 'user_id, content, updated_at';

// Digital assets

export async function fetchDigitalAssets(userId: string): Promise<DigitalAsset[]> {
  const { data, error } = await supabase
    .from('digital_assets')
    .select(DIGITAL_ASSET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load digital assets');
  return data ?? [];
}

export async function createDigitalAsset(params: {
  userId: string;
  name: string;
  type: DigitalAssetType | null;
  location: string | null;
  credentialsLocation: string | null;
  notes: string | null;
}): Promise<DigitalAsset> {
  const { data, error } = await supabase
    .from('digital_assets')
    .insert({
      user_id: params.userId,
      name: params.name,
      type: params.type,
      location: params.location,
      credentials_location: params.credentialsLocation,
      notes: params.notes,
    })
    .select(DIGITAL_ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create digital asset');
  return data;
}

export async function updateDigitalAsset(
  id: string,
  params: Partial<Omit<DigitalAsset, 'id' | 'user_id' | 'created_at'>>
): Promise<DigitalAsset> {
  const { data, error } = await supabase
    .from('digital_assets')
    .update(params)
    .eq('id', id)
    .select(DIGITAL_ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update digital asset');
  return data;
}

export async function deleteDigitalAsset(id: string): Promise<void> {
  const { error } = await supabase.from('digital_assets').delete().eq('id', id);
  if (error) throw new Error('Could not delete digital asset');
}

// Financial assets

export async function fetchFinancialAssets(userId: string): Promise<FinancialAsset[]> {
  const { data, error } = await supabase
    .from('financial_assets')
    .select(FINANCIAL_ASSET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load financial assets');
  return data ?? [];
}

export async function createFinancialAsset(params: {
  userId: string;
  name: string;
  type: FinancialAssetType | null;
  institution: string | null;
  notes: string | null;
}): Promise<FinancialAsset> {
  const { data, error } = await supabase
    .from('financial_assets')
    .insert({
      user_id: params.userId,
      name: params.name,
      type: params.type,
      institution: params.institution,
      notes: params.notes,
    })
    .select(FINANCIAL_ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create financial asset');
  return data;
}

export async function updateFinancialAsset(
  id: string,
  params: Partial<Omit<FinancialAsset, 'id' | 'user_id' | 'created_at'>>
): Promise<FinancialAsset> {
  const { data, error } = await supabase
    .from('financial_assets')
    .update(params)
    .eq('id', id)
    .select(FINANCIAL_ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update financial asset');
  return data;
}

export async function deleteFinancialAsset(id: string): Promise<void> {
  const { error } = await supabase.from('financial_assets').delete().eq('id', id);
  if (error) throw new Error('Could not delete financial asset');
}

// Trusted people

export async function fetchTrustedPeople(userId: string): Promise<TrustedPerson[]> {
  const { data, error } = await supabase
    .from('trusted_people')
    .select(TRUSTED_PERSON_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load trusted people');
  return data ?? [];
}

export async function fetchTrustedPersonById(id: string): Promise<TrustedPerson | null> {
  const { data, error } = await supabase
    .from('trusted_people')
    .select(TRUSTED_PERSON_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Could not load trusted person');
  return data;
}

export async function createTrustedPerson(params: {
  userId: string;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
}): Promise<TrustedPerson> {
  const { data, error } = await supabase
    .from('trusted_people')
    .insert({
      user_id: params.userId,
      name: params.name,
      relationship: params.relationship,
      email: params.email,
      phone: params.phone,
    })
    .select(TRUSTED_PERSON_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create trusted person');
  return data;
}

export async function updateTrustedPerson(
  id: string,
  params: Partial<{ name: string; relationship: string | null; email: string | null; phone: string | null; status: TrustedPersonStatus }>
): Promise<TrustedPerson> {
  const { data, error } = await supabase
    .from('trusted_people')
    .update(params)
    .eq('id', id)
    .select(TRUSTED_PERSON_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update trusted person');
  return data;
}

export async function deleteTrustedPerson(id: string): Promise<void> {
  const { error } = await supabase.from('trusted_people').delete().eq('id', id);
  if (error) throw new Error('Could not delete trusted person');
}

// Permissions — presença de linha = acesso concedido; ausência = sem acesso.

export async function fetchPermissionsForTrustedPerson(trustedPersonId: string): Promise<TrustedPersonPermission[]> {
  const { data, error } = await supabase
    .from('trusted_person_permissions')
    .select(PERMISSION_COLUMNS)
    .eq('trusted_person_id', trustedPersonId);
  if (error) throw new Error('Could not load permissions');
  return data ?? [];
}

export async function grantPermission(trustedPersonId: string, section: EstateSection): Promise<TrustedPersonPermission> {
  const { data, error } = await supabase
    .from('trusted_person_permissions')
    .insert({ trusted_person_id: trustedPersonId, section })
    .select(PERMISSION_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not grant permission');
  return data;
}

export async function revokePermission(trustedPersonId: string, section: EstateSection): Promise<void> {
  const { error } = await supabase
    .from('trusted_person_permissions')
    .delete()
    .eq('trusted_person_id', trustedPersonId)
    .eq('section', section);
  if (error) throw new Error('Could not revoke permission');
}

// Access log — populado manualmente/simulado nesta fase (ver Decisões tomadas #2)

export async function fetchAccessLogForTrustedPerson(trustedPersonId: string): Promise<EstateAccessLogEntry[]> {
  const { data, error } = await supabase
    .from('estate_access_log')
    .select(ACCESS_LOG_COLUMNS)
    .eq('trusted_person_id', trustedPersonId)
    .order('accessed_at', { ascending: false });
  if (error) throw new Error('Could not load access log');
  return data ?? [];
}

export async function logSimulatedAccess(trustedPersonId: string, section: EstateSection): Promise<EstateAccessLogEntry> {
  const { data, error } = await supabase
    .from('estate_access_log')
    .insert({ trusted_person_id: trustedPersonId, section })
    .select(ACCESS_LOG_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not log access');
  return data;
}

// Instructions

export async function fetchEstateInstructions(userId: string): Promise<EstateInstructions | null> {
  const { data, error } = await supabase
    .from('estate_instructions')
    .select(INSTRUCTIONS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Could not load instructions');
  return data;
}

export async function upsertEstateInstructions(userId: string, content: string): Promise<EstateInstructions> {
  const { data, error } = await supabase
    .from('estate_instructions')
    .upsert({ user_id: userId, content, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select(INSTRUCTIONS_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save instructions');
  return data;
}

// Important documents — reaproveita a tabela documents já existente

export async function fetchAllDocuments(userId: string): Promise<UploadedDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load documents');
  return data ?? [];
}

export async function fetchEstateDocuments(userId: string): Promise<UploadedDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('is_estate_document', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load estate documents');
  return data ?? [];
}

export async function setDocumentEstateFlag(documentId: string, isEstateDocument: boolean): Promise<UploadedDocument> {
  const { data, error } = await supabase
    .from('documents')
    .update({ is_estate_document: isEstateDocument })
    .eq('id', documentId)
    .select('*')
    .single();
  if (error || !data) throw new Error('Could not update document');
  return data;
}
