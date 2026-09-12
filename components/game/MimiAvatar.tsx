/**
 * Mimi's face, cropped out of the walk sheet by background sizing — one frame
 * of the sprite the player is currently controlling, reused as an avatar.
 *
 * Every dimension has to scale together with the element: sizing the box alone
 * would just show a different (wrong) part of the sheet. Authored against a
 * 36px box, so SHEET/OFFSET below are that reference.
 */
const AVATAR_REF_PX = 36;
const AVATAR_SHEET = { width: 403.2, height: 230.4, offsetX: -15.6 };

interface MimiAvatarProps {
  size: number;
  className?: string;
}

export default function MimiAvatar({ size, className = "" }: MimiAvatarProps) {
  const scale = size / AVATAR_REF_PX;
  return (
    <div
      className={className}
      style={{
        height: size,
        width: size,
        backgroundImage: "url(/assets/game/character/mimi-sheet-1.png)",
        backgroundSize: `${AVATAR_SHEET.width * scale}px ${AVATAR_SHEET.height * scale}px`,
        backgroundPosition: `${AVATAR_SHEET.offsetX * scale}px 0px`,
      }}
    />
  );
}
