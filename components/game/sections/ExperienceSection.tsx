import { LuBriefcase, LuCalendar, LuMapPin } from "react-icons/lu";
import { EXPERIENCE } from "@/game/data/portfolio";
import { SectionCard, SubHeading } from "./theme";

/** TV + Sofa -> Experience. Timeline of cards. */
export default function ExperienceSection() {
  return (
    <div className="relative space-y-4 border-l-2 border-[#6f5c9e]/40 pl-4">
      {EXPERIENCE.map((entry) => (
        <div key={entry.company} className="relative">
          <span
            className="absolute -left-[1.375rem] top-1.5 h-3 w-3 rounded-full border-2 border-[#1e1730] bg-[#ffe9a8]"
            aria-hidden
          />
          <SectionCard>
            <div className="mb-1 flex items-center gap-2 font-mono text-sm font-bold text-[#ffe9a8]">
              <LuBriefcase size={16} className="shrink-0" />
              {entry.role}
            </div>
            <p className="mb-2 font-mono text-xs text-[#c9bce6]">{entry.company}</p>
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[#a999c9]">
              <span className="flex items-center gap-1">
                <LuCalendar size={12} /> {entry.dates}
              </span>
              <span className="flex items-center gap-1">
                <LuMapPin size={12} /> {entry.location}
              </span>
            </div>
            <SubHeading>Highlights</SubHeading>
            <ul className="space-y-1.5 font-sans text-sm leading-relaxed text-[#f2ecff]">
              {entry.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span className="text-[#6bbf8a]">▸</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      ))}
    </div>
  );
}
