import { beforeEach, expect, it, vi } from "vitest";
import { createTimerSound } from "./timerSound";
let context, oscillators;
beforeEach(() => {
  oscillators = [];
  context = { state: "running", currentTime: 10, destination: {}, resume: vi.fn().mockResolvedValue(), close: vi.fn().mockResolvedValue(), createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }), createOscillator: () => { const node = { frequency: {}, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }; oscillators.push(node); return node; } };
  vi.stubGlobal("AudioContext", vi.fn(function () { return context; }));
});
it("only creates audio after activation, schedules a bounded alarm and stops all tones on dismissal", async () => {
  const sound = createTimerSound(); expect(AudioContext).not.toHaveBeenCalled();
  await expect(sound.play()).rejects.toThrow(); await sound.enable(); await sound.play();
  expect(oscillators).toHaveLength(18); expect(oscillators[0].start).toHaveBeenCalledWith(10); expect(oscillators[17].stop.mock.calls[0][0]).toBeCloseTo(20.86);
  sound.stop(); expect(oscillators.every(node => node.stop.mock.calls.length === 2)).toBe(true);
  sound.close(); expect(context.close).toHaveBeenCalled();
});
it("does not claim a suspended browser can play sound and gives a shorter test chime", async () => {
  const sound = createTimerSound(); context.state = "suspended";
  await expect(sound.enable()).rejects.toThrow(/blocked/);
  context.state = "running"; await sound.enable(); await sound.play({ test: true }); expect(oscillators).toHaveLength(3);
});
