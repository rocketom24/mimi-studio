import { TECH_STACK } from "@/game/data/portfolio";
import { SubHeading } from "./theme";

/** Dining Table -> Tech Stack. What I use, grouped by category with real logos. */
export default function TechStackSection() {
  return (
    <div className="space-y-5">
      {TECH_STACK.map((group) => (
        <div key={group.category}>
          <SubHeading>{group.category}</SubHeading>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {group.items.map(({ name, icon: Icon }) => (
              <div
                key={name}
                title={name}
                className="flex flex-col items-center gap-1.5 border border-[#6f5c9e]/50 bg-[#241c33] px-2 py-2.5 text-center"
              >
                <Icon size={22} className="text-[#ffe9a8]" />
                <span className="font-mono text-[10px] leading-tight text-[#e8ddff]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
