  PF.game = {
  state: null,
  timerId: null,

  other(player) {
    return player === 1 ? 2 : 1;
  },

  startMatch(p1, p2, cloudProfiles = null) {
    if (this.state && this.state.noMoveTimer) {
      clearTimeout(this.state.noMoveTimer);
    }

    clearInterval(this.timerId);

    this.state = PF.state.create({ 1: p1, 2: p2 });
    if (cloudProfiles && cloudProfiles.p1 && cloudProfiles.p2) {
      this.state.cloud = cloudProfiles;
    }

    PF.ui.showGame();
    PF.history.clear(this.state);
    PF.history.add(
      this.state,
      `Матч начался. Первым ходит ${this.state.players[this.state.currentPlayer]}.`,
      "event"
    );
    if (this.state.cloud?.p1 && this.state.cloud?.p2) {
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

    this.scheduleNoMoveIfNeeded();
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
    if (!s || s.over) return;

    s.timeLeft -= 1;
    PF.ui.updateTimer(s);

    if (s.timeLeft > 0 && s.timeLeft <= 5) {
      PF.audio.tick(s.timeLeft);
    }

    if (s.timeLeft <= 0) {
      clearInterval(this.timerId);

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
        return;
      }

      if (s.timeoutPending && s.timeLeft <= 0) {
        s.timeoutPending = false;
        this.handleTimeout();
        return;
      }

      if (s.turnSegments.length >= PF.CFG.simpleSegments) {
        this.completeSimpleMove();
      } else {
        PF.ui.setMessage(
          `Игрок ${s.players[s.currentPlayer]}: сегмент ${s.turnSegments.length}/${PF.CFG.simpleSegments}.`
        );
        PF.ui.updateHUD(s);
        PF.render.draw(s);
        this.scheduleNoMoveIfNeeded();
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
    });
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
    PF.ui.setMessage(`Время вышло. Пенальти пробивает ${otherName}.`);
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
    if (PF.ai) {
      PF.ai.stop();
    }

    const scorerName = s.players[scorer];
    s.result = {
      type: "goal",
      winner: scorer,
      text: `Гол! ${scorerName} побеждает.`
    };
    const concededName = s.players[this.other(scorer)];

    PF.audio.goal();

    PF.stats.finishGame({
      p1: s.players[1],
      p2: s.players[2],
      winnerName: scorerName,
      draw: false,
      scorerName,
      concededName
    });

    PF.history.logGoal(s, scorer);
    if (PF.save) {
      PF.save.autoSaveCurrent();
    }
    if (PF.cloud) {
      PF.cloud.syncMatch(s);
    }
    PF.ui.showGoalOverlay(scorerName);
    PF.ui.setMessage(`Гол! ${scorerName} побеждает.`);
    PF.ui.updateHUD(s);
    PF.render.draw(s);
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
    if (PF.ai) {
      PF.ai.stop();
    }

    PF.audio.draw();

    PF.stats.finishGame({
      p1: s.players[1],
      p2: s.players[2],
      draw: true
    });

    PF.history.logDraw(s, reason);
    if (PF.save) {
      PF.save.logDraw(s, reason);
      PF.save.autoSaveCurrent();
    }
    if (PF.cloud) {
      PF.cloud.syncMatch(s);
    }
    PF.ui.setMessage(reason);
    PF.ui.updateHUD(s);
    PF.render.draw(s);
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
  }
};
