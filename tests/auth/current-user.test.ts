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

  it("fails closed when Clerk is not configured and production preview auth is not local Playwright", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");

    const { getCurrentUser } = await loadCurrentUser();
    const user = await getCurrentUser();

    expect(user).toBeNull();
    expect(clerkMocks.auth).not.toHaveBeenCalled();
  });

  it("allows Playwright preview auth for a local production-mode server", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
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

  it("allows Playwright preview auth for an IPv6 local production-mode server", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://[::1]:3100");
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
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

  it("returns a real user when Clerk is configured and the user is authenticated", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_configured");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_configured");
    clerkMocks.auth.mockResolvedValue({ userId: "user_12345" });
    clerkMocks.currentUser.mockResolvedValue({
      id: "user_12345",
      emailAddresses: [{ id: "email_1", emailAddress: "test@example.com" }],
      primaryEmailAddressId: "email_1",
      firstName: "Test",
      lastName: "User",
      imageUrl: "https://example.com/avatar.jpg"
    });

    const { getCurrentUser } = await loadCurrentUser();
    const user = await getCurrentUser();

    expect(user).toMatchObject({
      id: "user_12345",
      email: "test@example.com",
      name: "Test User",
      imageUrl: "https://example.com/avatar.jpg",
      isLocalPreview: false
    });
    expect(clerkMocks.auth).toHaveBeenCalledOnce();
    expect(clerkMocks.currentUser).toHaveBeenCalledOnce();
  });
});
