PF.stats = {
  key: "pf_stats_v1",

  all() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || "{}");
    } catch {
      return {};
    }
  },

  save(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  },

  ensure(data, name) {
    if (!data[name]) {
      data[name] = {
        name,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        updatedAt: ""
      };
    }

    return data[name];
  },

  ensureByName(name) {
    const data = this.all();
    this.ensure(data, name);
    this.save(data);
  },

  finishGame({
    p1,
    p2,
    winnerName = null,
    draw = false,
    scorerName = null,
    concededName = null
  }) {
    const data = this.all();

    const s1 = this.ensure(data, p1);
    const s2 = this.ensure(data, p2);

    s1.games += 1;
    s2.games += 1;

    if (draw) {
      s1.draws += 1;
      s2.draws += 1;
    } else if (winnerName) {
      if (winnerName === p1) {
        s1.wins += 1;
        s2.losses += 1;
      } else {
        s2.wins += 1;
        s1.losses += 1;
      }
    }

    if (scorerName && data[scorerName]) {
      data[scorerName].goalsFor += 1;

      if (concededName && data[concededName]) {
        data[concededName].goalsAgainst += 1;
      }
    }

    const now = new Date().toISOString();
    s1.updatedAt = now;
    s2.updatedAt = now;

    this.save(data);
  },

  table() {
    return Object.values(this.all()).sort((a, b) => {
      return (
        b.wins - a.wins ||
        b.games - a.games ||
        a.name.localeCompare(b.name, "ru")
      );
    });
  }
};