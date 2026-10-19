/** The sizes an upload may have. The server enforces every one of them; the uploaders stay inside them. */
export const UPLOAD_LIMITS = {
  /** A request body above this is refused with 413. */
  maxBodyBytes: 1_000_000,
  /** What an uploader puts in one request. */
  batchBytes: 600_000,
  /** Records in one request envelope. */
  recordsPerBatch: 2000,
  /** Records one SavedVariables file may hold before the uploader asks for it to be split. */
  recordsPerFile: 100_000,
  /** The envelope's `addonVersion` length. */
  addonVersionMax: 20,
  /** Verification grant tokens one upload may carry. */
  grantTokensMax: 4,
  /** Auction scans from more realms than this in one upload are refused. */
  realmsPerUpload: 3,
  /**
   * Census rows one install may report per UTC day, players seen and own characters. The rest are refused,
   * so one install cannot invent a crowd of character keys. A repeat of a row already counted is not a new one.
   */
  censusSeenPerDay: 500,
  censusSelfPerDay: 50,
} as const;
