import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Supabase client singleton instance.
 * Configured with:
 * - persistSession: true - enables session persistence across browser refreshes (important for mobile)
 * - detectSessionInUrl: true - handles OAuth redirects and magic links
 * - autoRefreshToken: true - automatically refreshes tokens before expiry
 */
export const supabase: SupabaseClient = createClient(
  environment.supabase.url,
  environment.supabase.anonKey,
  {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);
