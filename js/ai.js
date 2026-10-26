PF.ai = {
  enabled: false,
  player: 2,
  timer: null,

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  },

  maybePlay() {
    const s = PF.game.state;

    if (!this.enabled) return;
    if (!s) return;
    if (s.over) return;
    if (s.animating) return;
    if (s.currentPlayer !== this.player) return;

    this.stop();

    const delay = s.phase === "penalty" ? 750 : 700;

    this.timer = setTimeout(() => {
      this.makeMove();
    }, delay);
  },

  makeMove() {
    const s = PF.game.state;

    if (!this.enabled) return;
    if (!s) return;
    if (s.over) return;
    if (s.animating) return;
    if (s.currentPlayer !== this.player) return;
    if (s.timeLeft <= 0) return;

    if (s.phase === "simple") {
      const targets = PF.rules.legalSimpleTargets(s);

      if (!targets.length) {
        return;
      }

      const best = this.chooseSimple(s, targets);
      PF.game.applySimple(best);
    } else {
      const targets = PF.rules.legalPenaltyTargets(s);

      if (!targets.length) {
        return;
      }

      const best = this.choosePenalty(s, targets);
      PF.game.applyPenalty(best);
    }
  },

  progressScore(s, p) {
    const dir = this.player === 2 ? 1 : -1;
    const centerX = PF.CFG.cellsX / 2;

    let score = 0;

    // Игрок 2 атакует вниз, поэтому чем ниже, тем лучше.
    // Если ИИ когда-нибудь будет играть за игрока 1, он будет атаковать вверх.
    score += dir * p.y * 18;

    // Небольшой бонус за контроль центра поля.
    score -= Math.abs(p.x - centerX) * 2.2;

    // Минимальный рандом, чтобы ходы не были полностью одинаковыми.
    score += Math.random() * 0.25;

    return score;
  },

  chooseSimple(s, targets) {
    let best = null;
    let bestScore = -Infinity;

    for (const p of targets) {
      const scorer = PF.rules.segmentScores(s.ball, p);

      let score = this.progressScore(s, p);

      // Если этот ход забивает гол в нужные ворота — отлично.
      if (scorer === this.player) {
        score += 100000;
      }

      // Если ход приводит к голу в свои ворота — плохо.
      if (scorer && scorer !== this.player) {
        score -= 200000;
      }

      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    return best || targets[0];
  },

  choosePenalty(s, targets) {
    let best = null;
    let bestScore = -Infinity;

    for (const p of targets) {
      const scorer = PF.rules.segmentScores(s.ball, p);

      let score = this.progressScore(s, p);

      // Пенальти в нужные ворота — максимальный приоритет.
      if (scorer === this.player) {
        score += 100000;
      }

      // Автогол — очень плохо.
      if (scorer && scorer !== this.player) {
        score -= 200000;
      }

      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }

    return best || targets[0];
  }
};
