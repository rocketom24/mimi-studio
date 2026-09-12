"use client";

import { useEffect, useRef, useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy } from "react-icons/lu";
import { CONTACT_LINKS } from "@/game/data/portfolio";
import { IconTile, Reveal, SectionIntro } from "./theme";

/**
 * Phone + Cabinet -> Contact Me. Each row carries two actions: open it, or
 * copy it. Copying confirms in place — a visitor who taps "copy" should never
 * have to wonder whether it worked.
 */
export default function ContactSection() {
  const [copied, setCopied] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be denied or missing (insecure origin, older
      // browser). The link itself still works, so fail quietly.
      return;
    }
    setCopied(label);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="space-y-4">
      <Reveal index={0}>
        <SectionIntro>Every one of these is real and reachable. Open it, or copy it for later.</SectionIntro>
      </Reveal>

      <ul className="space-y-2.5">
        {CONTACT_LINKS.map(({ label, value, href, icon: Icon }, index) => {
          const isExternal = href.startsWith("http");
          const isCopied = copied === label;
          return (
            <li key={label}>
              <Reveal index={index + 1}>
                <div className="mimi-glass-soft mimi-motion group flex items-center gap-3 rounded-xl pr-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--mimi-line-strong)] hover:shadow-[0_16px_32px_-22px_rgba(0,0,0,0.9)]">
                  <a
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pl-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mimi-gold)]"
                  >
                    <IconTile icon={Icon} size={38} className="group-hover:scale-105" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--mimi-gold-dim)]">
                        {label}
                      </span>
                      <span className="mimi-motion block truncate font-sans text-sm text-[var(--mimi-cream)] transition-colors duration-200 group-hover:text-[var(--mimi-gold)]">
                        {value}
                      </span>
                    </span>
                    <LuArrowUpRight
                      size={16}
                      aria-hidden
                      className="mimi-motion shrink-0 text-[var(--mimi-muted)] opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                    />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopy(label, value)}
                    aria-label={isCopied ? `${label} copied` : `Copy ${label}`}
                    className="mimi-motion flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-transparent text-[var(--mimi-muted)] transition-all duration-200 hover:border-[var(--mimi-line)] hover:bg-white/[0.06] hover:text-[var(--mimi-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mimi-gold)]"
                  >
                    {isCopied ? (
                      <LuCheck size={16} className="text-[var(--mimi-sage)]" />
                    ) : (
                      <LuCopy size={15} />
                    )}
                  </button>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ul>

      <p aria-live="polite" className="h-4 font-mono text-[11px] text-[var(--mimi-sage)]">
        {copied ? `${copied} copied to clipboard` : ""}
      </p>
    </div>
  );
}
