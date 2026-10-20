// What the header, the avatar menu and the signed-in home know about the player
// (docs/design/specs/2026-10-20-account-shell-design.md). Types only, so both sides can import it.

export interface ShellCharacter {
  id: string;
  name: string;
  classSlug: string;
  realm: string | null;
}

export interface AccountStatus {
  emoji: string | null;
  text: string;
  /** ISO time after which the status reads as unset; null: until changed. */
  clearsAt: string | null;
}

export interface AccountShell {
  userId: string;
  /** The account name from sign-in (BattleTag or email name); shown only to its owner. */
  name: string;
  handle: string | null;
  displayName: string;
  status: AccountStatus | null;
  publicProfile: boolean;
  characters: ShellCharacter[];
  mainCharacterId: string | null;
  /** The character the player is on now; defaults to the main character. */
  activeCharacterId: string | null;
}

/** One account signed in on this browser, for the account switcher. */
export interface DeviceAccount {
  userId: string;
  displayName: string;
  handle: string | null;
  current: boolean;
}
