import { describe, expect, it } from "vitest";
import { projectedSize } from "./projection";
import {
  COMPACT_HEIGHT_FILL_FACTOR,
  ZOOM_MIN,
  baselineZoom,
  compactControlsReservePx,
  compactHeightFill,
  fitHouseZoom,
  isCompactViewport,
  minZoomFactor,
} from "./cameraFraming";

const PHONE_PORTRAIT = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };
const DESKTOP = { width: 1440, height: 900 };

describe("cameraFraming", () => {
  it("treats phones as compact in both orientations, desktop as not", () => {
    expect(isCompactViewport(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height)).toBe(true);
    expect(isCompactViewport(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height)).toBe(true);
    expect(isCompactViewport(DESKTOP.width, DESKTOP.height)).toBe(false);
  });

  it("leaves the desktop baseline as the whole-house fit", () => {
    const { width, height } = DESKTOP;
    expect(baselineZoom(width, height)).toBe(fitHouseZoom(width, height));
  });

  it("draws the house at least 1:1 on a portrait phone rather than downscaling it", () => {
    // The regression this framing exists for: the old whole-house fit drew the
    // 504px-wide house into a 390px screen, i.e. below 1x, which reads blurry.
    const { width, height } = PHONE_PORTRAIT;
    expect(fitHouseZoom(width, height)).toBeLessThan(1);
    expect(baselineZoom(width, height)).toBeGreaterThan(1);
  });

  it("keeps the house clear of the on-screen controls on every phone size", () => {
    // The house is centred vertically, so its bottom edge sits at
    // height/2 + houseHeight/2 and must stay above the D-pad's top edge. The
    // 412x915 case is the one where the buttons are a size larger (>=400px
    // wide), which a width-blind reserve got wrong by 9px.
    const phones = [
      PHONE_PORTRAIT,
      { width: 375, height: 667 },
      { width: 360, height: 640 },
      { width: 412, height: 915 },
      { width: 430, height: 932 },
    ];
    for (const { width, height } of phones) {
      const houseScreenHeight = projectedSize().height * baselineZoom(width, height);
      const houseBottom = height / 2 + houseScreenHeight / 2;
      expect(houseBottom).toBeLessThanOrEqual(height - compactControlsReservePx(width, height));
    }
  });

  it("never asks for more fill than the taste knob", () => {
    for (const { width, height } of [PHONE_PORTRAIT, { width: 375, height: 667 }, { width: 412, height: 915 }]) {
      expect(compactHeightFill(width, height)).toBeLessThanOrEqual(COMPACT_HEIGHT_FILL_FACTOR);
    }
  });

  it("reserves a taller band once the D-pad's buttons step up past 400px wide", () => {
    expect(compactControlsReservePx(412, 915)).toBeGreaterThan(compactControlsReservePx(390, 844));
  });

  it("never draws the house below 1:1 on a phone, whichever way it is held", () => {
    // The whole point of the portrait framing: downscaled art is what reads as
    // blurry, so the taste knob may be tuned freely above this line but not below.
    for (const { width, height } of [PHONE_PORTRAIT, PHONE_LANDSCAPE, { width: 375, height: 667 }]) {
      expect(baselineZoom(width, height)).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps the whole-house fit on a landscape phone", () => {
    const { width, height } = PHONE_LANDSCAPE;
    expect(baselineZoom(width, height)).toBe(fitHouseZoom(width, height));
  });

  it("never frames smaller than the old whole-house fit did", () => {
    for (const { width, height } of [PHONE_PORTRAIT, PHONE_LANDSCAPE, DESKTOP, { width: 375, height: 667 }]) {
      expect(baselineZoom(width, height)).toBeGreaterThanOrEqual(fitHouseZoom(width, height));
    }
  });

  it("relaxes the zoom floor just enough to pinch back out to the whole house", () => {
    const { width, height } = PHONE_PORTRAIT;
    const floor = minZoomFactor(width, height);
    expect(floor).toBeLessThan(1);
    // At the floor the camera lands exactly on the whole-house framing.
    expect(baselineZoom(width, height) * floor).toBeCloseTo(fitHouseZoom(width, height), 10);
  });

  it("holds the zoom floor at 1 wherever the baseline already shows the whole house", () => {
    expect(minZoomFactor(DESKTOP.width, DESKTOP.height)).toBe(ZOOM_MIN);
    expect(minZoomFactor(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height)).toBe(ZOOM_MIN);
  });
});
