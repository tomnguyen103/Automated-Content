import { task } from "@trigger.dev/sdk";
import { z } from "zod";
import { runAgentMissionJob } from "../workers/jobs/run-agent-mission";
import { publishScheduledPostJob } from "../workers/jobs/publish-post";

const publishScheduledPostPayloadSchema = z.object({
  provider: z.enum(["linkedin", "x", "meta", "slack", "discord", "mock"]),
  scheduledJobId: z.string().min(1),
  workspaceId: z.string().min(1)
});

const runAgentMissionPayloadSchema = z.object({
  missionId: z.string().min(1),
  workspaceId: z.string().min(1)
});

export const publishScheduledPost = task({
  id: "social.publish-scheduled-post",
  maxDuration: 300,
  queue: {
    concurrencyLimit: 5
  },
  run: async (payload: unknown) => {
    const data = publishScheduledPostPayloadSchema.parse(payload);

    return publishScheduledPostJob({
      data
    });
  }
});

export const runAgentMission = task({
  id: "agents.run-mission",
  maxDuration: 900,
  queue: {
    concurrencyLimit: 2
  },
  run: async (payload: unknown) => {
    const data = runAgentMissionPayloadSchema.parse(payload);

    return runAgentMissionJob({
      data
    });
  }
});
