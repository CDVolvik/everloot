import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import EmailAuthForm from "@/components/EmailAuthForm";
import { signInMethods } from "@/lib/auth/auth";
import { pageMetadata } from "@/lib/seo";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Make an account", description: "Make a free Everloot account with your email or Battle.net.", path: "/sign-up" }),
  robots: { index: false, follow: true },
};

export default async function SignUpPage() {
  if (await getUser().catch(() => null)) redirect("/account");
  const methods = signInMethods();
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold text-fg">Make an account</h1>
      {methods.battlenet && (
        <p className="text-fg-2">
          Play on Battle.net? <a href="/api/auth/bnet" className="text-accent hover:underline underline-offset-4">Sign in with Battle.net</a>; your
          first sign-in makes the account.
        </p>
      )}
      {methods.email
        ? <EmailAuthForm mode="sign-up" />
        : <p className="text-fg-2">Email sign-up is not open yet.</p>}
      <p className="text-sm text-fg-2">
        Already have one? <Link href="/sign-in" className="text-accent hover:underline underline-offset-4">Sign in</Link>.
        {" "}By making an account you agree to the <Link href="/terms" className="text-accent hover:underline underline-offset-4">Terms</Link> and
        the <Link href="/privacy" className="text-accent hover:underline underline-offset-4">Privacy Policy</Link>.
      </p>
    </article>
  );
}
