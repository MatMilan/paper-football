PF.game = {
  paused: false,
  state: null,
  timerId: null,
  
  setPaused(value) {
    this.paused = value;

    if (value) {
      clearInterval(this.timerId);
    } else if (this.state && !this.state.over) {
      this.resetTimer();
    }
  },

  autoHandleNoMoves() {
    const s = this.state;

    if (!s || s.over || s.animating || this.paused) {
      return false;
    }

    if (s.timeLeft <= 0) {
      return false;
    }

    // Нельзя объявлять отсутствие хода посреди простого хода.
    // Если игрок уже сделал 1 или 2 отрезка, даём ему продолжить.
    if (s.phase === "simple" && s.turnSegments.length > 0) {
      return false;
    }

    // В онлайне автоматическое решение принимает только хост.
    if (PF.online && PF.online.room && !PF.online.isHost) {
      return false;
    }

    const targets =
      s.phase === "simple"
        ? PF.rules.legalSimpleTargets(s)
        : PF.rules.legalPenaltyTargets(s);

    if (targets.length > 0) {
      return false;
    }

    console.warn("No legal moves detected", {
      phase: s.phase,
      turnSegments: s.turnSegments.length,
      ball: s.ball,
      visitedCount: s.visited.size,
      segmentsCount: s.segments.length
    });

    if (s.phase === "simple") {
      const next = this.other(s.currentPlayer);

      PF.history.add(
        s,
        `Нет допустимых ходов. Пенальти пробивает ${s.players[next]}.`,
        "warn"
      );

      this.startTurn(next, "penalty");

      if (PF.online && PF.online.room) {
        PF.online.updateRoomState(s);
      }

      return true;
    }

    this.declareDraw("Ничья: у игроков нет допустимых ходов.");

    return true;
  },

  other(player) {
    return player === 1 ? 2 : 1;
  },

  startMatch(p1, p2, cloudProfiles = null) {
    if (this.state && this.state.noMoveTimer) {
      clearTimeout(this.state.noMoveTimer);
    }

    clearInterval(this.timerId);

    this.state = PF.state.create({ 1: p1, 2: p2 });
    if (cloudProfiles && (cloudProfiles.p1 || cloudProfiles.p2)) {
      this.state.cloud = cloudProfiles;
    }

    PF.ui.showGame();
    PF.history.clear(this.state);
    PF.history.add(
      this.state,
      `Матч начался. Первым ходит ${this.state.players[this.state.currentPlayer]}.`,
      "event"
    );
    if (this.state.cloud?.p1 || this.state.cloud?.p2) {
      PF.history.add(
        this.state,
        "Облачная статистика включена.",
        "event"
      );
    }
    if (PF.save) {
      PF.save.logStart(this.state);
    }

    PF.ui.setMessage("Игра началась.");
    this.startTurn(this.state.currentPlayer, "simple");
    this.autoHandleNoMoves();
  },
  startOnlineMatch(room) {
    if (PF.ai) {
      PF.ai.enabled = false;
      PF.ai.stop();
    }
    const state = room.state;

    this.state = PF.state.create(state.players);

    this.state.currentPlayer = state.currentPlayer;
    this.state.phase = state.phase;
    this.state.ball = PF.geo.clone(state.ball);
    this.state.displayBall = PF.geo.clone(state.displayBall);
    this.state.turnStartBall = PF.geo.clone(state.turnStartBall);
    this.state.path = state.path.map(p => PF.geo.clone(p));
    this.state.visited = new Set(state.visited);
    this.state.segments = state.segments.map(s => ({
      a: PF.geo.clone(s.a),
      b: PF.geo.clone(s.b),
      player: s.player,
      penalty: s.penalty
    }));
    this.state.turnSegments = state.turnSegments;
    this.state.turnVisited = state.turnVisited;
    this.state.events = state.events;
    this.state.lastSegment = state.lastSegment ? {
      a: PF.geo.clone(state.lastSegment.a),
      b: PF.geo.clone(state.lastSegment.b),
      player: state.lastSegment.player,
      penalty: state.lastSegment.penalty
    } : null;
    this.state.trail = state.trail.map(t => ({
      x: t.x,
      y: t.y,
      player: t.player
    }));
    this.state.history = state.history;

    PF.ui.showScreen("app");
    PF.ui.updateHUD(this.state);
    PF.ui.updateTimer(this.state);
    PF.render.draw(this.state);
    PF.history.render(this.state);
    if (PF.online && PF.online.isHost) {
      this.autoHandleNoMoves();
    }

    this.resetTimer();

    if (PF.online) {
      PF.online.subscribeToRoom();
    }
  },

  startTurn(player, phase) {
    const s = this.state;
    if (!s) return;

    clearTimeout(s.noMoveTimer);
    s.noMoveTimer = null;

    s.currentPlayer = player;
    s.phase = phase;

    s.turnStartBall = PF.geo.clone(s.ball);
    s.displayBall = PF.geo.clone(s.ball);
    s.path = [PF.geo.clone(s.ball)];

    s.turnSegments = [];
    s.turnVisited = [];
    s.timeoutPending = false;

    this.resetTimer();

    PF.ui.updateHUD(s);
    PF.render.draw(s);

    if (PF.ai) {
      PF.ai.maybePlay();
    }
  },

  resetTimer() {
    const s = this.state;
    if (!s) return;

    clearInterval(this.timerId);

    s.timeLeft = PF.CFG.turnSeconds;
    PF.ui.updateTimer(s);

    this.timerId = setInterval(() => this.tick(), 1000);
  },

  tick() {
    const s = this.state;

    if (!s || s.over || this.paused) return;

    s.timeLeft -= 1;
    PF.ui.updateTimer(s);

    if (s.timeLeft > 0 && s.timeLeft <= 5) {
      PF.audio.tick(s.timeLeft);
    }

    if (s.timeLeft <= 0) {
      clearInterval(this.timerId);

      // В онлайне таймаут обрабатывает только хост.
      if (PF.online && PF.online.room && !PF.online.isHost) {
        return;
      }

      if (s.animating) {
        s.timeoutPending = true;
      } else {
        this.handleTimeout();
      }
    }
  },

  scheduleNoMoveIfNeeded() {
    const s = this.state;
    if (!s || s.over || s.animating) return;
    // В онлайне авто-проверку делает только хост.
    if (PF.online && PF.online.room && !PF.online.isHost) return;
    
    clearTimeout(s.noMoveTimer);
    s.noMoveTimer = null;

    const targets =
      s.phase === "simple"
        ? PF.rules.legalSimpleTargets(s)
        : PF.rules.legalPenaltyTargets(s);

    if (targets.length > 0) return;

    PF.ui.setMessage(
      `У игрока ${s.players[s.currentPlayer]} нет допустимого хода. Назначается пенальти.`
    );

    s.noMoveTimer = setTimeout(() => {
      this.resolveNoMove();
    }, 800);
  },

  resolveNoMove() {
    const s = this.state;
    if (!s || s.over) return;

    clearTimeout(s.noMoveTimer);
    s.noMoveTimer = null;

    s.cannotStreak += 1;
    s.timeoutStreak = 0;
    s.lastDrawOfferBy = null;

    PF.audio.invalid();

    const name = s.players[s.currentPlayer];
    const other = this.other(s.currentPlayer);
    const otherName = s.players[other];

    if (s.cannotStreak >= 2) {
      this.declareDraw("Ничья: нет допустимых ходов два раза подряд.");
      return;
    }

    PF.history.add(
      s,
      `${name} не может ходить. Пенальти пробивает ${otherName}.`,
      "warn"
    );

    if (s.phase === "simple") {
      this.rollbackCurrentSimpleMove();
    }

    this.startTurn(other, "penalty");
    PF.ui.setMessage(`Пенальти пробивает ${otherName}.`);
  },

  clickPoint(target) {
    const s = this.state;
    if (!s || s.over || s.animating || s.timeLeft <= 0) return;
    if (PF.ai && PF.ai.enabled && s.currentPlayer === PF.ai.player) {
      return;
    }

    clearTimeout(s.noMoveTimer);
    s.noMoveTimer = null;

    PF.audio.init();

    if (s.phase === "simple") {
      this.applySimple(target.p);
    } else {
      this.applyPenalty(target.p);
    }
  },

  applySimple(p) {
    const s = this.state;
    if (!s) return;

    // Проверка: если это онлайн-режим и не мой ход, игнорируем
    if (PF.online && PF.online.room && !PF.online.canMakeMove()) {
      PF.audio.invalid();
      PF.ui.setMessage("Сейчас не ваш ход.");
      return;
    }
    const a = PF.geo.clone(s.ball);

    if (!PF.rules.isSimpleSegmentAllowed(s, a, p)) {
      PF.audio.invalid();
      PF.ui.setMessage("Недопустимый ход: выберите подсвеченную точку.");
      return;
    }

    const scorer = PF.rules.segmentScores(a, p);

    this.addSegment(a, p, false);

    s.ball = PF.geo.clone(p);
    s.path.push(PF.geo.clone(p));

    if (!scorer) {
      const k = PF.geo.key(p);
      s.visited.add(k);
      s.turnVisited.push(k);
    }

    PF.audio.move();

    const visual = PF.render.goalVisual(a, p);
    const duration = scorer ? 520 : 160;

    PF.render.animateBall(s, visual, duration, () => {
      if (scorer) {
        if (PF.save) {
          PF.save.logSimple(s, true, scorer);
        }

        this.declareGoal(scorer);
        // Синхронизация с облаком
        if (PF.online && PF.online.room) {
          PF.online.updateRoomState(s);
        }
        return;
      }

      if (s.timeoutPending && s.timeLeft <= 0) {
        s.timeoutPending = false;
        this.handleTimeout();
        return;
      }

      if (s.turnSegments.length >= PF.CFG.simpleSegments) {
        this.completeSimpleMove();
        // Синхронизация с облаком
        if (PF.online && PF.online.room) {
          PF.online.updateRoomState(s);
        }
      } else {
        PF.ui.setMessage(
          `Игрок ${s.players[s.currentPlayer]}: сегмент ${s.turnSegments.length}/${PF.CFG.simpleSegments}.`
        );
        PF.ui.updateHUD(s);
        PF.render.draw(s);
        this.scheduleNoMoveIfNeeded();
         // Синхронизация с облаком
        if (PF.online && PF.online.room) {
          PF.online.updateRoomState(s);
        }
        if (PF.ai) {
          PF.ai.maybePlay();
        }
      }
    });
  },

  completeSimpleMove() {
    const s = this.state;
    if (!s) return;

    PF.history.logSimple(s);
    if (PF.save) {
      PF.save.logSimple(s, false);
    }

    s.timeoutStreak = 0;
    s.cannotStreak = 0;
    s.lastDrawOfferBy = null;

    const next = this.other(s.currentPlayer);

    PF.ui.setMessage(`Ход переходит игроку ${s.players[next]}.`);
    this.startTurn(next, "simple");
    const handled = this.autoHandleNoMoves();
      if (!handled && PF.online && PF.online.room) {
        PF.online.updateRoomState(this.state);
      }
     // Синхронизация с облаком
    if (PF.online && PF.online.room) {
      PF.online.updateRoomState(s);
    }
  },

  applyPenalty(p) {
    const s = this.state;
    if (!s) return;

    const a = PF.geo.clone(s.ball);

    if (!PF.rules.isPenaltyEndpointAllowed(s, a, p)) {
      PF.audio.invalid();
      PF.ui.setMessage("Недопустимое пенальти: выберите подсвещенную точку.");
      return;
    }

    const scorer = PF.rules.segmentScores(a, p);

    this.addSegment(a, p, true);

    s.ball = PF.geo.clone(p);
    s.path = [PF.geo.clone(p)];

    if (!scorer) {
      const k = PF.geo.key(p);
      s.visited.add(k);
    }

    PF.history.logPenalty(s, a, p);
    PF.audio.whistle();

    const visual = PF.render.goalVisual(a, p);
    const duration = scorer ? 620 : 340;

    PF.render.animateBall(s, visual, duration, () => {
      if (scorer) {
        if (PF.save) {
          PF.save.logPenalty(s, a, p, visual, true, scorer);
        }

        this.declareGoal(scorer);
        return;
      }

      if (s.timeoutPending && s.timeLeft <= 0) {
        s.timeoutPending = false;
        this.handleTimeout();
        return;
      }

      s.timeoutStreak = 0;
      s.cannotStreak = 0;
      s.lastDrawOfferBy = null;
      if (PF.save) {
        PF.save.logPenalty(s, a, p, visual, false, null);
      }

      const next = this.other(s.currentPlayer);

      PF.ui.setMessage(`Пенальти пробит. Ход игрока ${s.players[next]}.`);
      this.startTurn(next, "simple");
      const handled = this.autoHandleNoMoves();

      if (!handled && PF.online && PF.online.room) {
        PF.online.updateRoomState(this.state);
      }
    });
         // Синхронизация с облаком
    if (PF.online && PF.online.room) {
      PF.online.updateRoomState(s);
    }
  },

  addSegment(a, b, penalty) {
    const s = this.state;
    if (!s) return;

    const seg = {
      a: PF.geo.clone(a),
      b: PF.geo.clone(b),
      player: s.currentPlayer,
      penalty
    };

    const sk = PF.geo.segmentKey(seg.a, seg.b);

    s.segments.push(seg);
    s.segmentSet.add(sk);
    s.turnSegments.push({ seg, sk });
    s.lastSegment = seg;
  },

  rollbackCurrentSimpleMove() {
    const s = this.state;
    if (!s) return;

    while (s.turnSegments.length) {
      const item = s.turnSegments.pop();
      s.segments.pop();
      s.segmentSet.delete(item.sk);
    }

    for (const k of s.turnVisited) {
      s.visited.delete(k);
    }

    s.turnVisited = [];
    s.ball = PF.geo.clone(s.turnStartBall);
    s.displayBall = PF.geo.clone(s.ball);
    s.path = [PF.geo.clone(s.ball)];
    s.lastSegment = s.segments.length
      ? s.segments[s.segments.length - 1]
      : null;

    s.trail = [];
  },

  handleTimeout() {
    const s = this.state;
    if (!s || s.over) return;

    clearInterval(this.timerId);

    s.timeoutStreak += 1;
    s.cannotStreak = 0;
    s.lastDrawOfferBy = null;

    PF.audio.timeout();

    const name = s.players[s.currentPlayer];
    const other = this.other(s.currentPlayer);
    const otherName = s.players[other];

    if (s.timeoutStreak >= 4) {
      this.declareDraw("Ничья: 4 срыва времени подряд.");
      return;
    }

    PF.history.add(
      s,
      `${name} не успел. Пенальти пробивает ${otherName}.`,
      "warn"
    );

    if (s.phase === "simple") {
      this.rollbackCurrentSimpleMove();
    }

    this.startTurn(other, "penalty");
    const handled = this.autoHandleNoMoves();

    if (!handled && PF.online && PF.online.room) {
      PF.online.updateRoomState(this.state);
    }
    PF.ui.setMessage(`Время вышло. Пенальти пробивает ${otherName}.`);
         // Синхронизация с облаком
    if (PF.online && PF.online.room) {
      PF.online.updateRoomState(s);
    }
  },

  offerDraw() {
    const s = this.state;
    if (!s || s.over || s.animating) return;

    const other = this.other(s.currentPlayer);

    if (s.lastDrawOfferBy === other) {
      this.declareDraw("Ничья: оба игрока подряд предложили ничью.");
      return;
    }

    s.lastDrawOfferBy = s.currentPlayer;

    if (s.phase === "simple") {
      this.rollbackCurrentSimpleMove();
    }

    PF.history.add(
      s,
      `${s.players[s.currentPlayer]} предложил ничью. Ход переходит к ${s.players[other]}.`,
      "event"
    );

    PF.ui.setMessage(
      `${s.players[s.currentPlayer]} предложил ничью. Ход переходит к ${s.players[other]}.`
    );

    this.startTurn(other, "simple");
  },

  declareGoal(scorer) {
    const s = this.state;
    if (!s || s.over) return;

    clearInterval(this.timerId);
    clearTimeout(s.noMoveTimer);

    s.over = true;
    s.phase = "goal";

    const scorerName = s.players[scorer];

    s.result = {
      type: "goal",
      winner: scorer,
      text: `Гол! ${scorerName} побеждает.`
    };

    PF.audio.goal();

    if (PF.save) {
      PF.save.logSimple?.(s, true, scorer);
    }

    PF.history.logGoal(s, scorer);

    PF.ui.showResultOverlay(`Гол! ${scorerName}`, "goal");
    PF.ui.setMessage(`Гол! ${scorerName} побеждает.`);
    PF.ui.updateHUD(s);
    PF.render.draw(s);

    if (PF.online && PF.online.room) {
      if (PF.online.isHost) {
        PF.online.finishOnlineMatch(s);
      } else {
        PF.online.updateRoomState(s, true);
      }
    }
  },

  declareDraw(reason) {
    const s = this.state;
    if (!s || s.over) return;

    clearInterval(this.timerId);
    clearTimeout(s.noMoveTimer);

    s.over = true;
    s.phase = "draw";

    s.result = {
      type: "draw",
      text: reason || "Ничья."
    };

    PF.audio.draw();

    PF.history.logDraw(s, reason);

    PF.ui.showResultOverlay(s.result.text, "draw");
    PF.ui.setMessage(s.result.text);
    PF.ui.updateHUD(s);
    PF.render.draw(s);

    if (PF.save) {
      PF.save.logDraw?.(s, reason);
      PF.save.autoSaveCurrent?.();
    }

    if (PF.online && PF.online.room) {
      if (PF.online.isHost) {
        PF.online.finishOnlineMatch(s);
      } else {
        PF.online.updateRoomState(s, true);
      }
    }
  },

  newMatch() {
    const s = this.state;

    if (s && s.players && s.players[1] && s.players[2]) {
      this.startMatch(s.players[1], s.players[2]);
    } else {
      PF.ui.showAuth();
    }
  },

  logout() {
    if (this.state && this.state.noMoveTimer) {
      clearTimeout(this.state.noMoveTimer);
    }

    clearInterval(this.timerId);
    this.state = null;
    if (PF.ai) {
      PF.ai.stop();
    }

    PF.ui.showAuth();
    PF.ui.setMessage("");
  },
  startOnlineMatch(room) {
    const state = room.state;
  
    this.state = PF.state.create(state.players);
  
    this.state.currentPlayer = state.currentPlayer;
    this.state.phase = state.phase;
    this.state.ball = PF.geo.clone(state.ball);
    this.state.displayBall = PF.geo.clone(state.displayBall);
    this.state.turnStartBall = PF.geo.clone(state.turnStartBall);
    this.state.path = state.path.map(p => PF.geo.clone(p));
    this.state.visited = new Set(state.visited);
    this.state.segments = state.segments.map(s => ({
      a: PF.geo.clone(s.a),
      b: PF.geo.clone(s.b),
      player: s.player,
      penalty: s.penalty
    }));
    this.state.turnSegments = state.turnSegments;
    this.state.turnVisited = state.turnVisited;
    this.state.events = state.events;
    this.state.lastSegment = state.lastSegment ? {
      a: PF.geo.clone(state.lastSegment.a),
      b: PF.geo.clone(state.lastSegment.b),
      player: state.lastSegment.player,
      penalty: state.lastSegment.penalty
    } : null;
    this.state.trail = state.trail.map(t => ({
      x: t.x,
      y: t.y,
      player: t.player
    }));
    this.state.history = state.history;
  
    PF.ui.showGame();
    PF.ui.updateHUD(this.state);
    PF.ui.updateTimer(this.state);
    PF.render.draw(this.state);
    PF.history.render(this.state);
  
    this.resetTimer();
  
    if (PF.online) {
      PF.online.subscribeToRoom();
    }
  }  
};
