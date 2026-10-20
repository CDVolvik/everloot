import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import ApiKeys from "@/components/ApiKeys";
import { authV2Enabled, getAuth } from "@/lib/auth/auth";
import { isPlaceholderEmail } from "@/lib/auth/battlenet";
import { pageMetadata } from "@/lib/seo";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Your account", description: "Your Everloot account settings.", path: "/account" }),
  robots: { index: false, follow: false },
};

const methodNames: Record<string, string> = { battlenet: "Battle.net", credential: "Email and password" };

// With Better Auth on, the session also carries the email and the sign-in methods.
async function details() {
  if (!authV2Enabled()) return { email: null, methods: ["battlenet"] };
  const requestHeaders = await headers();
  const [session, accounts] = await Promise.all([
    getAuth().api.getSession({ headers: requestHeaders }),
    getAuth().api.listUserAccounts({ headers: requestHeaders }),
  ]);
  const email = session?.user.email;
  return { email: email && !isPlaceholderEmail(email) ? email : null, methods: accounts.map((a) => a.providerId) };
}

export default async function AccountPage() {
  let account;
  try {
    const user = await getUser();
    account = user && { user, ...await details() };
  } catch {
    return (
      <article className="max-w-3xl space-y-4">
        <h1 className="text-3xl font-bold text-fg">Your account</h1>
        <p role="alert" className="text-fg-2">Your account is unavailable right now. Try again in a minute.</p>
      </article>
    );
  }
  if (!account) redirect("/sign-in");
  const { user, email, methods } = account;
  return (
    <article className="max-w-3xl space-y-8">
      <h1 className="text-3xl font-bold text-fg">Your account</h1>

      <section className="space-y-2">
        <h2 className="text-xl text-fg">Profile</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Name</dt><dd className="text-fg">{user.name}</dd>
          {email && <><dt className="text-muted">Email</dt><dd className="text-fg">{email}</dd></>}
          <dt className="text-muted">Signs in with</dt>
          <dd className="text-fg">{methods.map((m) => methodNames[m] ?? m).join(", ")}</dd>
        </dl>
        {methods.includes("credential") && (
          <p className="text-sm text-fg-2">
            <Link href="/reset-password" className="text-accent hover:underline underline-offset-4">Change your password</Link>
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl text-fg">API keys</h2>
        <p className="text-sm text-fg-2">
          Keys for the Everloot API and MCP server. How to use them is in <Link href="/docs/api/keys" className="text-accent hover:underline underline-offset-4">the docs</Link>.
        </p>
        <ApiKeys />
      </section>
    </article>
  );
}
