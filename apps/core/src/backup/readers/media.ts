/**
 * Enumerate and download the media library, preserving folder structure.
 *
 * Files are streamed to the archive without buffering. Downloads go through the
 * same concurrency limiter as everything else — a media library is where it is
 * easiest to accidentally saturate someone's origin server.
 */
export {};
