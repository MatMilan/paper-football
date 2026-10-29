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
// Предустановленные размеры поля
PF.FIELD_SIZES = {
  "28x38": { cellsX: 28, cellsY: 38, goalWidth: 6, label: "28 × 38 (стандарт)" },
  "20x30": { cellsX: 20, cellsY: 30, goalWidth: 4, label: "20 × 30 (среднее)" },
  "16x24": { cellsX: 16, cellsY: 24, goalWidth: 4, label: "16 × 24 (малое)" }
};

// Доступное время на ход
PF.TURN_TIMES = [20, 30];

// Применить настройки поля и времени
PF.applyGameSettings = function (settings) {
  if (!settings) return;

  if (settings.cellsX) PF.CFG.cellsX = settings.cellsX;
  if (settings.cellsY) PF.CFG.cellsY = settings.cellsY;
  if (settings.goalWidth) PF.CFG.goalWidth = settings.goalWidth;
  if (settings.turnSeconds) PF.CFG.turnSeconds = settings.turnSeconds;

  // Пересчитываем производные значения
  PF.CFG.GOAL_LEFT = (PF.CFG.cellsX - PF.CFG.goalWidth) / 2;
  PF.CFG.GOAL_RIGHT = PF.CFG.GOAL_LEFT + PF.CFG.goalWidth;
  PF.CFG.START = {
    x: PF.CFG.cellsX / 2,
    y: PF.CFG.cellsY / 2
  };

  // Пересобираем векторы пенальти (они не зависят от поля, но на всякий случай)
  // Перерисовываем канвас
  if (PF.render && PF.render.resize) {
    PF.render.resize();
  }
};
