"use client";

import { useEffect, useState } from "react";
import { Headphones, LoaderCircle, VideoOff } from "lucide-react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

type RoomData = { token: string; serverUrl: string };
export function LiveRoom({ callId, closed }: { callId: string; closed: boolean }) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (closed) return;
    let active = true;
    fetch(`/api/live/${callId}/token`, { cache: "no-store" }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Görüşme bağlantısı kurulamadı.");
      return data as RoomData;
    }).then((data) => { if (active) setRoom(data); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Bağlantı kurulamadı."); });
    return () => { active = false; };
  }, [callId, closed]);
  if (closed) return <div className="help-card"><VideoOff size={20} /><p>Bu görüşme sona erdi. Mesaj geçmişi görüntülenebilir.</p></div>;
  if (error) return <div className="help-card"><Headphones size={22} /><h3>Mesajlaşma kullanılabilir</h3><p>{error}</p></div>;
  if (!room) return <div className="help-card"><LoaderCircle size={22} className="animate-spin" /><p>Görüşme hazırlanıyor...</p></div>;
  return <div className="video-frame"><LiveKitRoom token={room.token} serverUrl={room.serverUrl} connect={true} video={true} audio={true} data-lk-theme="default"><VideoConference /></LiveKitRoom></div>;
}
