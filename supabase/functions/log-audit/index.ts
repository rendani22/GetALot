// Edge Function: log-audit
// Records audit log entries for various system actions
// Deno runtime for Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

interface AuditLogRequest {
  action: string
  entity_type: string
  entity_id: string
  metadata?: Record<string, unknown>
}

function buildCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-Requested-With, X-Client-Info, apikey, Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = buildCorsHeaders(origin)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User client to verify caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: callingUser }, error: userError } = await userClient.auth.getUser()
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          details: userError?.message || 'Could not verify user token'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: AuditLogRequest = await req.json()
    const { action, entity_type, entity_id, metadata } = body

    if (!action || !entity_type || !entity_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: action, entity_type, entity_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin client for inserting audit log
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get user's staff profile for additional context
    const { data: staffProfile } = await userClient
      .from('staff_profiles')
      .select('full_name, role')
      .eq('user_id', callingUser.id)
      .single()

    // Insert audit log
    const { data: auditLog, error: auditError } = await adminClient
      .from('audit_logs')
      .insert({
        action,
        entity_type,
        entity_id,
        performed_by: callingUser.id,
        metadata: {
          ...metadata,
          performed_by_name: staffProfile?.full_name,
          performed_by_role: staffProfile?.role,
          user_agent: req.headers.get('user-agent'),
          timestamp_iso: new Date().toISOString()
        }
      })
      .select()
      .single()

    if (auditError) {
      console.error('Audit log insert error:', auditError)
      return new Response(
        JSON.stringify({
          error: 'Failed to create audit log',
          details: auditError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, audit_log: auditLog }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
