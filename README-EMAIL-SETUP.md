# Email Notification Setup

The POD system sends email notifications to receivers when packages are registered for them.

## Environment Variables

Set these environment variables in your Supabase project settings (Dashboard > Settings > Edge Functions):

### Required for Email Sending

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Your Resend API key | `re_123abc...` |
| `EMAIL_FROM` | Sender email address | `POD System <noreply@yourdomain.com>` |

### Optional (Customization)

| Variable | Description | Default |
|----------|-------------|---------|
| `COLLECTION_LOCATION` | Location shown in email | `the designated collection point` |
| `COLLECTION_HOURS` | Hours shown in email | `Monday to Friday, 8:00 AM - 5:00 PM` |
| `SUPPORT_EMAIL` | Support email for questions | `support@example.com` |

## Setting Up Resend

1. Sign up at [resend.com](https://resend.com)
2. Create an API key in your Resend dashboard
3. Verify your sending domain
4. Add the API key to Supabase Edge Function secrets:

```bash
supabase secrets set RESEND_API_KEY=re_your_api_key_here
supabase secrets set EMAIL_FROM="POD System <noreply@yourdomain.com>"
supabase secrets set COLLECTION_LOCATION="Building A, Ground Floor Reception"
supabase secrets set COLLECTION_HOURS="Monday to Friday, 8:00 AM - 5:00 PM"
supabase secrets set SUPPORT_EMAIL="support@yourcompany.com"
```

Or via the Supabase Dashboard:
1. Go to Project Settings > Edge Functions
2. Add each secret with its value

## Email Content

When a package is created, the receiver gets an email containing:
- Package reference number (e.g., `PKG-20260121-A1B2`)
- Package notes (if any)
- Collection location and hours
- Instructions on what to bring (reference number + ID)
- Contact information for support

## Audit Logging

The system records the following audit events for email notifications:
- `RECEIVER_NOTIFIED` - When email is successfully sent to receiver
- `PACKAGE_CREATED` - Contains `email_sent` and `email_error` in metadata

## Troubleshooting

If emails are not being sent:

1. Check that `RESEND_API_KEY` is set correctly
2. Verify your sending domain in Resend
3. Check Edge Function logs in Supabase Dashboard
4. Look for `email_error` in the `PACKAGE_CREATED` audit log metadata

If no email service is configured, packages will still be created but with `status: 'pending'` instead of `status: 'notified'`.
