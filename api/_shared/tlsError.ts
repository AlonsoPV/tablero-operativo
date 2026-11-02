/** Detecta fallos TLS típicos en Windows (proxy/antivirus / CA del sistema). */
export function isTlsCertificateError(error: unknown): boolean {
  const text = [
    error instanceof Error ? error.message : '',
    error instanceof Error && 'cause' in error && error.cause instanceof Error
      ? error.cause.message
      : '',
    error instanceof Error && 'cause' in error && error.cause && typeof error.cause === 'object'
      ? String((error.cause as { code?: string }).code ?? '')
      : '',
  ]
    .join(' ')
    .toLowerCase()

  return (
    text.includes('unable to verify the first certificate') ||
    text.includes('unable_to_verify_leaf_signature') ||
    text.includes('self-signed certificate') ||
    text.includes('cert_authority_invalid') ||
    text.includes('unable to get local issuer certificate')
  )
}

export const TLS_CERTIFICATE_USER_MESSAGE =
  'Node no confio en el certificado TLS al llamar a Gemini (comun con antivirus/proxy). Reinicia con npm run dev (usa --use-system-ca) o configura NODE_EXTRA_CA_CERTS.'
