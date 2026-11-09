import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

/**
 * Rozhraní přihlášení (Better Auth): přihlášení, odhlášení, sezení.
 * Vědomá výjimka z „každá adresa ověří přihlášení“ — je to přihlášení
 * samo. Registrace je vypnutá (`disableSignUp`), pokusy omezené.
 */
export const { GET, POST } = toNextJsHandler(auth);
