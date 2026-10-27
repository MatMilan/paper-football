PF.cloud = {
  url: "https://xugxqthgpbnzcebbhsxc.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Z3hxdGhncGJuemNlYmJoc3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjIwODAsImV4cCI6MjEwODU5ODA4MH0.zzBSHscadS-Q3roJg7kNPUhc4QR_PXjlvT6xtwP_yhE", 
  
  client: null,
  ready: false,
  currentProfile: null,

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

  async signInWithGoogle() {
    if (!this.ready) throw new Error("Supabase не подключен.");

    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) throw error;
    return data;
  },

  async signInWithEmail(email, password) {
    if (!this.ready) throw new Error("Supabase не подключен.");

    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  },

  async signUpWithEmail(email, password, displayName) {
    if (!this.ready) throw new Error("Supabase не подключен.");

    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName }
      }
    });

    if (error) throw error;
    return data;
  },

  async signOut() {
    if (!this.ready) return;

    await this.client.auth.signOut();
    this.currentProfile = null;
  },

  async getCurrentSession() {
    if (!this.ready) return null;

    const { data: { session } } = await this.client.auth.getSession();
    return session;
  },

  async getOrCreateProfile() {
    const session = await this.getCurrentSession();
    if (!session?.user) return null;

    const userId = session.user.id;
    const email = session.user.email;
    const displayName = session.user.user_metadata?.display_name || 
                       session.user.user_metadata?.full_name ||
                       email?.split("@")[0] || "Игрок";

    let { data: profile, error: selectError } = await this.client
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      console.error("Select profile error:", selectError);
    }

    if (!profile) {
      const { data: newProfile, error: insertError } = await this.client
        .from("profiles")
        .insert({
          user_id: userId,
          display_name: displayName,
          email: email
        })
        .select()
        .single();

      if (insertError) throw insertError;
      profile = newProfile;
    }

    this.currentProfile = profile;
    return profile;
  },

  async getProfileById(id) {
    if (!this.ready || !id) return null;

    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data;
  },

  async getLeaderboard() {
    if (!this.ready) return [];

    const { data, error } = await this.client
      .from("profiles")
      .select("id, display_name, rating, games, wins, draws, losses, goals_for, goals_against")
      .order("rating", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Leaderboard error:", error);
      return [];
    }

    return data || [];
  },

  eloExpected(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  },

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

      // Сценарий 1: Игра против ИИ
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
          player2_profile_id: null,
          winner_profile_id: result.winner === 1 ? p1.id : null,
          is_draw: isDraw,
          score: result,
          events: state.events || []
        });

      // Сценарий 2: PvP
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
