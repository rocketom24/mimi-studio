import { ImageResponse } from "next/og";
import { BRAND, mimiMarkStyle } from "@/lib/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Browser tab icon: Mimi's own sprite frame on the studio's warm ground. */
export default function Icon() {
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
