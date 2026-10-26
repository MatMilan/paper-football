PF.geo = {
  clone(p) {
    return { x: p.x, y: p.y };
  },

  key(p) {
    return `${p.x},${p.y}`;
  },

  same(a, b) {
    return a.x === b.x && a.y === b.y;
  },

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  segmentKey(a, b) {
    const [p, q] = [a, b].sort((m, n) => (m.x - n.x) || (m.y - n.y));
    return `${p.x},${p.y}|${q.x},${q.y}`;
  },

  toCanvas(p) {
    return {
      x: PF.CFG.padding + p.x * PF.CFG.cell,
      y: PF.CFG.padding + p.y * PF.CFG.cell
    };
  },

  orient(a, b, c) {
    const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (v > 0) return 1;
    if (v < 0) return -1;
    return 0;
  },

  onSegment(a, b, p) {
    return (
      this.orient(a, b, p) === 0 &&
      p.x >= Math.min(a.x, b.x) &&
      p.x <= Math.max(a.x, b.x) &&
      p.y >= Math.min(a.y, b.y) &&
      p.y <= Math.max(a.y, b.y)
    );
  },

  segmentsIntersect(a, b, c, d) {
    const o1 = this.orient(a, b, c);
    const o2 = this.orient(a, b, d);
    const o3 = this.orient(c, d, a);
    const o4 = this.orient(c, d, b);

    if (o1 !== o2 && o3 !== o4) return true;

    if (o1 === 0 && this.onSegment(a, b, c)) return true;
    if (o2 === 0 && this.onSegment(a, b, d)) return true;
    if (o3 === 0 && this.onSegment(c, d, a)) return true;
    if (o4 === 0 && this.onSegment(c, d, b)) return true;

    return false;
  },

  collinearOverlap(a, b, c, d) {
    if (this.orient(a, b, c) !== 0 || this.orient(a, b, d) !== 0) return false;

    const vertical = a.x === b.x && c.x === d.x;

    if (!vertical) {
      const a1 = Math.min(a.x, b.x);
      const a2 = Math.max(a.x, b.x);
      const b1 = Math.min(c.x, d.x);
      const b2 = Math.max(c.x, d.x);

      return Math.max(a1, b1) < Math.min(a2, b2);
    }

    const a1 = Math.min(a.y, b.y);
    const a2 = Math.max(a.y, b.y);
    const b1 = Math.min(c.y, d.y);
    const b2 = Math.max(c.y, d.y);

    return Math.max(a1, b1) < Math.min(a2, b2);
  },

  isBlockedBySegments(segments, a, b, extraSegments = []) {
    const checkSegment = (s) => {
      if (this.segmentKey(a, b) === this.segmentKey(s.a, s.b)) return true;
      if (this.collinearOverlap(a, b, s.a, s.b)) return true;

      if (this.segmentsIntersect(a, b, s.a, s.b)) {
        const startsOnExisting =
          this.same(a, s.a) ||
          this.same(a, s.b) ||
          this.onSegment(s.a, s.b, a);

        if (!startsOnExisting) return true;

        if (!this.same(b, a) && this.onSegment(s.a, s.b, b)) return true;
        if (this.onSegment(a, b, s.a) && !this.same(s.a, a)) return true;
        if (this.onSegment(a, b, s.b) && !this.same(s.b, a)) return true;
      }

      return false;
    };

    for (const s of segments) {
      if (checkSegment(s)) return true;
    }

    for (const s of extraSegments) {
      if (checkSegment(s)) return true;
    }

    return false;
  }
};