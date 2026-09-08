// One scoring policy, shared by the live lobby and the simulation,
// so the hit rate we advertise is produced by the code that actually runs.
const POLICY = {
  halfLifeMs: 3 * 24 * 60 * 60 * 1000,   // a game you played 3 days ago counts half
  priorWeight: 0.15,                      // how much catalogue position matters when we know nothing

  // recency-weighted play count + a small popularity prior for cold start
  score(gameId, history, now, prior) {
    let s = 0;
    for (const h of history) {
      if (h.id !== gameId) continue;
      s += Math.pow(0.5, (now - h.t) / this.halfLifeMs);
    }
    return s + (prior || 0) * this.priorWeight;
  },

  rank(games, history, now) {
    return games.map((g, i) => {
      const plays = history.filter(h => h.id === g.id);
      return {
        id: g.id,
        name: g.name,
        plays: plays.length,
        lastPlayed: plays.length ? Math.max(...plays.map(h => h.t)) : null,
        score: this.score(g.id, history, now, 1 / (i + 1)),
      };
    }).sort((a, b) => b.score - a.score);
  },

  stickiness: 1.4,   // a challenger must beat a cached game by 40% to be worth re-downloading

  // how many games fit in the storage budget.
  // `cached` gets a bonus: evicting something we already hold costs a fresh download later,
  // so we only churn when the newcomer is clearly better.
  pick(ranked, budgetMB, sliceMB, cached) {
    const slots = Math.max(0, Math.floor(budgetMB / sliceMB));
    if (!cached || !cached.length) return ranked.slice(0, slots);
    const held = new Set(cached);
    return ranked
      .map(r => ({...r, eff: r.score * (held.has(r.id) ? this.stickiness : 1)}))
      .sort((a, b) => b.eff - a.eff)
      .slice(0, slots);
  },

  reason(r, now) {
    if (!r.plays) return 'popular';
    const mins = Math.round((now - r.lastPlayed) / 60000);
    const ago = mins < 1 ? 'just now' : mins < 60 ? mins + 'm ago'
              : mins < 1440 ? Math.round(mins / 60) + 'h ago' : Math.round(mins / 1440) + 'd ago';
    return `played ${r.plays}× · ${ago}`;
  },
};
if (typeof module !== 'undefined') module.exports = POLICY;
