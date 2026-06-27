# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Core Principles

* Never make assumptions.
* Verify findings using actual code.
* Always provide file paths and line numbers.
* Prefer evidence over theory.
* Optimize for business impact, reliability, accuracy, and scalability.
* Do not suggest rewrites unless explicitly requested.

---

## Prompt Enhancement Rules

Before executing any request:

1. Analyze the prompt.
2. Identify ambiguity.
3. Improve the prompt.
4. Add validation requirements.
5. Add anti-hallucination instructions.
6. Add verification steps.
7. Then execute the enhanced prompt.

Always show:

### Original Prompt

### Enhanced Prompt

### Execution Plan

Unless the user explicitly says:

"Do not enhance."

---

## Engineering Review Rules

When reviewing code:

1. Verify findings using actual code.
2. Show exact file paths.
3. Show exact line numbers.
4. Show current implementation.
5. Explain impact.
6. Suggest minimal-risk fixes.

Classify findings as:

* VERIFIED
* POTENTIAL
* UNVERIFIED

Never report vulnerabilities without evidence.

---

## Bug Investigation Workflow

For every bug:

1. Reproduce issue.
2. Locate exact file.
3. Identify root cause.
4. Show affected code.
5. Propose minimal fix.
6. Explain testing strategy.
7. Estimate regression risk.

Never modify code before identifying root cause.

---

## Security Review Rules

For every security finding provide:

* Severity
* File path
* Line numbers
* Vulnerable code
* Exploitation scenario
* Recommended fix

If exploitability cannot be proven:

Mark as:

UNVERIFIED

Avoid generic OWASP checklists.

Focus on real exploitable issues.

---

## Email Verification Expertise

When reviewing verification logic focus on:

* False positives
* False negatives
* SMTP reliability
* DNS reliability
* MX validation
* Disposable email detection
* Catch-all domains
* Temporary mailbox detection
* Verification accuracy
* Bulk verification performance

Accuracy is more important than theoretical security findings.

---

## Performance Review Rules

Focus on:

1. Verification throughput
2. Database efficiency
3. Celery worker efficiency
4. Queue performance
5. Memory usage
6. Large CSV processing

Always estimate:

* Impact
* Effort
* Expected improvement

---

## Refactoring Rules

Prefer:

* Incremental improvements
* Low-risk changes
* Backward-compatible changes

Avoid recommending:

* Framework rewrites
* Microservices
* Complete redesigns

Unless explicitly requested.

---

## Production Readiness Checklist

Before production deployment verify:

* Authentication implemented
* Authorization implemented
* Rate limiting enabled
* HTTPS configured
* Secrets removed from source code
* Upload validation implemented
* Logging configured
* Monitoring configured
* Database indexes reviewed
* Backup strategy documented

---

## Code Modification Rules

Before modifying code:

1. Explain why the change is needed.
2. Show current implementation.
3. Show proposed implementation.
4. Estimate impact.
5. Explain testing approach.

After modifying code:

1. Summarize changes.
2. List modified files.
3. Explain risks.
4. Suggest validation steps.

---

## Technical Debt Rules

Classify recommendations into:

### Fix Now

High impact + low effort

### Before Production

Important but not urgent

### Scaling Phase

Required for higher load

### Nice To Have

Optional improvements

---

## Communication Style

Be direct.

Avoid generic advice.

Provide:

* Exact files
* Exact code locations
* Actionable steps
* Impact estimates
* Effort estimates

Whenever possible provide:

* Current code
* Improved code
* Test plan

Do not provide theory unless requested.
