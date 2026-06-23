import { z } from "zod";
import { mediaAttachmentSchema } from "@/lib/media/types";

export const socialPlatformSchema = z.enum([
  "linkedin",
  "x",
  "instagram",
  "facebook",
  "tiktok",
  "threads"
]);
export const socialPlatformOptions = socialPlatformSchema.options;

export const platformPolicyStatusSchema = z.enum(["pass", "warn", "block"]);

export const platformVariantSchema = z.object({
  id: z.string().min(1),
  platform: socialPlatformSchema,
  title: z.string().min(1).max(120),
  hook: z.string().min(1).max(280),
  body: z.string().min(1).max(5000),
  cta: z.string().min(1).max(220),
  hashtags: z.array(z.string().min(2).max(64)).max(12),
  media: z.array(mediaAttachmentSchema).max(10).default([]),
  mediaPrompt: z.string().max(500).optional(),
  characterCount: z.number().int().nonnegative(),
  policyStatus: platformPolicyStatusSchema,
  policyWarnings: z.array(z.string().min(1)).max(8)
});

export type SocialPlatform = z.infer<typeof socialPlatformSchema>;
export type PlatformPolicyStatus = z.infer<typeof platformPolicyStatusSchema>;
export type PlatformVariant = z.infer<typeof platformVariantSchema>;

export const platformLabels: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  threads: "Threads"
};
