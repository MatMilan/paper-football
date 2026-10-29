PF.audio = {
  ctx: null,
  enabled: localStorage.getItem("pf_sound_enabled") !== "0",

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    if (!this.ctx) {
      this.ctx = new AC();
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  },

  save() {
    localStorage.setItem("pf_sound_enabled", this.enabled ? "1" : "0");
  },

  tone(freq, duration = 0.08, type = "sine", gain = 0.05, delay = 0) {
    if (!this.enabled || !this.ctx) return;

    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(g);
    g.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + duration + 0.03);
  },

  click() {
    this.tone(620, 0.045, "triangle", 0.04);
  },

  move() {
    this.tone(430, 0.06, "triangle", 0.05);
  },

  invalid() {
    this.tone(170, 0.14, "sawtooth", 0.055);
  },

  tick(sec) {
    const freq = sec <= 1 ? 1568 : sec === 2 ? 1319 : sec === 3 ? 1175 : sec === 4 ? 1047 : 880;
    this.tone(freq, 0.06, "square", 0.045);
  },

  timeout() {
    this.tone(220, 0.2, "sawtooth", 0.06);
  },

  whistle() {
    this.tone(1900, 0.16, "square", 0.05);
    this.tone(1450, 0.2, "square", 0.045, 0.16);
  },
  opponentMove() {
    this.tone(880, 0.06, "sine", 0.04);
  },

  yourTurn() {
    this.tone(660, 0.08, "sine", 0.05);
    this.tone(880, 0.08, "sine", 0.05, 0.1);
  },

  goal() {
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone(f, 0.13, "triangle", 0.065, i * 0.09);
    });
  },

  draw() {
    [440, 349].forEach((f, i) => {
      this.tone(f, 0.17, "sine", 0.05, i * 0.13);
    });
  }
};
