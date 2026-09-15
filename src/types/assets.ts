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
  created_at: string;
}
