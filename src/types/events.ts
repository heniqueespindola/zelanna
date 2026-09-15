export type EventType = 'renewal' | 'expiry' | 'deadline';

export interface LifeEvent {
  id: string;
  user_id: string;
  type: EventType;
  due_date: string | null;
  source_id: string | null;
  created_at: string;
}
