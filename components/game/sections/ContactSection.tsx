import { CONTACT_LINKS } from "@/game/data/portfolio";

/** Phone + Cabinet -> Contact Me. Clear clickable contact buttons. */
export default function ContactSection() {
  return (
    <div className="space-y-3">
      <p className="font-sans text-sm text-[#c9bce6]">Reach out through any of these — all real, all clickable:</p>
      <div className="grid gap-3 sm:grid-cols-1">
        {CONTACT_LINKS.map(({ label, value, href, icon: Icon }) => (
          <a
            key={label}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="group flex items-center gap-3 border-2 border-[#6f5c9e]/60 bg-[#3a2f4d] px-4 py-3 transition-colors hover:border-[#ffe9a8] hover:bg-[#241c33]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-[#6f5c9e] bg-[#1e1730] text-[#ffe9a8]">
              <Icon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[11px] uppercase tracking-wide text-[#a999c9]">{label}</span>
              <span className="block truncate font-mono text-sm text-[#f2ecff] group-hover:text-[#ffe9a8]">
                {value}
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
