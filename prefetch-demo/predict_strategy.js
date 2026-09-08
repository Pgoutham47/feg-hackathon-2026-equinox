// Which games do we cache, and how much of each?
//
// predict.html answers "how often do we guess the right game". That is only half
// the question: a hit on a full bundle and a hit on a slice are not worth the same,
// and cost 8x different storage. This turns hit rate into expected wait, so the
// tiers can be compared at equal storage.
//
//     node predict_strategy.js
//
// Same user model as predict.html (Zipf catalogue, 3 favourites, 78% return rate)
// and the same policy.js the live lobby loads.

const POLICY = require('./site/policy.js');

const CATALOG_N = 24, USERS = 400, SESSIONS = 8, DAY = 864e5;
const SLICE_MB = 6.5, FULL_MB = 52;

// Measured on the real bundle at 25 Mbps — see the results table in README.md.
const T = {
  full:  {play: 0.11, visuals: 0.90},
  slice: {play: 0.08, visuals: 14.70},
  miss:  {play: 2.22, visuals: 16.90},
};

const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0;
  let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const popularity = Array.from({length: CATALOG_N}, (_, i) => 1 / Math.pow(i + 1, 1.1));
const games = Array.from({length: CATALOG_N}, (_, i) => ({id: i + 1, name: 'game' + (i + 1)}));

function weightedPick(r, w) {
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return w.length - 1;
}

// A strategy turns a ranking + a storage budget into {full:Set, slice:Set}.
const STRATEGIES = {
  'No prefetch': () => ({full: new Set(), slice: new Set()}),

  'Full bundles only': (ranked, mb) => ({
    full: new Set(ranked.slice(0, Math.floor(mb / FULL_MB)).map(r => r.id)),
    slice: new Set(),
  }),

  'Slices only': (ranked, mb, held) => ({
    full: new Set(),
    slice: new Set(POLICY.pick(ranked, mb, SLICE_MB, held).map(r => r.id)),
  }),

  // top pick gets the whole bundle, the rest of the budget spreads as slices
  'Tiered: 1 full + slices': (ranked, mb, held) => {
    if (mb < FULL_MB) return STRATEGIES['Slices only'](ranked, mb, held);
    const top = ranked[0].id;
    const rest = POLICY.pick(ranked.filter(r => r.id !== top), mb - FULL_MB, SLICE_MB, held);
    return {full: new Set([top]), slice: new Set(rest.map(r => r.id))};
  },
};

function simulate(budgetMB, seed) {
  const r = rng(seed);
  const names = Object.keys(STRATEGIES);
  const res = {};
  for (const n of names) res[n] = {taps: 0, play: 0, visuals: 0, mb: 0, fullHit: 0, sliceHit: 0};

  for (let u = 0; u < USERS; u++) {
    const favs = [];
    while (favs.length < 3) { const g = weightedPick(r, popularity) + 1; if (!favs.includes(g)) favs.push(g); }
    const favW = [0.55, 0.28, 0.17];

    const hist = {}, heldFull = {}, heldSlice = {};
    for (const n of names) { hist[n] = []; heldFull[n] = new Set(); heldSlice[n] = new Set(); }
    let now = Date.now() - SESSIONS * DAY;

    for (let s = 0; s < SESSIONS; s++) {
      now += DAY;
      const taps = [];
      const nTaps = 1 + (r() < 0.35 ? 1 : 0);
      for (let k = 0; k < nTaps; k++)
        taps.push(r() < 0.78 ? favs[weightedPick(r, favW)] : weightedPick(r, popularity) + 1);

      for (const n of names) {
        const held = [...heldFull[n], ...heldSlice[n]];
        const plan = STRATEGIES[n](POLICY.rank(games, hist[n], now), budgetMB, held);

        // only pay for what is not already on the device
        for (const id of plan.full)  if (!heldFull[n].has(id))  res[n].mb += FULL_MB;
        for (const id of plan.slice) if (!heldSlice[n].has(id) && !heldFull[n].has(id)) res[n].mb += SLICE_MB;
        heldFull[n] = plan.full; heldSlice[n] = plan.slice;

        for (const t of taps) {
          const tier = plan.full.has(t) ? 'full' : plan.slice.has(t) ? 'slice' : 'miss';
          res[n].taps++; res[n].play += T[tier].play; res[n].visuals += T[tier].visuals;
          if (tier === 'full') res[n].fullHit++; else if (tier === 'slice') res[n].sliceHit++;
        }
        for (const t of taps) hist[n].push({id: t, t: now});
      }
    }
  }
  return res;
}

const BUDGETS = [6.5, 13, 26, 52, 78, 104, 156];
const pad = (s, n) => String(s).padEnd(n);

console.log(`\n${USERS} simulated users x ${SESSIONS} sessions, ${CATALOG_N}-game catalogue.`);
console.log(`slice ${SLICE_MB} MB · full bundle ${FULL_MB} MB · timings measured at 25 Mbps\n`);

for (const mb of BUDGETS) {
  const res = simulate(mb, 12345 + mb);
  console.log(`── storage budget ${mb} MB ${'─'.repeat(46)}`);
  console.log(`   ${pad('strategy', 26)}${pad('play screen', 14)}${pad('all visuals', 14)}${pad('hit', 16)}downloaded`);
  let best = null;
  for (const n of Object.keys(STRATEGIES)) {
    const d = res[n];
    const play = d.play / d.taps, vis = d.visuals / d.taps;
    if (!best || play < best.play) best = {n, play};
    const hit = ((d.fullHit + d.sliceHit) / d.taps * 100).toFixed(0);
    const mix = d.fullHit ? `${hit}% (${(d.fullHit / d.taps * 100).toFixed(0)}% full)` : `${hit}%`;
    console.log(`   ${pad(n, 26)}${pad(play.toFixed(2) + ' s', 14)}${pad(vis.toFixed(1) + ' s', 14)}${pad(mix, 16)}${(d.mb / USERS).toFixed(0)} MB/user`);
  }
  console.log(`   → fastest to play screen: ${best.n}\n`);
}
