export const publishFailureCategories = [
  "provider_config",
  "provider_capability",
  "token_scope",
  "queue_enqueue",
  "provider_transient",
  "provider_permanent",
  "policy_block",
  "content_invalid"
] as const;

export type PublishFailureCategory = (typeof publishFailureCategories)[number];

export type PublishRecoveryAction = "retry" | "reschedule" | "reconnect_provider" | "manual_review";

export type PublishFailureRecovery = {
  category: PublishFailureCategory;
  retryable: boolean;
  recommendation: string;
  actions: PublishRecoveryAction[];
};

const transientPatterns = [/timeout/i, /temporar/i, /rate limit/i, /429/, /network/i, /unavailable/i];

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function classifyPublishFailure({
  errorCode,
  errorMessage,
  retryable = false
}: {
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
}): PublishFailureRecovery {
  const code = errorCode ?? "";
  const message = errorMessage ?? "";
  const combined = `${code} ${message}`;

  if (code === "queue_enqueue" || /enqueue|redis|bullmq|queue/i.test(combined)) {
    return {
      category: "queue_enqueue",
      retryable: true,
      recommendation: "Queue enqueue failed after the durable schedule row was created. Retry enqueue or reschedule after the queue is healthy.",
      actions: ["retry", "reschedule"]
    };
  }

  if (/scope|permission/i.test(combined)) {
    return {
      category: "token_scope",
      retryable: false,
      recommendation: "Reconnect the provider with the required scopes before retrying.",
      actions: ["reconnect_provider", "manual_review"]
    };
  }

  if (/capability|unsupported|cannot publish|provider mismatch|does not expose/i.test(combined)) {
    return {
      category: "provider_capability",
      retryable: false,
      recommendation: "Choose a compatible provider or platform before rescheduling.",
      actions: ["reschedule", "manual_review"]
    };
  }

  if (/configuration|credentials|account|connect|token/i.test(combined)) {
    return {
      category: "provider_config",
      retryable: false,
      recommendation: "Reconnect or configure the provider account before retrying the publish.",
      actions: ["reconnect_provider", "manual_review"]
    };
  }

  if (/policy|approved|blocked|review/i.test(combined)) {
    return {
      category: "policy_block",
      retryable: false,
      recommendation: "Return the variant to review and resolve the policy block before publishing.",
      actions: ["manual_review"]
    };
  }

  if (/content|variant|body|empty|invalid/i.test(combined)) {
    return {
      category: "content_invalid",
      retryable: false,
      recommendation: "Fix the content variant, rerun review, then schedule it again.",
      actions: ["manual_review", "reschedule"]
    };
  }

  if (retryable || includesAny(combined, transientPatterns)) {
    return {
      category: "provider_transient",
      retryable: true,
      recommendation: "Retry after the provider recovers, preserving the existing scheduled job for duplicate-send protection.",
      actions: ["retry", "reschedule"]
    };
  }

  return {
    category: "provider_permanent",
    retryable: false,
    recommendation: "Leave the publish for manual review and inspect the provider response before retrying.",
    actions: ["manual_review"]
  };
}

export class PublishRecoveryError extends Error {
  readonly code: string;
  readonly recovery: PublishFailureRecovery;

  constructor({
    code,
    message,
    recovery = classifyPublishFailure({ errorCode: code, errorMessage: message })
  }: {
    code: string;
    message: string;
    recovery?: PublishFailureRecovery;
  }) {
    super(message);
    this.name = "PublishRecoveryError";
    this.code = code;
    this.recovery = recovery;
  }
}
