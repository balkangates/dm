'use client';
// components/StoreDirectMessage.tsx
// Müşterinin bir mağazayla ÖZEL (1:1) yazıştığı panel. LiveStream.tsx'teki
// herkese açık canlı yayın sohbetiyle KARIŞTIRILMASIN — bu, tamamen ayrı
// bir konuşma kaydı (conversations.customer_id doldurulmuş) üzerinden
// çalışır. Ürün kartındaki "Sor" ve Siparişlerim'deki "Sor" linkleri bu
// paneli, ilgili bağlamı (product/order) önceden doldurulmuş şekilde açar.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useStoreDirectMessages } from '@/lib/hooks/useStoreDirectMessages';
import { draftTextFromContext, type DmDraftContext } from '@/lib/messaging';

export interface DirectMessageOpenRequest extends DmDraftContext {
  nonce: number; // aynı bağlamla tekrar tıklansa da widget'ın yeniden açılıp odaklanması için
}

export default function StoreDirectMessage({
  storeId,
  storeName,
  storeOwnerId,
  openRequest,
}: {
  storeId: string;
  storeName: string;
  storeOwnerId: string | null;
  // Dışarıdan (ProductCard "Sor", Siparişlerim "Sor") tetiklenen açılış isteği.
  openRequest: DirectMessageOpenRequest | null;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pendingCtx, setPendingCtx] = useState<{ storeProductId?: string | null; storeOrderId?: string | null } | null>(null);
  const { conversationId, messages, loading, sending, error, send } = useStoreDirectMessages(open ? storeId : null, storeOwnerId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dışarıdan gelen "Sor" isteği: paneli aç, taslak metni ve bağlamı yükle.
  useEffect(() => {
    if (!openRequest) return;
    setOpen(true);
    setInput(draftTextFromContext(openRequest));
    setPendingCtx({ storeProductId: openRequest.productId ?? null, storeOrderId: openRequest.orderId ?? null });
    setTimeout(() => inputRef.current?.focus(), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!input.trim()) return;
    await send(input, pendingCtx ?? undefined);
    setInput('');
    setPendingCtx(null);
  };

  if (!user) return null;

  return (
    <>
      {/* Yüzen tetikleyici buton */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)', color: '#000' }}
        title={`${storeName} ile mesajlaş`}
      >
        <i className="fas fa-comment-dots" />
      </button>

      {open && (
        <div
          className="fixed bottom-20 right-4 z-40 w-[92vw] max-w-sm rounded-2xl overflow-hidden flex flex-col"
          style={{ height: 440, background: '#0B1220', border: '1px solid #2A3650', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
        >
          <div className="flex items-center justify-between px-3 py-2.5" style={{ background: '#131C2C', borderBottom: '1px solid #2A3650' }}>
            <p className="text-white text-xs font-bold truncate">{storeName} — Mesajlar</p>
            <button onClick={() => setOpen(false)} className="text-[#5E7090] hover:text-white text-xs">
              <i className="fas fa-xmark" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {loading && <p className="text-[#5E7090] text-[11px] font-mono">Yükleniyor…</p>}
            {!loading && messages.length === 0 && (
              <p className="text-[#5E7090] text-[11px] font-mono">Henüz mesaj yok. {storeName} ile ilk mesajı sen gönder.</p>
            )}
            {messages.map((m) => {
              const isSelf = m.sender_id === user.id;
              return (
                <div key={m.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[80%] rounded-xl px-2.5 py-1.5 text-[11px]"
                    style={{
                      background: isSelf ? 'rgba(212,175,55,0.18)' : '#1E2A42',
                      color: isSelf ? '#D4AF37' : '#E5EAF3',
                      border: isSelf ? '1px solid rgba(212,175,55,0.35)' : '1px solid #2A3650',
                    }}
                  >
                    {m.store_product && (
                      <div className="text-[9px] font-mono mb-1 opacity-70">
                        <i className="fas fa-box mr-1" />{m.store_product.name}
                      </div>
                    )}
                    {m.store_order_id && !m.store_product && (
                      <div className="text-[9px] font-mono mb-1 opacity-70">
                        <i className="fas fa-receipt mr-1" />Sipariş #{m.store_order_id.slice(0, 8)}
                      </div>
                    )}
                    <p className="break-words leading-snug">{m.message}</p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {pendingCtx?.storeProductId && (
            <div className="px-3 py-1 text-[9px] font-mono flex items-center gap-1" style={{ color: '#D4AF37', background: 'rgba(212,175,55,0.08)' }}>
              <i className="fas fa-box" /> Ürün soruluyor
              <button className="ml-auto text-[#5E7090]" onClick={() => setPendingCtx(null)}><i className="fas fa-xmark" /></button>
            </div>
          )}
          {pendingCtx?.storeOrderId && (
            <div className="px-3 py-1 text-[9px] font-mono flex items-center gap-1" style={{ color: '#D4AF37', background: 'rgba(212,175,55,0.08)' }}>
              <i className="fas fa-receipt" /> Sipariş soruluyor
              <button className="ml-auto text-[#5E7090]" onClick={() => setPendingCtx(null)}><i className="fas fa-xmark" /></button>
            </div>
          )}

          {error && <p className="px-3 py-1 text-[10px] text-red-400 font-mono">{error}</p>}

          <div className="flex items-center gap-1.5 p-2.5" style={{ borderTop: '1px solid #2A3650' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              placeholder="Mesaj yaz…"
              disabled={sending || !conversationId}
              className="flex-1 rounded-lg px-3 py-2 text-white text-[11px] font-mono placeholder-white/30 focus:outline-none"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #2A3650' }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim() || !conversationId}
              className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D76E)' }}
            >
              <i className={`fas ${sending ? 'fa-spinner fa-spin' : 'fa-paper-plane'} text-black text-xs`} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
