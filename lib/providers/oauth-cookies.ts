import type { ProviderKey } from "@/lib/providers/types";

export function providerOauthStateCookieName(provider: ProviderKey) {
  return `provider_oauth_state_${provider}`;
}

export function providerOauthCodeVerifierCookieName(provider: ProviderKey) {
  return `provider_oauth_code_verifier_${provider}`;
}
