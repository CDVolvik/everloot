/** The sizes an upload may have. The server enforces every one of them; the uploaders stay inside them. */
export declare const UPLOAD_LIMITS: {
    /** A request body above this is refused with 413. */
    readonly maxBodyBytes: 1000000;
    /** What an uploader puts in one request. */
    readonly batchBytes: 600000;
    /** Records in one request envelope. */
    readonly recordsPerBatch: 2000;
    /** Records one SavedVariables file may hold before the uploader asks for it to be split. */
    readonly recordsPerFile: 100000;
    /** The envelope's `addonVersion` length. */
    readonly addonVersionMax: 20;
    /** Verification grant tokens one upload may carry. */
    readonly grantTokensMax: 4;
    /** Auction scans from more realms than this in one upload are refused. */
    readonly realmsPerUpload: 3;
    /**
     * Census rows one install may report per UTC day, players seen and own characters. The rest are refused,
     * so one install cannot invent a crowd of character keys. A repeat of a row already counted is not a new one.
     */
    readonly censusSeenPerDay: 500;
    readonly censusSelfPerDay: 50;
};
