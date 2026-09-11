import { ABOUT_INTRO } from "@/game/data/portfolio";
import { THEME } from "./theme";

/** Kitchen -> About Me. Mimi introducing herself, not reading a résumé. */
export default function AboutSection() {
  return (
    <div className="space-y-4 font-sans text-base leading-relaxed text-[#f2ecff] sm:text-[17px]">
      <div className="flex items-center gap-3 border-b border-[#6f5c9e]/40 pb-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 font-mono text-lg font-bold"
          style={{ borderColor: THEME.purple, backgroundColor: THEME.plum, color: THEME.gold }}
        >
          {ABOUT_INTRO.name.charAt(0)}
        </div>
        <div>
          <p className="font-mono text-sm font-bold text-[#ffe9a8]">{ABOUT_INTRO.name}</p>
          <p className="font-mono text-xs text-[#c9bce6]">
            {ABOUT_INTRO.role} · {ABOUT_INTRO.location}
          </p>
        </div>
      </div>
      {ABOUT_INTRO.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}
