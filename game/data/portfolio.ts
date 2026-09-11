export type PortfolioSectionId =
  | "about"
  | "experience"
  | "projects"
  | "skills"
  | "education"
  | "contact"
  | "cv"
  | "techStack"
  | "currentlyLearning";

export interface PortfolioSection {
  readonly title: string;
  readonly body: readonly string[];
}

const PLACEHOLDER = "[Placeholder content — real portfolio text goes here.]";

/** Content shown in a portfolio panel, keyed by section id. Kept separate from rendering. */
export const PORTFOLIO_SECTIONS: Record<PortfolioSectionId, PortfolioSection> = {
  about: {
    title: "About Mimi",
    body: [PLACEHOLDER],
  },
  experience: {
    title: "Experience",
    body: [PLACEHOLDER],
  },
  projects: {
    title: "Projects",
    body: [PLACEHOLDER],
  },
  skills: {
    title: "Skills",
    body: [PLACEHOLDER],
  },
  education: {
    title: "Education",
    body: [PLACEHOLDER],
  },
  contact: {
    title: "Contact Mimi",
    body: [PLACEHOLDER],
  },
  cv: {
    title: "Quick CV",
    body: [PLACEHOLDER],
  },
  techStack: {
    title: "Tech Stack",
    body: [PLACEHOLDER],
  },
  currentlyLearning: {
    title: "Currently Learning",
    body: [PLACEHOLDER],
  },
};
