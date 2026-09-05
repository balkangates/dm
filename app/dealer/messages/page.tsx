'use client';
// app/dealer/messages/page.tsx
// Bayi gelen kutusu: mağazasına yazan HER müşteri için AYRI bir
// konuşma satırı (conversations.customer_id ile ayrışır — bkz.
// fixes/fix_dm_customer_store_messaging.sql). Soldan müşteri seçilir,
// sağda o müşteriyle olan özel yazışma geçmişi görünür ve cevap SADECE
// o müşteriye (receiver_id = customer_id) gider — mağaza müşterilerine
// "genel" bir canlı yayın mesajı bunun dışında, LiveStream.tsx üzerinden
// devam eder.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { ensureStore } from '@/lib/dealer';
import { listStoreDmConversations, type DmConversationSummary, type DmMessage } from '@/lib/messaging';

const CARD = { background: '#131C2C', border: '1px solid #2A3650' };

export default function DealerMessagesPage() {
  const { profile } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<DmConversationSummary[]>([]);
  const [selected, setSelected] = useState<DmConversationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');

  const loadInbox = useCallback(async (sId: string) => {
    const rows = await listStoreDmConversations(sId);
    setConversations(rows);
  }, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const s = await ensureStore(profile.id);
      if (s) { setStoreId(s.id); await loadInbox(s.id); }
      setLoading(false);
    })();
  }, [profile, loadInbox]);

  // Yeni müşteri mesajı gelince gelen kutusunu tazele.
  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`dealer_inbox_${storeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `store_id=eq.${storeId}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((payload.new as any).message_type === 'dm') loadInbox(storeId);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, loadInbox]);

  // "selected" müşteri değişince o konuşmayı açan hook — dealer,
  // storeOwnerId olarak profile.id'yi, storeId olarak mevcut mağazayı
  // kullanır; ama okunacak/gönderilecek conversation zaten seçili
  // müşterinin conversation_id'sine sabit — bu yüzden hook'u burada
  // DOĞRUDAN kullanmak yerine basit bir thread state'i tutuyoruz.
  const [thread, setThread] = useState<DmMessage[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!selected) { setThread([]); return; }
    let cancelled = false;
    (async () => {
      const { fetchDmMessages, markDmConversationRead } = await import('@/lib/messaging');
      const rows = await fetchDmMessages(selected.conversation_id);
      if (!cancelled) setThread(rows);
      if (profile) await markDmConversationRead(selected.conversation_id, profile.id);
    })();
    return () => { cancelled = true; };
  }, [selected, profile]);

  useEffect(() => {
    if (!selected) return;
    const channel = supabase
      .channel(`dealer_thread_${selected.conversation_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selected.conversation_id}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          if (row.message_type !== 'dm') return;
          setThread((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected]);

  const handleSend = async () => {
    if (!input.trim() || !selected || !profile || !storeId) return;
    setSending(true);
    try {
      const { sendDmMessage } = await import('@/lib/messaging');
      // receiver_id burada NET: seçili konuşmanın customer_id'si —
      // yani cevap her zaman DOĞRU müşteriye gider, başka bir müşteriye
      // karışması mümkün değil (RLS de bunu ayrıca garanti eder).
      await sendDmMessage({
        conversationId: selected.conversation_id, storeId, senderId: profile.id,
        receiverId: selected.customer_id, text: input.trim(),
      });
      setInput('');
      if (storeId) await loadInbox(storeId);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="text-[#5E7090] font-mono text-sm">Yükleniyor…</p>;

  return (
    <div className="space-y-4">
      <p className="text-white font-black text-lg">Mesajlar</p>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Müşteri listesi */}
        <div className="rounded-xl overflow-hidden" style={CARD}>
          {conversations.length === 0 && (
            <p className="text-[#5E7090] text-xs font-mono p-3">Henüz müşteri mesajı yok.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.conversation_id}
              onClick={() => setSelected(c)}
              className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 border-b border-[#1E2A42] last:border-b-0"
              style={{ background: selected?.conversation_id === c.conversation_id ? 'rgba(212,175,55,0.1)' : 'transparent' }}
            >
              <div className="min-w-0">
                <p className="text-white text-xs font-bold truncate">{c.customer_name}</p>
                <p className="text-[#5E7090] text-[10px] font-mono truncate">{c.last_message_preview || '—'}</p>
              </div>
              {c.unread_count > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-black"
                  style={{ background: '#EF4444', color: '#fff' }}>
                  {c.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Seçili müşteriyle yazışma */}
        <div className="rounded-xl flex flex-col" style={{ ...CARD, height: 480 }}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-[#5E7090] text-xs font-mono">
              Soldan bir müşteri seçin.
            </div>
          ) : (
            <>
              <div className="px-3 py-2.5 border-b border-[#1E2A42]">
                <p className="text-white text-xs font-bold">{selected.customer_name}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {thread.map((m) => {
                  const isSelf = m.sender_id === profile?.id;
                  return (
                    <div key={m.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[75%] rounded-xl px-2.5 py-1.5 text-[11px]"
                        style={{
                          background: isSelf ? 'rgba(212,175,55,0.18)' : '#1E2A42',
                          color: isSelf ? '#D4AF37' : '#E5EAF3',
                          border: isSelf ? '1px solid rgba(212,175,55,0.35)' : '1px solid #2A3650',
                        }}>
                        {m.store_product && (
                          <div className="text-[9px] font-mono mb-1 opacity-70"><i className="fas fa-box mr-1" />{m.store_product.name}</div>
                        )}
                        {m.store_order_id && !m.store_product && (
                          <div className="text-[9px] font-mono mb-1 opacity-70"><i className="fas fa-receipt mr-1" />Sipariş #{m.store_order_id.slice(0, 8)}</div>
                        )}
                        <p className="break-words leading-snug">{m.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 p-2.5 border-t border-[#1E2A42]">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  placeholder={`${selected.customer_name} adlı müşteriye yanıt yaz…`}
                  disabled={sending}
                  className="flex-1 rounded-lg px-3 py-2 text-white text-[11px] font-mono placeholder-white/30 focus:outline-none"
                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #2A3650' }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)' }}
                >
                  <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'} text-black text-xs`} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
