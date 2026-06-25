import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./trigger"],
  logLevel: "log",
  maxDuration: 900,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 30_000,
      maxTimeoutInMs: 300_000,
      factor: 2,
      randomize: true
    }
  }
});
