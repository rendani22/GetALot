# 🤖 COPILOT INSTRUCTIONS
## Digital Proof of Delivery (POD) System

This file defines **how GitHub Copilot must behave** when generating code, architecture, and features for this project.

Copilot must follow these instructions **strictly**.

---

## 🧭 PROJECT OVERVIEW

**Goal:**  
Build a **digital Proof of Delivery (POD) system** with:
- QR code–based parcel tracking
- Digital signatures
- Staff accountability
- Full, immutable audit trail
- POD PDF generation
- Supabase as backend platform

**Target Environment:**
- Android devices
- Mobile-first **Angular web application**
- Always-online environment
- Mine / industrial audit compliance

---

## 🛑 GLOBAL RULES (NON-NEGOTIABLE)

Copilot must ALWAYS obey the following:

1. **Angular is mandatory**
    - Use Angular (latest stable)
    - Use standalone components where possible
    - Mobile-first responsive design
    - Optimised for touch input (signature & QR scan)

2. **Supabase is mandatory**
    - Use Supabase PostgreSQL
    - Use Supabase Auth
    - Use Supabase Storage
    - Use Supabase Edge Functions for all writes

3. **No direct database writes from the frontend**
    - All INSERT / UPDATE operations must go through Edge Functions
    - Angular app is READ-ONLY except via Edge Functions

4. **Audit trail is mandatory**
    - Every state-changing action must be logged
    - Audit logs are immutable (no UPDATE / DELETE)

5. **Staff accountability**
    - Every action must be tied to an authenticated staff user
    - Use `auth.users.id` as the staff identifier

6. **Immutability**
    - POD records are locked after completion
    - Audit logs can never be edited or deleted

7. **Server time only**
    - Never trust client timestamps
    - Always use server-generated timestamps

---

### Checklist
- Happy path tested
- Failure scenarios tested
- Audit logs verified
- POD PDFs reviewed
- Mobile usability confirmed
- Billing evidence validated

---

## ✅ SUCCESS DEFINITION

This system is considered successful when:
- Every package has a complete digital chain of custody
- Every delivery has a signed, immutable POD
- Every action is traceable to a staff member
- Auditors can reconstruct events without explanation

---

**End of instructions.**