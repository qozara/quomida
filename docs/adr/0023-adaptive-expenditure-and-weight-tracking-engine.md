# 0023. Adaptive Expenditure & Weight Tracking Engine

* Status: accepted
* Date: 2026-10-20

## Context and Problem Statement

Quomida previously calculated static calorie and macronutrient targets based on manual entries or fixed multipliers. However, metabolic expenditure varies dynamically across individuals, shifts as body mass changes, and adapts to sustained caloric deficit or surplus (adaptive thermogenesis). Furthermore:
1. Daily bathroom scale measurements suffer from substantial day-to-day noise caused by water retention, sodium intake, glycogen storage, and digestive transit variance (typically ±1–2 kg fluctuations). Naive reactions to raw weight cause unnecessary caloric swings and user anxiety.
2. Existing commercial macro trackers either rely on closed-source cloud algorithms that transmit sensitive personal biometric telemetry to external servers, or use unconstrained linear regression that swings wildly when users miss weigh-in days or log irregularly.
3. Users need a local-first, privacy-preserving, mathematically sound adaptive engine that filters scale noise, computes empirical Total Daily Energy Expenditure (TDEE) from historical consumption and trend weight delta, and recalibrates targets with safe guardrails.
4. The system must integrate with Bring Your Own Storage (BYOS) sync to maintain multi-device consistency across Google Sheets without compromising offline-first availability or historical immutability.

## Decision Outcome

We implement an **Adaptive Expenditure & Weight Tracking Engine** consisting of a deterministic biometric seed baseline, gap-aware Exponential Weighted Moving Average (EWMA) trend weight filtering, a 14-day rolling energy balance solver, and BYOS cloud synchronization:

1. **Deterministic Biometric Seed Engine (Mifflin-St Jeor)**:
   - When biometrics (`sex`, `birth_date`, `height_cm`, `activity_multiplier`) are provided, baseline Basal Metabolic Rate (BMR) is calculated via the validated Mifflin-St Jeor formula:
     $$\text{BMR} = 10 \times W + 6.25 \times H - 5 \times A + s$$
     where $s = +5$ for males and $-161$ for females, $W$ is weight in kg, $H$ is height in cm, and $A$ is age in full years.
   - Seed TDEE: $\text{round}(\text{BMR} \times \text{activity\_multiplier})$.
   - Target Calorie & Macro Calculation:
     - Caloric delta from goal: $\Delta E_{\text{daily}} = \frac{(\text{weekly\_rate\_pct} / 100) \times W \times 7700}{7}$
     - Safety floor enforcement: minimum 1200 kcal/day for females, 1500 kcal/day for males.
     - Protein: $\text{round}(W \times \text{protein\_g\_per\_kg})$.
     - Fats: minimum physiological floor ($0.7\text{ g/kg} \times 9\text{ kcal/g}$) up to $\text{Target}_{\text{kcal}} \times \text{fat\_calorie\_pct}$.
     - Carbohydrates: remainder of calories allocated to carbs ($\max(0, (\text{Target}_{\text{kcal}} - (P_g \times 4 + F_g \times 9)) / 4)$).

2. **Gap-Aware EWMA Trend Weight Filter ($\alpha = 0.12$)**:
   - Daily weight fluctuations are smoothed using an Exponential Weighted Moving Average with a base smoothing factor $\alpha = 0.12$ (equivalent to an approximate 15-day half-life).
   - To handle missed logging days and irregular intervals without distortion, the effective smoothing parameter scales with elapsed calendar days:
     $$\alpha_{\text{eff}} = 1 - (1 - \alpha)^{\Delta\text{days}}$$
     where $\Delta\text{days} = \text{daysBetween}(d_{\text{prev}}, d_{\text{new}})$.
   - $\hat{W}_{\text{new}} = \hat{W}_{\text{prev}} + \alpha_{\text{eff}} \times (W_{\text{raw}} - \hat{W}_{\text{prev}})$.

3. **14-Day Rolling Energy Balance TDEE Solver**:
   - Analysis window: 14 days ($W_{14} = [\text{today} - 13\text{ days}, \text{today}]$).
   - Dual-Gate Data Sufficiency:
     - **Weight Sufficiency**: $\ge 4$ weight logs in the most recent 7 days ($[\text{today} - 6, \text{today}]$) AND $\ge 1$ weight log in the preceding 7 days ($[\text{today} - 13, \text{today} - 7]$).
     - **Intake Sufficiency**: $\ge 10$ distinct dates in $W_{14}$ with daily intake $\ge 800\text{ kcal}$.
   - Observed Expenditure:
     $$\Delta\hat{W}_{\text{daily}} = \frac{\hat{W}_{\text{end}} - \hat{W}_{\text{start}}}{\text{daysBetween}(d_{\text{start}}, d_{\text{end}})}$$
     $$\Delta E_{\text{tissue}} = \Delta\hat{W}_{\text{daily}} \times 7700\text{ kcal/kg}$$
     $$\text{TDEE}_{\text{obs}} = \overline{I}_{14} - \Delta E_{\text{tissue}}$$
   - Smoothing & Safety Clamp:
     $$\text{TDEE}_{\text{blended}} = 0.30 \times \text{TDEE}_{\text{obs}} + 0.70 \times \text{TDEE}_{\text{prev}}$$
     $$\text{TDEE}_{\text{new}} = \text{clamp}(\text{round}(\text{TDEE}_{\text{blended}}), \text{TDEE}_{\text{prev}} - 150, \text{TDEE}_{\text{prev}} + 150)$$
   - **Idempotent Weekly Anchor (`prior_tdee`) & Mutation Recalculation**:
     - To allow immediate target recalculation when users edit, add, or delete past food or weight logs without compounding distortion or recursive 30/70 drift, `adaptive_state` stores `prior_tdee` (the pre-calibration baseline anchor for the current 7-day cycle).
     - Re-evaluations occurring within the same 7-day calibration cycle anchor against `prior_tdee`, guaranteeing deterministic and idempotent target resolution on repeated edits. Advancing to a new weekly cycle ($\ge 7\text{ days}$) shifts `prior_tdee` to the previous cycle's `estimated_tdee`.
     - If deletions cause data sufficiency to drop below gate thresholds ($\text{status} \ne \text{'ready'}$), targets cleanly revert to the safe baseline anchor rather than retaining stale targets from deleted logs.
   - New targets are recalculated using $\text{TDEE}_{\text{new}}$ and the latest trend weight $\hat{W}_{\text{end}}$.

4. **Schema Evolution (Fresh v0 Baseline)**:
   - `weight_logs` collection added with fields `id` (`weight_YYYY-MM-DD`), `date`, `timestamp`, `weight_kg`, `trend_weight_kg`, `note`, `updatedAt`.
   - `user_settings` schema extended with `target_mode`, `biometrics`, `goal_config`, and `adaptive_state` directly at version 0 as a fresh baseline.

5. **BYOS Google Sheets Tab Isolation**:
   - A dedicated `weight_logs` worksheet tab in the user's Google Drive spreadsheet stores serialized weight logs with dynamic header mapping, preserving isolated sync operations.

6. **Pluggable Lightweight SVG Visualizations**:
   - Pure React/SVG charting component (`WeightTrendChart`) rendering raw scale points, EWMA trend curves, and goal reference lines with zero external charting library bundle overhead.

7. **Multi-Device Cloud Sync Cascade Recalculation & EWMA Trend Healing**:
   - When remote `weight_logs`, `daily_logs`, or `user_settings` modifications arrive via cloud sync (`syncDatabaseWithRemote` / `forceSync`), the sync pipeline automatically:
     - Recomputes chronological EWMA tendency across the merged local + remote weight history. Any healed or updated `trend_weight_kg` values are saved locally and pushed back to the remote adapter (e.g. Google Sheets `weight_logs` tab).
     - Re-evaluates adaptive expenditure and macro targets against the newly merged data state. If targets change, `user_settings` is updated locally and pushed to the remote adapter (e.g. Google Drive AppData `settings.json`).
     - Reactively streams `user_settings` changes via RxDB observable (`db.user_settings.findOne('global_settings').$`) to all active presentation components (`<MacroRings />`, `<SettingsModal />`, `<AnalyticsModal />`) without requiring a manual page refresh.
     - Automatically refreshes the 14-day compliance pane and horizon metrics in `<AnalyticsModal />` whenever daily logs are pulled or modified across any past date.

## Consequences

### Positive
- **Metabolic Realism**: Caloric targets automatically adjust to actual biological expenditure rather than static formulas.
- **Noise Immunity**: Day-to-day fluid and digestive fluctuations are filtered via gap-aware EWMA, giving users peace of mind.
- **Safety Rails**: Conservative 30/70 blending, ±150 kcal weekly clamps, and absolute gender-specific calorie floors prevent unsafe extreme targets.
- **Zero-Cloud Privacy**: Entire energy expenditure algorithm executes 100% client-side in domain-core; biometric data never leaves user control.
- **BYOS Multi-Device Sync**: Full bi-directional synchronization via Google Drive Sheets using the existing decoupled cloud sync architecture.

### Negative / Risks
- **Data Requirement Latency**: Requires 10 qualifying intake days and 5 qualifying weigh-in days across 14 days before adaptive calibration engages; explicit UI state indicators (`collecting_data`, `insufficient_logs`, `ready`) are necessary to guide the user during the initial warm-up period.
