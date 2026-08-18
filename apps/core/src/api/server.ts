/**
 * The localhost API the desktop app drives.
 *
 * This is the same surface the CLI calls in-process, so there is exactly one
 * implementation of every operation and the GUI can never quietly diverge from
 * the command line.
 *
 * Startup handshake, which the .NET supervisor depends on:
 *   1. bind to port 0 — the OS picks a free port, so two instances never collide
 *   2. print one line of JSON to stdout: {"port":54123,"token":"..."}
 *   3. speak nothing else on stdout; logs go to stderr
 *
 * The supervisor reads that line and switches to HTTP immediately. It never
 * parses human-readable output — that coupling breaks the moment a log message
 * is reworded.
 *
 * Two non-negotiables: bind to 127.0.0.1 only, and require the bearer token on
 * every request. This process holds live admin credentials for someone's CMS, and
 * a port bound to 0.0.0.0 would hand them to the network.
 */
export interface ServeOptions {
  port?: number;
  token?: string;
  /** Exit when the supervising process disappears, so no orphan is left holding
   *  credentials after the desktop app is killed. */
  parentPid?: number;
}

export interface ServeHandle {
  port: number;
  token: string;
  close(): Promise<void>;
}

export async function serve(_options: ServeOptions): Promise<ServeHandle> {
  throw new Error('not implemented');
}
