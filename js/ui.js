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
    if (PF.cloud) {
      PF.cloud.init();
      this.updateCloudStatus();
    }

    this.bindCloud();
  },

  cache() {
    this.els = {
      player1Pin: document.getElementById("player1Pin"),
      player2Pin: document.getElementById("player2Pin"),
      cloudStatus: document.getElementById("cloudStatus"),
      leadersBtn: document.getElementById("leadersBtn"),
      leadersModal: document.getElementById("leadersModal"),
      closeLeaders: document.getElementById("closeLeaders"),
      leadersTableWrap: document.getElementById("leadersTableWrap"),
      
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
      goalText: document.getElementById("goalText"),

      onlineBtn: document.getElementById("onlineBtn"),
      onlineScreen: document.getElementById("onlineScreen"),
      onlineMenu: document.getElementById("onlineMenu"),
      waitingRoom: document.getElementById("waitingRoom"),
      roomCodeDisplay: document.getElementById("roomCodeDisplay"),
      roomCodeInput: document.getElementById("roomCodeInput"),
      onlineError: document.getElementById("onlineError"),
      backToAuthBtn: document.getElementById("backToAuthBtn"),
      createRoomBtn: document.getElementById("createRoomBtn"),
      joinRoomBtn: document.getElementById("joinRoomBtn"),
      cancelRoomBtn: document.getElementById("cancelRoomBtn")
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
    this.els.authForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      let p1 = this.els.player1Name.value.trim();
      let p2 = this.els.player2Name.value.trim();

      const aiEnabled = this.els.aiToggle && this.els.aiToggle.checked;

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

      const pin1 = (this.els.player1Pin?.value || "").trim();
      const pin2 = (this.els.player2Pin?.value || "").trim();

      const cloud = { p1: null, p2: null };

      if (PF.cloud && PF.cloud.ready) {
        // 1. Профиль Игрока 1 создается всегда, если есть PIN
        if (pin1) {
          try {
            this.els.authError.textContent = "Проверка облачного профиля Игрока 1...";
            cloud.p1 = await PF.cloud.loginOrRegister(p1, pin1);
          } catch (err) {
            this.els.authError.textContent = err.message || "Ошибка профиля Игрока 1.";
            return;
          }
        }

        // 2. Профиль Игрока 2 нужен только если играем против человека
        if (!aiEnabled && pin2) {
          try {
            this.els.authError.textContent = "Проверка облачного профиля Игрока 2...";
            cloud.p2 = await PF.cloud.loginOrRegister(p2, pin2);

            if (cloud.p1 && cloud.p1.id === cloud.p2.id) {
              this.els.authError.textContent = "Облачные профили игроков должны быть разными.";
              return;
            }
          } catch (err) {
            this.els.authError.textContent = err.message || "Ошибка профиля Игрока 2.";
            return;
          }
        }
      } else if (pin1 || pin2) {
        this.els.authError.textContent =
          "Supabase не настроен. Либо вставь ключи в js/cloud.js, либо оставь поля PIN пустыми.";
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

      PF.game.startMatch(p1, p2, cloud);

      if (cloud.p1 || cloud.p2) {
        this.setMessage("Облачная статистика включена.");
      } else {
        this.setMessage("Локальный режим.");
      }
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
    // Онлайн-режим
    const onlineBtn = document.getElementById("onlineBtn");
    if (onlineBtn) {
      onlineBtn.addEventListener("click", () => {
        this.showOnlineScreen();
      });
    }

    const createRoomBtn = document.getElementById("createRoomBtn");
    if (createRoomBtn) {
      createRoomBtn.addEventListener("click", async () => {
        await this.createRoom();
      });
    }

    const joinRoomBtn = document.getElementById("joinRoomBtn");
    if (joinRoomBtn) {
      joinRoomBtn.addEventListener("click", async () => {
        await this.joinRoom();
      });
    }

    const cancelRoomBtn = document.getElementById("cancelRoomBtn");
    if (cancelRoomBtn) {
      cancelRoomBtn.addEventListener("click", () => {
        this.cancelRoom();
      });
    }

    const backToAuthBtn = document.getElementById("backToAuthBtn");
    if (backToAuthBtn) {
      backToAuthBtn.addEventListener("click", () => {
        this.showAuth();
      });
    }
  },
  
  updateCloudStatus() {
    if (!this.els.cloudStatus) return;

    this.els.cloudStatus.textContent =
      PF.cloud?.ready
        ? "Supabase подключен: можно использовать облачную статистику."
        : "Supabase не настроен: будет локальная статистика.";
  },

  bindCloud() {
    if (this.els.leadersBtn) {
      this.els.leadersBtn.addEventListener("click", () => {
        this.renderLeaders();

        if (this.els.leadersModal) {
          this.els.leadersModal.classList.remove("hidden");
        }
      });
    }

    if (this.els.closeLeaders) {
      this.els.closeLeaders.addEventListener("click", () => {
        if (this.els.leadersModal) {
          this.els.leadersModal.classList.add("hidden");
        }
      });
    }
  },

  async renderLeaders() {
    const wrap = this.els.leadersTableWrap;
    if (!wrap) return;

    if (!PF.cloud?.ready) {
      wrap.innerHTML = '<p class="muted">Supabase не настроен. Вставь ключи в js/cloud.js.</p>';
      return;
    }

    wrap.innerHTML = '<p class="muted">Загрузка...</p>';

    try {
      const rows = await PF.cloud.fetchLeaders();

      if (!rows.length) {
        wrap.innerHTML = '<p class="muted">Пока нет облачных профилей.</p>';
        return;
      }

      const body = rows
        .map((row) => {
          return `
            <tr>
              <td>${this.escape(row.display_name)}</td>
              <td>${row.rating}</td>
              <td>${row.games}</td>
              <td>${row.wins}</td>
              <td>${row.draws}</td>
              <td>${row.losses}</td>
              <td>${row.goals_for}:${row.goals_against}</td>
            </tr>
          `;
        })
        .join("");

      wrap.innerHTML = `
        <table class="leaders-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Рейтинг</th>
              <th>И</th>
              <th>В</th>
              <th>Н</th>
              <th>П</th>
              <th>Голы</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      `;
    } catch (e) {
      wrap.innerHTML = `<p class="error">Ошибка загрузки лидеров: ${this.escape(e.message)}</p>`;
    }
  },
  showOnlineScreen() {
    this.els.authScreen.classList.add("hidden");
    this.els.onlineScreen.classList.remove("hidden");
    this.els.onlineMenu.classList.remove("hidden");
    this.els.waitingRoom.classList.add("hidden");
    this.els.onlineError.textContent = "";
  },

  async createRoom() {
    const profile = PF.cloud.currentProfile;
    if (!profile) {
      this.els.onlineError.textContent = "Нужно войти в облачный профиль.";
      return;
    }

    try {
      this.els.onlineError.textContent = "Создание комнаты...";
      const room = await PF.online.createRoom(profile.name);
    
      this.els.onlineMenu.classList.add("hidden");
      this.els.waitingRoom.classList.remove("hidden");
      this.els.roomCodeDisplay.textContent = room.room_code;
    } catch (e) {
      this.els.onlineError.textContent = e.message;
    }
  },

  async joinRoom() {
    const profile = PF.cloud.currentProfile;
    if (!profile) {
      this.els.onlineError.textContent = "Нужно войти в облачный профиль.";
      return;
    }

    const code = this.els.roomCodeInput.value.trim().toUpperCase();
    if (!code) {
      this.els.onlineError.textContent = "Введите код комнаты.";
      return;
    }

    try {
      this.els.onlineError.textContent = "Подключение...";
      const room = await PF.online.joinRoom(code, profile.name);
    
      this.els.onlineScreen.classList.add("hidden");
      this.els.app.classList.remove("hidden");
    
      PF.game.startOnlineMatch(room);
    } catch (e) {
      this.els.onlineError.textContent = e.message;
    }
  },

  cancelRoom() {
    PF.online.leaveRoom();
    this.els.onlineMenu.classList.remove("hidden");
    this.els.waitingRoom.classList.add("hidden");
    this.els.onlineError.textContent = "";
  }
};
