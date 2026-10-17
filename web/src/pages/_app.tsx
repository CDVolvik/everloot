import type { AppProps } from "next/app";
import "../app/globals.css";
import { fontVariables } from "../app/fonts";

// Only the 500 page below uses the Pages Router: a render that fails while a lore page is being built
// on demand never reaches the app's error boundary, so Next falls back to pages/500.
export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${fontVariables} min-h-screen`}>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Component {...pageProps} />
      </main>
    </div>
  );
}
