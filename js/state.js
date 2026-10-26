PF.state = {
  create(players) {
    const start = PF.geo.clone(PF.CFG.START);

    return {
      players,
      currentPlayer: Math.random() < 0.5 ? 1 : 2,
      phase: "simple",

      ball: PF.geo.clone(start),
      displayBall: PF.geo.clone(start),
      turnStartBall: PF.geo.clone(start),
      path: [PF.geo.clone(start)],

      visited: new Set([PF.geo.key(start)]),
      segments: [],
      segmentSet: new Set(),

      turnSegments: [],
      turnVisited: [],

      timeLeft: PF.CFG.turnSeconds,
      timeoutStreak: 0,
      cannotStreak: 0,

      lastDrawOfferBy: null,
      over: false,
      animating: false,
      timeoutPending: false,

      history: [],
      noMoveTimer: null
    };
  }
};