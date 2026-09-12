import { ImageResponse } from "next/og";
import { BRAND, mimiMarkStyle } from "@/lib/brand";

// iOS's own required size; it applies the rounded mask itself, so the artwork
// stays square and fills the tile edge to edge.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the same Mimi frame as the tab icon, at tile size. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: BRAND.ink,
          ...mimiMarkStyle(size.width),
        }}
      />
    ),
    size,
  );
}
