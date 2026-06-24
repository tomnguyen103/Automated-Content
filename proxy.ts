import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextMiddleware, NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const protectedRoutePatterns = [
  "/dashboard(.*)",
  "/agents(.*)",
  "/approvals(.*)",
  "/create(.*)",
  "/calendar(.*)",
  "/media(.*)",
  "/connections(.*)",
  "/auto-replies(.*)",
  "/analytics(.*)",
  "/brand-memory(.*)",
  "/billing(.*)",
  "/settings(.*)"
];

const isProtectedRoute = createRouteMatcher(protectedRoutePatterns);

const hasClerkRuntimeKeys = () =>
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

const getRequestHostname = (request: NextRequest) => {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  return host?.split(":")[0]?.toLowerCase() ?? request.nextUrl.hostname;
};

const getBrowserCanonicalUrl = (request: NextRequest) => {
  if (!["GET", "HEAD"].includes(request.method) || request.nextUrl.pathname.startsWith("/api/")) {
    return null;
  }

  let appUrl: URL;

  try {
    appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  } catch {
    return null;
  }

  if (appUrl.hostname !== "localhost") {
    return null;
  }

  const requestHostname = getRequestHostname(request);
  const shouldUseLocalhost =
    requestHostname === "127.0.0.1" || requestHostname.endsWith(".ngrok-free.dev");

  if (!shouldUseLocalhost) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.protocol = appUrl.protocol;
  url.hostname = appUrl.hostname;
  url.port = appUrl.port;

  return url;
};

const hasLocalPreviewFlag = () =>
  process.env.AUTH_LOCAL_PREVIEW === "1" || process.env.PLAYWRIGHT_AUTH_LOCAL_PREVIEW === "1";

const hasLocalPreviewBypass = (request: NextRequest) =>
  hasLocalPreviewFlag() &&
  (request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1");

const unconfiguredAuthProxy: NextMiddleware = (request: NextRequest) => {
  if (process.env.NODE_ENV === "production" && !hasLocalPreviewBypass(request) && isProtectedRoute(request)) {
    return NextResponse.json(
      { error: "Authentication is not configured for protected routes." },
      { status: 503 }
    );
  }

  return NextResponse.next();
};

const configuredAuthProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

const authProxy = hasClerkRuntimeKeys() ? configuredAuthProxy : unconfiguredAuthProxy;

const proxy: NextMiddleware = (request, event) => {
  if (hasLocalPreviewBypass(request)) {
    return NextResponse.next();
  }

  const canonicalUrl = getBrowserCanonicalUrl(request);

  if (canonicalUrl) {
    return NextResponse.redirect(canonicalUrl);
  }

  return authProxy(request, event);
};

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)"
  ]
};
