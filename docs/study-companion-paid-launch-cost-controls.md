# Study Companion paid-launch cost controls — deferred

These are prerequisites for enabling paid subscriptions or broadly releasing image questions. They are documented here for later implementation; they are not implemented by this note.

1. **Record all billable output.** Include both `candidates_token_count` and `thoughts_token_count` from Gemini usage metadata in cost accounting. Validate model-specific input, image, and output rates against provider billing, including announced rate changes. Reconcile application estimates with Google billing reports.
2. **Enforce a real project spending limit.** Set a Gemini project-level spend cap in AI Studio or an eligible Google Cloud spend-cap budget, plus a conservative application-side budget guard and alerts. Account for delayed provider cap enforcement and in-flight requests; reject new helps before the reserve would exceed the application limit, without charging a help. Do not treat an alerts-only budget as a hard cap.
3. **Measure representative student questions before setting final pricing.** Collect aggregate per-plan/per-feature input, image, visible-output, thinking-token, latency, failure, and cost distributions (including p50 and p95). Review a small, consented or de-identified sample for academic quality and route simple questions to a cheaper model only after quality checks. Do not retain raw student questions or images by default for cost analysis.

Recalculate Scholar and Dean's List unit economics using real data and the applicable provider rates before launching paid plans. Include Paddle fees, refunds, taxes, hosting, free-user subsidy, and a safety margin. Keep one successful answer equal to one help; daily image limits are additional abuse controls, not new help grants.
