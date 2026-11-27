import type { SupabaseClient, User } from "@supabase/supabase-js";

// One slow auth response (a cold connection, a busy database) used to be read as
// "signed out" and bounced the user to the login page. Retry once with a fresh
// attempt before giving up. Failing closed is unchanged: if no attempt returns a
// verified user, the caller still treats the request as having no session.
export const GET_USER_ATTEMPT_MS = 4000;
export const GET_USER_ATTEMPTS = 2;

type GetUserResult = { data: { user: User | null } };

export async function getUserWithRetry(
  supabase: Pick<SupabaseClient, "auth">,
  pathname: string,
  attemptMs = GET_USER_ATTEMPT_MS,
  attempts = GET_USER_ATTEMPTS,
): Promise<GetUserResult> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), attemptMs);
    });
    try {
      const result = await Promise.race([supabase.auth.getUser(), timeout]);
      if (result !== "timeout") return result;
      console.error(
        `[proxy:getUserWithTimeout] supabase.auth.getUser() did not respond within ${attemptMs}ms for ${pathname} (attempt ${attempt}/${attempts}).`,
      );
    } catch (error) {
      console.error(
        `[proxy:getUserWithTimeout] supabase.auth.getUser() threw for ${pathname} (attempt ${attempt}/${attempts}).`,
        error,
      );
    } finally {
      clearTimeout(timer!);
    }
  }
  console.error(
    `[proxy:getUserWithTimeout] no verified user for ${pathname} after ${attempts} attempts - treating as no session.`,
  );
  return { data: { user: null } };
}
