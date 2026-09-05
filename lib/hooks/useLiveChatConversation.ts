'use client';
// lib/hooks/useLiveChatConversation.ts
// ─────────────────────────────────────────────────────────────────────────
// Bir mağazanın canlı sohbet odasına "girmenin" GÜVENLİ tek yolu. Yarış
// durumuna karşı korumalı:
//   - Asıl garanti DB tarafında: get_or_create_store_live_conversation()
//     RPC'si conversation + conversation_participants kaydını TEK
//     transaction'da, ON CONFLICT DO NOTHING ile atomik olarak sağlıyor
//     (bkz. fixes/fix_live_chat_participants_v3.sql). Yani iki sekme aynı
//     anda mount olsa bile çift katılımcı satırı OLUŞMAZ.
//   - Client tarafında da EK bir koruma var: aynı (storeId, userId) çifti
//     için art arda gelen render'larda RPC'yi tekrar tekrar çağırmamak
//     için bir ref ile "zaten istek attık" işaretleniyor.
//
// Edge case'ler:
//   - Kullanıcı giriş yapmamışsa (auth.uid() yok) → RPC hiç çağrılmaz,
//     error: 'AUTH_REQUIRED' döner, component "giriş yapmalısınız" UI'ı
//     gösterebilir.
//   - Ağ hatası / RPC hatası → error state'e yazılır, conversationId
//     null kalır, çağıran taraf yeniden deneme (retry) butonu gösterebilir.
//   - storeId değişirse (başka mağazaya geçiş) → state sıfırlanıp yeniden
//     denenir.
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

interface UseLiveChatConversationResult {
  conversationId: string | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useLiveChatConversation(storeId: string | null | undefined): UseLiveChatConversationResult {
  const { user, loading: authLoading } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aynı (storeId, userId) için tekrar tekrar RPC atmayı önlemek için.
  const inFlightKey = useRef<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const retry = useCallback(() => {
    inFlightKey.current = null;
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!storeId) {
      setConversationId(null);
      setLoading(false);
      return;
    }

    // Auth henüz yüklenmediyse bekle — erken "AUTH_REQUIRED" hatası
    // vermemek için (kullanıcı aslında giriş yapmış olabilir, sadece
    // profil/oturum bilgisi henüz gelmedi).
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setConversationId(null);
      setLoading(false);
      setError('AUTH_REQUIRED');
      return;
    }

    const key = `${storeId}:${user.id}:${retryTick}`;
    if (inFlightKey.current === key) return; // aynı istek zaten atıldı/atılıyor
    inFlightKey.current = key;

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc('get_or_create_store_live_conversation', { p_store_id: storeId })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          console.error('[useLiveChatConversation] RPC hatası:', rpcError);
          setError(rpcError.message || 'CONVERSATION_ERROR');
          setConversationId(null);
        } else {
          setConversationId(data as string);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [storeId, user, authLoading, retryTick]);

  return { conversationId, loading, error, retry };
}
