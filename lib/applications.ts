// lib/applications.ts — Faz 7: tedarikçi/bayi başvuru veri katmanı.
// fix_phase7_role_applications.sql'e bağlı (role_applications tablosu +
// submit_role_application / admin_approve_role_application /
// admin_reject_role_application RPC'leri).
import { supabase } from './supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

export type RequestedRole = 'dealer' | 'supplier';

export interface RoleApplicationInput {
  requestedRole: RequestedRole;
  companyName: string;
  taxNumber?: string;
  taxOffice?: string;
  phone: string;
  address?: string;
  note?: string;
  /** Faz 9: giriş yapmış kullanıcı ikinci role başvururken de TCKN
   * göndersin diye — ziyaretçi formuyla aynı çift kayıt korumasını almak
   * için. */
  nationalId?: string;
}

// ── Ziyaretçi (giriş yapmamış) başvuru akışı ──────────────────────────────
// Sıra: 1) checkApplicationDuplicate  2) supabase.auth.signUp()
// 3) submitPublicRoleApplication(newUserId, ...)

export interface PublicRoleApplicationInput extends RoleApplicationInput {
  fullName: string;
  email: string;
  nationalId: string;
}

export async function checkApplicationDuplicate(params: {
  phone: string;
  nationalId?: string;
  taxNumber?: string;
}): Promise<{ duplicate: boolean; reason?: 'EXISTING_ACCOUNT' | 'EXISTING_APPLICATION' }> {
  const { data, error } = await supabase.rpc('check_application_duplicate', {
    p_phone: params.phone,
    p_national_id: params.nationalId ?? null,
    p_tax_number: params.taxNumber ?? null,
  });
  if (error) throw error;
  return data as { duplicate: boolean; reason?: 'EXISTING_ACCOUNT' | 'EXISTING_APPLICATION' };
}

export async function submitPublicRoleApplication(userId: string, input: PublicRoleApplicationInput) {
  const { data, error } = await supabase.rpc('submit_public_role_application', {
    p_user_id: userId,
    p_requested_role: input.requestedRole,
    p_full_name: input.fullName,
    p_email: input.email,
    p_national_id: input.nationalId,
    p_company_name: input.companyName,
    p_tax_number: input.taxNumber ?? null,
    p_tax_office: input.taxOffice ?? null,
    p_phone: input.phone,
    p_address: input.address ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ── Zaten giriş yapmış müşteri için başvuru akışı ─────────────────────────

export async function submitRoleApplication(input: RoleApplicationInput) {
  const { data, error } = await supabase.rpc('submit_role_application', {
    p_requested_role: input.requestedRole,
    p_company_name: input.companyName,
    p_tax_number: input.taxNumber ?? null,
    p_tax_office: input.taxOffice ?? null,
    p_phone: input.phone,
    p_address: input.address ?? null,
    p_note: input.note ?? null,
    p_national_id: input.nationalId ?? null,
  });
  if (error) throw error;
  return data as string; // yeni başvurunun id'si
}

export async function loadMyApplications(): Promise<AnyRow[]> {
  const { data, error } = await supabase
    .from('role_applications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ── Admin tarafı ──────────────────────────────────────────────────────────

export async function loadPendingApplications(): Promise<AnyRow[]> {
  const { data, error } = await supabase
    .from('role_applications')
    .select('*, profiles!role_applications_user_id_fkey(full_name, email, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function approveApplication(applicationId: string) {
  const { error } = await supabase.rpc('admin_approve_role_application', {
    p_application_id: applicationId,
  });
  if (error) throw error;
}

export async function rejectApplication(applicationId: string, reason: string) {
  const { error } = await supabase.rpc('admin_reject_role_application', {
    p_application_id: applicationId,
    p_reason: reason,
  });
  if (error) throw error;
}

export const ROLE_LABEL: Record<RequestedRole, string> = {
  dealer: 'Bayi',
  supplier: 'Tedarikçi',
};

/** Faz 9: profil zaten hangi rol(ler)e sahip — RoleToggle'da o seçenekleri
 * gizlemek/işaretlemek için. */
export function heldRoles(profile: { is_dealer?: boolean; is_supplier?: boolean } | null | undefined): RequestedRole[] {
  const held: RequestedRole[] = [];
  if (profile?.is_dealer) held.push('dealer');
  if (profile?.is_supplier) held.push('supplier');
  return held;
}
