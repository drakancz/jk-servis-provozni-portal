import { createAuthClient } from "better-auth/react";

/**
 * Přihlášení z prohlížeče. Volá `/api/auth` na téže adrese, takže omezení
 * pokusů i kontrola původu požadavku platí jako u každého jiného volání.
 */
export const authKlient = createAuthClient();
