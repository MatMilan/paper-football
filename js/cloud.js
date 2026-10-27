/*
  Облачный модуль на Supabase.
  Отвечает за:
  - профили игроков;
  - авторизацию имя + PIN;
  - рейтинг Эло;
  - облачную статистику;
  - сохранение матчей;
  - таблицу лидеров.
*/

PF.cloud = {
  // ВСТАВЬ СЮДА СВОИ ДАННЫЕ
  url: "https://xugxqthgpbnzcebbhsxc.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Z3hxdGhncGJuemNlYmJoc3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjIwODAsImV4cCI6MjEwODU5ODA4MH0.zzBSHscadS-Q3roJg7kNPUhc4QR_PXjlvT6xtwP_yhE",

  client: null,
  ready: false,

  init() {
    if (this.ready) return;

    const hasPlaceholder =
      !this.url ||
      !this.anonKey ||
      this.url.includes("PASTE_YOUR_SUPABASE_URL") ||
      this.anonKey.includes("PASTE_YOUR_SUPABASE_ANON_KEY");

    if (hasPlaceholder || !window.supabase) {
      this.ready = false;
      return;
    }

    try {
      this.client = window.supabase.createClient(this.url, this.anonKey);
      this.ready = true;
    } catch (e) {
      console.error("Supabase init error:", e);
      this.ready = false;
    }
  },

  statusText() {
    return this.ready
      ? "Supabase подключен: можно использовать облачную статистику."
      : "Supabase не настроен: будет локальная статистика.";
  },

  /*
    Простая хэш-функция для PIN.
    На GitHub Pages будет работать через crypto.subtle.
    Если открываешь через file:// и защищенного контекста нет,
    используется запасной небезопасный хэш только для локального теста.
  */
  async hashPin(name, pin) {
    const text = `${String(name).toLowerCase()}:${String(pin)}`;

    if (window.crypto && window.crypto.subtle) {
      const data = new TextEncoder().encode(text);
      const digest = await window.crypto.subtle.digest("SHA-256", data);

      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    return `insecure:${this.simpleHash(text)}`;
  },

  simpleHash(str) {
    let hash = 5381;

    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }

    return (hash >>> 0).toString(16);
  },

  /*
    Вход или автоматическая регистрация профиля.
    Если имя не занято — создаем профиль.
    Если имя занято — проверяем PIN.
  */
  async loginOrRegister(name, pin) {
    if (!this.ready) {
      throw new Error("Облако не настроено.");
    }

    const cleanName = String(name || "").trim();
    const cleanPin = String(pin || "").trim();

    if (cleanName.length < 2) {
      throw new Error("Имя игрока должно содержать минимум 2 символа.");
    }

    if (cleanPin.length < 4) {
      throw new Error("PIN должен содержать минимум 4 символа.");
    }

    const pinHash = await this.hashPin(cleanName, cleanPin);

    const { data: existing, error: findError } = await this.client
      .from("profiles")
      .select("*")
      .ilike("display_name", cleanName)
      .maybeSingle();

    if (findError) {
      throw new Error(findError.message);
    }

    if (existing) {
      if (existing.pin_hash !== pinHash) {
        throw new Error(`Неверный PIN для игрока «${cleanName}».`);
      }

      return existing;
    }

    const { data: created, error: insertError } = await this.client
      .from("profiles")
      .insert({
        display_name: cleanName,
        pin_hash: pinHash
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(
        `Не удалось создать профиль. Возможно, имя уже занято. (${insertError.message})`
      );
    }

    return created;
  },

  async getProfileById(id) {
    if (!this.ready) {
      throw new Error("Облако не настроено.");
    }

    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  },

  async fetchLeaders() {
    if (!this.ready) {
      throw new Error("Облако не настроено.");
    }

    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .order("rating", { ascending: false })
      .order("wins", { ascending: false })
      .order("games", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  },

  eloExpected(myRating, opponentRating) {
    return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
  },

  /*
    Отправляет результат матча в облако и обновляет рейтинг.
  */
  async syncMatch(state) {
    if (!this.ready) return;
    if (!state) return;
    if (!state.over) return;
    if (state.cloudSyncing || state.cloudSynced) return;

    const p1Cloud = state.cloud?.p1;
    const p2Cloud = state.cloud?.p2;

    if (!p1Cloud?.id && !p2Cloud?.id) return;

    const result = state.result;
    if (!result || (result.type !== "goal" && result.type !== "draw")) return;

    state.cloudSyncing = true;

    try {
      const isDraw = result.type === "draw";

      // Сценарий 1: Игра против ИИ (p2Cloud отсутствует)
      if (p1Cloud?.id && !p2Cloud?.id) {
        const p1 = await this.getProfileById(p1Cloud.id);
        if (!p1) throw new Error("Профиль Игрока 1 не найден.");

        const update1 = { games: p1.games + 1 };

        if (isDraw) {
          update1.draws = p1.draws + 1;
        } else if (result.winner === 1) {
          update1.wins = p1.wins + 1;
          update1.goals_for = p1.goals_for + 1;
        } else {
          update1.losses = p1.losses + 1;
          update1.goals_against = p1.goals_against + 1;
        }

        await this.client.from("profiles").update(update1).eq("id", p1.id);

        await this.client.from("matches").insert({
          player1_profile_id: p1.id,
          player2_profile_id: null, // ИИ
          winner_profile_id: result.winner === 1 ? p1.id : null,
          is_draw: isDraw,
          score: result,
          events: state.events || []
        });

      // Сценарий 2: Игра PvP (оба в облаке)
      } else if (p1Cloud?.id && p2Cloud?.id) {
        const p1 = await this.getProfileById(p1Cloud.id);
        const p2 = await this.getProfileById(p2Cloud.id);
        if (!p1 || !p2) throw new Error("Профиль не найден.");

        const score1 = isDraw ? 0.5 : result.winner === 1 ? 1 : 0;
        const score2 = isDraw ? 0.5 : result.winner === 2 ? 1 : 0;

        const expected1 = this.eloExpected(p1.rating, p2.rating);
        const expected2 = this.eloExpected(p2.rating, p1.rating);
        const K = 32;

        const newRating1 = Math.max(100, Math.round(p1.rating + K * (score1 - expected1)));
        const newRating2 = Math.max(100, Math.round(p2.rating + K * (score2 - expected2)));

        const update1 = { rating: newRating1, games: p1.games + 1 };
        const update2 = { rating: newRating2, games: p2.games + 1 };

        if (isDraw) {
          update1.draws = p1.draws + 1;
          update2.draws = p2.draws + 1;
        } else if (score1 === 1) {
          update1.wins = p1.wins + 1;
          update2.losses = p2.losses + 1;
        } else {
          update1.losses = p1.losses + 1;
          update2.wins = p2.wins + 1;
        }

        if (result.type === "goal") {
            if (result.winner === 1) {
            update1.goals_for = p1.goals_for + 1;
            update2.goals_against = p2.goals_against + 1;
          } else {
            update1.goals_against = p1.goals_against + 1;
            update2.goals_for = p2.goals_for + 1;
          }
        }

        await this.client.from("profiles").update(update1).eq("id", p1.id);
        await this.client.from("profiles").update(update2).eq("id", p2.id);

        await this.client.from("matches").insert({
          player1_profile_id: p1.id,
          player2_profile_id: p2.id,
          winner_profile_id: result.winner === 1 ? p1.id : p2.id,
          is_draw: isDraw,
          score: result,
          events: state.events || []
        });
      }

      state.cloudSynced = true;

      if (PF.history) {
        PF.history.add(state, "Облако: результат матча и статистика сохранены.", "event");
      }
    } catch (e) {
      console.error("Cloud sync error:", e);
      if (PF.history) {
        PF.history.add(state, `Облако: ошибка сохранения (${e.message}).`, "warn");
      }
    } finally {
      state.cloudSyncing = false;
    }
  }
};
