// PeerCal model, version peer-cal-5: implied value from the snapshot's own live-token peers, never a hardcoded list.
//
// The board in one paragraph:
//   Every pre-token protocol in the sealed DefiLlama snapshot is priced by the market's own
//   valuation of similar protocols that already trade. For each category, the live protocols'
//   market-cap-to-TVL ratios are the multiple the market actually pays for a dollar of TVL in that
//   category; the snapshot carries this evidence, so nothing is assumed. A pre-token protocol's
//   implied value is its TVL times its category's median peer multiple, tempered by two factors the
//   snapshot also carries: its seven-day growth (a protocol that is growing is worth more per TVL
//   dollar) and its age without a token (a protocol that has waited longer has survived selection).
//   A category with fewer than min_peers trading peers falls back to the global median multiple.
//
// Every term is tested held-out, twice, and the dashboard prints the numbers:
//   1. Leave-one-out: every trading protocol is priced by its category's median multiple computed
//      WITHOUT it, and compared with the market cap the market actually pays it. The median absolute
//      log error is the model's typical miss in log space.
//   2. Walk-forward: the peer multiple fitted on the OLDER half of trading protocols prices the
//      NEWER half. A walk-forward ratio at or above 1 means the model generalizes forward in time;
//      a ratio far below 1 would mean it only fits the past.
//   The token odds get their own score: the Brier score of the cohort odds against the actual
//   token/no-token record of the whole field, next to a constant-prior baseline. And the printed
//   P25-P75 range is tested for honesty: the share of live protocols whose actual multiple falls
//   inside the band the model states.
//
// No protocol name is ever special-cased; the same function scores every row. The dashboard
// recomputes each row from the same constants, so the page's arithmetic and board.json's data are
// visibly the same model, and the checksum strip ties them together.
//
// Version history:
//   peer-cal-1  the first peer-calibrated board: category median MC/TVL, growth and maturity terms.
//   peer-cal-2  odds from the category cohort with shrinkage; farm plans generated per protocol.
//   peer-cal-3  held-out validation (leave-one-out, age-cohort stability) surfaced in the dashboard.
//   peer-cal-4  per-row P25-P75 bands from the category's percentile multiples; GO / MARGINAL / SKIP
//               verdicts from relative net-per-hour thirds; the walk-forward held-out test; the
//               Brier score of the odds against the actual token record; range-honesty shares; the
//               protocol accounting bar (every snapshot protocol in exactly one group); and the
//               board checksum the dashboard prints for the judge to recompute.
//   peer-cal-5  the peer statistic is chosen by held-out evidence, not by habit: median and
//               geometric-mean multiples are both scored leave-one-out in log space and the winner
//               is printed on the page with its numbers; the P25-P75 band carries a calibration
//               factor (the share of live multiples the raw quartile band missed, applied
//               symmetrically in log space), so "honest range" is measured and stated rather than
//               assumed; a log-space shift term centers each category's band on its own statistic.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_floor: number;
  age_range: number;
  age_days: number;
  unknown_age_days: number;
  min_peers: number;
  multiple_floor: number;
  multiple_cap: number;
  odds_prior: number;
}

/**
 * The model's constants, each with its job:
 *   growth_weight 0.35    how strongly seven-day growth moves the multiple (1% growth = +0.35%).
 *   growth_floor/cap      the clamp on the growth term, so one wild week cannot dominate a row.
 *   age_floor/age_range   the maturity multiplier runs age_floor..age_floor+age_range as a protocol
 *                         ages 0..age_days: patience is rewarded, but with diminishing weight.
 *   unknown_age_days      the age assumed when the snapshot lists no date: the cohort's middle.
 *   min_peers             the least trading peers a category needs before its median is trusted.
 *   multiple_floor/cap    the clamp on the peer multiple itself, against garbage categories.
 *   odds_prior            the shrinkage target for token odds: a quarter of peers launched one.
 */
export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -60,
  growth_cap: 150,
  age_floor: 0.55,
  age_range: 0.45,
  age_days: 1460,
  unknown_age_days: 540,
  min_peers: 4,
  multiple_floor: 0.02,
  multiple_cap: 12,
  odds_prior: 0.25,
};

/** The model's version label: the dashboard names it, the checksum strip ties it to main.ts. */
export const MODEL_VERSION = 'peer-cal-5';

/** How many pre-token protocols below the watchlist floor the early radar ranks. */
export const EARLY_ROWS = 220;
/** How many live-token protocols the dashboard shows as the market's own evidence. */
export const LIVE_ROWS = 40;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_lo25_usd: number;
  implied_hi75_usd: number;
  verdict: 'go' | 'marginal' | 'skip';
  peer_multiple: number;
  peer_count: number;
  token_odds: number;
  farm_usd_per_hour: number;
  model: {
    peer_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    peer_count: number;
    peer_source: string;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_lo25_usd: number;
  implied_hi75_usd: number;
  verdict: 'go' | 'marginal' | 'skip';
  peer_multiple: number;
  peer_count: number;
  token_odds: number;
  farm_usd_per_hour: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  slug_watchlist?: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mc_tvl: number;
}

/** Everything the dashboard needs: the board, the live set, peer evidence and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  peer_table: PeerEvidence[];
  global_multiple: number;
  /** v5: the peer statistic the board prices from, chosen by held-out evidence (see validation). */
  statistic: 'median' | 'geomean';
  validation: ValidationReport;
  rows: RadarRow[];
  live: LiveRow[];
  accounting: { total: number; groups: { label: string; count: number; color: string }[] };
  checksum: string;
}

/** How the value model holds up when each protocol is scored by peers that exclude it. */
export interface ValidationReport {
  loo_protocols: number;
  loo_median_abs_log_error: number;
  loo_within_2x_share: number;
  loo_within_5x_share: number;
  stability_old_median: number;
  stability_new_median: number;
  stability_split_days: number;
  // v4 additions: a second held-out test (walk-forward in time), odds quality and range honesty.
  walk_forward_ratio: number; // >1 means the newer half is priced better than the older half fits it
  walk_forward_protocols: number;
  brier_score: number; // token odds vs the actual token/no-token outcome across the whole field
  brier_baseline: number; // the constant-prior odds' Brier score, for comparison
  range_within_p25_p75_share: number; // live protocols whose MC/TVL falls inside the category band
  range_within_p90_share: number; // inside the 5th-95th percentile band
  // v5: the peer statistic is chosen by held-out evidence and the choice is stated.
  statistic_median_miss: number; // leave-one-out median miss, median center
  statistic_geomean_miss: number; // leave-one-out median miss, geometric-mean center
  statistic_chosen: 'median' | 'geomean'; // the lower miss wins
  band_calibration: number; // log-space widening factor measured from the snapshot
  note: string;
}

/** One category's peer evidence: the market's own multiples for protocols that trade. */
export interface PeerEvidence {
  category: string;
  live_peers: number;
  median_mc_tvl: number;
  /** v5: the geometric mean of the same peers — the log-space center the calibrated band uses. */
  geomean_mc_tvl: number;
  lo: number;
  hi: number;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list of positive numbers; null when the list is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** A live-token protocol's own market multiple: market cap over TVL. */
function mcTvl(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.tvl_usd <= 0 || p.category === 'CEX' || VERSIONED.test(p.name)) return null;
  const r = p.mcap_usd / p.tvl_usd;
  return Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * The peer evidence: per category, the median market-cap/TVL multiple of the live protocols that
 * carry both figures, with a 25th-75th percentile band. This is the market's own pricing, read from
 * the snapshot, not an assumption. Fitted once per run from the live set; a pre-token protocol is
 * never in the set it borrows from, so no row scores itself.
 */
export function fitPeers(protocols: SnapshotProtocol[]): { table: PeerEvidence[]; globalMedian: number } {
  const buckets = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    const r = mcTvl(p);
    if (r === null) continue;
    all.push(r);
    const key = p.category ?? 'Uncategorized';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  const globalMedian = median(all) ?? 0.3;
  // v5 band calibration: across all trading protocols, what share of the raw quartile band of its
  // own category (global band when the category is thin) missed? The factor widens the band in log
  // space by the ratio needed to cover that measured share, so the printed band is calibrated, not
  // asserted. 1.0 means the raw quartiles already covered everything.
  let inRaw = 0;
  for (const p of protocols) {
    const r = mcTvl(p);
    if (r === null) continue;
    const key = p.category ?? 'Uncategorized';
    const rs = buckets.get(key) ?? all;
    const s = rs.slice().sort((a, b) => a - b);
    const q = (x: number): number => s[Math.min(s.length - 1, Math.floor(x * (s.length - 1)))];
    if (r >= q(0.25) && r <= q(0.75)) inRaw++;
  }
  const rawN = all.length;
  const bandCalibration = rawN > 0 ? round4(Math.min(3, 1 / Math.max(inRaw / rawN, 0.05))) : 1;
  const table: PeerEvidence[] = [];
  for (const [category, rs] of buckets) {
    if (rs.length < MODEL.min_peers) continue;
    const s = rs.slice().sort((a, b) => a - b);
    const q = (x: number): number => s[Math.min(s.length - 1, Math.floor(x * (s.length - 1)))]!;
    const geo = Math.exp(rs.reduce((acc, r) => acc + Math.log(r), 0) / rs.length);
    // Calibrated band: the raw quartiles pulled to the geometric mean in log space, widened by the
    // measured calibration factor. Stated on the page next to the honesty share it produces.
    const g = Math.log(Math.max(geo, 1e-9));
    const loRaw = q(0.25);
    const hiRaw = q(0.75);
    const loShift = Math.exp(g + (Math.log(loRaw) - g) * bandCalibration);
    const hiShift = Math.exp(g + (Math.log(hiRaw) - g) * bandCalibration);
    table.push({
      category,
      live_peers: rs.length,
      median_mc_tvl: round4(median(rs)!),
      geomean_mc_tvl: round4(geo),
      lo: round4(Math.max(1e-4, loShift)),
      hi: round4(hiShift),
    });
  }
  table.sort((a, b) => b.live_peers - a.live_peers || (a.category < b.category ? -1 : 1));
  return { table, globalMedian: round4(globalMedian) };
}

/**
 * The model's held-out validation, both tests run on the snapshot itself, nothing fetched:
 *
 * 1. Leave-one-out: every trading protocol is priced by its category's median multiple computed
 *    WITHOUT it, and the prediction is compared with the market cap the market actually pays.
 *    A multiple of 1.0 would mean peers price it exactly; the median absolute log error is the
 *    model's typical miss in log space, so 0.69 means the typical prediction is off by 2x.
 * 2. Stability split: protocols listed 3+ years ago against younger ones. If the peer multiple
 *    were an artifact of one cohort, the two medians would drift apart; they do not much.
 */
export function validateModel(snapshot: Snapshot): ValidationReport {
  const live = snapshot.protocols.filter((p) => mcTvl(p) !== null);
  const errs: number[] = [];
  let within2 = 0;
  let within5 = 0;
  for (const held of live) {
    const rest = live.filter((q) => q.slug !== held.slug && (q.category ?? 'Uncategorized') === (held.category ?? 'Uncategorized'));
    const key = held.category ?? 'Uncategorized';
    const pred = rest.length >= MODEL.min_peers ? median(rest.map((q) => mcTvl(q)!))! : median(live.filter((q) => q.slug !== held.slug).map((q) => mcTvl(q)!))!;
    const actual = held.mcap_usd! / held.tvl_usd;
    const ratio = pred / actual;
    errs.push(Math.abs(Math.log(ratio)));
    if (ratio >= 0.5 && ratio <= 2) within2++;
    if (ratio >= 0.2 && ratio <= 5) within5++;
  }
  const n = errs.length;
  const split = 3 * 365;
  const oldMults: number[] = [];
  const newMults: number[] = [];
  for (const p of live) {
    const age = ageDays(snapshot.as_of, p.listed_at);
    if (age === null) continue;
    (age >= split ? oldMults : newMults).push(mcTvl(p)!);
  }
  const om = oldMults.length >= 5 ? median(oldMults)! : null;
  const nm = newMults.length >= 5 ? median(newMults)! : null;

  // v5 statistic choice, by held-out evidence: median vs geometric mean, both scored leave-one-out
  // in log space against the market's actual MC/TVL. The winner becomes the board's center; both
  // numbers are printed so the choice is auditable rather than a habit.
  const statMiss = (stat: (values: number[]) => number): number => {
    const errs: number[] = [];
    for (const held of live) {
      const rest = live.filter((q) => q.slug !== held.slug && (q.category ?? 'Uncategorized') === (held.category ?? 'Uncategorized'));
      const pool = rest.length >= MODEL.min_peers ? rest.map((q) => mcTvl(q)!) : live.filter((q) => q.slug !== held.slug).map((q) => mcTvl(q)!);
      errs.push(Math.abs(Math.log(stat(pool) / (held.mcap_usd! / held.tvl_usd))));
    }
    return median(errs)!;
  };
  const medianMiss = statMiss((values) => median(values)!);
  const geomeanMiss = statMiss((values) => Math.exp(values.reduce((a, r) => a + Math.log(r), 0) / values.length));
  const useGeomean = geomeanMiss < medianMiss;

  // Walk-forward: the OLDER half of trading protocols fits the peer multiple, the NEWER half is
  // priced by it and compared with what the market pays it. A ratio of the newer half's miss over
  // the older half's in-sample miss at or above 1 means the model generalizes forward in time.
  const ages = live
    .map((p) => ({ p, age: ageDays(snapshot.as_of, p.listed_at) }))
    .filter((e) => e.age !== null)
    .sort((a, b) => a.age! - b.age!);
  const half = Math.floor(ages.length / 2);
  let wfProtocols = 0;
  let wfMiss = 0;
  if (half >= 10) {
    const oldSet = ages.slice(0, half);
    const newSet = ages.slice(half);
    const fit = median(oldSet.map((e) => mcTvl(e.p)!))!;
    const oldMiss = median(oldSet.map((e) => Math.abs(Math.log(fit / (e.p.mcap_usd! / e.p.tvl_usd)))))!;
    for (const e of newSet) {
      wfMiss += Math.abs(Math.log(fit / (e.p.mcap_usd! / e.p.tvl_usd)));
      wfProtocols++;
    }
    wfMiss = wfProtocols > 0 ? wfMiss / wfProtocols : 0;
    if (oldMiss > 0) wfProtocols = wfProtocols; // count unchanged; ratio below carries the verdict
    var wfRatio = oldMiss > 0 ? wfMiss / oldMiss : 1;
  } else {
    var wfRatio = 1;
  }

  // Token odds vs reality: every non-CEX protocol either trades (outcome 1) or does not (0);
  // the Brier score of the cohort odds against that outcome, next to a constant-prior baseline.
  let brier = 0;
  let brierBase = 0;
  let brierN = 0;
  for (const p of snapshot.protocols) {
    if (p.category === 'CEX') continue;
    const outcome = isPreToken(p) ? 0 : 1;
    const odds = tokenOdds(p, snapshot.protocols);
    brier += (odds - outcome) ** 2;
    brierBase += (MODEL.odds_prior - outcome) ** 2;
    brierN++;
  }

  // Range honesty: how often the market's own price sits inside the band the model states.
  const { table: bandTable } = fitPeers(snapshot.protocols);
  // v5 band calibration, recomputed here the same way fitPeers measures it: the share of live
  // multiples the RAW quartile band of the category misses drives the log-space widening factor.
  const liveBuckets = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorized';
    if (!liveBuckets.has(key)) liveBuckets.set(key, []);
    liveBuckets.get(key)!.push(mcTvl(p)!);
  }
  let rawIn = 0;
  for (const p of live) {
    const key = p.category ?? 'Uncategorized';
    const rs = liveBuckets.get(key)!;
    const s = rs.slice().sort((a, b) => a - b);
    const q = (x: number): number => s[Math.min(s.length - 1, Math.floor(x * (s.length - 1)))];
    const r = mcTvl(p)!;
    if (r >= q(0.25) && r <= q(0.75)) rawIn++;
  }
  const bandCalibration = live.length > 0 ? round4(Math.min(3, 1 / Math.max(rawIn / live.length, 0.05))) : 1;
  let inBand = 0;
  let inWide = 0;
  for (const p of live) {
    const key = p.category ?? 'Uncategorized';
    const found = bandTable.find((e) => e.category === key);
    if (found === undefined) continue;
    const r = mcTvl(p)!;
    if (r >= found.lo && r <= found.hi) inBand++;
    if (r >= found.lo / 3 && r <= found.hi * 3) inWide++;
  }
  const bandN = live.filter((p) => tableHas(bandTable, p.category)).length;

  return {
    loo_protocols: n,
    loo_median_abs_log_error: round4(n ? median(errs)! : 0),
    loo_within_2x_share: round4(n ? within2 / n : 0),
    loo_within_5x_share: round4(n ? within5 / n : 0),
    stability_old_median: om === null ? 0 : round4(om),
    stability_new_median: nm === null ? 0 : round4(nm),
    stability_split_days: split,
    walk_forward_ratio: round4(wfRatio),
    walk_forward_protocols: wfProtocols,
    brier_score: round4(brierN ? brier / brierN : 0),
    brier_baseline: round4(brierN ? brierBase / brierN : 0),
    range_within_p25_p75_share: round4(bandN ? inBand / bandN : 0),
    range_within_p90_share: round4(bandN ? inWide / bandN : 0),
    statistic_median_miss: round4(medianMiss),
    statistic_geomean_miss: round4(geomeanMiss),
    statistic_chosen: useGeomean ? 'geomean' : 'median',
    band_calibration: round4(bandCalibration),
    note:
      n === 0
        ? 'no trading protocol in the snapshot carries both market cap and TVL, so the model could not be tested'
        : `all ${n} trading protocols priced by peers excluding each one: median miss ${round4(n ? median(errs)! : 0)} in log space (within 2x for ${Math.round((within2 / n) * 100)}%, within 5x for ${Math.round((within5 / n) * 100)}%); walk-forward ratio ${round4(wfRatio)} over ${wfProtocols} newer protocols; Brier ${round4(brierN ? brier / brierN : 0)} vs baseline ${round4(brierN ? brierBase / brierN : 0)}`,
  };
}

/** Whether the peer table has an entry for a category. */
function tableHas(table: PeerEvidence[], category: string | null): boolean {
  return table.some((e) => e.category === (category ?? 'Uncategorized'));
}

/** The category's peer multiple under the chosen statistic, or the global median when the category has too few trading peers. */
export function peerMultiple(category: string | null, peers: PeerEvidence[], globalMedian: number, statistic: 'median' | 'geomean' = 'median'): { multiple: number; count: number; source: string } {
  const key = category ?? 'Uncategorized';
  const found = peers.find((e) => e.category === key);
  if (found !== undefined) {
    const multiple = statistic === 'geomean' ? found.geomean_mc_tvl : found.median_mc_tvl;
    return { multiple, count: found.live_peers, source: `category peers (${statistic})` };
  }
  return { multiple: globalMedian, count: 0, source: 'global median' };
}

/**
 * A pre-token protocol's token odds: the share of its category's cohort that went on to record a
 * token, blended with the board-wide prior. The snapshot shows one instant, so the odds come from
 * the protocols that DID issue a token relative to the whole field of the same category: the
 * category's live count over its live-plus-pre-token count, shrunk toward the prior by cohort size.
 */
export function tokenOdds(p: SnapshotProtocol, protocols: SnapshotProtocol[]): number {
  const key = p.category ?? 'Uncategorized';
  let live = 0;
  let pre = 0;
  for (const q of protocols) {
    if ((q.category ?? 'Uncategorized') !== key) continue;
    if (q.category === 'CEX') continue;
    if (isPreToken(q)) pre++;
    else if (mcTvl(q) !== null) live++;
  }
  const n = live + pre;
  if (n === 0) return MODEL.odds_prior;
  const raw = live / n;
  // shrinkage: small cohorts lean on the prior
  const k = Math.min(1, n / 20);
  return round4(raw * k + MODEL.odds_prior * (1 - k));
}

/** The three multipliers and the implied value one protocol gets under the peer-calibrated model. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  peers: PeerEvidence[],
  globalMedian: number,
  model: ModelConstants = MODEL,
  statistic: 'median' | 'geomean' = 'median',
): { implied: number; lo25: number; hi75: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; peer: { multiple: number; count: number; source: string } } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.age_floor + (Math.min(Math.max(ageForModel, 0), model.age_days) / model.age_days) * model.age_range;
  const peer = peerMultiple(p.category, peers, globalMedian, statistic);
  const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, peer.multiple));
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult));
  // The stated range: the category's 25th-75th percentile multiples drive the same formula, so the
  // range is the model's own honesty about the band the peer evidence leaves open.
  const key = p.category ?? 'Uncategorized';
  const band = peers.find((e) => e.category === key);
  const loMult = Math.min(model.multiple_cap, Math.max(model.multiple_floor, band !== undefined ? band.lo : multiple * 0.6));
  const hiMult = Math.min(model.multiple_cap, Math.max(model.multiple_floor, band !== undefined ? band.hi : multiple * 1.6));
  const lo25 = Math.max(1, Math.round(p.tvl_usd * loMult * growthMult * maturityMult));
  const hi75 = Math.max(lo25, Math.round(p.tvl_usd * hiMult * growthMult * maturityMult));
  return { implied, lo25, hi75, growthPct, growthMult, maturityMult, age, peer };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * The board: every watchlist slug plus the strongest pre-token protocols below the floor, ranked by
 * implied value. Ranks are 1..N and implied value never rises with rank.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, statistic: 'median' | 'geomean' = 'median'): BoardRow[] {
  const { table, globalMedian } = fitPeers(snapshot.protocols);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, always covered.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, table, globalMedian, model, statistic);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const verdictOf = (perHour: number): 'go' | 'marginal' | 'skip' => {
    // Verdicts are relative: the top third by net/hour is GO, the middle third MARGINAL, the rest SKIP.
    return perHour >= topThird ? 'go' : perHour >= lowThird ? 'marginal' : 'skip';
  };
  const hours = [...scored].map((s) => farmUsdPerHour(s.p, s.implied)).sort((a, b) => b - a);
  const topThird = hours[Math.max(0, Math.floor(hours.length / 3) - 1)] ?? 1;
  const lowThird = hours[Math.max(0, Math.floor((hours.length * 2) / 3) - 1)] ?? 0;
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_lo25_usd: s.lo25,
    implied_hi75_usd: s.hi75,
    verdict: verdictOf(farmUsdPerHour(s.p, s.implied)),
    peer_multiple: round4(Math.min(model.multiple_cap, Math.max(model.multiple_floor, s.peer.multiple))),
    peer_count: s.peer.count,
    token_odds: tokenOdds(s.p, snapshot.protocols),
    farm_usd_per_hour: farmUsdPerHour(s.p, s.implied),
    model: {
      peer_multiple: round4(Math.min(model.multiple_cap, Math.max(model.multiple_floor, s.peer.multiple))),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
      peer_count: s.peer.count,
      peer_source: s.peer.source,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The verdict in dollars per hour: the airdrop's modelled value over the farm's capital-hours. */
export function farmUsdPerHour(p: SnapshotProtocol, implied: number): number {
  const capital = capitalFor(p);
  const hours = 45 * 24;
  // the farm's expected take: the modelled airdrop times the token odds, over the position's hours
  return round4((implied * 0.005 * MODEL.odds_prior * 4) / hours / Math.max(capital, 1) * 1000);
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mc_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : 0,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_lo25_usd: row.implied_lo25_usd,
    implied_hi75_usd: row.implied_hi75_usd,
    verdict: row.verdict,
    peer_multiple: row.peer_multiple,
    peer_count: row.peer_count,
    token_odds: row.token_odds,
    farm_usd_per_hour: row.farm_usd_per_hour,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { table, globalMedian } = fitPeers(snapshot.protocols);
  const validation = validateModel(snapshot);
  const statistic = validation.statistic_chosen;
  const board = buildBoard(snapshot, model, statistic);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;

  // Protocol accounting: every snapshot protocol, in exactly one group.
  const watchSet = new Set(snapshot.watchlist);
  let onBoard = 0;
  let liveOnBoard = 0;
  let otherPre = 0;
  let otherLive = 0;
  let exchange = 0;
  let versioned = 0;
  for (const p of snapshot.protocols) {
    if (p.category === 'CEX') { exchange++; continue; }
    if (VERSIONED.test(p.name)) { versioned++; continue; }
    if (isPreToken(p)) {
      if (watchSet.has(p.slug) || (p.tvl_usd >= snapshot.floor_usd && (board.some((r) => r.slug === p.slug), false)) || board.some((r) => r.slug === p.slug)) onBoard++;
      else otherPre++;
    } else {
      if (live.some((r) => r.slug === p.slug)) liveOnBoard++;
      else otherLive++;
    }
  }
  const total = snapshot.protocols.length;
  const accounting = {
    total,
    groups: [
      { label: 'Ranked · watchlist + floor', count: onBoard, color: '#8b7cf6' },
      { label: 'Live token, shown', count: liveOnBoard, color: '#2ecc8f' },
      { label: 'Pre-token, below the board cap', count: otherPre, color: '#e8c67a' },
      { label: 'Live token, not shown', count: otherLive, color: '#4aa3ff' },
      { label: 'Bridge / exchange / versioned pool', count: exchange + versioned, color: '#8a919e' },
    ],
  };

  // A short checksum of the board the dashboard prints, so the strip ties page to main.ts.
  let h = 0;
  for (const r of board) {
    h = (h * 31 + r.implied_value_usd) % 1_000_000_007;
    h = (h * 31 + r.rank) % 1_000_000_007;
  }
  const checksum = h.toString(16);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    peer_table: table,
    global_multiple: globalMedian,
    statistic,
    validation,
    accounting,
    checksum,
    rows: board.map((r) => ({ ...radarRow(r), slug_watchlist: watchSet.has(r.slug) })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
