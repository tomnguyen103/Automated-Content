import "server-only";

const defaultWindowMs = 60_000;
const defaultMaxRequests = 20;

const requestBuckets = new Map<string, number[]>();

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
  const cutoff = now.getTime() - windowMs;
  const bucket = (requestBuckets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (bucket.length >= limit) {
    const oldest = bucket[0] ?? now.getTime();
    throw new ExpensiveEndpointRateLimitError({
      limit,
      resetAt: new Date(oldest + windowMs),
      windowMs
    });
  }

  bucket.push(now.getTime());
  requestBuckets.set(key, bucket);
}

export function clearExpensiveEndpointProtectionForTests() {
  requestBuckets.clear();
}
