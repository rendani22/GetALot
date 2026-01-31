// Edge Function: driver-pickup
// Marks a package as picked up by driver and sends "On the Way" email notification
// Deno runtime for Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

interface DriverPickupRequest {
  package_id: string
}

interface PackageResponse {
  id: string
  reference: string
  receiver_email: string
  notes: string | null
  status: string
  picked_up_at: string
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
      console.error('JWT verification failed:', userError?.message, userError?.status)
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          details: userError?.message || 'Could not verify user token',
          code: userError?.status || 'unknown'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if calling user is a driver or admin
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

    if (!['driver', 'admin'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({
          error: 'Only drivers and admins can pick up packages',
          details: `User role is '${callerProfile.role}'`
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: DriverPickupRequest = await req.json()
    const { package_id } = body

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

    // Get current package state with delivery location
    const { data: pkg, error: fetchError } = await adminClient
      .from('packages')
      .select(`
        *,
        delivery_locations(id, name, address, google_maps_link),
        package_items(id, quantity, description)
      `)
      .eq('id', package_id)
      .single()

    if (fetchError || !pkg) {
      return new Response(
        JSON.stringify({
          error: 'Package not found',
          details: fetchError?.message || `No package with ID ${package_id}`
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate package status - must be pending or notified
    if (!['pending', 'notified'].includes(pkg.status)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid package status for pickup',
          details: `Package ${pkg.reference} has status '${pkg.status}'. Only pending or notified packages can be picked up.`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date().toISOString()

    // Update package status to in_transit
    const { data: updatedPackage, error: updateError } = await adminClient
      .from('packages')
      .update({
        status: 'in_transit',
        picked_up_by: callingUser.id,
        picked_up_at: now,
        updated_at: now
      })
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

    // Send "Package On the Way" email notification
    let emailSent = false
    let emailError: string | null = null

    try {
      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      const supportEmail = Deno.env.get('SUPPORT_EMAIL') || 'support@example.com'
      const collectionHours = Deno.env.get('COLLECTION_HOURS') || 'Monday to Friday, 8:00 AM - 5:00 PM'

      // Get delivery location details
      const locationName = pkg.delivery_locations?.name || Deno.env.get('COLLECTION_LOCATION') || 'the designated collection point'
      const locationAddress = pkg.delivery_locations?.address || ''
      const locationMapsLink = pkg.delivery_locations?.google_maps_link || null

      // Get package items
      const packageItems = pkg.package_items || []

      if (resendApiKey) {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: Deno.env.get('EMAIL_FROM') || 'POD System <noreply@example.com>',
            to: [pkg.receiver_email],
            subject: `Package On the Way - ${pkg.reference}`,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #374151;">
                <div style="background: #3b82f6; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">🚚 Package On the Way!</h1>
                </div>
                
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
                  <p style="margin: 0 0 20px 0;">Hello,</p>
                  <p style="margin: 0 0 20px 0;">Great news! Your package has been picked up and is now on its way to the collection point.</p>
                  
                  <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Your Package Reference</p>
                    <p style="font-size: 28px; font-weight: bold; color: #1e40af; margin: 0; font-family: monospace;">${pkg.reference}</p>
                  </div>

                  ${pkg.po_number ? `
                  <div style="background: #f5f3ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Purchase Order</p>
                    <p style="font-size: 18px; font-weight: bold; color: #5b21b6; margin: 0; font-family: monospace;">${pkg.po_number}</p>
                  </div>
                  ` : ''}

                  ${packageItems.length > 0 ? `
                  <div style="margin: 20px 0;">
                    <h3 style="color: #1e3a5f; font-size: 16px; margin: 0 0 10px 0;">📋 Package Contents</h3>
                    <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px;">
                      <thead>
                        <tr style="background: #f9fafb;">
                          <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Qty</th>
                          <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${packageItems.map((item: any) => `
                        <tr>
                          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${item.quantity}</td>
                          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${item.description}</td>
                        </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                  ` : ''}
                  
                  <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                    <h3 style="color: #92400e; font-size: 16px; margin: 0 0 10px 0;">📍 Delivery Status</h3>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="background: #10b981; width: 12px; height: 12px; border-radius: 50%;"></div>
                      <span style="font-size: 14px; color: #78350f;">Package picked up at ${new Date(now).toLocaleTimeString()}</span>
                    </div>
                    <div style="border-left: 2px dashed #d97706; height: 20px; margin-left: 5px;"></div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="background: #fbbf24; width: 12px; height: 12px; border-radius: 50%;"></div>
                      <span style="font-size: 14px; color: #78350f;">In transit to collection point</span>
                    </div>
                    <div style="border-left: 2px dashed #d97706; height: 20px; margin-left: 5px;"></div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="background: #e5e7eb; width: 12px; height: 12px; border-radius: 50%;"></div>
                      <span style="font-size: 14px; color: #9ca3af;">Awaiting arrival at collection point</span>
                    </div>
                  </div>
                  
                  <h2 style="color: #1e3a5f; font-size: 18px; margin: 30px 0 15px 0;">📍 Collection Point</h2>
                  
                  <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Destination</p>
                    <p style="font-size: 18px; font-weight: bold; color: #065f46; margin: 0;">${locationName}</p>
                    ${locationAddress ? `<p style="font-size: 14px; color: #047857; margin: 8px 0 0 0;">${locationAddress}</p>` : ''}
                    ${locationMapsLink ? `<p style="margin: 12px 0 0 0;"><a href="${locationMapsLink}" style="color: #3b82f6; font-size: 14px; text-decoration: none;">📍 View on Google Maps</a></p>` : ''}
                  </div>
                  
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                        <strong>Collection Hours:</strong>
                      </td>
                      <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                        ${collectionHours}
                      </td>
                    </tr>
                  </table>
                  
                  <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 0; font-size: 14px; color: #1e40af;">
                      <strong>📧 Next notification:</strong> You'll receive an email when your package arrives at the collection point and is ready for pickup.
                    </p>
                  </div>
                </div>
                
                <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center;">
                  <p style="margin: 0 0 10px 0; font-size: 12px; color: #6b7280;">
                    Questions? Contact us at <a href="mailto:${supportEmail}" style="color: #3b82f6;">${supportEmail}</a>
                  </p>
                  <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                    This is an automated message from the POD System. Please do not reply directly to this email.
                  </p>
                </div>
              </body>
              </html>
            `
          })
        })

        if (emailResponse.ok) {
          emailSent = true
        } else {
          const errorBody = await emailResponse.text()
          emailError = `Email API error: ${errorBody}`
          console.error('Email send failed:', emailError)
        }
      } else {
        emailError = 'Email service not configured (RESEND_API_KEY not set)'
        console.log('Email notification skipped:', emailError)
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      emailError = `Email exception: ${errorMessage}`
      console.error('Email send exception:', e)
    }

    // Create audit log entry
    await adminClient.from('audit_logs').insert({
      action: 'PACKAGE_PICKED_UP',
      entity_type: 'package',
      entity_id: package_id,
      performed_by: callingUser.id,
      metadata: {
        package_reference: pkg.reference,
        receiver_email: pkg.receiver_email,
        driver_name: callerProfile.full_name,
        driver_id: callerProfile.id,
        picked_up_at: now,
        previous_status: pkg.status,
        new_status: 'in_transit',
        email_sent: emailSent,
        email_error: emailError
      }
    })

    // Also log the in-transit notification if email was sent
    if (emailSent) {
      await adminClient.from('audit_logs').insert({
        action: 'PACKAGE_IN_TRANSIT_NOTIFICATION',
        entity_type: 'package',
        entity_id: package_id,
        performed_by: callingUser.id,
        metadata: {
          reference: pkg.reference,
          receiver_email: pkg.receiver_email,
          notification_type: 'email',
          notification_status: 'sent',
          email_subject: 'Package On the Way'
        }
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        package: updatedPackage,
        email_sent: emailSent,
        email_error: emailError,
        message: `Package ${pkg.reference} marked as in transit`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
