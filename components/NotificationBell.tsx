'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  loadMyNotifications,
  countUnread,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToMyNotifications,
  NOTIFICATION_ICON,
  NOTIFICATION_COLOR,
  timeAgo,
  type AppNotification,
} from '@/lib/notifications';

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const [list, count] = await Promise.all([loadMyNotifications(20), countUnread()]);
    setItems(list);
    setUnread(count);
    setLoaded(true);
  };

  useEffect(() => {
    if (!user) return;
    countUnread().then(setUnread);
    const unsub = subscribeToMyNotifications(user.id, () => {
      setUnread((n) => n + 1);
      if (open) refresh();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (open && !loaded) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;

  const handleClickItem = async (n: AppNotification) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
      setUnread((c) => Math.max(0, c - 1));
      try {
        await markNotificationRead(n.id);
      } catch {
        // sessiz geç
      }
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      // sessiz geç
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: '#131C2C', border: '1px solid #2A3650', color: '#A3B3D1' }}
        aria-label="Bildirimler"
      >
        <i className="fas fa-bell" style={{ fontSize: 13 }} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white"
            style={{ background: '#EF4444' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl z-40"
          style={{ background: '#131C2C', border: '1px solid #2A3650' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1E2A42] sticky top-0" style={{ background: '#131C2C' }}>
            <p className="text-white font-bold text-xs">Bildirimler</p>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-[10px] font-mono text-[#D4AF37]">
                Hepsini okundu yap
              </button>
            )}
          </div>

          {!loaded ? (
            <p className="text-[#5E7090] text-xs font-mono px-4 py-6 text-center">Yükleniyor…</p>
          ) : items.length === 0 ? (
            <p className="text-[#5E7090] text-xs font-mono px-4 py-6 text-center">Henüz bildirimin yok.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClickItem(n)}
                className="w-full text-left flex items-start gap-2.5 px-4 py-2.5 border-b border-[#1E2A42] last:border-0"
                style={{ background: n.is_read ? 'transparent' : 'rgba(212,175,55,0.06)' }}
              >
                <i
                  className={`fas ${NOTIFICATION_ICON[n.type]} mt-0.5`}
                  style={{ color: NOTIFICATION_COLOR[n.type], fontSize: 12 }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs font-bold truncate">{n.title}</p>
                  <p className="text-[#5E7090] text-[11px] font-mono line-clamp-2">{n.message}</p>
                  <p className="text-[#5E7090] text-[10px] font-mono mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
                {!n.is_read && <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: '#D4AF37' }} />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
