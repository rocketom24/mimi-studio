import { describe, expect, it } from "vitest";
import { advancePhase, approach, approachAngle, keyframeBlend } from "./walkCycle";

describe("advancePhase", () => {
  it("does not advance when no distance was moved", () => {
    expect(advancePhase(1.23, 0, 10)).toBeCloseTo(1.23);
  });

  it("advances by a full turn per stride length, wrapping back to the start", () => {
    expect(advancePhase(0, 10, 10)).toBeCloseTo(0);
  });

  it("advances by half a turn for half a stride length", () => {
    expect(advancePhase(0, 5, 10)).toBeCloseTo(Math.PI);
  });

  it("wraps phase into [0, 2*PI)", () => {
    const result = advancePhase(0, 25, 10); // 2.5 strides
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(Math.PI * 2);
    expect(result).toBeCloseTo(Math.PI);
  });
});

describe("keyframeBlend", () => {
  it("sits exactly on frame 0 at phase 0", () => {
    const result = keyframeBlend(0, 4);
    expect(result.fromIndex).toBe(0);
    expect(result.toIndex).toBe(1);
    expect(result.blend).toBeCloseTo(0);
  });

  it("is halfway between frame 0 and 1 a quarter of the way through the first of 4 segments", () => {
    const result = keyframeBlend((Math.PI * 2) / 4 / 2, 4);
    expect(result.fromIndex).toBe(0);
    expect(result.toIndex).toBe(1);
    expect(result.blend).toBeCloseTo(0.5);
  });

  it("wraps the last frame's `to` back to frame 0", () => {
    const result = keyframeBlend((Math.PI * 2 * 3.5) / 4, 4);
    expect(result.fromIndex).toBe(3);
    expect(result.toIndex).toBe(0);
    expect(result.blend).toBeCloseTo(0.5);
  });
});

describe("approach", () => {
  it("returns the target unchanged once already there", () => {
    expect(approach(5, 5, 10, 0.1)).toBeCloseTo(5);
  });

  it("moves partway toward the target, closer for a larger dt", () => {
    const small = approach(0, 10, 20, 0.01);
    const large = approach(0, 10, 20, 0.1);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(large);
    expect(large).toBeLessThan(10);
  });

  it("converges to the target over many steps", () => {
    let value = 0;
    for (let i = 0; i < 200; i++) value = approach(value, 10, 20, 1 / 60);
    expect(value).toBeCloseTo(10, 1);
  });
});

describe("approachAngle", () => {
  it("takes the short way around when crossing the 0/2*PI wrap", () => {
    const TWO_PI = Math.PI * 2;
    // Starting just below the wrap, target just above it: should move forward, not
    // backward across almost the whole circle.
    const result = approachAngle(TWO_PI - 0.1, 0.1, 20, 1 / 60);
    const forwardDistance = result - (TWO_PI - 0.1);
    expect(forwardDistance).toBeGreaterThan(0);
    expect(forwardDistance).toBeLessThan(0.3);
  });

  it("converges to the target angle over many steps", () => {
    let phase = 0.2;
    for (let i = 0; i < 200; i++) phase = approachAngle(phase, Math.PI, 20, 1 / 60);
    expect(phase).toBeCloseTo(Math.PI, 1);
  });
});
