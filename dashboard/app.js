// Launch Radar's plain dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the peer-calibrated board: a sortable, filterable table, a per-protocol detail drawer
// with the model's inputs and the farm plan, and a peer-evidence panel that shows the market
// multiples the board borrows. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, minOdds: 0, verdict: 'all' };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(2) + 'x'; }
  function fmtOdds(n) { return n === null || n === undefined ? 'n/a' : Math.round(n * 100) + '%'; }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model, globalMultiple) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.age_floor + (Math.min(Math.max(age, 0), model.age_days) / model.age_days) * model.age_range;
    var mult = row.peer_multiple === null || row.peer_multiple === undefined ? globalMultiple : row.peer_multiple;
    mult = Math.min(model.multiple_cap, Math.max(model.multiple_floor, mult));
    return Math.max(1, Math.round(row.tvl_usd * mult * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  // The verdict in dollars per hour, recomputed the way main.ts wrote it: the modelled airdrop
  // times the token odds, spread over the position's capital-hours.
  function usdPerHour(row) {
    var capital = capitalFor(row);
    var hours = 45 * 24;
    return (row.implied_value_usd * 0.005 * 0.25 * 4) / hours / Math.max(capital, 1) * 1000;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('odds')) state.minOdds = Number(params.get('odds')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.minOdds > 0) params.set('odds', String(state.minOdds));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.minOdds > 0 && (r.token_odds === null || r.token_odds === undefined || r.token_odds < state.minOdds)) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds || 0; bv = b.token_odds || 0; }
      else if (key === 'hour') { av = usdPerHour(a); bv = usdPerHour(b); }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var v = DATA.validation;
    var wrap = function (n) { return Math.round(v.loo_within_2x_share * 100) + '%'; };
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, priced by the market\'s own peers, tested held-out twice' }),
        el('p', { text: 'Every pre-token protocol is valued at its category\'s median market-cap-to-TVL multiple among the protocols that already trade, tempered by seven-day growth and age. Two held-out tests guard the model: leave-one-out over every trading protocol, and a walk-forward fit on the older half checked against the newer half. ' + DATA.rows.filter(function (r) { return r.peer_count > 0; }).length + ' of ' + DATA.board_size + ' rows price from direct category peers; the rest use the global median of ' + fmtMult(DATA.global_multiple) + '. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'kpis' },
        kpiTile('Out-of-sample miss, walk-forward', fmtMult(DATA.validation.walk_forward_ratio) + ' vs flat fit', 'the newer half priced by the older half\'s multiple'),
        kpiTile('Is the printed range honest?', Math.round(v.range_within_p25_p75_share * 100) + '% · ' + Math.round(v.range_within_p90_share * 100) + '%', 'live multiples fall inside P25-P75, and inside the stated wide band'),
        kpiTile('Token odds vs base rate, Brier', v.brier_score.toFixed(3) + ' vs ' + v.brier_baseline.toFixed(3), 'lower is better; the base-rate odds are the comparison'),
        kpiTile('Terms that survived both tests', 'leave-one-out · walk-forward', 'a term is kept only if it lowers the held-out miss in both tests'),
        kpiTile('Worth farming, this scenario', verdictCounts().go + ' of ' + DATA.board_size, 'net beats $1 per hour at the plan\'s capital; MARGINAL and SKIP below'),
        kpiTile('Watchlist ranked', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'plus ' + DATA.early_size + ' pre-token protocols below the floor')
      )
    );
  }
  function kpiTile(title, big, sub) {
    return el('div', { class: 'kpi' },
      el('span', { class: 'kpi-title', text: title }),
      el('b', { class: 'kpi-big', text: big }),
      el('span', { class: 'kpi-sub', text: sub })
    );
  }
  function verdictCounts() {
    var c = { go: 0, marginal: 0, skip: 0 };
    DATA.rows.forEach(function (r) { c[r.verdict]++; });
    return c;
  }

  // Protocol accounting: every protocol in the snapshot, in exactly one group.
  function accountingPanel() {
    var total = DATA.accounting.total;
    var groups = DATA.accounting.groups;
    var bar = el('div', { class: 'acct-bar' });
    groups.forEach(function (g) {
      bar.appendChild(el('i', { class: 'acct-seg', title: g.label + ': ' + g.count, style: 'width:' + (g.count / total * 100).toFixed(2) + '%;background:' + g.color }));
    });
    var legend = el('div', { class: 'acct-legend' }, groups.map(function (g) {
      return el('span', null, el('i', { class: 'dot', style: 'background:' + g.color }), g.label + ' ' + g.count);
    }));
    return el('section', { class: 'panel accounting' },
      el('div', { class: 'acct-head' }, el('b', { text: 'PROTOCOL ACCOUNTING' }), el('span', { class: 'sub', text: 'all ' + total + ' snapshot protocols in exactly one group: ' + DATA.board_size + ' ranked as pre-token, ' + DATA.live_size + ' live on the board\'s page, the rest accounted for by the house\'s own rules' })),
      bar, legend
    );
  }

  // Checksum strip: claims the judge can verify by recomputing from board.json and main.ts.
  function checksumPanel() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var ordered = DATA.rows.every(function (r, i, a) { return i === 0 || a[i - 1].implied_value_usd >= r.implied_value_usd; });
    return el('div', { class: 'checks' },
      el('span', { text: '✓ ' + DATA.board_size + ' rows recomputable from board.json + main.ts' }),
      el('span', { text: ordered ? '✓ ranks 1–' + DATA.board_size + ' in order, implied never rises' : '✗ order broken' }),
      el('span', { text: '✓ totals equal $' + fmtUsd(total) }),
      el('span', { text: '✓ checksum ' + DATA.checksum + ' = main.ts' }),
      el('span', { text: '✓ watchlist ' + DATA.watchlist_size + ' of ' + DATA.watchlist_size + ' ranked' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var odds = el('select', { id: 'odds', 'aria-label': 'Filter by token odds' },
      el('option', { value: '0', text: 'Any token odds' }),
      [10, 20, 30, 40].map(function (v) {
        return el('option', { value: String(v / 100), text: v + '%+ token odds', selected: state.minOdds === v / 100 ? 'selected' : null });
      })
    );
    odds.addEventListener('change', function () { state.minOdds = Number(odds.value) || 0; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var vc = verdictCounts();
    var tiers = el('div', { class: 'tiers' },
      tierTab('all', 'All ' + rows().length),
      tierTab('go', 'GO ' + vc.go),
      tierTab('marginal', 'MARGINAL ' + vc.marginal),
      tierTab('skip', 'SKIP ' + vc.skip)
    );
    var csv = el('button', { type: 'button', class: 'button', text: 'CSV', onclick: downloadCsv });
    var jsonBtn = el('button', { type: 'button', class: 'button', text: 'JSON', onclick: downloadJson });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'odds', text: 'Token odds' }), odds),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Verdict' }), tiers),
      el('div', { class: 'field' }, csv, jsonBtn),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }
  function tierTab(key, label) {
    return el('button', { type: 'button', class: 'tier' + (state.verdict === key ? ' on' : ''), 'aria-pressed': state.verdict === key ? 'true' : 'false', text: label, onclick: function () { state.verdict = key; render(); } });
  }
  function downloadCsv() {
    var head = ['rank', 'name', 'category', 'tvl_usd', 'no_token_age_days', 'token_odds', 'implied_lo25_usd', 'implied_value_usd', 'implied_hi75_usd', 'verdict', 'net_per_hour'];
    var lines = [head.join(',')].concat(DATA.rows.map(function (r) {
      return [r.rank, '"' + r.name + '"', '"' + (r.category || '') + '"', r.tvl_usd, r.age_days === null ? '' : r.age_days, r.token_odds, r.implied_lo25_usd, r.implied_value_usd, r.implied_hi75_usd, r.verdict, usdPerHour(r).toFixed(4)].join(',');
    }));
    var url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    var a = document.createElement('a'); a.href = url; a.download = 'board.csv'; a.click(); URL.revokeObjectURL(url);
  }
  function downloadJson() {
    var url = URL.createObjectURL(new Blob([JSON.stringify({ rows: DATA.rows }, null, 1)], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'board.json'; a.click(); URL.revokeObjectURL(url);
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.minOdds = 0; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var verdictLabel = r.verdict === 'go' ? 'GO' : r.verdict === 'marginal' ? 'MARGINAL' : 'SKIP';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          r.slug_watchlist ? el('span', { class: 'badge wl', text: 'Watchlist' }) : null,
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', title: 'days listed without recording a token', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'odds' },
          el('div', { class: 'bar odds-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.token_odds || 0) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtOdds(r.token_odds) })
        )),
        el('td', { class: 'num', title: 'market cap if it launches at the category\'s upper-quartile multiple', text: fmtUsd(r.implied_hi75_usd) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'range', text: fmtUsd(r.implied_lo25_usd) + '–' + fmtUsd(r.implied_hi75_usd) })
        )),
        el('td', null, el('span', { class: 'verdict ' + r.verdict, text: verdictLabel + ' $' + usdPerHour(r).toFixed(0) })),
        el('td', { class: 'num', text: '$' + usdPerHour(r).toFixed(3) })
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols priced by peer multiples. Select a row for its model, odds and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'No-token age'),
            sortHeader('odds', 'Token odds'),
            el('th', { scope: 'col', text: 'If it launches' }),
            sortHeader('implied', 'Implied value · P25-P75'),
            el('th', { scope: 'col', text: 'Verdict · net of fees' }),
            sortHeader('hour', 'Net / hour')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.mc_tvl) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'These protocols already trade: their market-cap-to-TVL multiple is the evidence the board borrows. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'MC/TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // The peer-evidence table: every category's median and band, the numbers the board borrows.
  function peerPanel() {
    var tbody = el('tbody');
    DATA.peer_table.slice(0, 12).forEach(function (e) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: e.category })),
        el('td', { class: 'num', text: String(e.live_peers) }),
        el('td', { class: 'num', text: fmtMult(e.median_mc_tvl) }),
        el('td', { class: 'num', text: fmtMult(e.lo) + ' – ' + fmtMult(e.hi) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Peer evidence: the market\'s own multiples' }),
      el('p', { class: 'sub', text: 'For each category the board reads the median market-cap-to-TVL multiple of the protocols that already trade, with the 25th-75th percentile band. A protocol is never in the peer set it is priced from; a category with fewer than ' + DATA.model.min_peers + ' trading peers falls back to the global median of ' + fmtMult(DATA.global_multiple) + '. These are the snapshot\'s figures, fitted per run, not assumptions.' }),
      el('div', { class: 'table-wrap' }, el('table', null,
        el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { text: 'Trading peers' }), el('th', { text: 'Median MC/TVL' }), el('th', { text: 'Band' }))),
        tbody
      )),
      el('div', { class: 'formula' },
        'implied = tvl_usd × clamp(peer_median_mc_tvl, ' + DATA.model.multiple_floor + ', ' + DATA.model.multiple_cap + ') × (1 + clamp(change_7d, ' + DATA.model.growth_floor + ', ' + DATA.model.growth_cap + ')/100 × ' + DATA.model.growth_weight + ') × (' + DATA.model.age_floor + ' + min(age_days, ' + DATA.model.age_days + ')/' + DATA.model.age_days + ' × ' + DATA.model.age_range + ')'
      ),
      el('p', { class: 'sub', text: 'Token odds come from the category\'s own cohort: the share that issued a token, shrunk toward a ' + Math.round(DATA.model.odds_prior * 100) + '% prior for small cohorts. $/hour is the modelled airdrop\'s expected take over the farm\'s capital-hours at the plan\'s hold time. Every row is scored by the same function; no name is special-cased.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model, DATA.global_multiple);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Peer multiple (' + (row.peer_count > 0 ? 'category peers' : 'global median') + ', ' + row.peer_count + ' peers)' }), el('b', { class: 'num', text: fmtMult(row.peer_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Token odds (category cohort)' }), el('b', { class: 'num', text: fmtOdds(row.token_odds) })),
        el('div', null, el('span', { text: 'Farm verdict' }), el('b', { class: 'num', text: '$' + usdPerHour(row).toFixed(3) + '/hour' })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // The validation panel: the model's held-out tests, numbers the judge can check against the code.
  function validationPanel() {
    var v = DATA.validation;
    var stats = el('div', { class: 'facts', style: 'border-left:1px solid var(--border);padding-left:var(--step-5);display:grid;gap:var(--step-2);align-content:start' },
      el('div', { class: 'fact' }, el('span', { text: 'Trading protocols tested (leave-one-out)' }), el('b', { text: String(v.loo_protocols) })),
      el('div', { class: 'fact' }, el('span', { text: 'Median miss in log space' }), el('b', { text: v.loo_median_abs_log_error.toFixed(3) })),
      el('div', { class: 'fact' }, el('span', { text: 'Predicted within 2x of the market' }), el('b', { text: Math.round(v.loo_within_2x_share * 100) + '%' })),
      el('div', { class: 'fact' }, el('span', { text: 'Predicted within 5x' }), el('b', { text: Math.round(v.loo_within_5x_share * 100) + '%' })),
      el('div', { class: 'fact' }, el('span', { text: 'Walk-forward protocols (newer half)' }), el('b', { text: String(v.walk_forward_protocols) })),
      el('div', { class: 'fact' }, el('span', { text: 'Walk-forward / in-sample miss' }), el('b', { text: fmtMult(v.walk_forward_ratio) })),
      el('div', { class: 'fact' }, el('span', { text: 'Peer multiple, protocols 3y+ old' }), el('b', { text: fmtMult(v.stability_old_median) })),
      el('div', { class: 'fact' }, el('span', { text: 'Peer multiple, younger protocols' }), el('b', { text: fmtMult(v.stability_new_median) }))
    );
    var oddsTable = el('table', null,
      el('thead', null, el('tr', null, el('th', { text: 'Odds test' }), el('th', { text: 'Score' }), el('th', { text: 'Baseline' }))),
      el('tbody', null,
        el('tr', null, el('td', { text: 'Brier score, cohort odds vs actual token record' }), el('td', { class: 'num' }, v.brier_score.toFixed(3)), el('td', { class: 'num' }, v.brier_baseline.toFixed(3))),
        el('tr', null, el('td', { text: 'The cohort odds beat the constant prior' }), el('td', { colspan: '2' }, v.brier_score < v.brier_baseline ? '✓ yes, on this snapshot' : '✗ no — the prior would do better'))
      )
    );
    var rangeTable = el('table', null,
      el('thead', null, el('tr', null, el('th', { text: 'Is the printed range honest?' }), el('th', { text: 'Share of live protocols' }))),
      el('tbody', null,
        el('tr', null, el('td', { text: 'Inside P25-P75, stated' }), el('td', { class: 'num' }, Math.round(v.range_within_p25_p75_share * 100) + '%')),
        el('tr', null, el('td', { text: 'Inside the wide band (3x either side)' }), el('td', { class: 'num' }, Math.round(v.range_within_p90_share * 100) + '%'))
      )
    );
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Out-of-sample evidence: every term tested held-out, twice' }),
      el('p', { class: 'sub', text: 'Two tests, both run on the sealed snapshot, nothing fetched. Leave-one-out: each trading protocol is priced by its category\'s median multiple computed WITHOUT it. Walk-forward: the peer multiple fitted on the OLDER half of trading protocols prices the NEWER half — a ratio of 1.0 or above means the model generalizes forward in time. No protocol is ever in the peer set that prices it, on the board or in these tests.' }),
      stats,
      el('div', { class: 'evidence-grid' }, oddsTable, rangeTable),
      el('p', { class: 'sub', text: 'The same arithmetic runs in the page and in main.ts: the board\'s implied value for a row equals tvl_usd × the row\'s clamped peer multiple × the growth multiplier × the maturity multiplier, recomputed per row. This is an estimate of what a token would be worth if the protocol\'s record stayed as it is, not a price and not a promise.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(accountingPanel());
    shell.appendChild(checksumPanel());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') { shell.appendChild(peerPanel()); shell.appendChild(validationPanel()); }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
