// 50-render-core.js - renderer, scene, lights, environment and post-processing.
// A warm room: soft window key light from the upper left with soft shadows, a cool rim
// from behind, a studio environment map for reflections on glossy plastic and paint, and
// a gentle tone map. Everything the set is made of is glossy, so the environment matters
// more than the lights.
(function (HW) {
  const QUALITY = {
    high:   { pr: 2,   shadow: 4096, ao: true,  bloom: true, samples: 4 },
    medium: { pr: 1.5, shadow: 2048, ao: false, bloom: true, samples: 4 },
    low:    { pr: 1,   shadow: 1024, ao: false, bloom: false, samples: 0 },
  };

  const R = (HW.render = {
    quality: 'high',
    init(canvas) {
      const T = window.THREE, X = window.THREEX;
      const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
      renderer.outputColorSpace = T.SRGBColorSpace;
      // Khronos PBR Neutral keeps saturated base colours (track orange, hub red) true
      renderer.toneMapping = T.NeutralToneMapping;
      renderer.toneMappingExposure = 0.95;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      R.renderer = renderer;

      const scene = new T.Scene();
      scene.background = new T.Color(0x1a110b);
      scene.fog = new T.Fog(0x1a110b, 260, 720);
      R.scene = scene;

      const camera = new T.PerspectiveCamera(38, 1, 0.5, 3000);
      camera.position.set(-18, 78, 112);
      R.camera = camera;

      // environment: a neutral studio for reflections, dimmed so the key light leads
      const pmrem = new T.PMREMGenerator(renderer);
      const env = pmrem.fromScene(new X.RoomEnvironment(), 0.04).texture;
      scene.environment = env;
      scene.environmentIntensity = 0.55;
      pmrem.dispose();

      // key: late-afternoon window light
      const key = new T.DirectionalLight(0xffe2c2, 2.6);
      key.position.set(-95, 150, 70);
      key.target.position.set(0, 4, 0);
      key.castShadow = true;
      const sc = key.shadow.camera;
      sc.left = -58; sc.right = 58; sc.top = 58; sc.bottom = -58; sc.near = 60; sc.far = 330;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.03;
      key.shadow.radius = 4;
      scene.add(key, key.target);
      R.key = key;
      // cool fill from the sky side, warm bounce from the wooden floor
      const hemi = new T.HemisphereLight(0xb9ccff, 0x6a4424, 0.55);
      scene.add(hemi);
      // rim from behind-right: separates the orange track from the floor
      const rim = new T.DirectionalLight(0xbfd6ff, 0.9);
      rim.position.set(110, 70, -140);
      scene.add(rim);
      R.hemi = hemi; R.rim = rim;

      R.buildComposer();
      R.resize();
      addEventListener('resize', R.resize);
      return R;
    },

    buildComposer() {
      const T = window.THREE, X = window.THREEX, q = QUALITY[R.quality];
      if (R.composer) { R.composer.dispose(); }
      const size = R.renderer.getDrawingBufferSize(new T.Vector2());
      const rt = new T.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: T.HalfFloatType, samples: q.samples });
      const composer = new X.EffectComposer(R.renderer, rt);
      composer.addPass(new X.RenderPass(R.scene, R.camera));
      R.aoPass = null; R.bloomPass = null;
      if (q.ao) {
        const ao = new X.GTAOPass(R.scene, R.camera, size.x, size.y);
        ao.output = X.GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 0.75;
        ao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
        composer.addPass(ao);
        R.aoPass = ao;
      }
      if (q.bloom) {
        const bloom = new X.UnrealBloomPass(new T.Vector2(size.x, size.y), 0.12, 0.35, 1.05);
        composer.addPass(bloom);
        R.bloomPass = bloom;
      }
      composer.addPass(new X.OutputPass());
      // vignette + a whisper of grain, after tone mapping
      R.finish = new X.ShaderPass({
        uniforms: { tDiffuse: { value: null }, amount: { value: 0.32 }, grain: { value: 0.018 }, time: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: [
          'uniform sampler2D tDiffuse; uniform float amount; uniform float grain; uniform float time; varying vec2 vUv;',
          'float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
          'void main(){',
          '  vec4 c = texture2D(tDiffuse, vUv);',
          '  vec2 d = vUv - 0.5; d.x *= 1.25;',
          '  float v = smoothstep(0.95, 0.25, length(d));',
          '  c.rgb *= mix(1.0 - amount, 1.0, v);',
          '  c.rgb += (h(vUv * 917.0 + time) - 0.5) * grain;',
          '  gl_FragColor = c;',
          '}',
        ].join('\n'),
      });
      composer.addPass(R.finish);
      R.composer = composer;
      R.key.shadow.mapSize.set(q.shadow, q.shadow);
      if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; }
    },

    setQuality(name) {
      if (!QUALITY[name] || name === R.quality) return;
      R.quality = name;
      R.buildComposer();
      R.resize();
      try { localStorage.setItem('hw.quality', name); } catch (e) { /* storage may be blocked */ }
      HW.bus.emit('quality', name);
    },

    resize() {
      const c = R.renderer.domElement, w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
      const q = QUALITY[R.quality];
      R.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr));
      R.renderer.setSize(w, h, false);
      R.camera.aspect = w / h;
      R.camera.updateProjectionMatrix();
      if (R.composer) {
        R.composer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr));
        R.composer.setSize(w, h);
      }
    },

    render(dt) {
      if (R.finish) R.finish.uniforms.time.value = (R.finish.uniforms.time.value + dt * 60) % 1000;
      R.composer.render(dt);
    },
  });
})(window.HW);
