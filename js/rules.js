PF.rules = {
  isInsideField(p) {
    return (
      p.x >= 0 &&
      p.x <= PF.CFG.cellsX &&
      p.y >= 0 &&
      p.y <= PF.CFG.cellsY
    );
  },

  isAdjacent(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
  },

  isTopBottomHorizontalBlocked(a, b) {
    if (a.y !== b.y) return false;
    if (a.y !== 0 && a.y !== PF.CFG.cellsY) return false;

    const minx = Math.min(a.x, b.x);
    const maxx = Math.max(a.x, b.x);

    const insideGoalMouth =
      minx >= PF.CFG.GOAL_LEFT && maxx <= PF.CFG.GOAL_RIGHT;

    return !insideGoalMouth;
  },

  segmentScores(a, b) {
    const EPS = 1e-9;

    // Верхние ворота: пересечение линии y = 0 из поля наружу.
    if (a.y >= 0 && b.y < 0) {
      const t = a.y === 0 ? 0 : (0 - a.y) / (b.y - a.y);

      if (t >= -EPS && t <= 1 + EPS) {
        const x = a.x + (b.x - a.x) * t;
        if (x >= PF.CFG.GOAL_LEFT - EPS && x <= PF.CFG.GOAL_RIGHT + EPS) {
          return 1;
        }
      }
    }

    // Нижние ворота: пересечение линии y = cellsY из поля наружу.
    if (a.y <= PF.CFG.cellsY && b.y > PF.CFG.cellsY) {
      const t =
        a.y === PF.CFG.cellsY
          ? 0
          : (PF.CFG.cellsY - a.y) / (b.y - a.y);

      if (t >= -EPS && t <= 1 + EPS) {
        const x = a.x + (b.x - a.x) * t;
        if (x >= PF.CFG.GOAL_LEFT - EPS && x <= PF.CFG.GOAL_RIGHT + EPS) {
          return 2;
        }
      }
    }

    return 0;
  },

  canCompleteFrom(state, current, done, localVisited, localSegments) {
    if (done >= PF.CFG.simpleSegments) return true;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const next = {
          x: current.x + dx,
          y: current.y + dy
        };

        if (this.isTopBottomHorizontalBlocked(current, next)) continue;

        if (PF.geo.isBlockedBySegments(state.segments, current, next, localSegments)) {
          continue;
        }

        if (this.segmentScores(current, next)) return true;

        if (!this.isInsideField(next)) continue;

        const nk = PF.geo.key(next);
        if (state.visited.has(nk) || localVisited.has(nk)) continue;

        localVisited.add(nk);
        localSegments.push({
          a: PF.geo.clone(current),
          b: PF.geo.clone(next)
        });

        if (this.canCompleteFrom(state, next, done + 1, localVisited, localSegments)) {
          return true;
        }

        localSegments.pop();
        localVisited.delete(nk);
      }
    }

    return false;
  },

  isSimpleSegmentAllowed(state, a, b) {
    if (state.phase !== "simple") return false;
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y)) return false;
    if (!this.isAdjacent(a, b)) return false;

    if (this.isTopBottomHorizontalBlocked(a, b)) return false;

    if (PF.geo.isBlockedBySegments(state.segments, a, b, [])) return false;

    if (this.segmentScores(a, b)) return true;

    if (!this.isInsideField(b)) return false;
    if (state.visited.has(PF.geo.key(b))) return false;

    const done = state.turnSegments.length + 1;
    if (done >= PF.CFG.simpleSegments) return true;

    const localVisited = new Set([PF.geo.key(b)]);
    const localSegments = [{ a: PF.geo.clone(a), b: PF.geo.clone(b) }];

    return this.canCompleteFrom(state, b, done, localVisited, localSegments);
  },

  isPenaltyEndpointAllowed(state, a, b) {
    if (state.phase !== "penalty") return false;
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y)) return false;

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const isPenaltyVector = PF.PENALTY_VECTORS.some(
      v => v.dx === dx && v.dy === dy
    );

    if (!isPenaltyVector) return false;

    if (this.isTopBottomHorizontalBlocked(a, b)) return false;

    // Если пенальти пересекает линию ворот — гол разрешен,
    // даже если конечная точка оказалась за пределами поля.
    if (this.segmentScores(a, b)) return true;

    // Если гол не забит, конечная точка обязательно должна быть в поле.
    if (!this.isInsideField(b)) return false;

    if (state.visited.has(PF.geo.key(b))) return false;

    return true;
  },

  legalSimpleTargets(state) {
    const result = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const p = {
          x: state.ball.x + dx,
          y: state.ball.y + dy
        };

        if (this.isSimpleSegmentAllowed(state, state.ball, p)) {
          result.push(p);
        }
      }
    }

    return result;
  },

  legalPenaltyTargets(state) {
    const result = [];

    for (const v of PF.PENALTY_VECTORS) {
      const p = {
        x: state.ball.x + v.dx,
        y: state.ball.y + v.dy
      };

      if (this.isPenaltyEndpointAllowed(state, state.ball, p)) {
        result.push(p);
      }
    }

    return result;
  }
};