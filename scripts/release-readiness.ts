import {
  buildReleaseReadinessReport,
  formatReleaseReadinessMarkdown,
  getReleaseReadinessInputsFromCli
} from "../lib/release/readiness";

const cliInputs = getReleaseReadinessInputsFromCli({
  args: process.argv.slice(2),
  env: process.env
});

for (const message of cliInputs.confirmationMessages) {
  console.warn(`[release-readiness] ${message}`);
}

const report = buildReleaseReadinessReport({
  env: process.env,
  gateResults: cliInputs.gateResults,
  manualChecks: cliInputs.manualChecks
});

console.log(formatReleaseReadinessMarkdown(report));

if (!report.ready) {
  process.exitCode = 1;
}
