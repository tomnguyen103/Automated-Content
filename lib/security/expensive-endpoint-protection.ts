import "server-only";

const defaultWindowMs = 60_000;
const defaultMaxRequests = 20;
const sweepIntervalMs = 60_000;

// Best-effort per-process throttle. Production abuse controls should back this
// with a shared store before relying on cross-instance limits.
const requestBuckets = new Map<string, number[]>();
let lastSweepAt = 0;

export class ExpensiveEndpointRateLimitError extends Error {
  readonly limit: number;
  readonly resetAt: string;
  readonly windowMs: number;

  constructor({
    limit,
    resetAt,
    windowMs
  }: {
    limit: number;
    resetAt: Date;
    windowMs: number;
  }) {
    super("Too many expensive media requests. Try again shortly.");
    this.name = "ExpensiveEndpointRateLimitError";
    this.limit = limit;
    this.resetAt = resetAt.toISOString();
    this.windowMs = windowMs;
  }
}

function bucketKey({
  route,
  userId,
  workspaceId
}: {
  route: string;
  userId: string;
  workspaceId: string;
}) {
  return `${route}:${workspaceId}:${userId}`;
}

function pruneExpiredBuckets(nowMs: number, windowMs: number) {
  if (nowMs - lastSweepAt < sweepIntervalMs) {
    return;
  }

  lastSweepAt = nowMs;
  const cutoff = nowMs - windowMs;

  for (const [key, timestamps] of requestBuckets) {
    const active = timestamps.filter((timestamp) => timestamp > cutoff);

    if (active.length === 0) {
      requestBuckets.delete(key);
    } else {
      requestBuckets.set(key, active);
    }
  }
}

export function assertExpensiveEndpointAllowed({
  limit = defaultMaxRequests,
  now = new Date(),
  route,
  skip = false,
  userId,
  windowMs = defaultWindowMs,
  workspaceId
}: {
  route: string;
  userId: string;
  workspaceId: string;
  limit?: number;
  now?: Date;
  skip?: boolean;
  windowMs?: number;
}) {
  if (skip) {
    return;
  }

  const key = bucketKey({ route, userId, workspaceId });
  const nowMs = now.getTime();
  pruneExpiredBuckets(nowMs, windowMs);
  const cutoff = nowMs - windowMs;
  const bucket = (requestBuckets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (bucket.length >= limit) {
    const oldest = bucket[0] ?? nowMs;
    throw new ExpensiveEndpointRateLimitError({
      limit,
      resetAt: new Date(oldest + windowMs),
      windowMs
    });
  }

  if (bucket.length === 0) {
    requestBuckets.delete(key);
  }

  bucket.push(nowMs);
  requestBuckets.set(key, bucket);
}

export function clearExpensiveEndpointProtectionForTests() {
  requestBuckets.clear();
  lastSweepAt = 0;
}

export function getExpensiveEndpointBucketCountForTests() {
  return requestBuckets.size;
}
