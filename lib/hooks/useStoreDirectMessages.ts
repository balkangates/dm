'use client';
// lib/hooks/useStoreDirectMessages.ts
// Bir (storeId, customerId=auth.uid()) çifti için özel/1:1 sohbeti
// yönetir: konuşmayı bulur/oluşturur (get_or_create_store_dm_conversation
// RPC'si — DB'de store_id+customer_id eşleşmesine göre TEK kayıt garanti
// eder), geçmişi çeker, realtime dinler, mesaj gönderir.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import {
  fetchDmMessages, getOrCreateStoreDmConversation, markDmConversationRead,
  sendDmMessage, type DmMessage,
} from '@/lib/messaging';

export function useStoreDirectMessages(storeId: string | null, storeOwnerId: string | null) {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!storeId || !user) { setConversationId(null); setMessages([]); return; }
    const key = `${storeId}:${user.id}`;
    if (inFlight.current === key) return;
    inFlight.current = key;

    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrCreateStoreDmConversation(storeId)
      .then(async (id) => {
        if (cancelled) return;
        setConversationId(id);
        const msgs = await fetchDmMessages(id);
        if (!cancelled) setMessages(msgs);
        await markDmConversationRead(id, user.id);
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'CONVERSATION_ERROR'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [storeId, user]);

  // Realtime — karşı tarafın (bayi) yeni mesajı anlık düşsün.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`dm_customer_${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          if (row.message_type !== 'dm') return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (user && row.sender_id !== user.id) markDmConversationRead(conversationId, user.id);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user]);

  const send = useCallback(async (text: string, ctx?: { storeProductId?: string | null; storeOrderId?: string | null }) => {
    if (!user || !conversationId || !storeId || !storeOwnerId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await sendDmMessage({
        conversationId, storeId, senderId: user.id, receiverId: storeOwnerId,
        text: trimmed, storeProductId: ctx?.storeProductId ?? null, storeOrderId: ctx?.storeOrderId ?? null,
      });
    } catch (e) {
      setError((e as Error).message || 'SEND_ERROR');
    } finally {
      setSending(false);
    }
  }, [user, conversationId, storeId, storeOwnerId]);

  return { conversationId, messages, loading, sending, error, send };
}
