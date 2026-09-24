// 40-power.js - four D cells -> brushed DC motor -> gear train -> four foam wheels.
// Internally SI (V, A, N.m, rad/s, kg.m^2) because that is how motor data are quoted;
// load torque arrives in dyne.cm and the foam surface speed leaves in cm/s.
//
// All four foam wheels hang off one idler, so they share one angular velocity and one
// flywheel. A car being launched through any nip loads the same motor: several cars in
// the nips at once bog the whole hub, and the pack sags under the current. Both effects
// are visible on the gauges and both are real behaviour of the toy.
(function (HW) {
  const M = HW.math;
  HW.power = {
    create(cfg, foamRcm) {
      const rW = foamRcm / 100;                       // foam wheel radius, m
      const st = {
        on: false, omegaM: 0, Q: 0, I: 0, V0: 0, Rpack: 0, Vterm: 0, soc: 1,
        tauMotor: 0, tauLoadW: 0, wheelAngle: 0, t: 0, energyJ: 0,
      };
      const capC = () => cfg.battCapacityAh * 3600;
      const inertiaM = () => {
        const Jw = 4 * 0.5 * (cfg.foamWheelMassG / 1000) * rW * rW + cfg.trainJ;   // at the wheel shaft
        return cfg.motorJ + Jw / (cfg.gearRatio * cfg.gearRatio);
      };
      const api = {
        state: st,
        foamR: foamRcm,
        setSwitch(on) { if (st.on !== !!on) { st.on = !!on; HW.bus.emit('switch', st.on); } },
        reset() { st.omegaM = 0; st.Q = (1 - cfg.charge) * capC(); st.I = 0; st.t = 0; st.energyJ = 0; },
        setCharge(c) { cfg.charge = M.clamp(c, 0, 1); st.Q = (1 - cfg.charge) * capC(); },
        get omegaW() { return st.omegaM / cfg.gearRatio; },
        get surfaceSpeed() { return (st.omegaM / cfg.gearRatio) * foamRcm; },   // cm/s
        // dt in s; loadDyneCm = total torque the cars exert back on the wheel shaft
        step(dt, loadDyneCm) {
          const soc = M.clamp(1 - st.Q / capC(), 0, 1);
          // alkaline discharge curve, crudely: voltage falls slowly then fast near empty
          const vFrac = Math.pow(soc, 0.35);
          const V0 = cfg.cells * M.lerp(cfg.cellV0Dead, cfg.cellV0Fresh, vFrac);
          const R = cfg.cells * M.lerp(cfg.cellRDead, cfg.cellRFresh, Math.pow(soc, 0.6));
          const G = cfg.gearRatio, w = st.omegaM;
          let I = 0;
          if (st.on) I = (V0 - cfg.motorK * w) / (cfg.motorR + R);
          let tau = cfg.motorK * I - cfg.motorB * w;
          // coulomb friction, with a proper stick at rest
          const fr = cfg.motorFric;
          const tauLoadW = loadDyneCm * 1e-7;                          // N.m at the wheel shaft
          const tauLoadM = tauLoadW >= 0 ? tauLoadW / (G * cfg.gearEff) : tauLoadW * cfg.gearEff / G;
          let net = tau - tauLoadM;
          if (w > 1e-3) net -= fr;
          else if (w < -1e-3) net += fr;
          else if (Math.abs(net) <= fr) net = 0; else net -= Math.sign(net) * fr;
          st.omegaM = w + net / inertiaM() * dt;
          if (!st.on && st.omegaM < 0 && w >= 0) st.omegaM = 0;
          if (st.on) st.Q += Math.max(0, I) * dt * cfg.drainScale;
          st.I = I; st.V0 = V0; st.Rpack = R; st.Vterm = V0 - I * R; st.soc = soc;
          st.tauMotor = tau; st.tauLoadW = tauLoadW; st.t += dt;
          st.energyJ += Math.max(0, st.Vterm * I) * dt;
          st.wheelAngle += (st.omegaM / G) * dt;
          if (st.wheelAngle > 1e4) st.wheelAngle %= 2 * Math.PI;           // keep it bounded
        },
        telemetry() {
          return {
            on: st.on, V: st.Vterm, V0: st.V0, I: st.I, soc: st.soc,
            rpmMotor: HW.units.radToRpm(st.omegaM), rpmWheel: HW.units.radToRpm(st.omegaM / cfg.gearRatio),
            foamSpeed: api.surfaceSpeed, loadNm: st.tauLoadW, powerW: st.Vterm * st.I,
          };
        },
      };
      api.reset();
      return api;
    },
  };
})(window.HW);
