// Edge Function: lock-pod
// Locks a POD record after PDF generation, making it immutable
// This is the final step in the POD completion process
// Deno runtime for Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

interface LockPodRequest {
  pod_id: string
  pdf_url?: string
  pdf_path?: string
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

    // Get staff profile
    const { data: staffProfile, error: profileError } = await userClient
      .from('staff_profiles')
      .select('id, role, full_name, is_active')
      .eq('user_id', callingUser.id)
      .single()

    if (profileError || !staffProfile) {
      return new Response(
        JSON.stringify({
          error: 'Staff profile not found',
          details: profileError?.message
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!staffProfile.is_active) {
      return new Response(
        JSON.stringify({
          error: 'Staff account is deactivated'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: LockPodRequest = await req.json()
    const { pod_id, pdf_url, pdf_path } = body

    if (!pod_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: pod_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin client for operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get current POD state
    const { data: pod, error: fetchError } = await adminClient
      .from('pods')
      .select('*')
      .eq('id', pod_id)
      .single()

    if (fetchError || !pod) {
      return new Response(
        JSON.stringify({
          error: 'POD not found',
          details: fetchError?.message || `No POD with ID ${pod_id}`
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already locked
    if (pod.is_locked) {
      return new Response(
        JSON.stringify({
          error: 'POD already locked',
          details: `POD ${pod.pod_reference} was locked at ${pod.locked_at}`,
          pod_reference: pod.pod_reference,
          locked_at: pod.locked_at
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the caller is the staff who created the POD or an admin
    if (pod.staff_id !== staffProfile.id && staffProfile.role !== 'admin') {
      await adminClient.from('audit_logs').insert({
        action: 'POD_LOCK_DENIED',
        entity_type: 'pod',
        entity_id: pod_id,
        performed_by: callingUser.id,
        metadata: {
          pod_reference: pod.pod_reference,
          reason: 'User is not the POD creator or an admin',
          attempted_by_name: staffProfile.full_name,
          pod_creator_id: pod.staff_id
        }
      })

      return new Response(
        JSON.stringify({
          error: 'Unauthorized to lock this POD',
          details: 'Only the POD creator or an admin can lock the POD'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date().toISOString()

    // Build update data
    const updateData: Record<string, any> = {
      is_locked: true,
      locked_at: now
    }

    if (pdf_url) {
      updateData.pdf_url = pdf_url
      updateData.pdf_path = pdf_path || null
      updateData.pdf_generated_at = now
    }

    // Lock the POD
    const { data: lockedPod, error: updateError } = await adminClient
      .from('pods')
      .update(updateData)
      .eq('id', pod_id)
      .eq('is_locked', false) // Double-check it's not already locked
      .select()
      .single()

    if (updateError) {
      console.error('POD lock error:', updateError)

      // Check if it was a lock conflict
      if (updateError.code === 'PGRST116') {
        return new Response(
          JSON.stringify({
            error: 'POD was already locked',
            details: 'Another process may have locked this POD'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          error: 'Failed to lock POD',
          details: updateError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log the lock action
    await adminClient.from('audit_logs').insert({
      action: 'POD_LOCKED',
      entity_type: 'pod',
      entity_id: pod_id,
      performed_by: callingUser.id,
      metadata: {
        pod_reference: lockedPod.pod_reference,
        package_id: lockedPod.package_id,
        package_reference: lockedPod.package_reference,
        locked_at: now,
        pdf_generated: !!pdf_url,
        pdf_url: pdf_url || null,
        locked_by_name: staffProfile.full_name,
        locked_by_role: staffProfile.role
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        pod: lockedPod,
        message: `POD ${lockedPod.pod_reference} has been locked and is now immutable`,
        locked_at: now,
        is_immutable: true
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
