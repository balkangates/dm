// lib/messaging.ts
// ─────────────────────────────────────────────────────────────────────────
// Müşteri ↔ mağaza arasındaki ÖZEL (1:1) mesajlaşma (DM) katmanı.
// Bilinçli olarak LiveStream.tsx'teki HERKESE AÇIK "canlı yayın sohbeti"
// (message_type='live') akışından tamamen ayrı tutulur — orası hâlâ
// store_id'ye göre TEK/paylaşımlı bir oda. Burada her satırın
// message_type='dm' olması ve conversations.customer_id dolu olması
// şart; RLS de (bkz. fixes/fix_dm_customer_store_messaging.sql) sadece
// o konuşmanın müşterisi ile mağaza sahibinin okuyup yazabilmesini
// garanti eder.
import { supabase } from './supabase';

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string | null;
  message: string;
  created_at: string;
  is_read: boolean;
  store_product_id: string | null;
  store_order_id: string | null;
  store_product?: { id: string; name: string } | null;
}

export interface DmConversationSummary {
  conversation_id: string;
  customer_id: string;
  customer_name: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
}

// Bir soru/mesaja bağlanacak isteğe bağlı bağlam — "Sor" linkleri
// (ürün kartı / siparişlerim) buradan doldurup DM widget'ına aktarır.
export interface DmDraftContext {
  productId?: string;
  productName?: string;
  orderId?: string;
  orderLabel?: string;
  text?: string;
}

/** MÜŞTERİ tarafı: mağazayla olan tek özel konuşmayı bulur/oluşturur. */
export async function getOrCreateStoreDmConversation(storeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_store_dm_conversation', { p_store_id: storeId });
  if (error) throw error;
  return data as string;
}

/** BAYİ tarafı: mağazasına ait tüm müşteri konuşmalarını (gelen kutusu) listeler. */
export async function listStoreDmConversations(storeId: string): Promise<DmConversationSummary[]> {
  const { data, error } = await supabase.rpc('list_store_dm_conversations', { p_store_id: storeId });
  if (error) throw error;
  return (data ?? []) as DmConversationSummary[];
}

/** Bir konuşmanın mesaj geçmişini, ürün/sipariş bağlamıyla birlikte çeker. */
export async function fetchDmMessages(conversationId: string): Promise<DmMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, receiver_id, message, created_at, is_read, store_product_id, store_order_id, store_product:store_products(id, name)')
    .eq('conversation_id', conversationId)
    .eq('message_type', 'dm')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ ...r, store_product: Array.isArray(r.store_product) ? r.store_product[0] : r.store_product }));
}

/**
 * Mesaj gönderir. receiverId zorunlu — karşı tarafın profiles.id'si
 * (müşteri yazıyorsa mağaza sahibi, bayi yazıyorsa müşteri) — böylece
 * "hangi müşteri hangi mağazada ne yazmış, mağaza kime yanıt vermiş"
 * her satırda net kalır; conversation_id + sender_id + receiver_id
 * üçlüsü tek başına conversation_id'den daha güvenilir bir filtre sağlar.
 */
export async function sendDmMessage(params: {
  conversationId: string;
  storeId: string;
  senderId: string;
  receiverId: string;
  text: string;
  storeProductId?: string | null;
  storeOrderId?: string | null;
}) {
  const { conversationId, storeId, senderId, receiverId, text, storeProductId, storeOrderId } = params;
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    store_id: storeId,
    sender_id: senderId,
    receiver_id: receiverId,
    message: text,
    message_type: 'dm',
    is_read: false,
    store_product_id: storeProductId ?? null,
    store_order_id: storeOrderId ?? null,
  });
  if (error) throw error;
}

/** Karşı tarafın gönderdiği okunmamış mesajları okundu işaretler. */
export async function markDmConversationRead(conversationId: string, viewerId: string) {
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .eq('message_type', 'dm')
    .neq('sender_id', viewerId)
    .eq('is_read', false);
}

/** "Sor" bağlamından hazır taslak metni üretir (input kutusuna basılır). */
export function draftTextFromContext(ctx: DmDraftContext): string {
  if (ctx.text) return ctx.text;
  if (ctx.productName) return `Merhaba, "${ctx.productName}" ürünü hakkında bir sorum var: `;
  if (ctx.orderLabel) return `Merhaba, ${ctx.orderLabel} numaralı siparişim hakkında bir sorum var: `;
  return '';
}
