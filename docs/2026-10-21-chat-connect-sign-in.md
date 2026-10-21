# Connecting a Chat provider by signing in

Carlos asked whether a player could sign in to their provider account instead of pasting a key, "like login in to the cli". This note says which providers allow that for an application like Everloot, which do not and why, and what each would cost. Nothing here is built. Each flow needs an application registered with the provider, and some need a secret. Registering those is the owner's step.

Unknown values are written [?]. Read again before building anything: these terms change.

## The short answer

- **OpenRouter allows it, and it is the cheapest to add.** It has a sign-in flow for third-party apps (OAuth with PKCE). The player signs in on openrouter.ai and the app receives an OpenRouter key that the player owns and can revoke. No client secret is involved. Whether an app must be registered first is [?]; the flow documented today takes only a callback URL. The key exchange can run in the player's browser, so the key still never reaches Everloot's servers.
- **A Claude or ChatGPT subscription cannot be used.** Claude Code and the Codex CLI sign in with the player's subscription. That sign-in is licensed for the vendor's own clients only, and neither vendor offers it to other applications. Using those tokens in Everloot would break the vendor's terms and could get the player's account suspended. The way in for both is an API key from the developer console, which is what Chat already takes.
- **Google is possible but costly.** Sign in with Google can grant access to the Gemini API on the player's own quota. It needs a Google Cloud project, an OAuth client and a consent screen. Google's review of the scope is [?]. The free sign-in that Gemini CLI uses is Google's own client, not one Everloot could use.
- **The Chinese providers take API keys only.** DeepSeek, Moonshot, Qwen, MiniMax, SiliconFlow, Baidu, Xiaomi, Z.ai, Tencent, BytePlus, StepFun and InternLM: none publishes a sign-in for third-party apps that I could find [?].
- **Ollama needs no sign-in.** It runs on the player's own computer.

## Per provider

| Provider | Third-party sign-in | Why or why not | What it would cost | What a player gains |
|---|---|---|---|---|
| OpenRouter | Yes, OAuth with PKCE | Built for apps like this; the player gets a key they can revoke | A callback page on everloot.app; no client secret; registration [?] | No key to copy. The player still pays per token from their OpenRouter credits, and free models stay free |
| Anthropic (Claude) | No | A Claude.ai subscription sign-in is for Anthropic's own apps; the API takes console keys only | Not possible within the terms | Nothing. A subscription does not cover API use |
| OpenAI (ChatGPT) | No [?] | ChatGPT sign-in in the Codex CLI is OpenAI's own client; whether "Sign in with ChatGPT" is offered to other apps is [?] | Not possible today, as far as I could find | Nothing today |
| Google (Gemini) | Possible | OAuth with the Gemini API scope, on the player's own Google project quota | One Google Cloud project, one OAuth client and secret, a consent screen; scope review [?] | Gemini without an AI Studio key, on their own quota |
| GitHub Models | Possible [?] | GitHub Models may accept a GitHub OAuth token with model access [?]; a Copilot subscription's own tokens are for Copilot clients | One GitHub OAuth app and its secret | Free-tier models with a GitHub account [?] |
| Chinese providers | No [?] | API keys only, as far as their docs show | Not possible | Nothing |
| Ollama | Not needed | Local | Nothing | Already keyless |

## If one is built

OpenRouter comes first. It is the only one that is clearly allowed, needs no secret, and serves every family in the catalogue. Its flow, in outline:

1. The page makes a code verifier and sends the player to openrouter.ai to sign in, with a callback URL on everloot.app and the verifier's challenge.
2. OpenRouter sends the player back with a code.
3. The page exchanges the code and the verifier for a key, straight from the browser to OpenRouter, and saves the key where a pasted one goes today (this browser, or the data folder in the Desktop App).

The Desktop App can run the same flow with a loopback callback. Each provider after OpenRouter is one more registered application and, for most, one more secret to keep. That is why this lane stops at the note.
