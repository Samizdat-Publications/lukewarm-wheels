// 40-electrical.js — battery pack -> brushed DC motor -> gear train -> foam wheels.
// Internally SI (V, A, N.m, rad/s, kg.m^2); load torque comes in as dyne.cm and
// wheel surface speed goes out in cm/s (SPEC s5.6).
(function (HW) {
  const U = HW.units, M = HW.math;

  HW.electrical = {
    create(cfg = HW.config, track = null) {
      const wheelRadiusM = ((track && track.foamWheelRadius) || cfg.derived().foamWheelRadius) / 100;
      const st = {
        on: false,
        omegaM: 0,           // motor rad/s
        Q: 0,                // coulombs drawn
        I: 0, Vterm: 0, V0: 0, Rpack: 0,
        tauM: 0, tauLoadM: 0, tauLoadW: 0,
        Pin: 0, Pmech: 0, t: 0,
      };
      const capacityC = () => cfg.battCapacityAh * 3600;
      function battery() {
        const soc = M.clamp(1 - st.Q / capacityC(), 0, 1);
        const V0 = cfg.cells * M.lerp(cfg.cellV0Dead, cfg.cellV0Fresh, soc);
        const R = cfg.cells * M.lerp(cfg.cellRFresh, cfg.cellRDead, 1 - soc) * cfg.battHealth;
        return { soc, V0, R };
      }
      function inertia() {
        const Jw = 0.5 * (cfg.foamWheelMassG / 1000) * wheelRadiusM * wheelRadiusM;
        return cfg.motorJ + 4 * Jw / (cfg.gearRatio * cfg.gearRatio);
      }
      const api = {
        state: st,
        setSwitch(on) { st.on = !!on; HW.bus.emit('switch', st.on); },
        reset() { st.omegaM = 0; st.Q = cfg.battUsedFrac * capacityC(); st.I = 0; st.on = false; st.t = 0; },
        get omegaWheel() { return st.omegaM / cfg.gearRatio; },
        get surfaceSpeed() { return (st.omegaM / cfg.gearRatio) * wheelRadiusM * 100; }, // cm/s
        step(dt, tauLoadDyneCm = 0) {
          const { soc, V0, R } = battery();
          st.V0 = V0; st.Rpack = R;
          const G = cfg.gearRatio, eta = cfg.gearEff;
          let I = 0;
          if (st.on) I = (V0 - cfg.motorKe * st.omegaM) / (cfg.motorR + R);
          const w = st.omegaM;
          let tauM = cfg.motorKt * I - cfg.motorB * w;
          const fric = cfg.motorFric;
          if (w > 1e-3) tauM -= fric; else if (tauM > fric) tauM -= fric; else tauM = 0;
          const tauLoadW = U.dyneCmToNm(tauLoadDyneCm);
          const tauLoadM = tauLoadW / (G * eta);
          const J = inertia();
          st.omegaM = Math.max(0, w + (tauM - tauLoadM) / J * dt);
          if (I > 0 || st.on) st.Q += Math.max(0, I) * dt;
          st.I = I; st.Vterm = V0 - I * R; st.tauM = tauM; st.tauLoadM = tauLoadM; st.tauLoadW = tauLoadW;
          st.Pin = st.Vterm * I; st.Pmech = tauM * st.omegaM; st.soc = soc; st.t += dt;
          return st.omegaM / G;
        },
        telemetry() {
          return {
            on: st.on, V: st.Vterm, V0: st.V0, I: st.I, soc: st.soc == null ? 1 : st.soc,
            rpmMotor: U.radToRpm(st.omegaM), rpmWheel: U.radToRpm(st.omegaM / cfg.gearRatio),
            surfaceSpeed: api.surfaceSpeed, Pin: st.Pin, Pmech: st.Pmech,
            tauLoadWheelGcm: st.tauLoadW * 1e7 / 981, ahUsed: st.Q / 3600, Rpack: st.Rpack,
          };
        },
        // no-load steady state for self-tests: omega where Kt*I = friction
        noLoadRpm() {
          const { V0, R } = battery();
          // Kt*(V0 - Ke*w)/(R+Rm) = fric + b*w  ->  w = (Kt*V0/(R+Rm) - fric) / (Kt*Ke/(R+Rm) + b)
          const Rt = cfg.motorR + R;
          const w = (cfg.motorKt * V0 / Rt - cfg.motorFric) / (cfg.motorKt * cfg.motorKe / Rt + cfg.motorB);
          return U.radToRpm(Math.max(0, w));
        },
      };
      api.reset();
      return api;
    },
  };
})(window.HW);
