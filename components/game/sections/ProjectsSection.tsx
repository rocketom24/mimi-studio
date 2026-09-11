import { PROJECTS } from "@/game/data/portfolio";
import { Chip, SectionCard, SubHeading } from "./theme";

/** PC -> Projects. Prominent, scannable project cards. */
export default function ProjectsSection() {
  return (
    <div className="space-y-4">
      {PROJECTS.map((project) => (
        <SectionCard key={project.name}>
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="font-mono text-sm font-bold text-[#ffe9a8]">{project.name}</h3>
            {project.year ? (
              <span className="shrink-0 font-mono text-[11px] text-[#a999c9]">{project.year}</span>
            ) : null}
          </div>
          <p className="mb-3 font-sans text-sm leading-relaxed text-[#f2ecff]">{project.description}</p>
          <ul className="mb-3 space-y-1 font-sans text-xs leading-relaxed text-[#c9bce6]">
            {project.features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span className="text-[#6bbf8a]">▸</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            {project.tech.map((tech) => (
              <Chip key={tech.name} icon={tech.icon}>
                {tech.name}
              </Chip>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
