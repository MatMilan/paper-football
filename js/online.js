PF.online = {
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

      this.subscribeToRoom();

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

      this.subscribeToRoom();

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
    if (!this.room || !PF.cloud.client) {
      console.warn("Cannot subscribe: no room or client");
      return;
    }

    this.unsubscribe();

    console.log("Subscribing to room:", this.room.id);

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
          console.log("Room update received:", payload);
          this.handleRoomUpdate(payload.new);
        }
      )
      .subscribe((status) => {
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
    console.log("handleRoomUpdate called with:", newRoom);
  
    const oldRoom = this.room;
    this.room = newRoom;

    if (!PF.game.state) {
      console.warn("No game state");
      return;
    }

    const oldState = oldRoom.state;
    const newState = newRoom.state;

    console.log("Old state segments:", oldState.segments?.length);
    console.log("New state segments:", newState.segments?.length);

    if (newState.over && !oldState.over) {
      PF.game.state.over = true;
      PF.game.state.phase = newState.phase;
      PF.game.state.result = newState.result;
      PF.render.draw(PF.game.state);
      return;
    }

    if (newState.currentPlayer !== oldState.currentPlayer || newState.segments.length !== oldState.segments.length) {
      console.log("Syncing state from room");
      this.syncStateFromRoom(newState);
    }
  },

  syncStateFromRoom(newState) {
    const s = PF.game.state;
    if (!s) return;

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
    s.turnSegments = newState.turnSegments;
    s.turnVisited = newState.turnVisited;
    s.timeLeft = newState.timeLeft;
    s.timeoutStreak = newState.timeoutStreak;
    s.cannotStreak = newState.cannotStreak;
    s.lastDrawOfferBy = newState.lastDrawOfferBy;
    s.over = newState.over;
    s.animating = newState.animating;
    s.events = newState.events;
    s.result = newState.result;
    s.lastSegment = newState.lastSegment ? {
      a: PF.geo.clone(newState.lastSegment.a),
      b: PF.geo.clone(newState.lastSegment.b),
      player: newState.lastSegment.player,
      penalty: newState.lastSegment.penalty
    } : null;
    s.trail = newState.trail.map(t => ({
      x: t.x,
      y: t.y,
      player: t.player
    }));
    s.history = newState.history;

    PF.ui.updateHUD(s);
    PF.ui.updateTimer(s);
    PF.render.draw(s);
    PF.history.render(s);
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
      animating: state.animating,
      timeoutPending: state.timeoutPending,
      events: state.events,
      result: state.result,
      saved: state.saved,
      lastSegment: state.lastSegment ? {
        a: PF.geo.clone(state.lastSegment.a),
        b: PF.geo.clone(state.lastSegment.b),
        player: state.lastSegment.player,
        penalty: state.lastSegment.penalty
      } : null,
      trail: state.trail.map(t => ({ x: t.x, y: t.y, player: t.player })),
      history: state.history
    };

    try {
      await PF.cloud.client
        .from("rooms")
        .update({
          state: stateForDB,
          current_player: state.currentPlayer,
          status: state.over ? "finished" : "playing"
        })
        .eq("id", this.room.id);
    } catch (e) {
      console.error("Update room error:", e);
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
    this.room = null;
    this.isHost = false;
    this.myPlayerNumber = null;
  }
};
