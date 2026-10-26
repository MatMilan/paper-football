PF.auth = {
  profilesKey: "pf_profiles_v1",
  lastMatchKey: "pf_last_match_v1",

  getProfiles() {
    try {
      return JSON.parse(localStorage.getItem(this.profilesKey) || "[]");
    } catch {
      return [];
    }
  },

  saveProfiles(list) {
    localStorage.setItem(this.profilesKey, JSON.stringify(list));
  },

  addProfile(name) {
    const clean = String(name || "").trim();
    if (!clean) return;

    const list = this.getProfiles();
    const exists = list.some(
      item => item.toLowerCase() === clean.toLowerCase()
    );

    if (!exists) {
      list.push(clean);
      list.sort((a, b) => a.localeCompare(b, "ru"));
      this.saveProfiles(list);
    }
  },

  findExistingProfile(name) {
    const clean = String(name || "").trim();
    const list = this.getProfiles();
    return (
      list.find(item => item.toLowerCase() === clean.toLowerCase()) || clean
    );
  },

  getLast() {
    try {
      return JSON.parse(
        localStorage.getItem(this.lastMatchKey) || '{"p1":"","p2":""}'
      );
    } catch {
      return { p1: "", p2: "" };
    }
  },

  setLast(p1, p2) {
    localStorage.setItem(this.lastMatchKey, JSON.stringify({ p1, p2 }));
  }
};