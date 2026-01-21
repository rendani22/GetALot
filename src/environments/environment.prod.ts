export const environment = {
  production: true,
  supabase: {
    // Get these values from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
    url: 'YOUR_SUPABASE_URL',
    // The anon key is a JWT token starting with 'eyJ...'
    anonKey: 'YOUR_SUPABASE_ANON_KEY_JWT',
    functionsUrl: 'YOUR_SUPABASE_URL/functions/v1'
  }
};
