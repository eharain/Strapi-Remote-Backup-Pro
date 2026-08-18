/**
 * Job progress as Server-Sent Events, at GET /jobs/:id/events.
 *
 * SSE rather than WebSockets: the traffic is one-way, it survives proxies and
 * reconnects without ceremony, and both Fastify and .NET's HttpClient handle it
 * with no extra dependency. Each event carries a monotonic id so a reconnecting
 * client can resume with Last-Event-ID instead of losing the run's history.
 */
export {};
