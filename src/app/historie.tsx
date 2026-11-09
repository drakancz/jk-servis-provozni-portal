import { historie, type Entita } from "@/lib/historie";
import { DATUM_CAS } from "@/lib/role";

import { KARTA } from "./styly";

/** Historie změn záznamu: kdo, kdy, co (bez hodnot polí). */
export async function Historie({ entita, id }: { entita: Entita; id: string }) {
  const zaznamy = await historie(entita, id);
  if (zaznamy.length === 0) return null;
  return (
    <section aria-labelledby="historie" className={KARTA}>
      <h2 id="historie" className="text-xl font-bold">
        Historie
      </h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {zaznamy.map((z) => (
          <li key={z.id} className="flex flex-wrap gap-x-2">
            <span className="text-text-tlumeny">{DATUM_CAS.format(z.kdy)}</span>
            <span>
              <span className="font-medium">{z.akce}</span>
              {z.detail ? `: ${z.detail}` : ""} · {z.kdo}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
