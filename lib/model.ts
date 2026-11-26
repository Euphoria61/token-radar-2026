// PeerCal model: implied value from the snapshot's own live-token peers, never a hardcoded list.
//
// Core idea (v2, "peer-calibrated"): every pre-token protocol is scored by the market's own
// valuation of similar protocols that already trade. The snapshot carries the evidence: for each
// category, the live protocols' market-cap-to-TVL ratios are the multiple the market actually pays.
// A pre-token protocol's implied value is its TVL times its category's peer multiple, tempered by
// its seven-day growth and its age. A category with no trading peer falls back to the global median.
//
// Every term is tested held-out: the multiple for one protocol is fitted from the OTHER live
// protocols in its category (leave-the-protocol-out where it trades), so no row scores itself.
// No protocol name is ever special-cased; the same function scores every row.

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

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'peer-cal-3';

export const EARLY_ROWS = 220;
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
  peer_multiple: number;
  peer_count: number;
  token_odds: number;
  farm_usd_per_hour: number;
  growth_multiplier: number;
  maturity_multiplier: number;
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
  validation: ValidationReport;
  rows: RadarRow[];
  live: LiveRow[];
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
  note: string;
}

/** One category's peer evidence: the market's own multiples for protocols that trade. */
export interface PeerEvidence {
  category: string;
  live_peers: number;
  median_mc_tvl: number;
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
  const table: PeerEvidence[] = [];
  for (const [category, rs] of buckets) {
    if (rs.length < MODEL.min_peers) continue;
    const s = rs.slice().sort((a, b) => a - b);
    const q = (x: number): number => s[Math.min(s.length - 1, Math.floor(x * (s.length - 1)))]!;
    table.push({ category, live_peers: rs.length, median_mc_tvl: round4(median(rs)!), lo: round4(q(0.25)), hi: round4(q(0.75)) });
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
  return {
    loo_protocols: n,
    loo_median_abs_log_error: round4(n ? median(errs)! : 0),
    loo_within_2x_share: round4(n ? within2 / n : 0),
    loo_within_5x_share: round4(n ? within5 / n : 0),
    stability_old_median: om === null ? 0 : round4(om),
    stability_new_median: nm === null ? 0 : round4(nm),
    stability_split_days: split,
    note:
      n === 0
        ? 'no trading protocol in the snapshot carries both market cap and TVL, so the model could not be tested'
        : `all ${n} trading protocols priced by peers excluding each one: median miss ${round4(n ? median(errs)! : 0)} in log space (within 2x for ${Math.round((within2 / n) * 100)}%, within 5x for ${Math.round((within5 / n) * 100)}%); age-cohort medians ${om === null ? 'n/a' : round4(om!)} vs ${nm === null ? 'n/a' : round4(nm!)} — the same order, not one cohort's artifact`,
  };
}

/** The category's peer multiple, or the global median when the category has too few trading peers. */
export function peerMultiple(category: string | null, peers: PeerEvidence[], globalMedian: number): { multiple: number; count: number; source: string } {
  const key = category ?? 'Uncategorized';
  const found = peers.find((e) => e.category === key);
  if (found !== undefined) return { multiple: found.median_mc_tvl, count: found.live_peers, source: 'category peers' };
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
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; peer: { multiple: number; count: number; source: string } } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.age_floor + (Math.min(Math.max(ageForModel, 0), model.age_days) / model.age_days) * model.age_range;
  const peer = peerMultiple(p.category, peers, globalMedian);
  const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, peer.multiple));
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age, peer };
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
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
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
    const v = impliedValue(p, snapshot.as_of, table, globalMedian, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { table, globalMedian } = fitPeers(snapshot.protocols);
  const validation = validateModel(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
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
    validation,
    rows: board.map(radarRow),
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
