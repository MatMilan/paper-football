  PF.ui = {
  els: {},
  TIMER_CIRC: 2 * Math.PI * 20,
  goalTimer: null,
  isGuest: false,
  currentMode: null, // 'pvp', 'pvc', 'online'

  init() {
    this.cache();
    this.bindAuth();
    this.bindMenu();
    this.bindPvPSetup();
    this.bindPvCSetup();
    this.bindOnline();
    this.bindGameControls();
    this.updateSoundBtn();
    this.checkAuthOnLoad();
  },
  
  cache() {
    this.els = {
      turnTimeSelect: document.getElementById("turnTimeSelect"),
      fieldSizeSelect: document.getElementById("fieldSizeSelect"),

      pvpTurnTimeSelect: document.getElementById("pvpTurnTimeSelect"),
      pvpFieldSizeSelect: document.getElementById("pvpFieldSizeSelect"),

      pvcSetupScreen: document.getElementById("pvcSetupScreen"),
      pvcSetupForm: document.getElementById("pvcSetupForm"),
      pvcTurnTimeSelect: document.getElementById("pvcTurnTimeSelect"),
      pvcFieldSizeSelect: document.getElementById("pvcFieldSizeSelect"),
      pvcBackBtn: document.getElementById("pvcBackBtn"),
      // Экран авторизации
      authScreen: document.getElementById("authScreen"),
      googleAuthBtn: document.getElementById("googleAuthBtn"),
      emailAuthForm: document.getElementById("emailAuthForm"),
      emailInput: document.getElementById("emailInput"),
      passwordInput: document.getElementById("passwordInput"),
      emailLoginBtn: document.getElementById("emailLoginBtn"),
      emailSignupBtn: document.getElementById("emailSignupBtn"),
      guestBtn: document.getElementById("guestBtn"),
      authError: document.getElementById("authError"),

      // Главное меню
      menuScreen: document.getElementById("menuScreen"),
      userInfo: document.getElementById("userInfo"),
      menuPvPBtn: document.getElementById("menuPvPBtn"),
      menuPvCBtn: document.getElementById("menuPvCBtn"),
      menuOnlineBtn: document.getElementById("menuOnlineBtn"),
      menuContinueBtn: document.getElementById("menuContinueBtn"),
      menuStatsBtn: document.getElementById("menuStatsBtn"),
      menuLogoutBtn: document.getElementById("menuLogoutBtn"),

      // Настройка PvP
      pvpSetupScreen: document.getElementById("pvpSetupScreen"),
      pvpSetupForm: document.getElementById("pvpSetupForm"),
      pvpPlayer1Name: document.getElementById("pvpPlayer1Name"),
      pvpPlayer2Name: document.getElementById("pvpPlayer2Name"),
      pvpBackBtn: document.getElementById("pvpBackBtn"),
      pvpError: document.getElementById("pvpError"),

      // Онлайн экран
      onlineScreen: document.getElementById("onlineScreen"),
      onlineTabs: document.getElementById("onlineTabs"),
      roomsTab: document.getElementById("roomsTab"),
      createTab: document.getElementById("createTab"),
      joinTab: document.getElementById("joinTab"),
      roomsList: document.getElementById("roomsList"),
      createRoomForm: document.getElementById("createRoomForm"),
      roomCodeInput: document.getElementById("roomCodeInput"),
      isPrivateRoom: document.getElementById("isPrivateRoom"),
      createError: document.getElementById("createError"),
      joinRoomForm: document.getElementById("joinRoomForm"),
      joinCodeInput: document.getElementById("joinCodeInput"),
      joinError: document.getElementById("joinError"),
      waitingRoom: document.getElementById("waitingRoom"),
      waitingRoomCode: document.getElementById("waitingRoomCode"),
      cancelRoomBtn: document.getElementById("cancelRoomBtn"),
      onlineBackBtn: document.getElementById("onlineBackBtn"),

      // Игровой экран
      app: document.getElementById("app"),
      player1Chip: document.getElementById("player1Chip"),
      player2Chip: document.getElementById("player2Chip"),
      phaseBadge: document.getElementById("phaseBadge"),
      timerWrap: document.getElementById("timerWrap"),
      timerRing: document.getElementById("timerRing"),
      timerText: document.getElementById("timerText"),
      message: document.getElementById("message"),

      // Кнопки игры
      soundBtn: document.getElementById("soundBtn"),
      historyToggleBtn: document.getElementById("historyToggleBtn"),
      saveMatchBtn: document.getElementById("saveMatchBtn"),
      replaysBtn: document.getElementById("replaysBtn"),
      backToMenuBtn: document.getElementById("backToMenuBtn"),

      // История
      historyPanel: document.getElementById("historyPanel"),
      historyList: document.getElementById("historyList"),

      // Повтор
      replayBar: document.getElementById("replayBar"),
      replayExit: document.getElementById("replayExit"),
      replayFirst: document.getElementById("replayFirst"),
      replayPrev: document.getElementById("replayPrev"),
      replayPlayPause: document.getElementById("replayPlayPause"),
      replayNext: document.getElementById("replayNext"),
      replayLast: document.getElementById("replayLast"),
      replaySlider: document.getElementById("replaySlider"),
      replayInfo: document.getElementById("replayInfo"),

      // Модалки
      statsModal: document.getElementById("statsModal"),
      statsTableWrap: document.getElementById("statsTableWrap"),
      closeStats: document.getElementById("closeStats"),

      replaysModal: document.getElementById("replaysModal"),
      replaysList: document.getElementById("replaysList"),
      closeReplays: document.getElementById("closeReplays"),

      // Оверлей гола
      goalOverlay: document.getElementById("goalOverlay"),
      goalText: document.getElementById("goalText")
    };
  },
  showResultOverlay(text, type = "goal") {
    if (!this.els.goalOverlay || !this.els.goalText) return;

    const textEl = this.els.goalText;

    textEl.textContent = text;
    textEl.className = `result-text ${type}`;

    this.els.goalOverlay.classList.remove("hidden");

    // Перезапуск анимации
    textEl.style.animation = "none";
    void textEl.offsetWidth;
    textEl.style.animation = "";

    clearTimeout(this.goalTimer);

    this.goalTimer = setTimeout(() => {
      this.els.goalOverlay.classList.add("hidden");
    }, 2200);
  },
  /* ==================== ЭКРАНЫ ==================== */

  showScreen(screenId) {
    const screens = ["authScreen", "menuScreen", "pvpSetupScreen", "pvcSetupScreen", "onlineScreen", "app"];
    screens.forEach(id => {
      const el = this.els[id];
      if (el) {
        if (id === screenId) {
          el.classList.remove("hidden");
        } else {
          el.classList.add("hidden");
        }
      }
    });
  },
  showGame() {
    this.showScreen("app");
  },
  /* ==================== АВТОРИЗАЦИЯ ==================== */

  async checkAuthOnLoad() {
    if (!PF.cloud || !PF.cloud.ready) {
      this.showScreen("authScreen");
      return;
    }

    try {
      const session = await PF.cloud.getCurrentSession();

      if (session?.user) {
        await PF.cloud.getOrCreateProfile();

        const restored = await this.tryRestoreOnline();

        if (!restored) {
          this.showMenu();
        }
      } else {
        this.showScreen("authScreen");
      }
    } catch (e) {
      console.error("Auth check error:", e);
      this.showScreen("authScreen");
    }
  },

  bindAuth() {
    // Google OAuth
    this.els.googleAuthBtn.addEventListener("click", async () => {
      try {
        this.els.authError.textContent = "Перенаправление на Google...";
        await PF.cloud.signInWithGoogle();
      } catch (e) {
        this.els.authError.textContent = "Ошибка входа через Google: " + e.message;
      }
    });

    // Email вход
    this.els.emailAuthForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.loginWithEmail();
    });

    this.els.emailLoginBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.loginWithEmail();
    });

    this.els.emailSignupBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.signupWithEmail();
    });

    // Гость
    this.els.guestBtn.addEventListener("click", () => {
      this.isGuest = true;
      PF.cloud.currentProfile = null;
      this.showMenu();
    });
  },

  async loginWithEmail() {
    const email = this.els.emailInput.value.trim();
    const password = this.els.passwordInput.value;

    if (!email || !password) {
      this.els.authError.textContent = "Введите email и пароль.";
      return;
    }

    try {
      this.els.authError.textContent = "Вход...";
      await PF.cloud.signInWithEmail(email, password);
      await PF.cloud.getOrCreateProfile();
      this.showMenu();
    } catch (e) {
      this.els.authError.textContent = "Ошибка входа: " + e.message;
    }
  },

  async signupWithEmail() {
    const email = this.els.emailInput.value.trim();
    const password = this.els.passwordInput.value;

    if (!email || !password) {
      this.els.authError.textContent = "Введите email и пароль.";
      return;
    }

    if (password.length < 6) {
      this.els.authError.textContent = "Пароль должен быть минимум 6 символов.";
      return;
    }

    const displayName = email.split("@")[0];

    try {
      this.els.authError.textContent = "Регистрация...";
      const result = await PF.cloud.signUpWithEmail(email, password, displayName);
    
      if (result.user && !result.session) {
        this.els.authError.textContent = "Письмо отправлено! Проверьте почту (отправитель: Supabase Auth) и подтвердите регистрацию, затем войдите.";
      } else {
        await PF.cloud.getOrCreateProfile();
        this.showMenu();
      }
    } catch (e) {
      this.els.authError.textContent = "Ошибка регистрации: " + e.message;
    }
  },

  /* ==================== ГЛАВНОЕ МЕНЮ ==================== */

  showMenu() {
    this.showScreen("menuScreen");
    this.updateUserInfo();
    this.updateContinueButton();
  },

  updateUserInfo() {
    if (this.isGuest) {
      this.els.userInfo.innerHTML = `
        <span class="user-badge guest">Гость</span>
        <span class="user-note">Без рейтинга и онлайна</span>
      `;
      this.els.menuOnlineBtn.disabled = true;
      this.els.menuOnlineBtn.title = "Онлайн доступен только для авторизованных пользователей";
    } else if (PF.cloud.currentProfile) {
      const p = PF.cloud.currentProfile;
      this.els.userInfo.innerHTML = `
        <span class="user-badge">${this.escape(p.display_name)}</span>
        <span class="user-note">Рейтинг: ${p.rating}</span>
      `;
      this.els.menuOnlineBtn.disabled = false;
      this.els.menuOnlineBtn.title = "";
    }
  },

  bindMenu() {
    this.els.menuContinueBtn.addEventListener("click", () => {
      this.showScreen("app");

      if (PF.game.state) {
        PF.game.setPaused(false);
        PF.ui.updateHUD(PF.game.state);
        PF.render.draw(PF.game.state);
      }

      if (PF.online && PF.online.room) {
        PF.online.refreshRoom();
      }
    });

    this.els.menuPvPBtn.addEventListener("click", () => {
      if (!this.confirmAndClearActiveGame("Начать игру против друга? Текущий матч будет потерян.")) {
        return;
      }

      if (!this.isGuest && PF.cloud.currentProfile && PF.cloud.currentProfile.display_name) {
        this.els.pvpPlayer1Name.value = PF.cloud.currentProfile.display_name;
      } else {
        this.els.pvpPlayer1Name.value = "";
      }

      this.els.pvpPlayer2Name.value = "";
      this.els.pvpError.textContent = "";

      this.showScreen("pvpSetupScreen");
      this.currentMode = "pvp";
    });

    this.els.menuPvCBtn.addEventListener("click", () => {
      if (!this.confirmAndClearActiveGame("Начать игру против компьютера? Текущий матч будет потерян.")) {
        return;
      }

      this.showScreen("pvcSetupScreen");
      this.currentMode = "pvc";
    });

    this.els.menuOnlineBtn.addEventListener("click", () => {
      if (this.isGuest) {
        alert("Онлайн-игра доступна только для авторизованных пользователей.");
        return;
      }

      if (!this.confirmAndClearActiveGame("Перейти к онлайн-игре? Текущий матч будет потерян.")) {
        return;
      }

      this.showOnlineScreen();
    });

    this.els.menuStatsBtn.addEventListener("click", () => {
      this.showStats();
    });

    this.els.menuLogoutBtn.addEventListener("click", async () => {
      if (!this.confirmAndClearActiveGame("Выйти из аккаунта? Текущий матч будет потерян.")) {
        return;
      }

      if (!this.isGuest && PF.cloud.ready) {
        await PF.cloud.signOut();
      }

      this.isGuest = false;
      PF.cloud.currentProfile = null;
      this.showScreen("authScreen");
    });
  },

  /* ==================== НАСТРОЙКА PvP ==================== */

  bindPvPSetup() {
    this.els.pvpSetupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.startPvPMatch();
    });

    this.els.pvpBackBtn.addEventListener("click", () => {
      this.showScreen("menuScreen");
    });
  },
  bindPvCSetup() {
    this.els.pvcSetupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.startPvCMatch();
    });

    this.els.pvcBackBtn.addEventListener("click", () => {
      this.showScreen("menuScreen");
    });
  },
  startPvPMatch() {
    const p1 = this.els.pvpPlayer1Name.value.trim();
    const p2 = this.els.pvpPlayer2Name.value.trim();

    if (!p1 || !p2) {
      this.els.pvpError.textContent = "Введите имена обоих игроков.";
      return;
    }

    if (p1.toLowerCase() === p2.toLowerCase()) {
      this.els.pvpError.textContent = "Имена игроков должны отличаться.";
      return;
    }

    this.els.pvpError.textContent = "";
    this.currentMode = "pvp";

    if (PF.ai) {
      PF.ai.enabled = false;
      PF.ai.stop();
    }

    const settings = this.getSettingsFromSelects(
      this.els.pvpTurnTimeSelect,
      this.els.pvpFieldSizeSelect
    );

    PF.game.startMatch(p1, p2, null, settings);
    this.showScreen("app");
  },

  startPvCMatch() {
    const profile = PF.cloud.currentProfile;
    const p1 = profile ? profile.display_name : "Игрок";
    const p2 = "Компьютер";

    this.currentMode = "pvc";

    if (PF.ai) {
      PF.ai.enabled = true;
      PF.ai.player = 2;
      PF.ai.stop();
    }

    const settings = this.getSettingsFromSelects(
      this.els.pvcTurnTimeSelect,
      this.els.pvcFieldSizeSelect
    );

  PF.game.startMatch(p1, p2, null, settings);
  this.showScreen("app");
},

  /* ==================== ОНЛАЙН ==================== */

  showOnlineScreen() {
    this.showScreen("onlineScreen");
    this.switchOnlineTab("rooms");
    this.loadRoomsList();
    
    if (PF.online) {
      PF.online.subscribeToRoomsList(() => this.loadRoomsList());
    }
  },

  bindOnline() {
    // Табы
    this.els.onlineTabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;

      const tab = btn.dataset.tab;
      this.switchOnlineTab(tab);
    });

    // Создать комнату
    this.els.createRoomForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.createRoom();
    });

    // Подключиться
    this.els.joinRoomForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.joinRoom();
    });

    // Отменить комнату
    this.els.cancelRoomBtn.addEventListener("click", () => {
      this.cancelRoom();
    });

    // Назад
    this.els.onlineBackBtn.addEventListener("click", () => {
      if (PF.online) {
        PF.online.unsubscribeFromRoomsList();
        PF.online.leaveRoom();
      }
      this.showScreen("menuScreen");
    });
  },

  switchOnlineTab(tab) {
    const tabs = this.els.onlineTabs.querySelectorAll(".tab-btn");
    tabs.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    this.els.roomsTab.classList.toggle("hidden", tab !== "rooms");
    this.els.createTab.classList.toggle("hidden", tab !== "create");
    this.els.joinTab.classList.toggle("hidden", tab !== "join");

    this.els.waitingRoom.classList.add("hidden");
    this.els.createRoomForm.classList.remove("hidden");
    this.els.joinRoomForm.classList.remove("hidden");
  },

  async loadRoomsList() {
    if (!PF.online) return;

    this.els.roomsList.innerHTML = '<p class="muted">Загрузка комнат...</p>';

    const rooms = await PF.online.getOpenRooms();

    if (!rooms.length) {
      this.els.roomsList.innerHTML = '<p class="muted">Нет открытых комнат. Создайте свою!</p>';
      return;
    }

    this.els.roomsList.innerHTML = "";

    rooms.forEach(room => {
      const item = document.createElement("div");
      item.className = "room-item";

      const hostName = room.host_name || "Хост";
      const code = room.room_code;

      item.innerHTML = `
        <div class="room-info">
          <div class="room-host">${this.escape(hostName)}</div>
          <div class="room-code">Код: ${code}</div>
        </div>
        <button class="join-btn">Войти</button>
      `;

      const joinBtn = item.querySelector(".join-btn");
      joinBtn.addEventListener("click", async () => {
        await this.joinRoomByCode(code);
      });

      this.els.roomsList.appendChild(item);
    });
  },

  async createRoom() {
    const profile = PF.cloud.currentProfile;
    if (!profile) {
      this.els.onlineError.textContent = "Нужно войти в облачный профиль.";
      return;
    }

    const code = this.els.roomCodeInput.value.trim().toUpperCase();
    const isPrivate = this.els.isPrivateRoom.checked;

    if (!code) {
      this.els.createError.textContent = "Введите код комнаты.";
      return;
  }

    const settings = this.getSettingsFromSelects(
      this.els.turnTimeSelect,
      this.els.fieldSizeSelect
    );

    try {
      this.els.createError.textContent = "Создание комнаты...";
      const room = await PF.online.createRoom(code, isPrivate, profile.display_name, settings);

      this.els.createRoomForm.classList.add("hidden");
      this.els.waitingRoom.classList.remove("hidden");
      this.els.waitingRoomCode.textContent = room.room_code;

      this.waitForPlayer(room);
    } catch (e) {
      this.els.createError.textContent = e.message;
    }
  },

  waitForPlayer(room) {
    const checkInterval = setInterval(async () => {
      if (!PF.online.room || PF.online.room.id !== room.id) {
        clearInterval(checkInterval);
        return;
      }

      const { data } = await PF.cloud.client
        .from("rooms")
        .select("*")
        .eq("id", room.id)
        .single();

      if (data && data.status === "playing" && data.guest_profile_id) {
        clearInterval(checkInterval);
        this.els.onlineScreen.classList.add("hidden");
        this.showScreen("app");
        PF.game.startOnlineMatch(data);
      }
    }, 2000);
  },

  async joinRoom() {
    const code = this.els.joinCodeInput.value.trim().toUpperCase();
    await this.joinRoomByCode(code);
  },

  async joinRoomByCode(code) {
    const profile = PF.cloud.currentProfile;

    if (!code) {
      this.els.joinError.textContent = "Введите код комнаты.";
      return;
    }

    try {
      this.els.joinError.textContent = "Подключение...";
      const room = await PF.online.joinRoom(code, profile.display_name);

      this.els.onlineScreen.classList.add("hidden");
      this.showScreen("app");
      PF.game.startOnlineMatch(room);
    } catch (e) {
      this.els.joinError.textContent = e.message;
    }
  },

  cancelRoom() {
    if (PF.online) {
      PF.online.leaveRoom();
    }
    this.switchOnlineTab("create");
    this.els.waitingRoom.classList.add("hidden");
    this.els.createRoomForm.classList.remove("hidden");
  },

  /* ==================== ИГРОВЫЕ КОНТРОЛЫ ==================== */

  bindGameControls() {
    this.els.soundBtn.addEventListener("click", () => {
      PF.audio.enabled = !PF.audio.enabled;
      PF.audio.save();
      this.updateSoundBtn();
      if (PF.audio.enabled) PF.audio.click();
    });

    this.els.historyToggleBtn.addEventListener("click", () => {
      this.els.historyPanel.classList.toggle("hidden");
    });

    this.els.saveMatchBtn.addEventListener("click", () => {
      PF.save.saveCurrent(true, false);
    });

    this.els.replaysBtn.addEventListener("click", () => {
      PF.save.renderList();
      this.els.replaysModal.classList.remove("hidden");
    });

    this.els.closeReplays.addEventListener("click", () => {
      this.els.replaysModal.classList.add("hidden");
    });

    this.els.closeStats.addEventListener("click", () => {
      this.els.statsModal.classList.add("hidden");
    });

    this.els.backToMenuBtn.addEventListener("click", () => {
      if (PF.replay && PF.replay.active) {
        PF.replay.exit();
      }

      if (PF.game.state && !PF.game.state.over) {
        if (!confirm("Выйти в меню? Текущая игра сохранится.")) {
          return;
        }

        // Для локальной игры ставим паузу.
        // Онлайн-игру не останавливаем, только прячем интерфейс.
        if (!PF.online || !PF.online.room) {
          PF.game.setPaused(true);
        }
      }

      this.showScreen("menuScreen");
      this.updateContinueButton();
    });

    if (PF.replay) {
      PF.replay.init();
    }
  },

  /* ==================== СТАТИСТИКА ==================== */

  async showStats() {
    this.els.statsModal.classList.remove("hidden");
    this.els.statsTableWrap.innerHTML = '<p class="muted">Загрузка...</p>';

    if (PF.cloud && PF.cloud.ready) {
      const leaders = await PF.cloud.getLeaderboard();

      if (!leaders.length) {
        this.els.statsTableWrap.innerHTML = '<p class="muted">Пока нет игроков.</p>';
        return;
      }

      const body = leaders.map((row, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${this.escape(row.display_name)}</td>
          <td>${row.rating}</td>
          <td>${row.games}</td>
          <td>${row.wins}</td>
          <td>${row.draws}</td>
          <td>${row.losses}</td>
          <td>${row.goals_for}:${row.goals_against}</td>
        </tr>
      `).join("");

      this.els.statsTableWrap.innerHTML = `
        <table class="stats-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Игрок</th>
              <th>Рейтинг</th>
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
    } else {
      this.els.statsTableWrap.innerHTML = '<p class="muted">Облако не подключено.</p>';
    }
  },

  /* ==================== HUD ==================== */

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

    this.updateContinueButton();
    const isOnlineActive = PF.online && PF.online.room;

    if (this.els.saveMatchBtn) {
      this.els.saveMatchBtn.style.display = isOnlineActive ? "none" : "";
    }
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
  updateContinueButton() {
    if (!this.els.menuContinueBtn) return;

    const hasActiveGame =
      PF.game.state &&
      !PF.game.state.over;

    this.els.menuContinueBtn.classList.toggle("hidden", !hasActiveGame);
  },
  async tryRestoreOnline() {
    if (!PF.online || !PF.cloud.currentProfile) return false;

    try {
      const room = await PF.online.restoreActiveRoom();

      if (room) {
        PF.game.startOnlineMatch(room);
        return true;
      }
    } catch (e) {
      console.warn("Restore online error:", e);
      PF.online.clearActive();
    }

    return false;
  },
  getSettingsFromSelects(turnTimeEl, fieldSizeEl) {
    const turnSeconds = parseInt(turnTimeEl.value, 10) || 20;
    const fieldSize = fieldSizeEl.value || "28x38";
    const fieldConfig = PF.FIELD_SIZES[fieldSize] || PF.FIELD_SIZES["28x38"];

    return {
      turnSeconds,
      fieldSize,
      cellsX: fieldConfig.cellsX,
      cellsY: fieldConfig.cellsY,
      goalWidth: fieldConfig.goalWidth
    };
  },
    
  confirmAndClearActiveGame(message) {
    if (PF.game.state && !PF.game.state.over) {
      if (!confirm(message)) {
        return false;
      }
    }

    if (PF.online) {
      PF.online.leaveRoom();
    }

    clearInterval(PF.game.timerId);

    PF.game.state = null;
    PF.game.paused = false;

    this.updateContinueButton();

    return true;
  },
  escape(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
};
