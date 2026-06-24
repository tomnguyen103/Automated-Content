import {
  buildReleaseReadinessReport,
  formatReleaseReadinessMarkdown
} from "../lib/release/readiness";

const report = buildReleaseReadinessReport({
  env: process.env
});

console.log(formatReleaseReadinessMarkdown(report));

if (report.blockerCount > 0) {
  process.exitCode = 1;
}
