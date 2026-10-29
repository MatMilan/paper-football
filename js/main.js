document.addEventListener("DOMContentLoaded", async () => {
  PF.render.init(document.getElementById("board"));
  PF.ui.init();

  const canvas = PF.render.canvas;

  canvas.addEventListener("click", (e) => {
    if (PF.replay && PF.replay.active) return;

    const state = PF.game.state;
    if (!state || state.over || state.animating) return;

    if (PF.online && PF.online.room && !PF.online.canMakeMove()) {
      PF.audio.invalid();
      PF.ui.setMessage("Сейчас не ваш ход.");
      return;
    }

    const c = PF.render.eventToCanvas(e);
    const target = PF.render.findTarget(c.x, c.y);

    if (target) {
      PF.game.clickPoint(target);
    } else {
      PF.audio.invalid();
      PF.ui.setMessage("Недопустимый ход: выберите подсвещенную точку.");
    }
  });

  document.addEventListener("pointerdown", () => PF.audio.init(), { once: true });

  document.addEventListener("pointerdown", () => {
    if (PF.audio.ctx && PF.audio.ctx.state === "suspended") {
      PF.audio.ctx.resume();
    }
  });

  if (PF.cloud) {
    PF.cloud.init();

    if (PF.cloud.ready) {
      PF.cloud.client.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth state changed:", event);

        if (event === "SIGNED_IN" && session) {
          try {
            await PF.cloud.getOrCreateProfile();

            // Если уже есть активный онлайн-матч — НЕ показываем меню.
            if (PF.game.state && !PF.game.state.over) {
              return;
            }

            const restored = await PF.ui.tryRestoreOnline();
            if (!restored) {
              PF.ui.showMenu();
            }
          } catch (e) {
            console.error("Error loading profile:", e);
          }
        }
      });
    }
  }

  // Возврат во вкладку: подтягиваем актуальное состояние комнаты.
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;

    if (PF.online && PF.online.room && PF.game.state && !PF.game.state.over) {
      await PF.online.refreshRoom();
    }
  });
});
