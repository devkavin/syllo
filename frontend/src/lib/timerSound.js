// Create/resume only from a user gesture: required by mobile autoplay policies.
export function createTimerSound() {
  let context;
  let nodes = [];
  function stop() {
    for (const node of nodes) { try { node.stop(); } catch { /* Already ended. */ } }
    nodes = [];
  }
  async function enable() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error("Audio is unavailable in this browser.");
    context ||= new Audio();
    await context.resume();
    if (context.state !== "running") throw new Error("Audio is blocked.");
  }
  async function play({ test = false } = {}) {
    stop();
    if (!context || context.state !== "running") throw new Error("Enable alarm sound again on this device.");
    const start = context.currentTime;
    for (let i = 0; i < (test ? 3 : 18); i++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + Math.floor(i / 3) * 2 + (i % 3) * 0.3;
      oscillator.frequency.value = [660, 880, 1046][i % 3];
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.24);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(at); oscillator.stop(at + 0.26);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      nodes.push(oscillator);
    }
  }
  function close() { stop(); if (context) { void context.close().catch(() => {}); context = null; } }
  return { enable, play, stop, close };
}
