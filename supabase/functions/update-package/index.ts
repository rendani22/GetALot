// Edge Function: update-package
// Updates a package with proper authorization and audit logging
// Enforces lock checks for POD-related packages
// Deno runtime for Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

interface UpdatePackageRequest {
  package_id: string
  status?: 'pending' | 'notified' | 'in_transit' | 'ready_for_collection' | 'collected' | 'returned'
  notes?: string
  receiver_email?: string
}

interface PackageResponse {
  id: string
  reference: string
  receiver_email: string
  notes: string | null
  status: string
  created_at: string
  updated_at: string
  pod_id: string | null
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

    // Check if calling user has appropriate role
    const { data: callerProfile, error: profileError } = await userClient
      .from('staff_profiles')
      .select('id, role, full_name, is_active')
      .eq('user_id', callingUser.id)
      .single()

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({
          error: 'Staff profile not found',
          details: profileError?.message
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!callerProfile.is_active) {
      return new Response(
        JSON.stringify({
          error: 'Staff account is deactivated',
          details: 'Contact an administrator to reactivate your account'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['warehouse', 'admin', 'collection'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient permissions to update packages',
          details: `User role is '${callerProfile.role}'`
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: UpdatePackageRequest = await req.json()
    const { package_id, status, notes, receiver_email } = body

    if (!package_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: package_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin client for operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get current package state
    const { data: existingPackage, error: fetchError } = await adminClient
      .from('packages')
      .select('*, pods(id, is_locked, locked_at, pod_reference)')
      .eq('id', package_id)
      .single()

    if (fetchError || !existingPackage) {
      return new Response(
        JSON.stringify({
          error: 'Package not found',
          details: fetchError?.message || `No package with ID ${package_id}`
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if package has a locked POD
    const lockedPod = existingPackage.pods?.find((pod: any) => pod.is_locked === true)
    if (lockedPod) {
      // Log the denied attempt
      await adminClient.from('audit_logs').insert({
        action: 'PACKAGE_UPDATE_DENIED',
        entity_type: 'package',
        entity_id: package_id,
        performed_by: callingUser.id,
        metadata: {
          package_reference: existingPackage.reference,
          pod_reference: lockedPod.pod_reference,
          locked_at: lockedPod.locked_at,
          reason: 'Package has a locked POD and cannot be modified',
          attempted_changes: { status, notes, receiver_email },
          performed_by_name: callerProfile.full_name,
          performed_by_role: callerProfile.role
        }
      })

      return new Response(
        JSON.stringify({
          error: 'Package is locked',
          details: `Package ${existingPackage.reference} has a completed and locked POD (${lockedPod.pod_reference}). Locked packages cannot be modified.`,
          pod_reference: lockedPod.pod_reference,
          locked_at: lockedPod.locked_at
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build update object
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (status !== undefined) {
      updateData.status = status

      // If marking as collected, set collected_at and collected_by
      if (status === 'collected') {
        updateData.collected_at = new Date().toISOString()
        updateData.collected_by = callingUser.id
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null
    }

    if (receiver_email !== undefined) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(receiver_email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      updateData.receiver_email = receiver_email.toLowerCase().trim()
    }

    // Perform update
    const { data: updatedPackage, error: updateError } = await adminClient
      .from('packages')
      .update(updateData)
      .eq('id', package_id)
      .select()
      .single()

    if (updateError) {
      console.error('Package update error:', updateError)
      return new Response(
        JSON.stringify({
          error: 'Failed to update package',
          details: updateError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log successful update
    await adminClient.from('audit_logs').insert({
      action: 'PACKAGE_UPDATED',
      entity_type: 'package',
      entity_id: package_id,
      performed_by: callingUser.id,
      metadata: {
        package_reference: updatedPackage.reference,
        changes: updateData,
        previous_status: existingPackage.status,
        new_status: updatedPackage.status,
        performed_by_name: callerProfile.full_name,
        performed_by_role: callerProfile.role
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        package: updatedPackage,
        message: `Package ${updatedPackage.reference} updated successfully`
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
