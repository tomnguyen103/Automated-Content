import { describe, expect, it } from "vitest";
import {
  aggregateAnalyticsMetrics,
  type AnalyticsAggregationInput
} from "@/lib/analytics/metrics";

const now = new Date("2026-06-20T12:00:00.000Z");

describe("aggregateAnalyticsMetrics", () => {
  it("aggregates posting, failure, reply, usage, and agent activity", () => {
    const input: AnalyticsAggregationInput = {
      now,
      posts: [
        {
          id: "post_1",
          platform: "linkedin",
          provider: "linkedin",
          status: "published",
          scheduledFor: new Date("2026-06-19T12:00:00.000Z"),
          publishedAt: new Date("2026-06-19T12:02:00.000Z"),
          failedAt: null,
          createdAt: new Date("2026-06-18T12:00:00.000Z")
        },
        {
          id: "post_2",
          platform: "x",
          provider: "x",
          status: "queued",
          scheduledFor: new Date("2026-06-21T12:00:00.000Z"),
          publishedAt: null,
          failedAt: null,
          createdAt: new Date("2026-06-20T10:00:00.000Z")
        },
        {
          id: "post_3",
          platform: "instagram",
          provider: "meta",
          status: "failed",
          scheduledFor: new Date("2026-06-18T12:00:00.000Z"),
          publishedAt: null,
          failedAt: new Date("2026-06-18T12:02:00.000Z"),
          createdAt: new Date("2026-06-17T12:00:00.000Z")
        }
      ],
      comments: [
        {
          id: "comment_1",
          platform: "linkedin",
          status: "matched",
          receivedAt: new Date("2026-06-19T13:00:00.000Z")
        },
        {
          id: "comment_2",
          platform: "instagram",
          status: "awaiting_approval",
          receivedAt: new Date("2026-06-20T09:00:00.000Z")
        }
      ],
      replies: [
        {
          id: "reply_1",
          provider: "linkedin",
          platform: "linkedin",
          status: "sent",
          createdAt: new Date("2026-06-19T13:01:00.000Z"),
          sentAt: new Date("2026-06-19T13:02:00.000Z")
        },
        {
          id: "reply_2",
          provider: "meta",
          platform: "instagram",
          status: "failed",
          error: "Provider rejected reply",
          createdAt: new Date("2026-06-20T09:01:00.000Z"),
          sentAt: null
        }
      ],
      usage: [
        {
          id: "usage_1",
          type: "ai_generation",
          quantity: 2,
          occurredAt: new Date("2026-06-19T12:00:00.000Z")
        },
        {
          id: "usage_2",
          type: "auto_reply",
          quantity: 1,
          occurredAt: new Date("2026-06-20T12:00:00.000Z")
        }
      ],
      agentRuns: [
        {
          id: "run_1",
          traceId: "trace_1",
          status: "succeeded",
          provider: "gemini",
          model: "gemini-2.5-flash",
          toolCalls: [{ name: "research_topic" }, { name: "save_draft" }],
          startedAt: new Date("2026-06-19T12:00:00.000Z"),
          completedAt: new Date("2026-06-19T12:00:12.000Z"),
          error: null
        },
        {
          id: "run_2",
          traceId: "trace_2",
          status: "failed",
          provider: "openai",
          model: "gpt-4.1-mini",
          toolCalls: [{ name: "draft_reply_suggestion" }],
          startedAt: new Date("2026-06-20T11:00:00.000Z"),
          completedAt: new Date("2026-06-20T11:00:05.000Z"),
          error: "Model failed"
        }
      ]
    };

    const snapshot = aggregateAnalyticsMetrics(input);

    expect(snapshot.posting).toMatchObject({
      total: 3,
      queued: 1,
      published: 1,
      failed: 1
    });
    expect(snapshot.failures).toEqual({
      total: 3,
      publishing: 1,
      replies: 1,
      agents: 1
    });
    expect(snapshot.replies).toMatchObject({
      comments: 2,
      matched: 1,
      awaitingApproval: 1,
      sent: 1,
      failed: 1
    });
    expect(snapshot.usage.totalQuantity).toBe(3);
    expect(snapshot.usage.byType).toEqual([
      {
        type: "ai_generation",
        label: "AI generations",
        quantity: 2
      },
      {
        type: "auto_reply",
        label: "Auto replies",
        quantity: 1
      }
    ]);
    expect(snapshot.agents).toMatchObject({
      total: 2,
      succeeded: 1,
      failed: 1,
      averageToolCalls: 1.5
    });
    expect(snapshot.agents.recent[0]).toMatchObject({
      id: "run_2",
      durationMs: 5000
    });
    expect(snapshot.platformBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "LinkedIn",
          posts: 1,
          published: 1,
          comments: 1,
          replies: 1,
          failures: 0
        }),
        expect.objectContaining({
          platform: "Instagram",
          posts: 1,
          comments: 1,
          replies: 0,
          failures: 2
        })
      ])
    );
  });

  it("uses explicit aggregate summaries for totals while keeping recent agent rows", () => {
    const snapshot = aggregateAnalyticsMetrics({
      now,
      posts: [],
      comments: [],
      replies: [],
      usage: [],
      agentRuns: [
        {
          id: "recent_run",
          traceId: "trace_recent",
          status: "succeeded",
          provider: "gemini",
          model: "gemini-2.5-flash",
          toolCalls: [{ name: "save_draft" }],
          startedAt: new Date("2026-06-20T11:00:00.000Z"),
          completedAt: new Date("2026-06-20T11:00:03.000Z"),
          error: null
        }
      ],
      summary: {
        posting: {
          total: 250,
          scheduled: 40,
          queued: 20,
          publishing: 5,
          published: 180,
          failed: 4,
          canceled: 1
        },
        replies: {
          comments: 320,
          matched: 140,
          awaitingApproval: 12,
          sent: 96,
          failed: 3
        },
        usage: {
          totalQuantity: 900,
          byType: [
            {
              type: "ai_generation",
              label: "AI generations",
              quantity: 600
            }
          ],
          daily: [
            {
              date: "2026-06-20",
              label: "Jun 20",
              quantity: 12
            }
          ]
        },
        agents: {
          total: 150,
          running: 2,
          succeeded: 143,
          failed: 5,
          averageToolCalls: 2.4
        },
        platformBreakdown: [
          {
            platform: "LinkedIn",
            posts: 120,
            published: 110,
            comments: 80,
            replies: 60,
            failures: 2
          }
        ]
      }
    });

    expect(snapshot.posting.total).toBe(250);
    expect(snapshot.failures).toEqual({
      total: 12,
      publishing: 4,
      replies: 3,
      agents: 5
    });
    expect(snapshot.usage.totalQuantity).toBe(900);
    expect(snapshot.agents.total).toBe(150);
    expect(snapshot.agents.recent).toHaveLength(1);
  });
});
