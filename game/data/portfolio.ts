import type { IconType } from "react-icons";
import {
  SiAndroidstudio,
  SiClerk,
  SiCss,
  SiDocker,
  SiExpress,
  SiFirebase,
  SiGit,
  SiGithub,
  SiHtml5,
  SiJavascript,
  SiKotlin,
  SiMongodb,
  SiNextdotjs,
  SiNodedotjs,
  SiOpenjdk,
  SiPostgresql,
  SiPostman,
  SiPrisma,
  SiReact,
  SiSpring,
  SiStripe,
  SiSupabase,
  SiTailwindcss,
  SiTypescript,
  SiVercel,
} from "react-icons/si";
import {
  LuBriefcase,
  LuBug,
  LuCode,
  LuDatabase,
  LuGauge,
  LuKeyRound,
  LuLayers,
  LuLayoutGrid,
  LuLinkedin,
  LuMail,
  LuNetwork,
  LuPhone,
  LuPuzzle,
  LuScrollText,
  LuShieldCheck,
  LuWebhook,
} from "react-icons/lu";

export type PortfolioSectionId =
  | "about"
  | "experience"
  | "projects"
  | "skills"
  | "education"
  | "contact"
  | "cv"
  | "techStack"
  | "currentlyLearning"
  | "publications";

/** Panel header title per section, shown by the shared PortfolioPanel shell. */
export const SECTION_TITLES: Record<PortfolioSectionId, string> = {
  about: "About Mimi",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  contact: "Contact Me",
  cv: "Quick CV",
  techStack: "Tech Stack",
  currentlyLearning: "Currently Learning",
  publications: "Publications",
};

/**
 * The furniture that opens each section, mirroring game/data/interactables.ts.
 * The panel shows it as a provenance eyebrow, so a visitor always knows which
 * piece of the apartment they just opened.
 */
export const SECTION_SOURCES: Record<PortfolioSectionId, string> = {
  about: "Kitchen",
  experience: "TV & Sofa",
  projects: "PC",
  skills: "Bed",
  education: "Bookshelf",
  contact: "Phone & Cabinet",
  cv: "Almari & Dressing Table",
  techStack: "Dining Table",
  currentlyLearning: "Garden",
  publications: "Cat Tower",
};

// ---- About ----

export const ABOUT_INTRO = {
  name: "Tasmim Shajahan",
  role: "Full Stack Developer",
  location: "Dhaka, Bangladesh",
  paragraphs: [
    "Hi, I'm Tasmim. Mimi, the one you're walking around as right now, is my stand-in for this tour. This whole apartment, the furniture, the code that makes it all move, I built it, so consider this your tour guide talking.",
    "What I actually do all day is build full web apps by myself, start to finish. Database, backend, the screens you click on, getting it all live on the internet without anyone else's help. Right now that means running the entire ordering and kitchen system for a real sushi restaurant in Milan. Reservations, table orders, payments, the whole thing quietly working while people eat their sushi.",
    "Before any of that I spent a stretch as an education consultant, helping students figure out where they were going and keeping every bit of paperwork in order. Turns out untangling a messy application process and untangling a messy codebase use the same part of my brain.",
    "When I'm not building things for other people I'm building things purely because I want them to exist. An app for writing Urdu poetry. This entire game you're standing in right now, walls, furniture and all, even the Cat Room is modeled on my actual cats. Go poke around the rest of the room, every piece of furniture has a bit more of me tucked behind it.",
  ],
} as const;

// ---- Experience ----

export interface ExperienceEntry {
  readonly company: string;
  readonly role: string;
  readonly dates: string;
  readonly location: string;
  readonly bullets: readonly string[];
}

export const EXPERIENCE: readonly ExperienceEntry[] = [
  {
    company: "Self-Employed",
    role: "Solo Developer",
    dates: "September 2025 – Present",
    location: "Dhaka, Bangladesh",
    bullets: [
      "Building production web apps end to end, solo: database schema, backend logic, UI, and deployment.",
      "Shipped a full restaurant operating system for a sushi place in Milan, covering reservations, kitchen workflow, and Stripe payments.",
      "Designed and built this cozy game-portfolio, along with other personal projects like an Urdu poetry writing app.",
    ],
  },
  {
    company: "EdSparkle Education Consultancy",
    role: "Education Consultant & Marketing Manager",
    dates: "June 2025 – February 2026",
    location: "Dhaka, Bangladesh",
    bullets: [
      "Managed client communication, documentation, and end-to-end education application processes.",
      "Created digital marketing content and coordinated campaigns across multiple platforms.",
      "Collaborated with team members to manage client projects and ensure timely delivery.",
    ],
  },
  {
    company: "ForesightBytes",
    role: "Backend Developer Intern",
    dates: "December 2023 – April 2025",
    location: "Remote",
    bullets: [
      "Developed backend modules for an ERP-based software system using Java.",
      "Implemented business logic, database operations, data processing, and application workflows.",
      "Debugged backend functionality and collaborated on software testing and integration.",
    ],
  },
];

// ---- Education ----

export interface EducationEntry {
  readonly school: string;
  readonly credential: string;
  readonly detail: string;
  readonly dates: string;
}

export const EDUCATION: readonly EducationEntry[] = [
  {
    school: "East West University",
    credential: "Bachelor of Science in Computer Science & Engineering",
    detail: "CGPA: 3.48 / 4.00",
    dates: "Graduated: 2026",
  },
  {
    school: "Higher Secondary Certificate (HSC)",
    credential: "",
    detail: "GPA: 5.00",
    dates: "",
  },
  {
    school: "Secondary School Certificate (SSC)",
    credential: "",
    detail: "GPA: 5.00",
    dates: "",
  },
];

// ---- Contact ----

export interface ContactEntry {
  readonly label: string;
  readonly value: string;
  readonly href: string;
  readonly icon: IconType;
}

export const CONTACT_LINKS: readonly ContactEntry[] = [
  { label: "Email", value: "rocketom24@gmail.com", href: "mailto:rocketom24@gmail.com", icon: LuMail },
  { label: "Phone", value: "+880 1777 682337", href: "tel:+8801777682337", icon: LuPhone },
  { label: "GitHub", value: "github.com/rocketom24", href: "https://github.com/rocketom24", icon: SiGithub },
  { label: "LinkedIn", value: "linkedin.com/in/tasmim2325", href: "https://bd.linkedin.com/in/tasmim2325", icon: LuLinkedin },
];

// ---- Tech Stack ----

export interface TechItem {
  readonly name: string;
  readonly icon: IconType;
}

export interface TechCategory {
  readonly category: string;
  readonly items: readonly TechItem[];
}

export const TECH_STACK: readonly TechCategory[] = [
  {
    category: "Languages",
    items: [
      { name: "JavaScript", icon: SiJavascript },
      { name: "TypeScript", icon: SiTypescript },
      { name: "Java", icon: SiOpenjdk },
      { name: "Kotlin", icon: SiKotlin },
      { name: "SQL", icon: LuDatabase },
    ],
  },
  {
    category: "Frontend",
    items: [
      { name: "Next.js", icon: SiNextdotjs },
      { name: "React", icon: SiReact },
      { name: "Tailwind CSS", icon: SiTailwindcss },
      { name: "HTML5", icon: SiHtml5 },
      { name: "CSS3", icon: SiCss },
    ],
  },
  {
    category: "Backend",
    items: [
      { name: "Node.js", icon: SiNodedotjs },
      { name: "Express.js", icon: SiExpress },
      { name: "Spring Boot", icon: SiSpring },
      { name: "REST APIs", icon: LuNetwork },
    ],
  },
  {
    category: "Database",
    items: [
      { name: "PostgreSQL", icon: SiPostgresql },
      { name: "MongoDB", icon: SiMongodb },
      { name: "Firebase Firestore", icon: SiFirebase },
      { name: "Supabase", icon: SiSupabase },
      { name: "Prisma ORM", icon: SiPrisma },
    ],
  },
  {
    category: "Auth & Payments",
    items: [
      { name: "Clerk", icon: SiClerk },
      { name: "Supabase Auth", icon: SiSupabase },
      { name: "Firebase Auth", icon: SiFirebase },
      { name: "Stripe", icon: SiStripe },
    ],
  },
  {
    category: "Deployment & Tools",
    items: [
      { name: "Vercel", icon: SiVercel },
      { name: "Git", icon: SiGit },
      { name: "GitHub", icon: SiGithub },
      { name: "Docker", icon: SiDocker },
      { name: "Postman", icon: SiPostman },
      { name: "Android Studio", icon: SiAndroidstudio },
    ],
  },
];

// ---- Projects ----

export interface ProjectEntry {
  readonly name: string;
  readonly year: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly tech: readonly TechItem[];
  readonly link?: string;
}

export const PROJECTS: readonly ProjectEntry[] = [
  {
    name: "Restaurant Operating System",
    year: "2026",
    description:
      "Production Restaurant Operating System for a real sushi restaurant client in Milan, Italy — dine-in, takeaway, delivery, reservations, and online ordering.",
    features: [
      "Normalized PostgreSQL + Prisma schema for menus, orders, reservations, payments and tables",
      "Supabase auth with role-based access and protected routes",
      "Stripe checkout, payment verification and webhook-driven order workflows",
      "Query optimization, indexing, caching and Core Web Vitals tuning",
    ],
    tech: [
      { name: "Next.js", icon: SiNextdotjs },
      { name: "TypeScript", icon: SiTypescript },
      { name: "Prisma", icon: SiPrisma },
      { name: "PostgreSQL", icon: SiPostgresql },
      { name: "Supabase", icon: SiSupabase },
      { name: "Stripe", icon: SiStripe },
      { name: "Tailwind CSS", icon: SiTailwindcss },
    ],
  },
  {
    name: "PKSF Digital Experience",
    year: "2026",
    description:
      "Modern digital concept for the Palli Karma-Sahayak Foundation (PKSF) website, focused on improved visual hierarchy, responsive UX, accessibility and modern web standards.",
    features: [
      "Rebuilt the interface with reusable React components and a scalable Next.js architecture",
      "Responsive layouts and animations tuned across every breakpoint",
      "Accessibility and modern web standards built into the component layer",
    ],
    tech: [
      { name: "Next.js", icon: SiNextdotjs },
      { name: "React", icon: SiReact },
      { name: "TypeScript", icon: SiTypescript },
      { name: "Tailwind CSS", icon: SiTailwindcss },
    ],
    link: "https://pksf-digital-experience.vercel.app/",
  },
  {
    name: "EWU FairRide",
    year: "Research Project",
    description:
      "Native Android ride-sharing app for university students, built around research on fairness perception to improve pricing transparency and trust.",
    features: [
      "Fairness-aware fare calculation from real-time distance, traffic, weather and route data",
      "Ride validation, real-time location tracking and emergency location sharing",
      "Fare acceptance required before trip initiation",
    ],
    tech: [
      { name: "Java", icon: SiOpenjdk },
      { name: "Android Studio", icon: SiAndroidstudio },
      { name: "Firebase", icon: SiFirebase },
    ],
  },
  {
    name: "Nour Ayni — Urdu Poetry Platform",
    year: "Personal Project",
    description:
      "Personalized Urdu poetry writing platform with an immersive, traditionally-styled writing experience.",
    features: [
      "Rich text editor with reusable templates, custom typography and attachments",
      "Debounced auto-save and responsive layouts",
      "PDF/PNG export that preserves custom typography and styling",
    ],
    tech: [
      { name: "Next.js", icon: SiNextdotjs },
      { name: "TypeScript", icon: SiTypescript },
      { name: "Clerk", icon: SiClerk },
      { name: "Tailwind CSS", icon: SiTailwindcss },
    ],
  },
  {
    name: "Gym Fitness Mobile Application",
    year: "",
    description: "Native Android fitness app for workout tracking and fitness management.",
    features: [
      "User-friendly mobile interfaces and app logic",
      "Optimized activity lifecycle management for smooth, responsive UI",
    ],
    tech: [
      { name: "Java", icon: SiOpenjdk },
      { name: "Android Studio", icon: SiAndroidstudio },
      { name: "Firebase", icon: SiFirebase },
    ],
  },
];

// ---- Publications ----

export interface PublicationEntry {
  readonly title: string;
  readonly venue: string;
  readonly year: string;
  readonly description: string;
  readonly href: string;
  readonly icon: IconType;
}

export const PUBLICATIONS: readonly PublicationEntry[] = [
  {
    title: "Algorithmic Fairness Perceptions in the Global South: Evidence from Bangladesh",
    venue: "arXiv",
    year: "2026",
    description:
      "A study of how people in Bangladesh judge the fairness of algorithmic decisions, from pricing to allocation. It brings Global South evidence to a fairness literature written mostly from the West.",
    href: "https://arxiv.org/html/2508.05281v3",
    icon: LuScrollText,
  },
  {
    title: "BDLemonLeaf: Image Dataset of Healthy and Disease Lemon (Citrus limon) Leaves",
    venue: "Mendeley Data",
    year: "2025",
    description:
      "An open image dataset of healthy and diseased lemon leaves, collected and labelled for plant disease research. It gives computer-vision models real field imagery to train and benchmark against.",
    href: "https://data.mendeley.com/datasets/643f5bbc2t/6",
    icon: LuDatabase,
  },
];

// ---- Skills (what I can do, distinct from Tech Stack's what I use) ----

/** Display grouping for the Skills panel — organisational only, claims unchanged. */
export type SkillGroup = "Build" | "Connect & Secure" | "Refine & Deliver";

export interface SkillEntry {
  readonly label: string;
  readonly description: string;
  readonly icon: IconType;
  readonly group: SkillGroup;
}

export const SKILL_GROUPS: readonly SkillGroup[] = ["Build", "Connect & Secure", "Refine & Deliver"];

export const SKILLS: readonly SkillEntry[] = [
  { label: "Full-Stack Development", description: "Owning a feature from schema to shipped UI", icon: LuLayers, group: "Build" },
  { label: "Database Design", description: "Normalized relational schemas, indexing", icon: LuDatabase, group: "Build" },
  { label: "API Integration", description: "REST APIs, CRUD operations, server actions", icon: LuNetwork, group: "Build" },
  { label: "Authentication & RBAC", description: "Session management, protected routes, role-based access", icon: LuKeyRound, group: "Connect & Secure" },
  { label: "Payments & Webhooks", description: "Stripe checkout, verification, webhook workflows", icon: LuWebhook, group: "Connect & Secure" },
  { label: "Secure Coding", description: "Protected routes, access control, safe data handling", icon: LuShieldCheck, group: "Connect & Secure" },
  { label: "Performance Optimization", description: "Query tuning, caching, lazy loading, Core Web Vitals", icon: LuGauge, group: "Refine & Deliver" },
  { label: "Debugging", description: "Tracing issues across the full stack to root cause", icon: LuBug, group: "Refine & Deliver" },
  { label: "Project Coordination", description: "Client communication, documentation, stakeholder management", icon: LuBriefcase, group: "Refine & Deliver" },
];

// ---- Currently Learning (placeholder — no source data provided yet) ----

export interface LearningItem {
  readonly label: string;
  readonly note: string;
  readonly progress: number;
  readonly icon: IconType;
}

/** Placeholder growth goals — swap for real ones once provided. */
export const CURRENTLY_LEARNING: readonly LearningItem[] = [
  { label: "Advanced System Design", note: "Scaling patterns for high-traffic apps", progress: 40, icon: LuLayoutGrid },
  { label: "AI/LLM Integration", note: "Bringing LLM features into web products", progress: 30, icon: LuPuzzle },
  { label: "Testing & CI/CD", note: "Automated pipelines and test coverage habits", progress: 25, icon: LuCode },
];

// ---- Quick CV ----

export const CV_SUMMARY = {
  ...ABOUT_INTRO,
  downloadHref: "/cv.pdf",
  headline:
    "Full Stack Developer experienced in designing, developing, and deploying production-ready SaaS applications, proficient across Next.js, React, TypeScript, Node.js, PostgreSQL and Supabase.",
} as const;
