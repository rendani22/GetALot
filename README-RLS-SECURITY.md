# Row-Level Security & Audit Compliance

This document describes the RLS (Row-Level Security) policies and audit compliance features implemented for tamper-proof data management.

## Overview

The POD (Proof of Delivery) system implements a multi-layered security model:

1. **Row-Level Security (RLS)** - Database-level access control
2. **POD Lock Mechanism** - Immutable records after completion
3. **Edge Functions** - All mutations go through controlled endpoints
4. **Comprehensive Audit Trail** - Every action is logged

## Tables & RLS Policies

### `staff_profiles` Table

| Operation | Policy | Description |
|-----------|--------|-------------|
| SELECT | All authenticated | Staff can view all profiles |
| INSERT | Admin only | Only admins can create staff |
| UPDATE | Admin only | Only admins can update staff |
| DELETE | Admin only | Only admins can deactivate staff |

### `packages` Table

| Operation | Policy | Description |
|-----------|--------|-------------|
| SELECT | All authenticated | All staff can view packages |
| INSERT | Warehouse/Admin | Only warehouse staff or admins can create |
| UPDATE | Warehouse/Admin/Collection | Can update only if no locked POD exists |
| DELETE | Admin only | Only admins, and only if no locked POD |

### `pods` Table

| Operation | Policy | Description |
|-----------|--------|-------------|
| SELECT | All active staff | Active staff can view all PODs |
| INSERT | Collection/Warehouse/Admin | Staff can create PODs for packages without existing PODs |
| UPDATE | Active staff (unlocked only) | Can only update unlocked PODs |
| DELETE | **DENIED** | PODs can NEVER be deleted |

### `audit_logs` Table

| Operation | Policy | Description |
|-----------|--------|-------------|
| SELECT | All active staff | Staff can view audit logs |
| INSERT | Authenticated | Logs are created automatically |
| UPDATE | **DENIED** | Audit logs are immutable |
| DELETE | **DENIED** | Audit logs can never be deleted |

## POD Lock Mechanism

### How It Works

1. **POD Created**: Initial `is_locked = false`
2. **PDF Generated**: PDF is created and uploaded
3. **POD Locked**: `is_locked = true`, `locked_at` timestamp set
4. **Immutable**: No further changes allowed

### Triggers

```sql
-- Prevents modification of locked PODs
trigger_prevent_pod_modification

-- Prevents deletion of any POD
trigger_prevent_pod_deletion

-- Automatically logs POD state changes
trigger_audit_pod_changes
```

### Package Protection

When a POD is locked, the associated package is also protected:

```sql
-- Prevents package modification when POD is locked
trigger_prevent_package_modification_when_locked

-- Prevents package deletion when POD is locked
trigger_prevent_package_deletion_when_locked
```

## Edge Functions

All mutations **MUST** go through Edge Functions to ensure:
- Proper authentication
- Role-based authorization
- Audit logging
- Business logic enforcement

### Available Functions

| Function | Purpose |
|----------|---------|
| `create-package` | Create a new package with email notification |
| `update-package` | Update package (checks POD lock status) |
| `create-staff` | Create new staff member (admin only) |
| `complete-pod` | Create POD record for a package |
| `lock-pod` | Lock POD after PDF generation |
| `log-audit` | Record audit entries |

### Example: Complete POD Flow

```typescript
// 1. Create POD via Edge Function
const createResponse = await fetch(
  `${supabaseUrl}/functions/v1/complete-pod`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey
    },
    body: JSON.stringify({
      package_id: 'uuid',
      signature_url: 'https://...',
      signature_path: 'path/to/signature.png',
      signed_at: '2024-01-20T10:30:00Z'
    })
  }
);

// 2. Generate and upload PDF (client-side)
const pdfUrl = await generateAndUploadPdf(pod, package);

// 3. Lock POD via Edge Function
const lockResponse = await fetch(
  `${supabaseUrl}/functions/v1/lock-pod`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey
    },
    body: JSON.stringify({
      pod_id: pod.id,
      pdf_url: pdfUrl,
      pdf_path: 'path/to/pod.pdf'
    })
  }
);
```

## Audit Trail

### Automatic Logging

The following actions are automatically logged:

| Action | Trigger |
|--------|---------|
| `packages_CREATED` | Package inserted |
| `packages_UPDATED` | Package updated |
| `PACKAGE_COLLECTED` | Package status → collected |
| `POD_CREATED` | POD record created |
| `POD_LOCKED` | POD becomes immutable |
| `POD_PDF_GENERATED` | PDF generated |
| `POD_DELETE_ATTEMPT` | Deletion attempted (always denied) |
| `PACKAGE_MODIFICATION_DENIED` | Update blocked due to locked POD |

### Audit Log Structure

```json
{
  "id": "uuid",
  "action": "POD_LOCKED",
  "entity_type": "pod",
  "entity_id": "uuid",
  "performed_by": "user-uuid",
  "metadata": {
    "pod_reference": "POD-2024-0001",
    "package_reference": "PKG-20240120-ABC1",
    "locked_at": "2024-01-20T10:35:00Z",
    "performed_by_name": "John Doe",
    "performed_by_role": "collection"
  },
  "created_at": "2024-01-20T10:35:00Z"
}
```

## Utility Functions

### Check Lock Status

```sql
-- Check if a package has a locked POD
SELECT is_pod_locked('package-uuid');

-- Get detailed lock status
SELECT * FROM get_pod_lock_status('package-uuid');
```

### From TypeScript

```typescript
// Check if package is locked
const isLocked = await packageService.isPackageLocked(packageId);

// Get detailed lock status
const status = await packageService.getPackageLockStatus(packageId);
if (status?.isLocked) {
  console.log(`Locked at ${status.lockedAt}`);
  console.log(`POD: ${status.podReference}`);
}
```

## Error Handling

### Locked Record Errors

When attempting to modify a locked record:

```json
{
  "error": "Package is locked",
  "details": "Package PKG-20240120-ABC1 has a completed and locked POD (POD-2024-0001). Locked packages cannot be modified.",
  "pod_reference": "POD-2024-0001",
  "locked_at": "2024-01-20T10:35:00Z"
}
```

### Database Exceptions

```
POD_LOCKED: Record POD-2024-0001 is locked and cannot be modified. Locked at: 2024-01-20T10:35:00Z

POD_DELETE_DENIED: POD records cannot be deleted. Record: POD-2024-0001, Package: PKG-20240120-ABC1

PACKAGE_LOCKED: Package PKG-20240120-ABC1 cannot be modified because it has a locked POD
```

## Deployment

### Apply Migration

```bash
supabase db push
# or
supabase migration up
```

### Deploy Edge Functions

```bash
supabase functions deploy complete-pod
supabase functions deploy lock-pod
supabase functions deploy update-package
```

## Compliance

This implementation satisfies the following requirements:

- ✅ **RLS policies applied on all tables** - All tables have RLS enabled with appropriate policies
- ✅ **Locked PODs cannot be updated or deleted** - Enforced via triggers and policies
- ✅ **All actions go through Edge Functions** - Mutations use controlled endpoints
- ✅ **Complete audit trail** - All changes are logged automatically
- ✅ **Tamper-proof records** - Locked PODs are immutable
