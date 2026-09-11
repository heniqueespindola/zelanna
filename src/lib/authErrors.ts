import type { AuthError } from '@supabase/supabase-js';

export function getAuthErrorMessage(error: AuthError): string {
  switch (error.message) {
    case 'Invalid login credentials':
      return 'Incorrect email or password.';
    case 'User already registered':
      return 'An account with this email already exists.';
    case 'Password should be at least 6 characters':
      return 'Password must be at least 6 characters.';
    case 'Unable to validate email address: invalid format':
      return 'Please enter a valid email address.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
