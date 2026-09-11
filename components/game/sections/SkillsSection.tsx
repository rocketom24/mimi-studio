import { SKILLS } from "@/game/data/portfolio";

/** Bed -> Skills. What I can do, distinct from Tech Stack's what I use. */
export default function SkillsSection() {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {SKILLS.map(({ label, description, icon: Icon }) => (
        <div key={label} className="flex items-start gap-2.5 border border-[#6f5c9e]/50 bg-[#241c33] p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-[#6f5c9e] bg-[#1e1730] text-[#ffe9a8]">
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold text-[#f2ecff]">{label}</p>
            <p className="mt-0.5 font-sans text-xs leading-snug text-[#a999c9]">{description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
