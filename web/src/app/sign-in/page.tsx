import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import EmailAuthForm from "@/components/EmailAuthForm";
import { authV2Enabled, signInMethods } from "@/lib/auth/auth";
import { profilesOn } from "@/lib/auth/device-accounts";
import { safeReturnTo } from "@/lib/auth/return-to";
import { pageMetadata } from "@/lib/seo";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Sign in", description: "Sign in to your Everloot account with Battle.net or email.", path: "/sign-in" }),
  robots: { index: false, follow: true },
};

const battlenetButton = "inline-flex items-center justify-center min-h-11 px-4 rounded-lg border border-line text-sm text-fg hover:text-accent";

// `?returnTo=/path` brings the visitor back to the page that sent them here (Save in the talent calculator, /me).
// `?add=1` (Add another account, in the avatar menu) keeps the signed-in account: with Better Auth's multi-session
// plugin a second sign-in adds an account to this browser instead of replacing the first.
export default async function SignInPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string | string[]; add?: string | string[] }> }) {
  const params = await searchParams;
  const add = params?.add === "1" && authV2Enabled() && profilesOn();
  const returnTo = safeReturnTo(params?.returnTo) ?? (add ? "/" : null);
  if (!add && await getUser().catch(() => null)) redirect(returnTo ?? "/account");
  const methods = signInMethods();
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold text-fg">{add ? "Add another account" : "Sign in"}</h1>
      {add && methods.battlenet && <p className="text-sm text-fg-2">To add a different Battle.net account, sign out of Battle.net first.</p>}
      {methods.battlenet && (
        <p><a href={returnTo ? `/api/auth/bnet?returnTo=${encodeURIComponent(returnTo)}` : "/api/auth/bnet"} className={battlenetButton}>Sign in with Battle.net</a></p>
      )}
      {methods.email ? (
        <>
          {methods.battlenet && <p className="text-sm text-muted">Or with your email:</p>}
          <EmailAuthForm mode="sign-in" returnTo={returnTo ?? undefined} />
          <p className="text-sm text-fg-2">
            New here? <Link href={returnTo ? `/sign-up?returnTo=${encodeURIComponent(returnTo)}` : "/sign-up"} className="text-accent hover:underline underline-offset-4">Make an account</Link>
            {" · "}
            <Link href="/reset-password" className="text-accent hover:underline underline-offset-4">Forgot your password?</Link>
          </p>
        </>
      ) : !methods.battlenet && <p className="text-fg-2">Sign-in is not available right now.</p>}
    </article>
  );
}
