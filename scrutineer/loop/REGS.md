# REGS.md — the frozen contract

Owned by the TEAM PRINCIPAL (human). Read-only to every agent in the loop. The loop may not
propose a change to this file; a change here is a regulation change and is made between seasons.

```yaml
season:
  max_generations: 12
  mode: attended                 # attended | unattended
  seed: 1994

circuit:
  quali_items: 10                # the specs the agent practises on
  sealed_items: 10               # held-out specs, never shown to the improver
  reserve_items: 70              # the SIMULATOR's pool for later circuits
  band: [0.30, 0.80]             # Agent0 frontier band for generated circuits
  band_samples: 6

lap:
  max_steps: 12                  # REGS step cap per lap
  wall_cap_s: 300
  timeout_penalty: 0.5           # tau applied to U on timeout

objective:                       # U = w_pass*pass + w_cost*(1-cost/cap) + w_wall*(1-wall/cap)
  w_pass: 0.5
  w_cost: 0.25
  w_wall: 0.25
  lap_base_s: 60.0               # lap_s = lap_base_s + lap_span_s * (1 - U)
  lap_span_s: 40.0

cost:
  race_and_replay_cap_usd: 3.00  # per generation; upgrade cost is charged to the role
  lambda_usd_per_hour: 0.50      # lambda in gain-per-dollar
  atr_most_blamed: 0.70          # ATR sliding scale on the replay budget
  atr_others: 1.15
  race_shares: {quali: 0.34, sealed: 0.16, smoke: 0.02, replay: 0.48}

credit:
  incident_threshold_s: 0.5      # credit_r > 0.5 s counts as a confirmed incident
  min_incidents: 5               # n_r >= 5 before any upgrade
  ci: 0.90                       # bootstrap CI level; CI90_lo(blame_r) > 0 required
  replay_seeds: 2
  ablate_top_k: 2                # top-2 roles when confidence is low or ablation is requested
  router_confidence_floor: 0.90  # below this, always ablate. High, deliberately: with a
                                 # low floor only the top-blamed role is ever replayed, so
                                 # only it accumulates incidents, so only it ever clears the
                                 # evidence bar. The second name on the list has to be able
                                 # to earn or fail to earn its own credit.
  p_fix_prior: 0.5               # labelled "prior" until 3 outcomes exist

gates:
  seesaw: "d_quali >= 0 and d_sealed >= 0 and max(d_quali, d_sealed) > 0"
  correlation_dead_band_s: 0.30
  black_flag_confidence: 0.80
  refer_band: [0.50, 0.80]
  min_diff_lines: 3
  novelty_cosine: 0.95
  generalisation_gap: 0.25       # quali_pass - sealed_pass above this triggers a circuit generation
  zero_variance_groups: 0.40
  entropy_collapse_ratio: 0.50   # RL candidate ineligible below 50 % of step-0 entropy
  kl_ratio: 3.0                  # only meaningful when kl_penalty_coef > 0

# Per-role cost table. Upgrade cost is charged to cost_r and sits outside the race cap.
roles:
  AERO:       {prefix: R, cost_usd: 0.30, hours: 0.25}
  STRATEGIST: {prefix: S, cost_usd: 0.03, hours: 0.03}
  POWER_UNIT: {prefix: W, cost_usd: 1.00, hours: 2.00}
  TYRES:      {prefix: S, cost_usd: 0.05, hours: 0.08}
  DATA:       {prefix: H, cost_usd: 0.30, hours: 0.25}
  SIMULATOR:  {prefix: C, cost_usd: 0.35, hours: 0.17}
  ENGINEER:   {prefix: P, cost_usd: 0.40, hours: 0.33}
  SCRUTINEER: {prefix: S, cost_usd: 0.10, hours: 0.17}
  HISTORIAN:  {prefix: P, cost_usd: 0.20, hours: 0.25}
  PIT_CREW:   {prefix: H, cost_usd: 0.05, hours: 0.17}

phase_b:                          # every third accepted generation
  every: 3
  engineer_fix_precision: 0.40
  engineer_regression_precision: 0.20
  router_precision: 0.50
  historian_first_pass: 0.60
  historian_page_utility: 0.30
  pitcrew_sandbox_fail: 0.20

anti_distillation: true           # typed-decision outputs are labels, never SFT/RL targets
independent_grader: true          # official scorer is execution; auditors are a different family
```

## Write set

The improver may write only `skills/{r*}/` and `harness/{r*}.py` for the selected role. Never in any
writable set: `REGS.md`, the evaluator, sealed data, `lineage/`, `scrutineer/`, `router/`.

## Isolation actually in force

The sealed circuit is held by `SealedEvaluator`, which returns only the aggregate `official:gen-n`
object — race time, opaque per-item booleans, cost — and never an item, a prompt or a candidate.
The design calls for that evaluator to hold a service-account key for a second W&B team; where
only one team exists, this file records that the split is enforced in process rather than by
membership, and the honesty panel prints it.

## Sign convention

`predicted_delta_s`, `credit_r`, `d_quali`, `d_sealed` are **seconds gained, positive = faster**.
