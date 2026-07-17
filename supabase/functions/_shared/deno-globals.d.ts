/**
 * Tipos mínimos de Deno para el language service de TypeScript del IDE.
 * Se fusiona con `declare namespace Deno` de las libs nativas (no usar `var Deno`).
 */
declare namespace Deno {
  function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void

  const env: {
    get(key: string): string | undefined
  }
}
