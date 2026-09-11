import { LuDownload } from "react-icons/lu";
import { CV_SUMMARY, EDUCATION, EXPERIENCE, SKILLS } from "@/game/data/portfolio";
import { SectionCard, SubHeading } from "./theme";

/** Dressing Table + Almari -> Quick CV. Compact résumé preview with a real download action. */
export default function CvSection() {
  const topSkills = SKILLS.slice(0, 6);

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-sm font-bold text-[#ffe9a8]">{CV_SUMMARY.name}</p>
        <p className="font-mono text-xs text-[#c9bce6]">
          {CV_SUMMARY.role} · {CV_SUMMARY.location}
        </p>
        <p className="mt-2 font-sans text-sm leading-relaxed text-[#f2ecff]">{CV_SUMMARY.headline}</p>
      </div>

      <SectionCard>
        <SubHeading>Experience</SubHeading>
        <p className="font-mono text-xs text-[#f2ecff]">
          {EXPERIENCE[0]?.role} <span className="text-[#a999c9]">— {EXPERIENCE[0]?.company}</span>
        </p>
      </SectionCard>

      <SectionCard>
        <SubHeading>Education</SubHeading>
        <p className="font-mono text-xs text-[#f2ecff]">
          {EDUCATION[0]?.school} <span className="text-[#a999c9]">({EDUCATION[0]?.detail})</span>
        </p>
      </SectionCard>

      <SectionCard>
        <SubHeading>Core Skills</SubHeading>
        <div className="flex flex-wrap gap-1.5">
          {topSkills.map((skill) => (
            <span key={skill.label} className="border border-[#6f5c9e]/60 bg-[#1e1730] px-2 py-0.5 font-mono text-[11px] text-[#e8ddff]">
              {skill.label}
            </span>
          ))}
        </div>
      </SectionCard>

      <a
        href={CV_SUMMARY.downloadHref}
        download
        className="flex items-center justify-center gap-2 border-2 border-[#ffe9a8] bg-[#ffe9a8] px-4 py-3 font-mono text-sm font-bold uppercase tracking-wide text-[#1e1730] transition-colors hover:bg-[#f2ecff]"
      >
        <LuDownload size={16} />
        Download Full CV
      </a>
    </div>
  );
}
