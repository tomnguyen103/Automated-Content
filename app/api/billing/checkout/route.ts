import { type NextRequest } from "next/server";
import { handleBillingActionRequest } from "@/lib/billing/action-route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleBillingActionRequest(request, "checkout");
}
