import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { playScanSound } from "./sound";

type WindowWithAudio = typeof window & {
  webkitAudioContext?: unknown;
};

const win = window as WindowWithAudio;

const createMockAudioContext = () => {
  const oscillator = {
    type: "",
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as null | (() => void),
  };
  const gainNode = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  const destination = {} as AudioDestinationNode;
  const close = vi.fn(() => Promise.resolve());

  // A class (not `vi.fn`) so `new AudioContextMock()` yields the spied instance.
  class AudioContextMock {
    currentTime = 0;
    destination = destination;
    createOscillator = vi.fn(() => oscillator);
    createGain = vi.fn(() => gainNode);
    close = close;
  }

  return { AudioContextMock, oscillator, gainNode, destination, close };
};

const setAudioContext = (value: unknown) => {
  Object.defineProperty(window, "AudioContext", { value, configurable: true });
};

describe("playScanSound", () => {
  const originalAudioContext = win.AudioContext;
  const originalWebkit = win.webkitAudioContext;

  afterEach(() => {
    setAudioContext(originalAudioContext);
    Object.defineProperty(window, "webkitAudioContext", {
      value: originalWebkit,
      configurable: true,
    });
  });

  it("builds and plays a short oscillator beep", () => {
    const { AudioContextMock, oscillator, gainNode, destination } = createMockAudioContext();
    setAudioContext(AudioContextMock);

    playScanSound();

    expect(oscillator.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledWith(destination);
    expect(oscillator.start).toHaveBeenCalledOnce();
    expect(oscillator.stop).toHaveBeenCalledOnce();
  });

  it("closes the AudioContext after playback ends (no context leak)", () => {
    const { AudioContextMock, oscillator, close } = createMockAudioContext();
    setAudioContext(AudioContextMock);

    playScanSound();
    expect(close).not.toHaveBeenCalled();

    // Simulate the oscillator finishing.
    oscillator.onended?.();
    expect(close).toHaveBeenCalledOnce();
  });

  it("is a safe no-op when the Web Audio API is unavailable", () => {
    setAudioContext(undefined);
    Object.defineProperty(window, "webkitAudioContext", { value: undefined, configurable: true });
    expect(() => playScanSound()).not.toThrow();
  });
});
