import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { fetchGmailStatus, exchangeGmailCode, disconnectGmail } from '@/lib/gmailAuth';
import type { GmailConnectionStatus } from '@/types/gmail';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GMAIL_WEB_CLIENT_ID!,
  iosClientId: process.env.EXPO_PUBLIC_GMAIL_IOS_CLIENT_ID!,
  offlineAccess: true,
  forceCodeForRefreshToken: true,
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
});

export function useGmailConnection() {
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGmailStatus()
      .then(setStatus)
      .finally(() => setLoading(false));
  }, []);

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      const response = await GoogleSignin.signIn();
      if (response.type !== 'success' || !response.data.serverAuthCode) {
        throw new Error('Google sign-in did not return a server auth code.');
      }
      setStatus(await exchangeGmailCode(response.data.serverAuthCode));
    } catch (err) {
      console.error('Gmail connect failed:', err);
      setError('Could not connect Gmail. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await disconnectGmail();
    try {
      await GoogleSignin.signOut();
    } catch {
      // best-effort — a stale local session doesn't block disconnect
    }
    setStatus(await fetchGmailStatus());
  };

  return { status, loading, connecting, error, connect, disconnect };
}
