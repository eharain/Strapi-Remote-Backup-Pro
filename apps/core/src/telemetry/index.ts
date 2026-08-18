/**
 * Structured logging and run reports.
 *
 * Logs go to stderr so stdout stays reserved for the sidecar handshake and for
 * machine-readable CLI output.
 *
 * Credentials, tokens, and passphrases are redacted at the logger rather than at
 * each call site — a support log is exactly the thing users paste into a public
 * issue tracker.
 */
export {};
