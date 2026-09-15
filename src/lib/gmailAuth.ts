import { supabase } from '@/lib/supabase';
import type { GmailConnectionStatus } from '@/types/gmail';

export async function fetchGmailStatus(): Promise<GmailConnectionStatus> {
  const { data, error } = await supabase.functions.invoke<GmailConnectionStatus>('gmail-status');
  if (error || !data) throw new Error('Could not load Gmail connection status');
  return data;
}

export async function exchangeGmailCode(serverAuthCode: string): Promise<GmailConnectionStatus> {
  const { data, error } = await supabase.functions.invoke<{ connected: boolean; googleEmail: string }>(
    'gmail-connect',
    { body: { serverAuthCode } }
  );
  if (error || !data) throw new Error('Could not connect Gmail');
  return { connected: data.connected, googleEmail: data.googleEmail, lastSyncedAt: null };
}

export async function disconnectGmail(): Promise<void> {
  const { error } = await supabase.functions.invoke('gmail-disconnect');
  if (error) throw new Error('Could not disconnect Gmail');
}
