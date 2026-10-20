import type { Metadata } from "next";
import Link from "next/link";
import ChatClient from "@/components/chat/ChatClient";
import { pageMetadata } from "@/lib/seo";

const TITLE = "Ask Everloot";
const description = "Ask about WoW: Forever in plain words. Your own AI model looks it up in Everloot's data and names the sources. Your key stays in your browser.";

export const metadata: Metadata = pageMetadata({ title: TITLE, description, path: "/chat" });

// No ad slot here: the page is a conversation, and a key form is no place for an ad.
export default function ChatPage() {
  return (
    <article className="space-y-6 max-w-3xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">Chat · Bring your own key</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg">{TITLE}</h1>
        <p className="text-lg text-fg-2">{description}</p>
      </header>

      <ChatClient />

      <section className="pt-6 border-t border-line space-y-3 text-sm text-fg-2">
        <h2 className="text-xl text-fg">How it works</h2>
        <p>
          The model is yours: an Anthropic or OpenRouter key (OpenRouter has a free model), or Ollama running on your
          computer. Your key and this conversation are kept in this browser only, and the questions go from this page
          straight to that provider. Everloot never receives your key. Remove it here, or clear this site&apos;s data in
          your browser, to forget it.
        </p>
        <p>
          The model looks things up with Everloot&apos;s own read-only tools: the database, the lore archive, recipes,
          market values and the change tracker. Each answer lists the sources those tools returned; a part the tools could
          not back says it comes from the model&apos;s own knowledge. Without a key you get the search hits as they are.
        </p>
        <p>
          The <Link href="/connect" className="underline hover:text-accent">Everloot connector</Link> brings the same tools
          to Claude and ChatGPT, and the Everloot Desktop App has this chat with your own characters&apos; gold and scans too.
        </p>
      </section>
    </article>
  );
}
