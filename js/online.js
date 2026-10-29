PF.online = {
  storageKey: "pf_online_active_v1",
  lastRevision: 0,
  lastSentRevision: null,
  pendingRemote: null,
  pollingTimer: null,
  channelStatus: null,
  lastActivityTime: null,
  opponentStatusCheckTimer: null,
  room: null,
  finishInProgress: false,
  roomFinished: false,
  subscription: null,
  roomsSubscription: null,
  isHost: false,
  myPlayerNumber: null,

  buildStateForDB(state) {
    return {
      players: state.players,
      currentPlayer: state.currentPlayer,
      phase: state.phase,
      ball: PF.geo.clone(state.ball),
      displayBall: PF.geo.clone(state.displayBall),
      turnStartBall: PF.geo.clone(state.turnStartBall),
      path: state.path.map(p => PF.geo.clone(p)),
      visited: Array.from(state.visited),
      segments: state.segments.map(s => ({
        a: PF.geo.clone(s.a),
        b: PF.geo.clone(s.b),
        player: s.player,
        penalty: s.penalty
      })),
      turnSegments: state.turnSegments,
      turnVisited: state.turnVisited,
      timeLeft: state.timeLeft,
      timeoutStreak: state.timeoutStreak,
      cannotStreak: state.cannotStreak,
      lastDrawOfferBy: state.lastDrawOfferBy,
      over: state.over,
      animating: false,
      timeoutPending: false,
      events: state.events,
      result: state.result,
      saved: state.saved,
      lastSegment: state.lastSegment ? {
        a: PF.geo.clone(state.lastSegment.a),
        b: PF.geo.clone(state.lastSegment.b),
        player: state.lastSegment.player,
        penalty: state.lastSegment.penalty
      } : null,
      trail: [],
      history: state.history,
      settings: state.settings || null
    };
  },
  updateActivityTime() {
    this.lastActivityTime = Date.now();
    this.updateOpponentStatus("connected");
  },

  startOpponentStatusCheck() {
    this.stopOpponentStatusCheck();

    this.opponentStatusCheckTimer = setInterval(() => {
      this.checkOpponentStatus();
    }, 5000);
  },

  stopOpponentStatusCheck() {
    clearInterval(this.opponentStatusCheckTimer);
    this.opponentStatusCheckTimer = null;
  },

  checkOpponentStatus() {
    if (!this.room || !PF.game.state) return;
    if (PF.game.state.over) return;

    const isMyTurn = PF.game.state.currentPlayer === this.myPlayerNumber;

    if (isMyTurn) {
      // Сейчас наш ход — статус соперника не так важен
      this.updateOpponentStatus("connected");
      return;
    }

    // Сейчас ход соперника
    if (!this.lastActivityTime) {
      this.updateOpponentStatus("thinking");
      return;
    }

    const elapsed = Date.now() - this.lastActivityTime;

    if (elapsed > 60000) {
      // Больше 60 секунд нет активности
      this.updateOpponentStatus("disconnected");
    } else {
      this.updateOpponentStatus("thinking");
    }
  },

  updateOpponentStatus(status) {
    if (PF.ui && PF.ui.updateOpponentStatus) {
      PF.ui.updateOpponentStatus(status);
    }
  },

  async createRoom(roomCode, isPrivate, playerName, settings = null) {
    if (!PF.cloud || !PF.cloud.ready) {
      throw new Error("Supabase не подключен.");
    }

    const profile = PF.cloud.currentProfile;
    if (!profile) {
      throw new Error("Нужно войти в облачный профиль.");
    }

    const code = roomCode.toUpperCase().trim();

    if (code.length < 3 || code.length > 10) {
      throw new Error("Код должен быть от 3 до 10 символов.");
    }

    // Проверяем, что код уникален
    const { data: existing } = await PF.cloud.client
      .from("rooms")
      .select("id")
      .eq("room_code", code)
      .eq("status", "waiting")
      .maybeSingle();

    if (existing) {
      throw new Error("Такой код уже используется. Придумайте другой.");
    }

    // Определяем настройки поля
    const fieldSize = settings?.fieldSize || "28x38";
    const turnSeconds = settings?.turnSeconds || 20;
    const fieldConfig = PF.FIELD_SIZES[fieldSize] || PF.FIELD_SIZES["28x38"];

    // Применяем настройки для текущего клиента
    PF.applyGameSettings({
      cellsX: fieldConfig.cellsX,
      cellsY: fieldConfig.cellsY,
      goalWidth: fieldConfig.goalWidth,
      turnSeconds: turnSeconds
    });

    const initialState = {
      players: { 1: playerName, 2: null },
      currentPlayer: Math.random() < 0.5 ? 1 : 2,
      phase: "simple",
      ball: { x: PF.CFG.START.x, y: PF.CFG.START.y },
      displayBall: { x: PF.CFG.START.x, y: PF.CFG.START.y },
      turnStartBall: { x: PF.CFG.START.x, y: PF.CFG.START.y },
      path: [{ x: PF.CFG.START.x, y: PF.CFG.START.y }],
      visited: [],
      segments: [],
      turnSegments: [],
      turnVisited: [],
      timeLeft: PF.CFG.turnSeconds,
      timeoutStreak: 0,
      cannotStreak: 0,
      lastDrawOfferBy: null,
      over: false,
      animating: false,
      timeoutPending: false,
      events: [],
      result: null,
      saved: false,
      lastSegment: null,
      trail: [],
      history: [],

      // Сохраняем настройки в состоянии комнаты
      settings: {
        cellsX: fieldConfig.cellsX,
        cellsY: fieldConfig.cellsY,
        goalWidth: fieldConfig.goalWidth,
        turnSeconds: turnSeconds,
        fieldSize: fieldSize
      }
    };

    try {
      const { data, error } = await PF.cloud.client
        .from("rooms")
        .insert({
          room_code: code,
          host_profile_id: profile.id,
          host_name: playerName,
          state: initialState,
          status: "waiting",
          is_private: isPrivate,
          current_player: initialState.currentPlayer
        })
        .select()
        .single();

      if (error) throw error;

      this.room = data;
      this.isHost = true;
      this.myPlayerNumber = 1;
      this.lastRevision = data.revision || 0;
      this.lastSentRevision = null;
      this.finishInProgress = false;
      this.roomFinished = false;

      this.saveActive();
      this.subscribeToRoom();
      this.startPolling();
      this.updateActivityTime();

      return data;
    } catch (e) {
      console.error("Create room error:", e);
      throw new Error(e.message || "Не удалось создать комнату.");
    }
  },

  async joinRoom(roomCode, playerName) {
    if (!PF.cloud || !PF.cloud.ready) {
      throw new Error("Supabase не подключен.");
    }

    const profile = PF.cloud.currentProfile;
    if (!profile) {
      throw new Error("Нужно войти в облачный профиль.");
    }

    const code = roomCode.toUpperCase().trim();

    try {
      const { data: room, error: findError } = await PF.cloud.client
        .from("rooms")
        .select("*")
        .eq("room_code", code)
        .eq("status", "waiting")
        .is("guest_profile_id", null)
        .maybeSingle();

      if (findError || !room) {
        throw new Error("Комната не найдена или уже занята.");
      }

      const updatedState = { ...room.state, players: { ...room.state.players, 2: playerName } };
      // Применяем настройки комнаты
      if (room.state && room.state.settings) {
        PF.applyGameSettings(room.state.settings);
      }

      const { data, error } = await PF.cloud.client
        .from("rooms")
        .update({
          guest_profile_id: profile.id,
          guest_name: playerName,
          state: updatedState,
          status: "playing"
        })
        .eq("id", room.id)
        .select()
        .single();

      if (error) throw error;

      this.room = data;
      this.isHost = false;
      this.myPlayerNumber = 2;
      this.finishInProgress = false;
      this.roomFinished = false;
      this.lastRevision = data.revision || 0;
      this.lastSentRevision = null;

      this.saveActive();
      this.subscribeToRoom();
      this.startPolling();
      this.updateActivityTime();
      this.startOpponentStatusCheck();

      return data;
    } catch (e) {
      console.error("Join room error:", e);
      throw new Error(e.message || "Не удалось подключиться к комнате.");
    }
  },

  async getOpenRooms() {
    if (!PF.cloud || !PF.cloud.ready) return [];

    const { data, error } = await PF.cloud.client
      .from("rooms")
      .select("*")
      .eq("status", "waiting")
      .eq("is_private", false)
      .is("guest_profile_id", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Get rooms error:", error);
      return [];
    }

    return data || [];
  },

  subscribeToRoom() {
    if (!this.room || !PF.cloud.client) return;

    this.unsubscribe();

    this.subscription = PF.cloud.client
      .channel(`room-${this.room.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${this.room.id}`
        },
        (payload) => {
          this.handleRoomUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        this.channelStatus = status;
        console.log("Subscription status:", status);
      });
      // Запускаем проверку статуса соперника
      this.updateActivityTime();
      this.startOpponentStatusCheck();
   },

  subscribeToRoomsList(callback) {
    if (!PF.cloud.client) return;

    this.unsubscribeFromRoomsList();

    this.roomsSubscription = PF.cloud.client
      .channel("rooms-list")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms"
        },
        () => {
          if (callback) callback();
        }
      )
      .subscribe();
  },

  unsubscribeFromRoomsList() {
    if (this.roomsSubscription) {
      PF.cloud.client.removeChannel(this.roomsSubscription);
      this.roomsSubscription = null;
    }
  },

  unsubscribe() {
    if (this.subscription) {
      PF.cloud.client.removeChannel(this.subscription);
      this.subscription = null;
    }
  },

  handleRoomUpdate(newRoom) {
    const rev = newRoom.revision || 0;
    // Обновляем время активности при получении любого обновления
    this.updateActivityTime();

    // Это ответ на наше же сообщение — не применяем его повторно.
    if (rev === this.lastSentRevision) {
      this.room = newRoom;
      return;
    }

    // Устаревшее состояние — игнорируем.
    if (rev <= this.lastRevision) return;

    this.lastRevision = rev;
    this.room = newRoom;
    if (newRoom.status === "finished") {
      this.roomFinished = true;
      this.clearActive();
      this.stopPolling();
    }

    if (!PF.game.state) return;

    // Если мяч сейчас анимируется — отложим применение,
    // чтобы не прервать ход посередине.
    if (PF.game.state.animating) {
      this.pendingRemote = newRoom.state;
      return;
    }

    this.applyRemoteState(newRoom.state);
  },

  applyRemoteState(newState) {
    const s = PF.game.state;
    if (!s || !newState) return;

    const wasOver = s.over;

    s.animating = false;
    s.timeoutPending = false;
    // Применяем настройки, если они пришли
    if (newState.settings && !s._settingsApplied) {
      PF.applyGameSettings(newState.settings);
      s._settingsApplied = true;
    }

    s.players = newState.players;
    s.currentPlayer = newState.currentPlayer;
    s.phase = newState.phase;
    s.ball = PF.geo.clone(newState.ball);
    s.displayBall = PF.geo.clone(newState.displayBall);
    s.turnStartBall = PF.geo.clone(newState.turnStartBall);
    s.path = newState.path.map(p => PF.geo.clone(p));
    s.visited = new Set(newState.visited);
    // Запоминаем количество сегментов до обновления
    const prevSegmentsCount = s.segments ? s.segments.length : 0;

    s.segments = newState.segments.map(seg => ({
      a: PF.geo.clone(seg.a),
      b: PF.geo.clone(seg.b),
      player: seg.player,
      penalty: seg.penalty
    }));

    s.turnSegments = newState.turnSegments || [];
    s.turnVisited = newState.turnVisited || [];
    s.timeLeft = newState.timeLeft;
    s.timeoutStreak = newState.timeoutStreak;
    s.cannotStreak = newState.cannotStreak;
    s.lastDrawOfferBy = newState.lastDrawOfferBy;
    s.over = newState.over;
    s.events = newState.events || [];
    s.result = newState.result;
    s.history = newState.history || [];

    s.lastSegment = newState.lastSegment ? {
      a: PF.geo.clone(newState.lastSegment.a),
      b: PF.geo.clone(newState.lastSegment.b),
      player: newState.lastSegment.player,
      penalty: newState.lastSegment.penalty
    } : null;

    s.trail = [];

    PF.ui.updateHUD(s);
    PF.ui.updateTimer(s);
    PF.render.draw(s);
    PF.history.render(s);

    // Конец матча у второго игрока
    if (!wasOver && s.over) {
      if (s.result?.type === "goal") {
        const scorerName = s.players[s.result.winner] || "";
        PF.audio.goal();
        PF.ui.showResultOverlay(`Гол! ${scorerName}`, "goal");
      } else if (s.result?.type === "draw") {
        PF.audio.draw();
        PF.ui.showResultOverlay(s.result.text || "Ничья", "draw");
      }

      if (PF.online) {
        PF.online.showResultMessage(s.result);
      }

      // Если хост получил финальное состояние от гостя,
      // хост завершает матч и начисляет рейтинг.
      if (
        PF.online &&
        PF.online.room &&
        PF.online.isHost &&
        !PF.online.finishInProgress &&
        !PF.online.roomFinished
      ) {
        PF.online.reportMatchEnd(s);
      }
    }

    // Если рейтинг пришёл уже после того, как матч стал завершённым
    if (s.over && PF.online && newState.result?.rating) {
      PF.online.showResultMessage(s.result);
    }
    // Определяем новые сегменты и подсвечиваем их
    const newSegmentsCount = s.segments.length;
    if (newSegmentsCount > prevSegmentsCount) {
      const newSegments = s.segments.slice(prevSegmentsCount);
      PF.render.highlightLastMove(newSegments);
      PF.audio.opponentMove();
    }

    if (PF.game.autoHandleNoMoves) {
      PF.game.autoHandleNoMoves();
    }
  },

  async updateRoomState(state, allowOver = false) {
    if (!this.room || !PF.cloud.client) return;

    // Завершение матча должно идти через finishOnlineMatch
    if (state.over && !allowOver) return;

    const stateForDB = this.buildStateForDB(state);

    try {
      const { data, error } = await PF.cloud.client.rpc("update_room_state", {
        p_room_id: this.room.id,
        p_state: stateForDB,
        p_status: "playing",
        p_current_player: state.currentPlayer
      });

      if (error) throw error;

      if (data) {
        this.lastSentRevision = data.revision;
        this.lastRevision = data.revision;
        this.room = data;

        if (data.status === "finished") {
          this.roomFinished = true;
          this.clearActive();
          this.stopPolling();
        }
      }
    } catch (e) {
      console.error("Update room error:", e);
    }
  },
  
  async finishOnlineMatch(state) {
    if (!this.room || !PF.cloud.client) return;
    if (!state || !state.over) return;
    if (!this.isHost) return;
    if (this.finishInProgress || this.roomFinished) return;

    this.finishInProgress = true;

    const isDraw = state.result?.type === "draw";
    const winnerPlayer =
      state.result?.type === "goal"
        ? state.result.winner || 0
        : 0;

    console.log("[online] finishOnlineMatch start", {
      roomId: this.room.id,
      isDraw,
      winnerPlayer
    });

    try {
      const stateForDB = this.buildStateForDB(state);

      const { data, error } = await PF.cloud.client.rpc("finish_online_match", {
        p_room_id: this.room.id,
        p_state: stateForDB,
        p_is_draw: isDraw,
        p_winner_player: winnerPlayer
      });

      if (error) throw error;

      console.log("[online] finishOnlineMatch result", data);

      if (data && !data.already_finished) {
        this.lastSentRevision = data.revision;
        this.lastRevision = data.revision;
        this.roomFinished = true;

        if (this.room) {
          this.room.status = "finished";
        }

        this.clearActive();
        this.stopPolling();

        const my = this.myPlayerNumber;

        this.showResultMessage({
          ...(state.result || {}),
          rating: {
            [`p${my}`]: data[`p${my}_rating`],
            [`p${my}_delta`]: data[`p${my}_delta`]
          }
        });
      } else if (data && data.already_finished) {
        this.roomFinished = true;

        if (this.room) {
          this.room.status = "finished";
        }

        this.clearActive();
        this.stopPolling();
      }
    } catch (e) {
      console.error("[online] Finish match error:", e);
      PF.ui.setMessage("Ошибка сохранения результата: " + e.message);
    } finally {
      this.finishInProgress = false;
    }
  },
  
  showResultMessage(result) {
    const baseText = result?.text || "Матч завершён.";
    const rating = result?.rating;
    const my = this.myPlayerNumber;

    if (!rating || !my) {
      PF.ui.setMessage(baseText);
      return;
    }

    const value = rating[`p${my}`];
    const delta = rating[`p${my}_delta`];

    if (value == null) {
      PF.ui.setMessage(baseText);
      return;
    }

    if (PF.cloud.currentProfile) {
      PF.cloud.currentProfile.rating = value;

      if (PF.ui.updateUserInfo) {
        PF.ui.updateUserInfo();
      }
    }

    const sign = delta >= 0 ? "+" : "";

    PF.ui.setMessage(`${baseText} Ваш рейтинг: ${value} (${sign}${delta})`);
  },
  showRatingMessage(ratingValue, deltaValue) {
    if (ratingValue == null) return;

    if (PF.cloud.currentProfile) {
      PF.cloud.currentProfile.rating = ratingValue;

      if (PF.ui.updateUserInfo) {
        PF.ui.updateUserInfo();
      }
    }

    const sign = deltaValue >= 0 ? "+" : "";
    PF.ui.setMessage(`Ваш рейтинг: ${ratingValue} (${sign}${deltaValue})`);
  },

  showRatingFromState(rating) {
    if (!rating || !this.myPlayerNumber) return;

    const value = rating[`p${this.myPlayerNumber}`];
    const delta = rating[`p${this.myPlayerNumber}_delta`];

    this.showRatingMessage(value, delta);
  },
  
  saveActive() {
    if (!this.room) return;

    const data = {
      roomId: this.room.id,
      roomCode: this.room.room_code,
      playerNumber: this.myPlayerNumber,
      isHost: this.isHost
    };

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn("Cannot save active room", e);
    }
  },

  clearActive() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {}
  },

  getActive() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || "null");
    } catch {
      return null;
    }
  },

  async restoreActiveRoom() {
    const active = this.getActive();
    if (!active) return null;

    const profile = PF.cloud.currentProfile;
    if (!profile) return null;

    const { data, error } = await PF.cloud.client
      .from("rooms")
      .select("*")
      .eq("id", active.roomId)
      .maybeSingle();

    if (error || !data) {
      this.clearActive();
      return null;
    }

    if (data.status === "finished") {
      this.clearActive();
      return null;
    }

    if (data.host_profile_id !== profile.id && data.guest_profile_id !== profile.id) {
      this.clearActive();
      return null;
    }

    this.room = data;
    // Применяем настройки комнаты
    if (data.state && data.state.settings) {
      PF.applyGameSettings(data.state.settings);
    }
    this.isHost = data.host_profile_id === profile.id;
    this.myPlayerNumber = this.isHost ? 1 : 2;
    this.finishInProgress = false;
    this.roomFinished = false;
    this.lastRevision = data.revision || 0;
    this.lastSentRevision = null;
    this.pendingRemote = null;

    this.subscribeToRoom();
    this.startPolling();

    console.log("Restored online room:", data.room_code);
    return data;
  },
  reportMatchEnd(state) {
    if (!this.room || !state || !state.over) return;

    if (this.isHost) {
      this.finishOnlineMatch(state);
    } else {
      this.updateRoomState(state, true);
    }
  },

  startPolling() {
    this.stopPolling();

    this.pollingTimer = setInterval(() => {
      this.refreshRoom();
    }, 3000);
  },

  stopPolling() {
    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  },

  async refreshRoom() {
    if (!this.room) return;

    try {
      const { data, error } = await PF.cloud.client
        .from("rooms")
        .select("*")
        .eq("id", this.room.id)
        .maybeSingle();

      if (error || !data) return;

      if ((data.revision || 0) > this.lastRevision) {
        this.handleRoomUpdate(data);
      } else if (this.channelStatus !== "SUBSCRIBED") {
        console.log("Realtime disconnected, resubscribing");
        this.subscribeToRoom();
      }
    } catch (e) {
      console.warn("Refresh room error", e);
    }
  },
  getInviteLink() {
    if (!this.room) return "";

    const base = window.location.origin + window.location.pathname;
    const code = this.room.room_code;

    return `${base}?join=${encodeURIComponent(code)}`;
  },
  getRoomSettingsLabel(room) {
    const settings = room.state?.settings;
    if (!settings) return "";

    const sizeLabel = settings.fieldSize || "28x38";
    const timeLabel = `${settings.turnSeconds || 20}с`;

    return { sizeLabel, timeLabel };
  },

  flushPending() {
    if (this.pendingRemote && PF.game.state && !PF.game.state.animating) {
      const state = this.pendingRemote;
      this.pendingRemote = null;
      this.applyRemoteState(state);
    }
  },
  
  isMyTurn() {
    if (!PF.game.state || !this.room) return false;
    return PF.game.state.currentPlayer === this.myPlayerNumber;
  },

  canMakeMove() {
    return this.isMyTurn() && PF.game.state && !PF.game.state.over && !PF.game.state.animating;
  },
  async fetchMatchHistory() {
    if (!PF.cloud || !PF.cloud.ready) return [];

    const profile = PF.cloud.currentProfile;
    if (!profile) return [];

    const profileId = profile.id;

    const { data, error } = await PF.cloud.client
      .from("matches")
      .select("*")
      .or(`player1_profile_id.eq.${profileId},player2_profile_id.eq.${profileId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Fetch match history error:", error);
      return [];
    }

    return data || [];
  },
  
  leaveRoom() {
    this.unsubscribe();
    this.stopPolling();
    this.clearActive();
    this.pendingRemote = null;
    this.room = null;
    this.isHost = false;
    this.myPlayerNumber = null;
    this.stopOpponentStatusCheck();
    this.lastActivityTime = null;
  }
};
