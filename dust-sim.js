(function () {
  "use strict";

  const video = document.getElementById("dust-video");
  const canvas = document.getElementById("dust-canvas");
  const statusEl = document.getElementById("dust-status");
  const startBtn = document.getElementById("dust-start");
  const stopBtn = document.getElementById("dust-stop");

  if (!video || !canvas || !statusEl || !startBtn || !stopBtn) {
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: true });

  const state = {
    stream: null,
    rafId: null,
    running: false,
    particles: [],
    tips: [],
    previousTips: [],
    particleCount: 280,
    cameraController: null,
    hands: null,
  };

  function setStatus(message, tone) {
    statusEl.textContent = message;
    statusEl.classList.remove("text-muted", "text-danger", "text-success", "text-warning");
    statusEl.classList.add(tone || "text-muted");
  }

  function resizeCanvas() {
    const rect = video.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const targetCount = Math.max(160, Math.floor((rect.width * rect.height) / 2600));
    state.particleCount = Math.min(targetCount, 420);
    seedParticles();
  }

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function seedParticles() {
    const width = canvas.clientWidth || video.clientWidth;
    const height = canvas.clientHeight || video.clientHeight;
    if (!width || !height) {
      return;
    }

    if (state.particles.length > state.particleCount) {
      state.particles.length = state.particleCount;
    }

    while (state.particles.length < state.particleCount) {
      state.particles.push({
        x: randomBetween(0, width),
        y: randomBetween(0, height),
        vx: randomBetween(-0.35, 0.35),
        vy: randomBetween(-0.35, 0.35),
        size: randomBetween(0.8, 2.6),
        life: randomBetween(40, 100),
        alpha: randomBetween(0.2, 0.9),
      });
    }
  }

  function updateTips(currentTips) {
    const next = [];

    for (let i = 0; i < currentTips.length; i += 1) {
      const tip = currentTips[i];
      const previousTip = state.previousTips[i] || tip;
      next.push({
        x: tip.x,
        y: tip.y,
        dx: tip.x - previousTip.x,
        dy: tip.y - previousTip.y,
      });
    }

    state.previousTips = currentTips.map((tip) => ({ x: tip.x, y: tip.y }));
    state.tips = next;
  }

  function applyHandForces(particle, width, height) {
    for (let i = 0; i < state.tips.length; i += 1) {
      const tip = state.tips[i];
      const tx = tip.x * width;
      const ty = tip.y * height;
      const dx = particle.x - tx;
      const dy = particle.y - ty;
      const distance = Math.hypot(dx, dy) || 0.001;

      if (distance < 130) {
        const influence = (130 - distance) / 130;
        const push = 0.52 * influence;
        particle.vx += (dx / distance) * push + tip.dx * width * 0.015;
        particle.vy += (dy / distance) * push + tip.dy * height * 0.015;
      }

      if (distance < 56) {
        const swirl = 0.08;
        particle.vx += -dy * swirl * 0.01;
        particle.vy += dx * swirl * 0.01;
      }
    }
  }

  function animate() {
    if (!state.running) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];

      applyHandForces(p, width, height);

      p.vx += (Math.random() - 0.5) * 0.015;
      p.vy += (Math.random() - 0.5) * 0.015;

      p.vx *= 0.965;
      p.vy *= 0.965;

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) {
        p.vx *= -0.72;
      }
      if (p.y < 0 || p.y > height) {
        p.vy *= -0.72;
      }

      p.x = Math.min(width, Math.max(0, p.x));
      p.y = Math.min(height, Math.max(0, p.y));

      p.life -= 0.32;
      if (p.life <= 0) {
        p.life = randomBetween(40, 100);
        p.alpha = randomBetween(0.2, 0.9);
      }

      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 240, 180, ${p.alpha})`;
      ctx.shadowColor = "rgba(255, 220, 110, 0.65)";
      ctx.shadowBlur = 6;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    state.rafId = window.requestAnimationFrame(animate);
  }

  function stopSimulation() {
    state.running = false;
    if (state.rafId) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    if (state.cameraController) {
      state.cameraController.stop();
      state.cameraController = null;
    }

    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }

    if (state.hands) {
      state.hands.close();
      state.hands = null;
    }

    state.tips = [];
    state.previousTips = [];

    startBtn.disabled = false;
    stopBtn.disabled = true;

    setStatus("Camera is off.", "text-muted");
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  async function startSimulation() {
    if (!window.Hands || !window.Camera) {
      setStatus("Hand tracking libraries are not available.", "text-danger");
      return;
    }

    try {
      startBtn.disabled = true;
      setStatus("Requesting camera permission...", "text-warning");

      state.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      video.srcObject = state.stream;
      await video.play();
      resizeCanvas();

      const hands = new window.Hands({
        locateFile(file) {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        },
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.6,
      });

      hands.onResults((results) => {
        if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
          updateTips([]);
          return;
        }

        const landmarks = results.multiHandLandmarks[0];
        const trackedTipIndices = [8, 12, 16, 20];
        const tips = trackedTipIndices.map((index) => ({
          x: 1 - landmarks[index].x,
          y: landmarks[index].y,
        }));

        updateTips(tips);
      });

      state.hands = hands;
      state.cameraController = new window.Camera(video, {
        onFrame: async () => {
          await hands.send({ image: video });
        },
        width: 1280,
        height: 720,
      });

      await state.cameraController.start();
      state.running = true;
      seedParticles();
      animate();

      stopBtn.disabled = false;
      setStatus("Live: move your hand to push the dust particles.", "text-success");
    } catch (error) {
      console.error(error);
      stopSimulation();
      setStatus("Could not access your camera. Please allow camera permission.", "text-danger");
    }
  }

  startBtn.addEventListener("click", startSimulation);
  stopBtn.addEventListener("click", stopSimulation);

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", stopSimulation);
})();
