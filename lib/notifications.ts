// lib/notifications.ts — Faz 13: bildirim sistemi.
// fix_phase13_notifications.sql'deki trigger'ların doldurduğu
// notifications tablosuna bağlı.
import { supabase } from './supabase';

export interface AppNotification {
  id: string;
  title: string | null;
  message: string | null;
  type: 'order' | 'payment' | 'shipping' | 'auction' | 'system' | 'success' | 'info' | 'warning' | 'error';
  is_read: boolean;
  created_at: string;
}

export async function loadMyNotifications(limit = 20): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function countUnread(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
}

/** Yeni bildirim geldiğinde (bu kullanıcı için) callback'i tetikler. */
export function subscribeToMyNotifications(userId: string, onInsert: () => void) {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      onInsert,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export const NOTIFICATION_ICON: Record<AppNotification['type'], string> = {
  order: 'fa-bag-shopping',
  payment: 'fa-credit-card',
  shipping: 'fa-truck',
  auction: 'fa-gavel',
  system: 'fa-gear',
  success: 'fa-circle-check',
  info: 'fa-circle-info',
  warning: 'fa-triangle-exclamation',
  error: 'fa-circle-exclamation',
};

export const NOTIFICATION_COLOR: Record<AppNotification['type'], string> = {
  order: '#D4AF37',
  payment: '#10B981',
  shipping: '#3B82F6',
  auction: '#A855F7',
  system: '#5E7090',
  success: '#10B981',
  info: '#3B82F6',
  warning: '#F59E0B',
  error: '#EF4444',
};

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'şimdi';
  if (mins < 60) return `${mins}dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}sa`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}g`;
  return new Date(iso).toLocaleDateString('tr-TR');
}
