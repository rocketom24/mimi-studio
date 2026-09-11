import { LuDownload } from "react-icons/lu";
import { CV_SUMMARY } from "@/game/data/portfolio";

/** Dressing Table + Almari -> Quick CV. Embeds the actual CV PDF, scrollable in place. */
export default function CvSection() {
  return (
    <div className="space-y-3">
      <iframe
        src={CV_SUMMARY.downloadHref}
        title="CV"
        className="h-[65vh] w-full border-2 border-[#6f5c9e]/50 bg-[#0f0a17]"
      />

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
