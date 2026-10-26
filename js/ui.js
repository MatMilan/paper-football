PF.ui = {
  els: {},
  TIMER_CIRC: 2 * Math.PI * 20,
  goalTimer: null,

  init() {
    this.cache();
    this.bindAuth();
    this.bindControls();
    this.populateAuth();
    this.updateSoundBtn();
  },

  cache() {
    this.els = {
      authScreen: document.getElementById("authScreen"),
      authForm: document.getElementById("authForm"),
      player1Name: document.getElementById("player1Name"),
      player2Name: document.getElementById("player2Name"),
      profilesList: document.getElementById("profilesList"),
      authError: document.getElementById("authError"),
      showStatsFromAuth: document.getElementById("showStatsFromAuth"),
      aiToggle: document.getElementById("aiToggle"),

      app: document.getElementById("app"),

      player1Chip: document.getElementById("player1Chip"),
      player2Chip: document.getElementById("player2Chip"),
      phaseBadge: document.getElementById("phaseBadge"),

      timerWrap: document.getElementById("timerWrap"),
      timerRing: document.getElementById("timerRing"),
      timerText: document.getElementById("timerText"),

      cannotMoveBtn: document.getElementById("cannotMoveBtn"),
      offerDrawBtn: document.getElementById("offerDrawBtn"),
      soundBtn: document.getElementById("soundBtn"),
      historyToggleBtn: document.getElementById("historyToggleBtn"),
      statsBtn: document.getElementById("statsBtn"),
      newMatchBtn: document.getElementById("newMatchBtn"),
      logoutBtn: document.getElementById("logoutBtn"),

      message: document.getElementById("message"),

      historyPanel: document.getElementById("historyPanel"),
      historyList: document.getElementById("historyList"),

      statsModal: document.getElementById("statsModal"),
      statsTableWrap: document.getElementById("statsTableWrap"),
      closeStats: document.getElementById("closeStats"),

      goalOverlay: document.getElementById("goalOverlay"),
      goalText: document.getElementById("goalText")
    };
  },

  escape(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  },

  populateAuth() {
    const profiles = PF.auth.getProfiles();
    const last = PF.auth.getLast();

    this.els.profilesList.innerHTML = "";

    for (const name of profiles) {
      const option = document.createElement("option");
      option.value = name;
      this.els.profilesList.appendChild(option);
    }

    this.els.player1Name.value = last.p1 || "";
    this.els.player2Name.value = last.p2 || "";
    this.els.authError.textContent = "";
  },

  showAuth() {
    this.els.authScreen.classList.remove("hidden");
    this.els.app.classList.add("hidden");
    this.populateAuth();
  },

  showGame() {
    this.els.authScreen.classList.add("hidden");
    this.els.app.classList.remove("hidden");
  },

  setMessage(text) {
    this.els.message.textContent = text;
  },

  updateHUD(state) {
    if (!state) return;

    this.els.player1Chip.textContent = state.players[1];
    this.els.player2Chip.textContent = state.players[2];

    this.els.player1Chip.classList.toggle(
      "active",
      state.currentPlayer === 1 && !state.over
    );

    this.els.player2Chip.classList.toggle(
      "active",
      state.currentPlayer === 2 && !state.over
    );

    this.els.phaseBadge.textContent = state.over
      ? "партия завершена"
      : state.phase === "simple"
        ? "простой ход"
        : "пенальти";

    this.els.offerDrawBtn.disabled = state.over || state.animating;
    this.els.cannotMoveBtn.disabled = state.over || state.animating;
  },

  updateTimer(state) {
    if (!state) return;

    const t = Math.max(0, state.timeLeft);

    this.els.timerText.textContent = String(t);

    const ratio = t / PF.CFG.turnSeconds;
    const offset = this.TIMER_CIRC * (1 - ratio);

    this.els.timerRing.style.strokeDashoffset = offset;
    this.els.timerWrap.classList.toggle("danger", t <= 5);
  },

  updateSoundBtn() {
    this.els.soundBtn.textContent = PF.audio.enabled
      ? "Звук: вкл"
      : "Звук: выкл";
  },

  showGoalOverlay(name) {
    this.els.goalText.textContent = `Гол! ${name}`;
    this.els.goalOverlay.classList.remove("hidden");

    clearTimeout(this.goalTimer);
    this.goalTimer = setTimeout(() => {
      this.els.goalOverlay.classList.add("hidden");
    }, 1800);
  },

  renderStats() {
    const rows = PF.stats.table();

    if (!rows.length) {
      this.els.statsTableWrap.innerHTML =
        '<p class="muted">Пока нет статистики. Сыграйте первый матч.</p>';
      return;
    }

    const body = rows
      .map((row) => {
        return `
          <tr>
            <td>${this.escape(row.name)}</td>
            <td>${row.games}</td>
            <td>${row.wins}</td>
            <td>${row.draws}</td>
            <td>${row.losses}</td>
            <td>${row.goalsFor}:${row.goalsAgainst}</td>
          </tr>
        `;
      })
      .join("");

    this.els.statsTableWrap.innerHTML = `
      <table class="stats-table">
        <thead>
          <tr>
            <th>Игрок</th>
            <th>И</th>
            <th>В</th>
            <th>Н</th>
            <th>П</th>
            <th>Голы</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  },

  bindAuth() {
    this.els.authForm.addEventListener("submit", (e) => {
      e.preventDefault();

      let p1 = this.els.player1Name.value.trim();
      let p2 = this.els.player2Name.value.trim();
      const aiEnabled = this.els.aiToggle.checked;

      if (aiEnabled && !p2) {
        p2 = "Компьютер";
      }

      if (!p1 || !p2) {
        this.els.authError.textContent = "Введите имена обоих игроков.";
        return;
      }

      p1 = PF.auth.findExistingProfile(p1);
      p2 = PF.auth.findExistingProfile(p2);

      if (p1.toLowerCase() === p2.toLowerCase()) {
        this.els.authError.textContent = "Имена игроков должны отличаться.";
        return;
      }

      this.els.authError.textContent = "";

      PF.auth.addProfile(p1);
      PF.auth.addProfile(p2);
      PF.auth.setLast(p1, p2);

      PF.stats.ensureByName(p1);
      PF.stats.ensureByName(p2);

      this.populateAuth();
      this.showGame();
      if (PF.ai) {
        PF.ai.enabled = aiEnabled;
        PF.ai.player = 2;
        PF.ai.stop();
      }

      PF.game.startMatch(p1, p2);
    });

    this.els.showStatsFromAuth.addEventListener("click", () => {
      this.renderStats();
      this.els.statsModal.classList.remove("hidden");
    });
  },

  bindControls() {
    this.els.cannotMoveBtn.addEventListener("click", () => {
      const state = PF.game.state;

      if (!state || state.over || state.animating) return;

      if (PF.render.currentTargets.length === 0) {
        PF.game.resolveNoMove();
      } else {
        PF.audio.invalid();
        this.setMessage("Есть доступный ход.");
      }
    });

    this.els.offerDrawBtn.addEventListener("click", () => {
      PF.game.offerDraw();
    });

    this.els.soundBtn.addEventListener("click", () => {
      PF.audio.enabled = !PF.audio.enabled;
      PF.audio.save();
      this.updateSoundBtn();
      if (PF.audio.enabled) PF.audio.click();
    });

    this.els.historyToggleBtn.addEventListener("click", () => {
      this.els.historyPanel.classList.toggle("hidden");
    });

    this.els.statsBtn.addEventListener("click", () => {
      this.renderStats();
      this.els.statsModal.classList.remove("hidden");
    });

    this.els.closeStats.addEventListener("click", () => {
      this.els.statsModal.classList.add("hidden");
    });

    this.els.newMatchBtn.addEventListener("click", () => {
      PF.game.newMatch();
    });

    this.els.logoutBtn.addEventListener("click", () => {
      PF.game.logout();
    });
  }
};
