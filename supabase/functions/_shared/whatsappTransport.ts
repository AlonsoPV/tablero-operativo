export async function sendWhatsAppGraphMessage(
  config: { accessToken: string; phoneNumberId: string; graphVersion: string },
  body: Record<string, unknown>
) {
  const { accessToken, phoneNumberId, graphVersion } = config
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    }
  )
  const raw = await response.text()
  let json: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      json = parsed as Record<string, unknown>
    }
  } catch {
    json = { raw }
  }
  return { ok: response.ok, status: response.status, json, raw }
}
