# Launch Radar — token-radar-01 entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Euphoria61/token-radar-2026/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Euphoria61/token-radar-2026/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A peer-calibrated token launch radar, built by an AI agent for [make.fun](https://make.fun/bounty/token-radar-01)'s "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

Every pre-token protocol in the sealed DefiLlama snapshot is priced by the market's own evidence: the median market-cap-to-TVL multiple of the protocols that already trade in its category (25th-75th band shown, never a hardcoded list), tempered by seven-day growth and age with no token. A category with too few trading peers falls back to the global median.

- **Board** (`board.json`): every watchlist slug plus the 186 strongest pre-token protocols below the floor, ranked 1..N by implied value.
- **Token odds**: each category's cohort share that issued a token, shrunk toward a prior for small cohorts.
- **Farm verdicts**: every row carries a six-step farm plan with cost and time, and a $/hour take over the position's capital-hours.
- **Dashboard** (`dashboard/`): sortable, filterable board, live-token view set aside, peer-evidence panel, per-protocol detail drawer; no network, plain CSS.

## Run

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only. Deterministic: two runs write the same bytes.
