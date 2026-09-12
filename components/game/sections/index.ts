import type { ComponentType } from "react";
import type { PortfolioSectionId } from "@/game/data/portfolio";
import AboutSection from "./AboutSection";
import ContactSection from "./ContactSection";
import CvSection from "./CvSection";
import EducationSection from "./EducationSection";
import ExperienceSection from "./ExperienceSection";
import LearningSection from "./LearningSection";
import ProjectsSection from "./ProjectsSection";
import PublicationsSection from "./PublicationsSection";
import SkillsSection from "./SkillsSection";
import TechStackSection from "./TechStackSection";

/** Each portfolio section owns its own visual layout; the panel shell just picks one by id. */
export const SECTION_COMPONENTS: Record<PortfolioSectionId, ComponentType> = {
  about: AboutSection,
  experience: ExperienceSection,
  education: EducationSection,
  contact: ContactSection,
  cv: CvSection,
  techStack: TechStackSection,
  projects: ProjectsSection,
  skills: SkillsSection,
  currentlyLearning: LearningSection,
  publications: PublicationsSection,
};
