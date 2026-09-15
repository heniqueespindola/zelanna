export type CoverageType = 'warranty' | 'insurance' | 'extension';

export interface CoverageRecord {
  id: string;
  asset_id: string;
  type: CoverageType | null;
  provider: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}
