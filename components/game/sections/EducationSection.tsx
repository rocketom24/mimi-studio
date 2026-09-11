import { LuGraduationCap } from "react-icons/lu";
import { EDUCATION } from "@/game/data/portfolio";
import { SectionCard } from "./theme";

/** Bookshelf -> Education. Stacked "book spine" cards. */
export default function EducationSection() {
  return (
    <div className="space-y-3">
      {EDUCATION.map((entry) => (
        <SectionCard key={entry.school} className="flex items-start gap-3 border-l-4 border-l-[#ffe9a8]">
          <LuGraduationCap size={20} className="mt-0.5 shrink-0 text-[#ffe9a8]" />
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold text-[#f2ecff]">{entry.school}</p>
            {entry.credential ? (
              <p className="mt-0.5 font-sans text-sm text-[#c9bce6]">{entry.credential}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[#ffe9a8]">
              <span>{entry.detail}</span>
              {entry.dates ? <span className="text-[#a999c9]">{entry.dates}</span> : null}
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
