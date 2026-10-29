PF.render = {
  highlightSegments: [],
  highlightTimer: null,
  canvas: null,
  ctx: null,
  currentTargets: [],
  animFrame: null,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    canvas.width = PF.CFG.padding * 2 + PF.CFG.cellsX * PF.CFG.cell;
    canvas.height = PF.CFG.padding * 2 + PF.CFG.cellsY * PF.CFG.cell;
  },
  resize() {
    if (!this.canvas) return;

    this.canvas.width = PF.CFG.padding * 2 + PF.CFG.cellsX * PF.CFG.cell;
    this.canvas.height = PF.CFG.padding * 2 + PF.CFG.cellsY * PF.CFG.cell;

    // Если есть активная игра — перерисовываем
    if (PF.game.state) {
      this.draw(PF.game.state);
    }
  },
  highlightLastMove(segments) {
    if (!segments || !segments.length) return;

    this.highlightSegments = segments;

    clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => {
      this.highlightSegments = [];
      if (PF.game.state) {
        this.draw(PF.game.state);
      }
    }, 2500);
  },

  eventToCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();

    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  },

  findTarget(x, y) {
    let best = null;
    let bestD = Infinity;

    for (const t of this.currentTargets) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }

    const radius = Math.max(17, PF.CFG.cell * 0.85);
    return bestD <= radius ? best : null;
  },

  prepareTargets(state) {
    if (!state || state.over || state.animating) {
      this.currentTargets = [];
      return;
    }

    const logical =
      state.phase === "simple"
        ? PF.rules.legalSimpleTargets(state)
        : PF.rules.legalPenaltyTargets(state);

    this.currentTargets = logical.map(p => {
      const raw = PF.geo.toCanvas(p);

      const x = PF.geo.clamp(raw.x, 16, this.canvas.width - 16);
      const y = PF.geo.clamp(raw.y, 16, this.canvas.height - 16);

      return {
        p,
        x,
        y,
        offscreen: raw.x !== x || raw.y !== y,
        score: PF.rules.segmentScores(state.ball, p)
      };
    });
  },

  goalVisual(a, b) {
    const score = PF.rules.segmentScores(a, b);
    if (!score) return PF.geo.clone(b);

    if (score === 1) {
      const t = a.y === 0 ? 0 : (0 - a.y) / (b.y - a.y);
      const x = a.x + (b.x - a.x) * t;
      return { x, y: -0.45 };
    }

    const t =
      a.y === PF.CFG.cellsY
        ? 0
        : (PF.CFG.cellsY - a.y) / (b.y - a.y);

    const x = a.x + (b.x - a.x) * t;
    return { x, y: PF.CFG.cellsY + 0.45 };
  },

  animateBall(state, to, duration, cb) {
    cancelAnimationFrame(this.animFrame);

    const from = PF.geo.clone(state.displayBall);
    const start = performance.now();

    state.animating = true;

    const step = (now) => {
      if (PF.game.state !== state) return;

      const t = Math.min(1, (now - start) / duration);

      state.displayBall = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      };
      state.trail = state.trail || [];

      state.trail.push({
        x: state.displayBall.x,
        y: state.displayBall.y,
        player: state.currentPlayer
      });

      if (state.trail.length > 16) {
        state.trail.shift();
      }

      this.draw(state);

      if (t < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        state.animating = false;
        if (cb) cb();

        // Применяем состояние соперника, которое ждало конца анимации.
        if (PF.online) {
          PF.online.flushPending();
        }
      }
    };

    this.animFrame = requestAnimationFrame(step);
  },

  draw(state) {
    if (!state) return;

    this.prepareTargets(state);

    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGoals(ctx);
    this.drawGrid(ctx);
    this.drawPoints(ctx, state);
    this.drawSegments(ctx, state);
    this.drawGoalLabels(ctx, state);

    if (!state.animating) {
      this.drawTargets(ctx, state);
    }

    this.drawBall(ctx, state);
  },

  drawGoals(ctx) {
    const topA = PF.geo.toCanvas({ x: PF.CFG.GOAL_LEFT, y: -1 });
    const topB = PF.geo.toCanvas({ x: PF.CFG.GOAL_RIGHT, y: 0 });

    ctx.save();

    ctx.fillStyle = "rgba(255,93,93,.16)";
    ctx.strokeStyle = "rgba(255,93,93,.68)";
    ctx.lineWidth = 2;

    ctx.fillRect(topA.x, topA.y, topB.x - topA.x, topB.y - topA.y);
    ctx.strokeRect(topA.x, topA.y, topB.x - topA.x, topB.y - topA.y);

    const botA = PF.geo.toCanvas({ x: PF.CFG.GOAL_LEFT, y: PF.CFG.cellsY });
    const botB = PF.geo.toCanvas({ x: PF.CFG.GOAL_RIGHT, y: PF.CFG.cellsY + 1 });

    ctx.fillStyle = "rgba(93,155,255,.16)";
    ctx.strokeStyle = "rgba(93,155,255,.68)";

    ctx.fillRect(botA.x, botA.y, botB.x - botA.x, botB.y - botA.y);
    ctx.strokeRect(botA.x, botA.y, botB.x - botA.x, botB.y - botA.y);

    ctx.restore();
  },

  drawGrid(ctx) {
    ctx.save();

    ctx.strokeStyle = "#d8d0ba";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= PF.CFG.cellsX; x++) {
      const a = PF.geo.toCanvas({ x, y: 0 });
      const b = PF.geo.toCanvas({ x, y: PF.CFG.cellsY });
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }

    for (let y = 0; y <= PF.CFG.cellsY; y++) {
      const a = PF.geo.toCanvas({ x: 0, y });
      const b = PF.geo.toCanvas({ x: PF.CFG.cellsX, y });
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }

    ctx.stroke();

    const tl = PF.geo.toCanvas({ x: 0, y: 0 });
    const br = PF.geo.toCanvas({ x: PF.CFG.cellsX, y: PF.CFG.cellsY });

    ctx.strokeStyle = "#8f8874";
    ctx.lineWidth = 2;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    ctx.restore();
  },

  drawPoints(ctx, state) {
    ctx.save();

    ctx.fillStyle = "rgba(43,43,43,.20)";

    for (let x = 0; x <= PF.CFG.cellsX; x++) {
      for (let y = 0; y <= PF.CFG.cellsY; y++) {
        const p = PF.geo.toCanvas({ x, y });
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = "rgba(43,43,43,.42)";

    for (const k of state.visited) {
      const [x, y] = k.split(",").map(Number);
      const p = PF.geo.toCanvas({ x, y });

      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },

  drawSegments(ctx, state) {
    ctx.save();
    ctx.lineCap = "round";

    for (const s of state.segments) {
      const a = PF.geo.toCanvas(s.a);
      const b = PF.geo.toCanvas(s.b);

      const isLast = state.lastSegment && state.lastSegment === s;
      const isHighlighted = this.highlightSegments.includes(s);

      const baseColor =
        s.player === 1
          ? "rgba(255,93,93,.92)"
          : "rgba(93,155,255,.92)";

      const glowColor =
        s.player === 1
          ? "#ff5d5d"
          : "#5d9bff";

      ctx.strokeStyle = baseColor;
      ctx.lineWidth = s.penalty ? 4 : 3;

      if (isHighlighted) {
        // Яркая подсветка последнего хода соперника
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 20;
        ctx.lineWidth += 2;
      } else if (isLast) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 14;
        ctx.lineWidth += 1.4;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.setLineDash(s.penalty ? [10, 7] : []);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();
  },

  drawTargets(ctx, state) {
    ctx.save();

    for (const t of this.currentTargets) {
      let fill;
      let stroke;

      if (t.score === 1) {
        fill = "rgba(255,93,93,.22)";
        stroke = "rgba(255,93,93,.88)";
      } else if (t.score === 2) {
        fill = "rgba(93,155,255,.22)";
        stroke = "rgba(93,155,255,.88)";
      } else {
        fill =
          state.currentPlayer === 1
            ? "rgba(255,93,93,.18)"
            : "rgba(93,155,255,.18)";

        stroke =
          state.currentPlayer === 1
            ? "rgba(255,93,93,.78)"
            : "rgba(93,155,255,.78)";
      }

      ctx.beginPath();
      ctx.arc(t.x, t.y, PF.CFG.targetRadius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      if (t.offscreen) {
        ctx.setLineDash([5, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.lineWidth = 1.7;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  },

  drawBall(ctx, state) {
    if (state.trail && state.trail.length) {
      ctx.save();

      for (let i = 0; i < state.trail.length; i++) {
        const t = state.trail[i];
        const progress = (i + 1) / state.trail.length;
        const alpha = progress * 0.22;
        const radius = 2 + progress * 4.4;

        const p = PF.geo.toCanvas(t);

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);

        ctx.fillStyle =
          t.player === 1
            ? `rgba(255,93,93,${alpha})`
            : `rgba(93,155,255,${alpha})`;

        ctx.fill();
      }

      ctx.restore();
    }

    const p = PF.geo.toCanvas(state.displayBall);

    ctx.save();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 7.6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#222";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = state.currentPlayer === 1 ? "#ff5d5d" : "#5d9bff";
    ctx.fill();

    ctx.restore();
  },
  
  drawGoalLabels(ctx, state) {
  if (!state || !state.players) return;

  const centerX = PF.CFG.cellsX / 2;

  const topPos = PF.geo.toCanvas({
    x: centerX,
    y: 1.35
  });

  const bottomPos = PF.geo.toCanvas({
    x: centerX,
    y: PF.CFG.cellsY - 1.35
  });

  const p1 = this.truncateName(state.players[1], 14);
  const p2 = this.truncateName(state.players[2], 14);

  this.drawPillText(
    ctx,
    `${p1} сюда ↑`,
    topPos.x,
    topPos.y,
    "#d64545"
  );

  this.drawPillText(
    ctx,
    `${p2} сюда ↓`,
    bottomPos.x,
    bottomPos.y,
    "#2f6fdb"
  );
},

truncateName(name, max = 14) {
  const clean = String(name || "").trim();

  if (clean.length <= max) {
    return clean;
  }

  return clean.slice(0, max - 1) + "…";
},

drawPillText(ctx, text, x, y, color) {
  ctx.save();

  ctx.font = "700 12px system-ui, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(text);
  const w = metrics.width + 18;
  const h = 21;

  const rx = x - w / 2;
  const ry = y - h / 2;

  ctx.fillStyle = "rgba(255,255,255,.84)";
  this.roundRect(ctx, rx, ry, w, h, 10);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  this.roundRect(ctx, rx, ry, w, h, 10);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 0.5);

  ctx.restore();
},

roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();

  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);

  ctx.closePath();
}
};
