export type AssetCategory = 'electronics' | 'vehicle' | 'appliance' | 'other';

export interface Asset {
  id: string;
  user_id: string;
  name: string;
  category: AssetCategory | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  seller: string | null;
  return_deadline: string | null;
  created_at: string;
}

export interface Maintenance {
  id: string;
  asset_id: string;
  date: string | null;
  description: string | null;
  cost: number | null;
  created_at: string;
}

export type ClaimStatus = 'open' | 'approved' | 'denied' | 'resolved';

export interface Claim {
  id: string;
  asset_id: string;
  coverage_id: string | null;
  date: string | null;
  description: string | null;
  status: ClaimStatus;
  result: string | null;
  created_at: string;
}
