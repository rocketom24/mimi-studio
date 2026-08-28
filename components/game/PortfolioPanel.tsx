import { PORTFOLIO_SECTIONS, type PortfolioSectionId } from "@/game/data/portfolio";

interface PortfolioPanelProps {
  sectionId: PortfolioSectionId | null;
  onClose: () => void;
}

/** Cozy pixel-style overlay showing one portfolio section. ESC also closes it, handled in Phaser. */
export default function PortfolioPanel({ sectionId, onClose }: PortfolioPanelProps) {
  if (!sectionId) return null;
  const section = PORTFOLIO_SECTIONS[sectionId];

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-[calc(100vw-2rem)] flex-col border-4 border-[#6f5c9e] bg-[#1e1730] text-[#f2ecff] shadow-[6px_6px_0_0_rgba(0,0,0,0.5)] sm:max-w-md md:max-w-lg">
        <div className="flex items-start justify-between gap-3 border-b-2 border-[#6f5c9e]/40 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
          <h2 className="font-mono text-lg font-bold uppercase tracking-wide text-[#ffe9a8] sm:text-2xl">
            {section.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-[#6f5c9e] font-mono text-sm leading-none text-[#e8ddff] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1730]"
          >
            X
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4 font-sans text-base leading-relaxed text-[#f2ecff] sm:px-6 sm:py-5 sm:text-[17px]">
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
