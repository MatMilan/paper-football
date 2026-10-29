PF.online = {
  storageKey: "pf_online_active_v1",
  lastRevision: 0,
  lastSentRevision: null,
  pendingRemote: null,
  pollingTimer: null,
  channelStatus: null,
  room: null,
  subscription: null,
  roomsSubscription: null,
  isHost: false,
  myPlayerNumber: null,

  async createRoom(roomCode, isPrivate, playerName) {
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
      history: []
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

      this.saveActive();
      this.subscribeToRoom();
      this.startPolling();

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
      this.lastRevision = data.revision || 0;
      this.lastSentRevision = null;

      this.saveActive();
      this.subscribeToRoom();
      this.startPolling();

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

    // Это ответ на наше же сообщение — не применяем его повторно.
    if (rev === this.lastSentRevision) {
      this.room = newRoom;
      return;
    }

    // Устаревшее состояние — игнорируем.
    if (rev <= this.lastRevision) return;

    this.lastRevision = rev;
    this.room = newRoom;

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
    s.animating = false;
    s.timeoutPending = false;

    console.log("Applying remote state, revision:", this.lastRevision);

    s.players = newState.players;
    s.currentPlayer = newState.currentPlayer;
    s.phase = newState.phase;
    s.ball = PF.geo.clone(newState.ball);
    s.displayBall = PF.geo.clone(newState.displayBall);
    s.turnStartBall = PF.geo.clone(newState.turnStartBall);
    s.path = newState.path.map(p => PF.geo.clone(p));
    s.visited = new Set(newState.visited);

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
    // Если после хода соперника у текущего игрока нет ходов —
    // хост автоматически назначает пенальти или ничью.
    if (PF.game && PF.game.autoHandleNoMoves) {
      PF.game.autoHandleNoMoves();
    }
  },

  async updateRoomState(state) {
    if (!this.room || !PF.cloud.client) return;

    const stateForDB = {
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
      history: state.history
    };

    try {
      const { data, error } = await PF.cloud.client.rpc("update_room_state", {
        p_room_id: this.room.id,
        p_state: stateForDB,
        p_status: state.over ? "finished" : "playing",
        p_current_player: state.currentPlayer
      });

      if (error) throw error;

      if (data) {
        this.lastSentRevision = data.revision;
        this.lastRevision = data.revision;
        this.room = data;

        if (state.over) {
          // Освобождаем код комнаты после завершения матча.
          try {
            await PF.cloud.client
              .from("rooms")
              .update({ room_code: null })
              .eq("id", this.room.id);
          } catch (e) {
            console.warn("Cannot release room code:", e);
          }

          this.clearActive();
          this.stopPolling();
        }
      }
    } catch (e) {
      console.error("Update room error:", e);
    }
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
    this.isHost = data.host_profile_id === profile.id;
    this.myPlayerNumber = this.isHost ? 1 : 2;
    this.lastRevision = data.revision || 0;
    this.lastSentRevision = null;
    this.pendingRemote = null;

    this.subscribeToRoom();
    this.startPolling();

    console.log("Restored online room:", data.room_code);
    return data;
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
  
  leaveRoom() {
    this.unsubscribe();
    this.stopPolling();
    this.clearActive();
    this.pendingRemote = null;
    this.room = null;
    this.isHost = false;
    this.myPlayerNumber = null;
  }
};
