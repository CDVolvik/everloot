import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import EmailAuthForm from "@/components/EmailAuthForm";
import { signInMethods } from "@/lib/auth/auth";
import { pageMetadata } from "@/lib/seo";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Sign in", description: "Sign in to your Everloot account with Battle.net or email.", path: "/sign-in" }),
  robots: { index: false, follow: true },
};

const battlenetButton = "inline-flex items-center justify-center min-h-11 px-4 rounded-lg border border-line text-sm text-fg hover:text-accent";

export default async function SignInPage() {
  if (await getUser().catch(() => null)) redirect("/account");
  const methods = signInMethods();
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold text-fg">Sign in</h1>
      {methods.battlenet && (
        <p><a href="/api/auth/bnet" className={battlenetButton}>Sign in with Battle.net</a></p>
      )}
      {methods.email ? (
        <>
          {methods.battlenet && <p className="text-sm text-muted">Or with your email:</p>}
          <EmailAuthForm mode="sign-in" />
          <p className="text-sm text-fg-2">
            New here? <Link href="/sign-up" className="text-accent hover:underline underline-offset-4">Make an account</Link>
            {" · "}
            <Link href="/reset-password" className="text-accent hover:underline underline-offset-4">Forgot your password?</Link>
          </p>
        </>
      ) : !methods.battlenet && <p className="text-fg-2">Sign-in is not available right now.</p>}
    </article>
  );
}
