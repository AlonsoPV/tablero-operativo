/** Meta MX: el tablero guarda 52XXXXXXXXXX; el webhook llega como 521XXXXXXXXXX. */
export function whatsappPhoneVariants(raw: string | null | undefined): string[] {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return []
  const out = new Set<string>([digits])
  if (digits.length === 10) {
    out.add(`52${digits}`)
    out.add(`521${digits}`)
  }
  if (digits.length === 12 && digits.startsWith('52') && !digits.startsWith('521')) {
    const local = digits.slice(2)
    out.add(local)
    out.add(`521${local}`)
  }
  if (digits.length === 13 && digits.startsWith('521')) {
    const local = digits.slice(3)
    out.add(local)
    out.add(`52${local}`)
  }
  return [...out]
}
