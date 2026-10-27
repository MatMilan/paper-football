document.addEventListener("DOMContentLoaded", async () => {
  PF.render.init(document.getElementById("board"));
  PF.ui.init();

  const canvas = PF.render.canvas;

  canvas.addEventListener("click", (e) => {
    if (PF.replay && PF.replay.active) {
      return;
    }

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

  // Инициализация Supabase
  if (PF.cloud) {
    PF.cloud.init();
    
    // Добавь это для отладки
    if (PF.cloud.ready) {
      console.log("Supabase ready");
      
      // Слушаем изменения состояния авторизации
      PF.cloud.client.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth state changed:", event);
        
        if (event === "SIGNED_IN" && session) {
          console.log("User signed in:", session.user);
          
          // Создаём или получаем профиль
          try {
            const profile = await PF.cloud.getOrCreateProfile();
            console.log("Profile loaded:", profile);
            
            // Показываем главное меню
            if (PF.ui) {
              PF.ui.showMenu();
            }
          } catch (e) {
            console.error("Error loading profile:", e);
          }
        }
      });
    }
  }
});
