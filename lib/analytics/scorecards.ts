export type AgentQualityInput = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  toolCallCount: number;
  durationMs: number | null;
  error?: string | null;
};

export type AgentQualityScorecard = {
  runId: string;
  score: number;
  grade: "excellent" | "healthy" | "watch" | "blocked";
  dimensions: {
    completion: number;
    toolDiscipline: number;
    latency: number;
    reliability: number;
  };
  evidence: string[];
};

function gradeForScore(score: number): AgentQualityScorecard["grade"] {
  if (score >= 90) {
    return "excellent";
  }

  if (score >= 75) {
    return "healthy";
  }

  if (score >= 55) {
    return "watch";
  }

  return "blocked";
}

function completionScore(run: AgentQualityInput) {
  if (run.status === "succeeded") {
    return 100;
  }

  if (run.status === "running") {
    return 70;
  }

  if (run.status === "queued") {
    return 60;
  }

  return 25;
}

function toolDisciplineScore(run: AgentQualityInput) {
  if (run.toolCallCount === 0) {
    return run.status === "succeeded" ? 80 : 65;
  }

  if (run.toolCallCount <= 4) {
    return 100;
  }

  if (run.toolCallCount <= 8) {
    return 82;
  }

  return 60;
}

function latencyScore(run: AgentQualityInput) {
  if (run.durationMs === null) {
    return run.status === "queued" || run.status === "running" ? 70 : 55;
  }

  if (run.durationMs <= 30_000) {
    return 100;
  }

  if (run.durationMs <= 120_000) {
    return 82;
  }

  if (run.durationMs <= 300_000) {
    return 65;
  }

  return 45;
}

function reliabilityScore(run: AgentQualityInput) {
  if (run.error) {
    return 30;
  }

  if (run.status === "failed") {
    return 35;
  }

  if (run.status === "running" || run.status === "queued") {
    return 75;
  }

  return 100;
}

function evidenceForRun(run: AgentQualityInput, dimensions: AgentQualityScorecard["dimensions"]) {
  const evidence = [
    `Completion ${dimensions.completion} from status ${run.status}.`,
    `Tool discipline ${dimensions.toolDiscipline} from ${run.toolCallCount} tool calls.`,
    run.durationMs === null
      ? `Latency ${dimensions.latency} because the run has not completed.`
      : `Latency ${dimensions.latency} from ${Math.round(run.durationMs / 1000)} seconds.`,
    `Reliability ${dimensions.reliability}${run.error ? ` because ${run.error}` : " with no recorded error."}`
  ];

  return evidence;
}

export function buildAgentQualityScorecard(run: AgentQualityInput): AgentQualityScorecard {
  const dimensions = {
    completion: completionScore(run),
    toolDiscipline: toolDisciplineScore(run),
    latency: latencyScore(run),
    reliability: reliabilityScore(run)
  };
  const rawScore = Math.round(
    (dimensions.completion + dimensions.toolDiscipline + dimensions.latency + dimensions.reliability) / 4
  );
  const score = run.status === "failed" || run.error ? Math.min(rawScore, 45) : rawScore;

  return {
    runId: run.id,
    score,
    grade: gradeForScore(score),
    dimensions,
    evidence: evidenceForRun(run, dimensions)
  };
}
