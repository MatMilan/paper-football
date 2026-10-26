document.addEventListener("DOMContentLoaded", () => {
  PF.render.init(document.getElementById("board"));
  PF.ui.init();

  const canvas = PF.render.canvas;

  canvas.addEventListener("click", (e) => {
    const state = PF.game.state;

    if (!state || state.over || state.animating) return;

    const c = PF.render.eventToCanvas(e);
    const target = PF.render.findTarget(c.x, c.y);

    if (target) {
      PF.game.clickPoint(target);
    } else {
      PF.audio.invalid();
      PF.ui.setMessage("Недопустимый ход: выберите подсвещенную точку.");
    }
  });

  document.addEventListener(
    "pointerdown",
    () => {
      PF.audio.init();
    },
    { once: true }
  );

  document.addEventListener("pointerdown", () => {
    if (PF.audio.ctx && PF.audio.ctx.state === "suspended") {
      PF.audio.ctx.resume();
    }
  });
});