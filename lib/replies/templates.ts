import type { ReplyPlatform } from "@/lib/replies/rules";

export type ReplyTemplateContext = {
  authorName?: string | null;
  brandVoice?: string;
  commentText: string;
  keyword?: string;
  platform: ReplyPlatform;
  postTitle?: string;
};

const supportedPlaceholders = new Set([
  "authorName",
  "brandVoice",
  "commentText",
  "firstName",
  "keyword",
  "platform",
  "postTitle"
]);

function cleanValue(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function getFirstName(authorName: string | null | undefined) {
  return cleanValue(authorName).split(" ").filter(Boolean)[0] ?? "";
}

export function getUnsupportedTemplatePlaceholders(template: string) {
  const unsupported = new Set<string>();

  for (const match of template.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)) {
    const name = match[1];

    if (!supportedPlaceholders.has(name)) {
      unsupported.add(name);
    }
  }

  return [...unsupported];
}

export function renderReplyTemplate(template: string, context: ReplyTemplateContext) {
  const unsupported = getUnsupportedTemplatePlaceholders(template);

  if (unsupported.length > 0) {
    throw new Error(`Unsupported reply template placeholder: ${unsupported.join(", ")}`);
  }

  const values: Record<string, string> = {
    authorName: cleanValue(context.authorName),
    brandVoice: cleanValue(context.brandVoice),
    commentText: cleanValue(context.commentText),
    firstName: getFirstName(context.authorName),
    keyword: cleanValue(context.keyword),
    platform: context.platform,
    postTitle: cleanValue(context.postTitle)
  };
  const rendered = template
    .replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_, key: string) => values[key] ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (rendered.length === 0) {
    throw new Error("Reply template rendered an empty message.");
  }

  if (rendered.length > 500) {
    throw new Error("Reply template rendered more than 500 characters.");
  }

  return rendered;
}
