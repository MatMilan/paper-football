PF.history = {
  add(state, text, cls = "") {
    state.history.unshift({
      time: new Date().toLocaleTimeString("ru-RU", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }),
      text,
      cls
    });

    if (state.history.length > PF.CFG.historyLimit) {
      state.history.length = PF.CFG.historyLimit;
    }

    this.render(state);
  },

  clear(state) {
    state.history = [];
    this.render(state);
  },

  point(p) {
    return `(${p.x},${p.y})`;
  },

  path(path) {
    return path.map(p => this.point(p)).join(" → ");
  },

  logSimple(state) {
    const name = state.players[state.currentPlayer];
    this.add(
      state,
      `${name}: ${this.path(state.path)}`,
      state.currentPlayer === 1 ? "p1" : "p2"
    );
  },

  logPenalty(state, a, b) {
    const name = state.players[state.currentPlayer];
    this.add(
      state,
      `${name}: пенальти ${this.point(a)} → ${this.point(b)}`,
      state.currentPlayer === 1 ? "p1" : "p2"
    );
  },

  logGoal(state, scorer) {
    this.add(state, `Гол! ${state.players[scorer]} забивает.`, "goal");
  },

  logDraw(state, reason) {
    this.add(state, reason, "draw");
  },

  render(state) {
    const el = document.getElementById("historyList");
    if (!el) return;

    el.innerHTML = "";

    for (const item of state.history) {
      const li = document.createElement("li");
      li.className = item.cls || "";
      li.textContent = `${item.time} ${item.text}`;
      el.appendChild(li);
    }
  }
};