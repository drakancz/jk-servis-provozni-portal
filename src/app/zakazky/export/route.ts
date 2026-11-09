import { exportZakazek, nazevExportu } from "@/lib/export";
import { precti } from "@/lib/hledani";
import { stavSchema } from "@/lib/prideleni";
import { prihlaseny } from "@/lib/sezeni";

/**
 * Export zakázek do Excelu (krok 3C). Oprávnění (Jakub, 8. 11. 2026):
 * stáhne ho **Majitel a Dispečer**. Nepřihlášený dostane 401, Technik 404.
 * `?q=` a `?stav=` jako v seznamu zakázek; nesmyslný stav se tiše ignoruje.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const kdo = await prihlaseny();
  if (!kdo) return new Response("Nepřihlášeno.", { status: 401 });
  if (kdo.role !== "MAJITEL" && kdo.role !== "DISPECER") {
    return new Response("Nenalezeno.", { status: 404 });
  }
  const parametry = new URL(request.url).searchParams;
  const hledany = precti(parametry.get("q") ?? undefined);
  const stavParam = stavSchema.safeParse(parametry.get("stav") ?? undefined);
  const stav = stavParam.success ? stavParam.data : null;

  const sesit = await exportZakazek(kdo, hledany, stav);
  return new Response(Buffer.from(sesit), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nazevExportu()}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
