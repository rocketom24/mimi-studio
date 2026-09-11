import { CURRENTLY_LEARNING } from "@/game/data/portfolio";
import { ProgressBar, SectionCard } from "./theme";

/** Garden -> Currently Learning. Growth-style cards, not a plain list. */
export default function LearningSection() {
  return (
    <div className="space-y-3">
      <p className="font-sans text-sm text-[#c9bce6]">Still growing — here's what's currently in progress:</p>
      {CURRENTLY_LEARNING.map((item) => (
        <SectionCard key={item.label}>
          <ProgressBar label={item.label} value={item.progress} icon={item.icon} />
          <p className="mt-2 font-sans text-xs leading-snug text-[#a999c9]">{item.note}</p>
        </SectionCard>
      ))}
    </div>
  );
}
