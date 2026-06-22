import { z } from "zod";

const isoTimestampSchema = z.iso.datetime({ offset: true });

export const brandMemoryProposalStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export const brandMemoryProposalScopeSchema = z.enum(["workspace", "platform", "profile", "campaign"]);

export const brandMemoryProposalSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  createdByUserId: z.string().min(1).optional(),
  sourceAgentRunId: z.string().min(1).optional(),
  sourceContentPackId: z.string().min(1).optional(),
  sourceVariantId: z.string().min(1).optional(),
  scope: brandMemoryProposalScopeSchema.default("workspace"),
  platform: z.string().min(1).optional(),
  originalText: z.string().min(1),
  editedText: z.string().min(1),
  inferredRule: z.string().min(1).max(400),
  confidence: z.number().int().min(0).max(100).default(70),
  status: brandMemoryProposalStatusSchema.default("pending"),
  evidence: z.record(z.string(), z.unknown()).default({}),
  reviewedByUserId: z.string().min(1).optional(),
  reviewedAt: isoTimestampSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export type BrandMemoryProposalStatus = z.infer<typeof brandMemoryProposalStatusSchema>;
export type BrandMemoryProposalScope = z.infer<typeof brandMemoryProposalScopeSchema>;
export type BrandMemoryProposal = z.infer<typeof brandMemoryProposalSchema>;
