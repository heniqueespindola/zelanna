export type DigitalAssetType =
  | 'domain'
  | 'website'
  | 'social_account'
  | 'youtube'
  | 'online_business'
  | 'digital_ip'
  | 'crypto_account'
  | 'other';

export interface DigitalAsset {
  id: string;
  user_id: string;
  name: string;
  type: DigitalAssetType | null;
  location: string | null;
  credentials_location: string | null;
  notes: string | null;
  created_at: string;
}

export type FinancialAssetType =
  | 'bank'
  | 'investment'
  | 'pension'
  | 'insurance'
  | 'crypto'
  | 'property'
  | 'other';

export interface FinancialAsset {
  id: string;
  user_id: string;
  name: string;
  type: FinancialAssetType | null;
  institution: string | null;
  notes: string | null;
  created_at: string;
}

export type TrustedPersonStatus = 'active' | 'revoked';

export interface TrustedPerson {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  status: TrustedPersonStatus;
  created_at: string;
}

export type EstateSection =
  | 'digital_assets'
  | 'financial_assets'
  | 'important_documents'
  | 'assets'
  | 'coverage'
  | 'instructions';

export interface TrustedPersonPermission {
  id: string;
  trusted_person_id: string;
  section: EstateSection;
  created_at: string;
}

export interface EstateAccessLogEntry {
  id: string;
  trusted_person_id: string;
  section: EstateSection;
  accessed_at: string;
}

export interface EstateInstructions {
  user_id: string;
  content: string;
  updated_at: string;
}
