import { supabase } from '@/lib/supabase';
import { evaluateCoverage, isExpiringSoon } from '@/lib/rulesEngine';
import { fetchContracts } from '@/lib/contracts';
import { fetchAssets, fetchCoverageForUser } from '@/lib/coverage';
import { RENEWAL_THRESHOLD_DAYS } from '@/lib/insights';
import type { Contract } from '@/types/contracts';
import type { LifeEvent } from '@/types/events';
import type { Asset } from '@/types/assets';
import type { CoverageRecord, CoverageType } from '@/types/coverage';

const EVENT_COLUMNS = 'id, user_id, type, due_date, source_id, created_at';
const BILLS_RELEVANT_CONTRACT_TYPES = ['insurance', 'utility'] as const;
const LIFE_CALENDAR_WINDOW_DAYS = 60;

export async function syncRenewalEvents(userId: string, contracts: Contract[]): Promise<void> {
  const rows = contracts
    .filter((c) => c.renewal_date !== null)
    .map((c) => ({ user_id: userId, type: 'renewal' as const, due_date: c.renewal_date, source_id: c.id }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('events').upsert(rows, { onConflict: 'source_id,type' });
  if (error) throw new Error('Could not sync renewal events');
}

export async function fetchUpcomingEvents(
  userId: string,
  windowDays: number = RENEWAL_THRESHOLD_DAYS
): Promise<LifeEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('user_id', userId)
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true });
  if (error) throw new Error('Could not load events');
  return (data ?? []).filter((e) => e.due_date && isExpiringSoon(e.due_date, windowDays));
}

export interface ContractRenewalEvent {
  event: LifeEvent;
  contract: Contract;
}

function joinEventsWithContracts(events: LifeEvent[], contracts: Contract[]): ContractRenewalEvent[] {
  const contractsById = new Map(contracts.map((c) => [c.id, c]));
  return events
    .filter((e) => e.type === 'renewal' && e.source_id !== null && contractsById.has(e.source_id))
    .map((e) => ({ event: e, contract: contractsById.get(e.source_id as string) as Contract }));
}

export async function fetchUpcomingBillRenewals(userId: string): Promise<ContractRenewalEvent[]> {
  const contracts = (await fetchContracts(userId)).filter((c) =>
    c.type !== null && (BILLS_RELEVANT_CONTRACT_TYPES as readonly string[]).includes(c.type)
  );
  await syncRenewalEvents(userId, contracts);
  const events = await fetchUpcomingEvents(userId);
  return joinEventsWithContracts(events, contracts);
}

export async function syncAssetLifeEvents(
  userId: string,
  assets: Asset[],
  coverageByAsset: Map<string, CoverageRecord[]>
): Promise<void> {
  const rows: { user_id: string; type: 'expiry' | 'deadline'; due_date: string; source_id: string }[] = [];
  for (const asset of assets) {
    const { primary } = evaluateCoverage(coverageByAsset.get(asset.id) ?? []);
    if (primary && primary.status === 'expiring_soon' && primary.end_date) {
      rows.push({ user_id: userId, type: 'expiry', due_date: primary.end_date, source_id: asset.id });
    }
    if (asset.return_deadline && isExpiringSoon(asset.return_deadline)) {
      rows.push({ user_id: userId, type: 'deadline', due_date: asset.return_deadline, source_id: asset.id });
    }
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from('events').upsert(rows, { onConflict: 'source_id,type' });
  if (error) throw new Error('Could not sync asset life events');
}

export type LifeCalendarEntry =
  | { event: LifeEvent; source: 'contract'; contract: Contract }
  | { event: LifeEvent; source: 'asset_coverage'; asset: Asset; coverageType: CoverageType }
  | { event: LifeEvent; source: 'asset_return_deadline'; asset: Asset };

export function joinLifeCalendarEvents(
  events: LifeEvent[],
  contracts: Contract[],
  assets: Asset[],
  coverageByAsset: Map<string, CoverageRecord[]>
): LifeCalendarEntry[] {
  const contractsById = new Map(contracts.map((c) => [c.id, c]));
  const assetsById = new Map(assets.map((a) => [a.id, a]));
  const entries: LifeCalendarEntry[] = [];

  for (const event of events) {
    if (event.type === 'renewal' && event.source_id !== null) {
      const contract = contractsById.get(event.source_id);
      if (contract) entries.push({ event, source: 'contract', contract });
      continue;
    }
    if (event.type === 'expiry' && event.source_id !== null) {
      const asset = assetsById.get(event.source_id);
      if (!asset) continue;
      const { primary } = evaluateCoverage(coverageByAsset.get(asset.id) ?? []);
      if (primary) entries.push({ event, source: 'asset_coverage', asset, coverageType: primary.type });
      continue;
    }
    if (event.type === 'deadline' && event.source_id !== null) {
      const asset = assetsById.get(event.source_id);
      if (asset) entries.push({ event, source: 'asset_return_deadline', asset });
    }
  }

  return entries;
}

export async function fetchLifeCalendarEvents(
  userId: string,
  windowDays: number = LIFE_CALENDAR_WINDOW_DAYS
): Promise<LifeCalendarEntry[]> {
  const [contracts, assets, coverage] = await Promise.all([
    fetchContracts(userId).then((cs) => cs.filter((c) => c.renewal_date !== null)),
    fetchAssets(userId),
    fetchCoverageForUser(),
  ]);
  const coverageByAsset = new Map<string, CoverageRecord[]>();
  for (const record of coverage) {
    const list = coverageByAsset.get(record.asset_id) ?? [];
    list.push(record);
    coverageByAsset.set(record.asset_id, list);
  }
  await Promise.all([
    syncRenewalEvents(userId, contracts),
    syncAssetLifeEvents(userId, assets, coverageByAsset),
  ]);
  const events = await fetchUpcomingEvents(userId, windowDays);
  return joinLifeCalendarEvents(events, contracts, assets, coverageByAsset);
}

export function groupEventsByDate(
  entries: LifeCalendarEntry[]
): { date: string; entries: LifeCalendarEntry[] }[] {
  const map = new Map<string, LifeCalendarEntry[]>();
  for (const entry of entries) {
    const date = entry.event.due_date as string;
    const list = map.get(date) ?? [];
    list.push(entry);
    map.set(date, list);
  }
  return Array.from(map.entries())
    .map(([date, dateEntries]) => ({ date, entries: dateEntries }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
