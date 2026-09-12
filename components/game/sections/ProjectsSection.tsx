"use client";

import { useState } from "react";
import { LuExternalLink, LuLayers, LuListChecks, LuSparkles } from "react-icons/lu";
import { PROJECTS } from "@/game/data/portfolio";
import { Badge, Chip, Eyebrow, Reveal, SubHeading, revealStyle } from "./theme";

/**
 * PC -> Projects. Master–detail: the rail keeps all four in view while one
 * reads in full, which is how someone actually scans a portfolio — compare,
 * then commit. On a phone the rail collapses to a scrollable chip row above
 * the same detail pane.
 */
export default function ProjectsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const project = PROJECTS[activeIndex];

  return (
    <div className="space-y-4">
      <Reveal index={0}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
          {/* Rail: vertical list on desktop, horizontal chip row on phone. */}
          <nav
            aria-label="Projects"
            className="mimi-rail -mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-44 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0 md:w-52"
          >
            {PROJECTS.map((entry, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={entry.name}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-current={isActive ? "true" : undefined}
                  className={`mimi-motion relative shrink-0 rounded-lg border px-3 py-2 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mimi-gold)] sm:w-full ${
                    isActive
                      ? "border-[var(--mimi-line-strong)] bg-[var(--mimi-gold)]/10"
                      : "border-transparent hover:border-[var(--mimi-line)] hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Active marker slides in from the edge instead of popping. */}
                  <span
                    className={`mimi-motion absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-[var(--mimi-gold)] transition-opacity duration-300 ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden
                  />
                  <span
                    className={`block font-mono text-[11px] leading-snug whitespace-nowrap transition-colors duration-200 sm:whitespace-normal ${
                      isActive ? "text-[var(--mimi-gold)]" : "text-[var(--mimi-muted)]"
                    }`}
                  >
                    {entry.name}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Detail: keyed on the selection so it re-reveals on every switch. */}
          <article key={project.name} className="min-w-0 flex-1 space-y-4">
            <div className="mimi-reveal" style={revealStyle(0)}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-xl leading-tight font-semibold text-[var(--mimi-cream)] sm:text-2xl">
                  {project.name}
                </h3>
                {project.year ? <Badge tone="clay">{project.year}</Badge> : null}
              </div>
              <p className="mt-2 font-sans text-[14px] leading-relaxed text-[var(--mimi-cream)]/85 sm:text-[15px]">
                {project.description}
              </p>
              {project.link ? (
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mimi-motion mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--mimi-line)] bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-[var(--mimi-gold)] transition-colors duration-200 hover:border-[var(--mimi-gold)] hover:bg-[var(--mimi-gold)]/10"
                >
                  <LuExternalLink size={12} aria-hidden />
                  Open Live Demo
                </a>
              ) : null}
            </div>

            <div className="mimi-reveal flex flex-wrap gap-2" style={revealStyle(1)}>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--mimi-line)] bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-[var(--mimi-muted)]">
                <LuListChecks size={12} className="text-[var(--mimi-sage)]" />
                {project.features.length} highlights
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--mimi-line)] bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-[var(--mimi-muted)]">
                <LuLayers size={12} className="text-[var(--mimi-sky)]" />
                {project.tech.length} technologies
              </span>
            </div>

            <div className="mimi-reveal" style={revealStyle(2)}>
              <SubHeading>What it does</SubHeading>
              <ul className="space-y-2 font-sans text-[13px] leading-relaxed text-[var(--mimi-cream)]/90 sm:text-sm">
                {project.features.map((feature) => (
                  <li key={feature} className="group/row flex gap-2.5">
                    <LuSparkles
                      size={13}
                      aria-hidden
                      className="mimi-motion mt-1 shrink-0 text-[var(--mimi-gold-dim)] transition-all duration-300 group-hover/row:scale-110 group-hover/row:text-[var(--mimi-gold)]"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mimi-reveal" style={revealStyle(3)}>
              <Eyebrow className="mb-2">Built with</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {project.tech.map((tech) => (
                  <Chip key={tech.name} icon={tech.icon}>
                    {tech.name}
                  </Chip>
                ))}
              </div>
            </div>
          </article>
        </div>
      </Reveal>
    </div>
  );
}
