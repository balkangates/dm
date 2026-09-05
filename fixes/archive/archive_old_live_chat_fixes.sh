#!/usr/bin/env bash
# =====================================================================
# archive_old_live_chat_fixes.sh
# ─────────────────────────────────────────────────────────────────────
# fix_live_chat_consolidated_final.sql PART 1+2 başarıyla uygulanıp
# doğrulandıktan SONRA, kendi repo'nuzda (bu script'in çalıştığı dizin
# fixes/ klasörünün bulunduğu proje kökü olmalı) çalıştırın.
#
# Ne yapar: 9 eski fix_live_chat_*.sql dosyasını fixes/archive/ altına
# taşır, her birinin başına "artık geçersiz, bkz. konsolide dosya"
# notu ekler. git mv kullanır (git geçmişini korur).
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."  # gerekirse proje köküne göre düzeltin
mkdir -p fixes/archive

NOTE_HEADER='-- =====================================================================
-- ⚠️ ARŞİVLENDİ — bu dosya artık AKTİF DEĞİL.
-- Güncel/tek kaynak: fixes/fix_live_chat_consolidated_final.sql
-- Bu dosya sadece TARİHSEL REFERANS için tutuluyor (hangi denemenin
-- ne zaman, neden yapıldığını görmek isterseniz).
-- =====================================================================

'

FILES=(
  "fix_store_live_chat.sql"
  "fix_live_chat_cross_visibility.sql"
  "fix_live_chat_cross_visibility_v2.sql"
  "fix_live_chat_participants_v3.sql"
  "fix_live_chat_conversation_rollback.sql"
  "fix_live_chat_final.sql"
  "fix_live_chat_legacy_read.sql"
  "fix_live_chat_store_isolation.sql"
  "fix_live_chat_participants_v5.sql"
)

for f in "${FILES[@]}"; do
  if [ -f "fixes/$f" ]; then
    # Not: dosya zaten bir "SÜPER EDİLDİ" notuyla başlıyorsa (örn.
    # fix_live_chat_legacy_read.sql) tekrar eklemeyin — kontrol edin.
    if ! grep -q "ARŞİVLENDİ" "fixes/$f"; then
      { printf '%s' "$NOTE_HEADER"; cat "fixes/$f"; } > "fixes/$f.tmp"
      mv "fixes/$f.tmp" "fixes/$f"
    fi
    git mv "fixes/$f" "fixes/archive/$f"
    echo "Arşivlendi: fixes/$f -> fixes/archive/$f"
  else
    echo "UYARI: fixes/$f bulunamadı, atlandı." >&2
  fi
done

echo ""
echo "Bitti. fixes/ altında artık sadece güncel dosyalar kalmalı:"
ls fixes/*.sql 2>/dev/null || true
echo ""
echo "Kontrol edin ve commit'leyin:"
echo "  git status"
echo "  git commit -m 'fix_live_chat_*: 9 dosyayı consolidated_final ile değiştir, eskiler archive/'"
