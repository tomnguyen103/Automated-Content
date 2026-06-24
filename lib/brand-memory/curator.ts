import type { BrandMemoryProposal, BrandMemoryProposalScope, BrandMemoryProposalStatus } from "@/lib/brand-memory/schemas";

export type BrandMemoryCluster = {
  id: string;
  label: string;
  scope: BrandMemoryProposalScope;
  platform?: string;
  proposalIds: string[];
  averageConfidence: number;
  statusCounts: Record<BrandMemoryProposalStatus, number>;
  signals: string[];
};

export type BrandMemoryMergeSuggestion = {
  id: string;
  clusterId: string;
  proposalIds: string[];
  recommendedRule: string;
  reason: string;
};

export type BrandMemoryContradictionWarning = {
  id: string;
  dimension: "brevity" | "feature_pitch" | "first_person" | "line_breaks";
  proposalIds: string[];
  severity: "warning" | "blocked";
  reason: string;
};

export type BrandMemoryCurationSummary = {
  clusters: BrandMemoryCluster[];
  mergeSuggestions: BrandMemoryMergeSuggestion[];
  contradictionWarnings: BrandMemoryContradictionWarning[];
};

type ProposalSignal = {
  dimension: BrandMemoryContradictionWarning["dimension"];
  stance: "prefer" | "avoid";
};

const stopWords = new Set([
  "a",
  "about",
  "and",
  "before",
  "copy",
  "for",
  "from",
  "future",
  "in",
  "is",
  "keep",
  "language",
  "of",
  "or",
  "prefer",
  "rule",
  "that",
  "the",
  "to",
  "use",
  "when",
  "with"
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : intersection / union;
}

function scopeKey(proposal: BrandMemoryProposal) {
  return `${proposal.scope}:${proposal.platform ?? "all"}`;
}

function clusterLabel(proposals: BrandMemoryProposal[]) {
  const counts = new Map<string, number>();

  for (const proposal of proposals) {
    for (const token of tokens(`${proposal.inferredRule} ${proposal.editedText}`)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  const label = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([token]) => token)
    .join(" ");

  return label || "related voice guidance";
}

function related(left: BrandMemoryProposal, right: BrandMemoryProposal) {
  if (scopeKey(left) !== scopeKey(right)) {
    return false;
  }

  const ruleOverlap = jaccard(tokens(left.inferredRule), tokens(right.inferredRule));
  const editOverlap = jaccard(tokens(left.editedText), tokens(right.editedText));
  const leftSignals = signalsForProposal(left);
  const rightSignals = signalsForProposal(right);
  const signalOverlap = leftSignals.some((leftSignal) =>
    rightSignals.some((rightSignal) => rightSignal.dimension === leftSignal.dimension)
  );

  return ruleOverlap >= 0.24 || editOverlap >= 0.3 || signalOverlap;
}

function createCluster(id: number, proposals: BrandMemoryProposal[]): BrandMemoryCluster {
  const [first] = proposals;
  const statusCounts = {
    accepted: proposals.filter((proposal) => proposal.status === "accepted").length,
    pending: proposals.filter((proposal) => proposal.status === "pending").length,
    rejected: proposals.filter((proposal) => proposal.status === "rejected").length
  };

  return {
    id: `brand_memory_cluster_${id}`,
    label: clusterLabel(proposals),
    scope: first.scope,
    platform: first.platform,
    proposalIds: proposals.map((proposal) => proposal.id),
    averageConfidence: Math.round(proposals.reduce((sum, proposal) => sum + proposal.confidence, 0) / proposals.length),
    statusCounts,
    signals: [...new Set(proposals.flatMap((proposal) => tokens(proposal.inferredRule)).slice(0, 8))]
  };
}

function rankProposal(proposal: BrandMemoryProposal) {
  const statusWeight = proposal.status === "accepted" ? 30 : proposal.status === "pending" ? 10 : 0;

  return proposal.confidence + statusWeight;
}

function signalsForProposal(proposal: BrandMemoryProposal): ProposalSignal[] {
  const text = normalize(`${proposal.inferredRule} ${proposal.editedText}`);
  const signals: ProposalSignal[] = [];

  if (/\b(first-person|founder-led|we|our|i|my)\b/.test(text)) {
    signals.push({ dimension: "first_person", stance: "prefer" });
  }

  if (/avoid first-person|third-person|brand voice instead of founder/.test(text)) {
    signals.push({ dimension: "first_person", stance: "avoid" });
  }

  if (/concise|tighter|shorter|remove extra|less setup/.test(text)) {
    signals.push({ dimension: "brevity", stance: "prefer" });
  }

  if (/long-form|expanded|detailed setup|more context/.test(text)) {
    signals.push({ dimension: "brevity", stance: "avoid" });
  }

  if (/line break|scannable|separate hooks|separate proof/.test(text)) {
    signals.push({ dimension: "line_breaks", stance: "prefer" });
  }

  if (/single paragraph|avoid line break|no line break/.test(text)) {
    signals.push({ dimension: "line_breaks", stance: "avoid" });
  }

  if (/avoid pure feature|avoid feature pitch|operator control|not a feature pitch/.test(text)) {
    signals.push({ dimension: "feature_pitch", stance: "avoid" });
  }

  if (/feature pitch|lead with features|product pitch/.test(text) && !/avoid feature pitch|not a feature pitch/.test(text)) {
    signals.push({ dimension: "feature_pitch", stance: "prefer" });
  }

  return signals;
}

function buildClusters(proposals: BrandMemoryProposal[]) {
  const unvisited = new Set(proposals.map((proposal) => proposal.id));
  const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const clusters: BrandMemoryProposal[][] = [];

  for (const proposal of proposals) {
    if (!unvisited.has(proposal.id)) {
      continue;
    }

    const group = [proposal];
    unvisited.delete(proposal.id);

    for (const candidateId of [...unvisited]) {
      const candidate = byId.get(candidateId);

      if (candidate && group.some((groupProposal) => related(groupProposal, candidate))) {
        group.push(candidate);
        unvisited.delete(candidate.id);
      }
    }

    clusters.push(group);
  }

  return clusters;
}

export function buildBrandMemoryCurationSummary(proposals: BrandMemoryProposal[]): BrandMemoryCurationSummary {
  const relevantProposals = proposals.filter((proposal) => proposal.status !== "rejected");
  const clusterGroups = buildClusters(relevantProposals);
  const clusters = clusterGroups.map((group, index) => createCluster(index + 1, group));
  const mergeSuggestions = clusterGroups
    .filter((group) => group.length > 1)
    .map((group, index) => {
      const recommended = [...group].sort((a, b) => rankProposal(b) - rankProposal(a))[0];
      const cluster = clusters.find((item) => item.proposalIds.includes(recommended.id));

      return {
        id: `brand_memory_merge_${index + 1}`,
        clusterId: cluster?.id ?? `brand_memory_cluster_${index + 1}`,
        proposalIds: group.map((proposal) => proposal.id),
        recommendedRule: recommended.inferredRule,
        reason: `Merge ${group.length} overlapping rules around ${clusterLabel(group)} and keep the clearest, highest-confidence wording.`
      } satisfies BrandMemoryMergeSuggestion;
    });
  const contradictionWarnings: BrandMemoryContradictionWarning[] = [];

  for (const group of clusterGroups) {
    const signals = group.map((proposal) => ({
      proposal,
      signals: signalsForProposal(proposal)
    }));

    for (const dimension of ["brevity", "feature_pitch", "first_person", "line_breaks"] as const) {
      const prefer = signals.filter((entry) =>
        entry.signals.some((signal) => signal.dimension === dimension && signal.stance === "prefer")
      );
      const avoid = signals.filter((entry) =>
        entry.signals.some((signal) => signal.dimension === dimension && signal.stance === "avoid")
      );
      const preferIds = new Set(prefer.map((entry) => entry.proposal.id));
      const avoidIds = new Set(avoid.map((entry) => entry.proposal.id));
      const crossesProposals = [...preferIds].some((id) => !avoidIds.has(id)) || [...avoidIds].some((id) => !preferIds.has(id));

      if (prefer.length > 0 && avoid.length > 0 && crossesProposals) {
        const proposalIds = [...new Set([...prefer, ...avoid].map((entry) => entry.proposal.id))];
        contradictionWarnings.push({
          id: `brand_memory_conflict_${dimension}_${contradictionWarnings.length + 1}`,
          dimension,
          proposalIds,
          severity: proposalIds.some((id) => group.find((proposal) => proposal.id === id)?.status === "accepted")
            ? "blocked"
            : "warning",
          reason: `Rules in this cluster disagree on ${dimension.replaceAll("_", " ")}. Review the evidence before accepting more memory.`
        });
      }
    }
  }

  return {
    clusters,
    mergeSuggestions,
    contradictionWarnings
  };
}
