window.PF = window.PF || {};

PF.CFG = {
  cellsX: 28,
  cellsY: 38,
  goalWidth: 6,
  cell: 18,
  padding: 26,
  turnSeconds: 20,
  simpleSegments: 3,
  historyLimit: 200,
  targetRadius: 9
};

PF.CFG.GOAL_LEFT = (PF.CFG.cellsX - PF.CFG.goalWidth) / 2;
PF.CFG.GOAL_RIGHT = PF.CFG.GOAL_LEFT + PF.CFG.goalWidth;

PF.CFG.START = {
  x: PF.CFG.cellsX / 2,
  y: PF.CFG.cellsY / 2
};

PF.PENALTY_VECTORS = (() => {
  const signs = [-1, 1];
  const candidates = [];

  for (const sx of signs) {
    candidates.push([6 * sx, 0], [0, 6 * sx]);
  }

  for (const sx of signs) {
    for (const sy of signs) {
      candidates.push(
        [6 * sx, 6 * sy],
        [6 * sx, 3 * sy],
        [3 * sx, 6 * sy]
      );
    }
  }

  const seen = new Set();
  const result = [];

  for (const [dx, dy] of candidates) {
    const k = `${dx},${dy}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push({ dx, dy });
    }
  }

  return result;
})();