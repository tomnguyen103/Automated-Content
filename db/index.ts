import "server-only";

import { drizzle } from "drizzle-orm/neon-http";
import { requireDatabaseUrl } from "@/lib/env";
import * as schema from "@/db/schema";

function createDatabaseClient(databaseUrl: string) {
  return drizzle(databaseUrl, { schema });
}

let cachedDb: ReturnType<typeof createDatabaseClient> | undefined;

export function getDb() {
  cachedDb ??= createDatabaseClient(requireDatabaseUrl());
  return cachedDb;
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
export { schema };
