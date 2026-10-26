/*
  Модуль сохранения партий и повтора.
  Работает локально через localStorage.
*/

PF.save = {
  key: "pf_saved_matches_v1",
  limit: 30,

  all() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || "[]");
    } catch {
      return [];
    }
  },

  saveAll(list) {
    localStorage.setItem(this.key, JSON.stringify(list));
  },

  buildCurrent() {
    const s = PF.game.state;
    if (!s) return null;

    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      players: s.players,
      result: s.result || {
        type: "incomplete",
        text: "Партия не завершена"
      },
      events: s.events,
      over: !!s.over
    };
  },

  saveCurrent(manual = false, silent = false) {
    const s = PF.game.state;
    if (!s) return;

    // Автосохранение завершенной партии делаем один раз.
    if (!manual && s.saved) return;

    const data = this.buildCurrent();
    if (!data) return;

    const all = this.all();
    all.unshift(data);

    if (all.length > this.limit) {
      all.length = this.limit;
    }

    this.saveAll(all);

    // Если вручную сохранили уже завершенную партию,
    // помечаем, чтобы авто-сохранение не дублировало.
    if (s.over) {
      s.saved = true;
    }

    if (!silent) {
      PF.ui.setMessage(manual ? "Партия сохранена." : "Партия автоматически сохранена.");
    }
  },

  autoSaveCurrent() {
    const s = PF.game.state;
    if (!s) return;
    if (!s.over) return;
    if (s.saved) return;

    this.saveCurrent(false, true);
  },

  delete(id) {
    let all = this.all();
    all = all.filter((m) => m.id !== id);
    this.saveAll(all);
    this.renderList();
  },

  get(id) {
    return this.all().find((m) => m.id === id) || null;
  },

  /*
    Запись событий для повтора.
  */

  logStart(state) {
    if (!state.events) return;

    state.events.push({
      type: "start",
      players: state.players,
      currentPlayer: state.currentPlayer,
      ball: PF.geo.clone(PF.CFG.START)
    });
  },

  logSimple(state, goal = false, scorer = null) {
    if (!state.events) return;

    state.events.push({
      type: goal ? "simple-goal" : "simple",
      player: state.currentPlayer,
      path: state.path.map((p) => PF.geo.clone(p)),
      scorer
    });
  },

  logPenalty(state, a, b, visual, goal = false, scorer = null) {
    if (!state.events) return;

    state.events.push({
      type: goal ? "penalty-goal" : "penalty",
      player: state.currentPlayer,
      a: PF.geo.clone(a),
      b: PF.geo.clone(b),
      visual: PF.geo.clone(visual),
      scorer
    });
  },

  logDraw(state, reason) {
    if (!state.events) return;

    state.events.push({
      type: "draw",
      reason
    });
  },

  /*
    Список сохраненных партий.
  */

  renderList() {
    const wrap = document.getElementById("replaysList");
    if (!wrap) return;

    const all = this.all();

    if (!all.length) {
      wrap.innerHTML = '<p class="muted">Нет сохраненных партий.</p>';
      return;
    }

    wrap.innerHTML = "";

    all.forEach((match) => {
      const item = document.createElement("div");
      item.className = "saved-item";

      const p1 = match.players?.[1] || "Игрок 1";
      const p2 = match.players?.[2] || "Игрок 2";

      const date = new Date(match.createdAt).toLocaleString("ru-RU", {
        dateStyle: "short",
        timeStyle: "medium"
      });

      const resultText = match.result?.text || "Без результата";

      const meta = document.createElement("div");
      meta.className = "meta";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `${p1} — ${p2}`;

      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `${date} • ${resultText}`;

      meta.appendChild(title);
      meta.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "actions";

      const watchBtn = document.createElement("button");
      watchBtn.textContent = "Смотреть";

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Удалить";

      watchBtn.addEventListener("click", () => {
        PF.replay.start(match);
      });

      deleteBtn.addEventListener("click", () => {
        this.delete(match.id);
      });

      actions.appendChild(watchBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(meta);
      item.appendChild(actions);

      wrap.appendChild(item);
    });
  }
};

PF.replay = {
  active: false,
  playing: false,
  frames: [],
  index: 0,
  timer: null,
  match: null,

  els: {},

  init() {
    this.els = {
      bar: document.getElementById("replayBar"),
      exit: document.getElementById("replayExit"),
      first: document.getElementById("replayFirst"),
      prev: document.getElementById("replayPrev"),
      playPause: document.getElementById("replayPlayPause"),
      next: document.getElementById("replayNext"),
      last: document.getElementById("replayLast"),
      slider: document.getElementById("replaySlider"),
      info: document.getElementById("replayInfo"),

      saveMatchBtn: document.getElementById("saveMatchBtn"),
      replaysBtn: document.getElementById("replaysBtn"),
      replaysModal: document.getElementById("replaysModal"),
      closeReplays: document.getElementById("closeReplays")
    };

    if (this.els.saveMatchBtn) {
      this.els.saveMatchBtn.addEventListener("click", () => {
        PF.save.saveCurrent(true, false);
      });
    }

    if (this.els.replaysBtn) {
      this.els.replaysBtn.addEventListener("click", () => {
        PF.save.renderList();
        if (this.els.replaysModal) {
          this.els.replaysModal.classList.remove("hidden");
        }
      });
    }

    if (this.els.closeReplays) {
      this.els.closeReplays.addEventListener("click", () => {
        if (this.els.replaysModal) {
          this.els.replaysModal.classList.add("hidden");
        }
      });
    }

    if (this.els.exit) {
      this.els.exit.addEventListener("click", () => {
        this.exit();
      });
    }

    if (this.els.first) {
      this.els.first.addEventListener("click", () => {
        this.first();
      });
    }

    if (this.els.prev) {
      this.els.prev.addEventListener("click", () => {
        this.prev();
      });
    }

    if (this.els.playPause) {
      this.els.playPause.addEventListener("click", () => {
        this.toggle();
      });
    }

    if (this.els.next) {
      this.els.next.addEventListener("click", () => {
        this.next();
      });
    }

    if (this.els.last) {
      this.els.last.addEventListener("click", () => {
        this.last();
      });
    }

    if (this.els.slider) {
      this.els.slider.addEventListener("input", () => {
        const value = Number(this.els.slider.value || 0);
        this.setIndex(value);
      });
    }
  },

  canWatch() {
    const s = PF.game.state;

    // Разрешаем смотреть повтор, если партии нет или она уже завершена.
    return !s || s.over;
  },

  start(match) {
    if (!this.canWatch()) {
      PF.ui.setMessage("Сначала завершите текущую партию, потом смотрите повтор.");
      return;
    }

    this.stop();

    this.match = match;
    this.frames = this.buildFrames(match);
    this.index = 0;
    this.active = true;
    this.playing = false;

    if (this.els.replaysModal) {
      this.els.replaysModal.classList.add("hidden");
    }

    if (this.els.bar) {
      this.els.bar.classList.remove("hidden");
    }

    const app = document.getElementById("app");
    if (app) {
      app.classList.add("replay-active");
    }

    this.updateSlider();
    this.updatePlayBtn();
    this.draw();
  },

  exit() {
    this.stop();

    this.active = false;
    this.frames = [];
    this.index = 0;
    this.match = null;

    if (this.els.bar) {
      this.els.bar.classList.add("hidden");
    }

    const app = document.getElementById("app");
    if (app) {
      app.classList.remove("replay-active");
    }

    if (PF.game.state) {
      PF.render.draw(PF.game.state);
    }
  },

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    this.updatePlayBtn();
  },

  buildFrames(match) {
    const frames = [];
    const segments = [];

    let ball = PF.geo.clone(PF.CFG.START);
    let player = match.events?.[0]?.currentPlayer || 1;

    frames.push({
      segments: [],
      ball: PF.geo.clone(ball),
      message: "Начало партии",
      player
    });

    const events = Array.isArray(match.events) ? match.events : [];

    for (const ev of events) {
      if (ev.type === "start") {
        player = ev.currentPlayer || 1;
        ball = PF.geo.clone(ev.ball || PF.CFG.START);

        frames[0] = {
          segments: [],
          ball: PF.geo.clone(ball),
          message: "Начало партии",
          player
        };

        continue;
      }

      if (ev.type === "simple" || ev.type === "simple-goal") {
        player = ev.player;

        const path = Array.isArray(ev.path) ? ev.path : [];

        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i];
          const b = path[i + 1];

          segments.push({
            a: PF.geo.clone(a),
            b: PF.geo.clone(b),
            player: ev.player,
            penalty: false
          });

          ball = PF.geo.clone(b);

          const isLastSegment = i === path.length - 2;

          let message = `Игрок ${match.players?.[ev.player] || ev.player}`;

          if (ev.type === "simple-goal" && isLastSegment) {
            message = `Гол! Забивает Игрок ${match.players?.[ev.scorer] || ev.scorer}`;
          }

          frames.push({
            segments: segments.slice(),
            ball: PF.geo.clone(ball),
            message,
            player: ev.player
          });
        }

        continue;
      }

      if (ev.type === "penalty" || ev.type === "penalty-goal") {
        player = ev.player;

        const visual = ev.visual || ev.b;

        segments.push({
          a: PF.geo.clone(ev.a),
          b: PF.geo.clone(visual),
          player: ev.player,
          penalty: true
        });

        ball = PF.geo.clone(visual);

        const message =
          ev.type === "penalty-goal"
            ? `Гол с пенальти! Забивает Игрок ${match.players?.[ev.scorer] || ev.scorer}`
            : `Пенальти: Игрок ${match.players?.[ev.player] || ev.player}`;

        frames.push({
          segments: segments.slice(),
          ball: PF.geo.clone(ball),
          message,
          player: ev.player
        });

        continue;
      }

      if (ev.type === "draw") {
        frames.push({
          segments: segments.slice(),
          ball: PF.geo.clone(ball),
          message: ev.reason || "Ничья",
          player
        });

        continue;
      }
    }

    return frames;
  },

  draw() {
    if (!this.frames.length) return;

    const frame = this.frames[this.index];

    const fakeState = {
      players: this.match?.players || { 1: "Игрок 1", 2: "Игрок 2" },
      phase: "replay",
      over: true,
      animating: true,
      segments: frame.segments || [],
      displayBall: PF.geo.clone(frame.ball),
      visited: new Set(),
      currentPlayer: frame.player || 1,
      trail: []
    };

    PF.render.draw(fakeState);

    if (this.els.info) {
      this.els.info.textContent = `${this.index + 1}/${this.frames.length} • ${frame.message || ""}`;
    }
  },

  updateSlider() {
    if (!this.els.slider) return;

    const max = Math.max(0, this.frames.length - 1);

    this.els.slider.min = "0";
    this.els.slider.max = String(max);
    this.els.slider.value = String(this.index);
  },

  updatePlayBtn() {
    if (!this.els.playPause) return;

    this.els.playPause.textContent = this.playing ? "⏸" : "▶";
  },

  setIndex(i) {
    if (!this.frames.length) return;

    this.index = Math.max(0, Math.min(i, this.frames.length - 1));

    this.updateSlider();
    this.draw();

    if (this.playing && this.index >= this.frames.length - 1) {
      this.stop();
    }
  },

  first() {
    this.setIndex(0);
  },

  prev() {
    this.setIndex(this.index - 1);
  },

  next() {
    this.setIndex(this.index + 1);
  },

  last() {
    this.setIndex(this.frames.length - 1);
  },

  play() {
    if (!this.frames.length) return;

    if (this.index >= this.frames.length - 1) {
      this.setIndex(0);
    }

    this.playing = true;
    this.updatePlayBtn();

    clearInterval(this.timer);

    this.timer = setInterval(() => {
      if (!this.active) {
        this.stop();
        return;
      }

      if (this.index >= this.frames.length - 1) {
        this.stop();
      } else {
        this.setIndex(this.index + 1);
      }
    }, 850);
  },

  toggle() {
    if (this.playing) {
      this.stop();
    } else {
      this.play();
    }
  }
};
