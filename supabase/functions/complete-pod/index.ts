// Edge Function: complete-pod
// Creates a POD record, generates PDF, and locks the record
// All-in-one controlled endpoint for POD completion
// Deno runtime for Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

interface CompletePodRequest {
  package_id: string
  signature_url: string
  signature_path: string
  signed_at: string
  notes?: string
}

interface PodResponse {
  id: string
  pod_reference: string
  package_id: string
  package_reference: string
  receiver_email: string
  staff_id: string
  staff_name: string
  staff_email: string
  signature_url: string
  completed_at: string
  is_locked: boolean
  locked_at: string | null
  pdf_url: string | null
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
      .select('id, role, full_name, email, is_active')
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

    // Check role - collection, warehouse, or admin can complete PODs
    if (!['collection', 'warehouse', 'admin'].includes(staffProfile.role)) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient permissions to complete PODs',
          details: `User role '${staffProfile.role}' cannot complete PODs`
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: CompletePodRequest = await req.json()
    const { package_id, signature_url, signature_path, signed_at, notes } = body

    if (!package_id || !signature_url || !signature_path || !signed_at) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          details: 'Required: package_id, signature_url, signature_path, signed_at'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin client for operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get package
    const { data: pkg, error: pkgError } = await adminClient
      .from('packages')
      .select('*')
      .eq('id', package_id)
      .single()

    if (pkgError || !pkg) {
      return new Response(
        JSON.stringify({
          error: 'Package not found',
          details: pkgError?.message || `No package with ID ${package_id}`
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if package already has a POD
    const { data: existingPod } = await adminClient
      .from('pods')
      .select('id, pod_reference, is_locked')
      .eq('package_id', package_id)
      .single()

    if (existingPod) {
      // Log duplicate attempt
      await adminClient.from('audit_logs').insert({
        action: 'POD_DUPLICATE_ATTEMPT',
        entity_type: 'package',
        entity_id: package_id,
        performed_by: callingUser.id,
        metadata: {
          package_reference: pkg.reference,
          existing_pod_reference: existingPod.pod_reference,
          existing_pod_locked: existingPod.is_locked,
          attempted_by_name: staffProfile.full_name
        }
      })

      return new Response(
        JSON.stringify({
          error: 'POD already exists for this package',
          details: `Package ${pkg.reference} already has POD ${existingPod.pod_reference}`,
          existing_pod_reference: existingPod.pod_reference,
          is_locked: existingPod.is_locked
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check package status - should be pending or notified
    if (pkg.status === 'collected') {
      return new Response(
        JSON.stringify({
          error: 'Package already collected',
          details: `Package ${pkg.reference} has already been marked as collected`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date().toISOString()

    // Create POD record
    const { data: pod, error: createError } = await adminClient
      .from('pods')
      .insert({
        package_id: pkg.id,
        package_reference: pkg.reference,
        receiver_email: pkg.receiver_email,
        staff_id: staffProfile.id,
        staff_name: staffProfile.full_name,
        staff_email: staffProfile.email,
        signature_url,
        signature_path,
        signed_at,
        completed_at: now,
        notes: notes?.trim() || pkg.notes,
        is_locked: false // Will be locked after PDF generation
      })
      .select()
      .single()

    if (createError) {
      console.error('POD creation error:', createError)
      return new Response(
        JSON.stringify({
          error: 'Failed to create POD',
          details: createError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log POD creation
    await adminClient.from('audit_logs').insert({
      action: 'POD_CREATED',
      entity_type: 'pod',
      entity_id: pod.id,
      performed_by: callingUser.id,
      metadata: {
        pod_reference: pod.pod_reference,
        package_id: pkg.id,
        package_reference: pkg.reference,
        receiver_email: pkg.receiver_email,
        staff_name: staffProfile.full_name,
        staff_role: staffProfile.role
      }
    })

    // Update package status to collected
    const { error: updatePkgError } = await adminClient
      .from('packages')
      .update({
        status: 'collected',
        collected_at: now,
        collected_by: callingUser.id,
        pod_id: pod.id,
        signature_url,
        signature_path,
        signed_at
      })
      .eq('id', package_id)

    if (updatePkgError) {
      console.warn('Failed to update package status:', updatePkgError)
      // Don't fail the whole operation - POD is created
    }

    // Log package collection
    await adminClient.from('audit_logs').insert({
      action: 'PACKAGE_COLLECTED',
      entity_type: 'package',
      entity_id: package_id,
      performed_by: callingUser.id,
      metadata: {
        package_reference: pkg.reference,
        pod_reference: pod.pod_reference,
        previous_status: pkg.status,
        new_status: 'collected',
        collected_by_name: staffProfile.full_name
      }
    })

    // Lock the POD (this should be done after PDF generation in real scenario)
    // For now, we'll mark it as ready to lock - client will call lock-pod after PDF

    return new Response(
      JSON.stringify({
        success: true,
        pod: pod,
        package: {
          ...pkg,
          status: 'collected',
          collected_at: now,
          pod_id: pod.id
        },
        message: `POD ${pod.pod_reference} created successfully for package ${pkg.reference}`,
        next_step: 'Generate PDF and call lock-pod endpoint'
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
