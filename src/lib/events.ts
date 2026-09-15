import { supabase } from '@/lib/supabase';
import { isExpiringSoon } from '@/lib/rulesEngine';
import { fetchContracts } from '@/lib/contracts';
import { RENEWAL_THRESHOLD_DAYS } from '@/lib/insights';
import type { Contract } from '@/types/contracts';
import type { LifeEvent } from '@/types/events';

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

export async function fetchLifeCalendarEvents(
  userId: string,
  windowDays: number = LIFE_CALENDAR_WINDOW_DAYS
): Promise<ContractRenewalEvent[]> {
  const contracts = (await fetchContracts(userId)).filter((c) => c.renewal_date !== null);
  await syncRenewalEvents(userId, contracts);
  const events = await fetchUpcomingEvents(userId, windowDays);
  return joinEventsWithContracts(events, contracts);
}

export function groupEventsByDate(
  entries: ContractRenewalEvent[]
): { date: string; entries: ContractRenewalEvent[] }[] {
  const map = new Map<string, ContractRenewalEvent[]>();
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
