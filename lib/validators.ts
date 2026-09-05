// lib/validators.ts — Faz 7b: TC Kimlik No / telefon / vergi no doğrulama.
// Yalnızca FORMAT doğrular (gerçekten o kişiye ait olduğunu kanıtlamaz —
// bunun için e-Devlet/NVI entegrasyonu gerekir, kapsam dışı). Amaç: bariz
// yanlış/uydurma girişleri ve kopyala-yapıştır hatalarını yakalamak.

/** Resmi TC Kimlik No checksum algoritması (Nüfus ve Vatandaşlık İşleri). */
export function isValidTcKimlikNo(raw: string): boolean {
  const s = raw.replace(/\D/g, '');
  if (s.length !== 11) return false;
  if (s[0] === '0') return false;
  const digits = s.split('').map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const d10 = (oddSum * 7 - evenSum) % 10;
  if (d10 !== digits[9]) return false;
  const first10Sum = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  const d11 = first10Sum % 10;
  if (d11 !== digits[10]) return false;
  return true;
}

/** 05XX XXX XX XX formatına normalize eder; geçersizse null döner. */
export function normalizeTrPhone(raw: string): string | null {
  let s = raw.replace(/\D/g, '');
  if (s.startsWith('90') && s.length === 12) s = s.slice(2);
  if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  if (s.length !== 10 || !s.startsWith('5')) return null;
  return '0' + s;
}

/** VKN (10 hane) ya da şahıs işletmesi için TC Kimlik No (11 hane) kabul eder. */
export function isValidTaxNumber(raw: string): boolean {
  const s = raw.replace(/\D/g, '');
  return s.length === 10 || s.length === 11;
}
