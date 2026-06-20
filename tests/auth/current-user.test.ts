import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn()
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerkMocks.auth,
  currentUser: clerkMocks.currentUser
}));

async function loadCurrentUser() {
  const { getCurrentUser } = await import("@/lib/auth/current-user");

  return { getCurrentUser };
}

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    clerkMocks.auth.mockReset();
    clerkMocks.currentUser.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the local preview user only when local preview auth is enabled", async () => {
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");

    const { getCurrentUser } = await loadCurrentUser();
    const user = await getCurrentUser();

    expect(user).toMatchObject({
      id: "local-preview-user",
      isLocalPreview: true
    });
    expect(clerkMocks.auth).not.toHaveBeenCalled();
  });

  it("fails closed when Clerk is not configured and local preview is disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");

    const { getCurrentUser } = await loadCurrentUser();
    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(clerkMocks.auth).not.toHaveBeenCalled();
  });

  it("returns null for configured Clerk when there is no authenticated user", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_configured");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_configured");
    clerkMocks.auth.mockResolvedValue({ userId: null });

    const { getCurrentUser } = await loadCurrentUser();
    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(clerkMocks.auth).toHaveBeenCalledOnce();
    expect(clerkMocks.currentUser).not.toHaveBeenCalled();
  });
});
