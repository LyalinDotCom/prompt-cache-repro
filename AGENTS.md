# Project instructions

- Own the simplest trustworthy public API cache benchmark. Keep web and CLI on one runner and one analysis implementation.
- Accounts own keys and declared tiers. Models own API IDs, cache rules, and pricing. Expand every selected account across every selected model for that provider.
- Current requested models: Gemini 3.8 Flash, Gemini 4 Argon, GPT-6.1 Sol, and Claude Opus 5.5. Never silently change a model, account, workload, endpoint, or reasoning setting after an error.
- Use official provider SDKs and public endpoints. Disable hidden retries and automatic continuation. Preserve native thinking/signature/tool-call history. Keep errors, refusals, and invalid continuations visible.
- Preserve raw evidence and unknown telemetry. Distinguish strict previous-input full hits, any hits, token coverage, and theoretical cost baselines. Do not infer internal root causes from external cache counters.
- The supplied proposed specs are reference material, not authoritative facts. Internal checkpoint, eviction, routing, and hidden timestamp claims remain unverified.
- Never expose keys in source, logs, reports, builds, Git, or screenshots. `.env` is local-only; browser keys remain in memory. Never use a `VITE_` variable for credentials.
- No backward-compatibility layers. Maintain one current configuration format: accounts and models. Internal resolved experiment cells may be called profiles.
- GitHub repository must remain private. Push stable changes directly to `main`; do not create pull requests. Keep the Sites deployment synchronized with stable source.
- Use GPT-6.1 Sol at high reasoning effort or a stronger model/effort for delegated building, design, review, and testing. Do not optimize down to weaker agents.
- Before pushing code, run `npm test` and `npm run build`. Exercise affected browser flows. Live tests require valid user-provided keys and explicit sample-size limitations. Coding sessions have no spending or request-count cutoff: allow natural completion with a 20-minute per-session deadline, as explicitly requested by the operator. Record cost estimates as observations only.
