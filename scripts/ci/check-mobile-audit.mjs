import fs from 'node:fs';

const reportPath = process.env.AUDIT_REPORT;
if (!reportPath) {
  throw new Error('AUDIT_REPORT must point to an npm audit JSON report');
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
if (report.error) {
  throw new Error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
}

const counts = report.metadata?.vulnerabilities;
if (!counts) {
  throw new Error('npm audit report has no vulnerability metadata');
}

const limits = {
  critical: Number.parseInt(process.env.MAX_CRITICAL ?? '0', 10),
  high: Number.parseInt(process.env.MAX_HIGH ?? '0', 10),
};

for (const [severity, limit] of Object.entries(limits)) {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`Invalid ${severity} vulnerability limit: ${limit}`);
  }
}

const summary = [
  '## Mobile production dependency audit',
  '',
  `- Critical: ${counts.critical} (temporary ceiling: ${limits.critical})`,
  `- High: ${counts.high} (temporary ceiling: ${limits.high})`,
  `- Moderate: ${counts.moderate}`,
  `- Low: ${counts.low}`,
  '',
  '> This is a regression ratchet, not a production-readiness waiver. Release requires zero critical and high findings or a documented, reviewed exception.',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
} else {
  process.stdout.write(summary);
}

const regressions = Object.entries(limits).filter(([severity, limit]) => counts[severity] > limit);
if (regressions.length > 0) {
  const detail = regressions.map(([severity, limit]) => `${severity}=${counts[severity]} > ${limit}`).join(', ');
  throw new Error(`Mobile dependency vulnerability ceiling exceeded: ${detail}`);
}
