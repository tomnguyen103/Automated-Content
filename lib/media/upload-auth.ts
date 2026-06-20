import { z } from "zod";

export const imageKitUploadAuthSchema = z.object({
  token: z.string().min(1),
  expire: z.number().int().positive(),
  signature: z.string().min(1),
  publicKey: z.string().min(1),
  urlEndpoint: z.string().url(),
  folder: z.string().min(1),
  tags: z.array(z.string().min(1)).max(16),
  metadata: z.object({
    workspaceId: z.string().min(1),
    uploadedByUserId: z.string().min(1),
    provider: z.enum(["imagekit", "mock"]),
    folder: z.string().min(1)
  }),
  isConfigured: z.boolean()
});

export type ImageKitUploadAuth = z.infer<typeof imageKitUploadAuthSchema>;
