import { ImageResponse } from "next/og";
import { BRAND, mimiMarkStyle } from "@/lib/brand";

export const alt = "Mimi Studio — the interactive portfolio of Tasmim Shajahan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK_SIZE = 260;

/**
 * Link preview: the studio's existing logo lockup — Mimi's sprite frame beside
 * the wordmark — scaled up onto the warm lamplit ground the portfolio panels
 * use. Shared by the Twitter card (see app/twitter-image.tsx).
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 56,
          width: "100%",
          height: "100%",
          padding: "0 96px",
          backgroundColor: BRAND.inkDeep,
          backgroundImage: `radial-gradient(circle at 22% 30%, rgba(255,217,142,0.16), transparent 55%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            width: MARK_SIZE,
            height: MARK_SIZE,
            flexShrink: 0,
            borderRadius: MARK_SIZE / 2,
            border: `4px solid ${BRAND.gold}`,
            backgroundColor: BRAND.ink,
            ...mimiMarkStyle(MARK_SIZE),
          }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 8,
              textTransform: "uppercase",
              color: BRAND.muted,
            }}
          >
            Walk around the apartment
          </div>
          <div style={{ fontSize: 108, fontWeight: 700, color: BRAND.gold, marginTop: 10 }}>
            Mimi Studio
          </div>
          <div style={{ fontSize: 44, color: BRAND.cream, marginTop: 6 }}>Tasmim Portfolio</div>
          <div style={{ fontSize: 28, color: BRAND.muted, marginTop: 22 }}>
            Full stack developer · Dhaka, Bangladesh
          </div>
        </div>
      </div>
    ),
    size,
  );
}
