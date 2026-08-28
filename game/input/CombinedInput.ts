import type { InputSource, MovementIntent } from "@/game/types/input";

/** ORs several input sources into one intent, so keyboard and touch drive Mimi without conflict. */
export class CombinedInput implements InputSource {
  constructor(private readonly sources: readonly InputSource[]) {}

  getIntent(): MovementIntent {
    const intent: MovementIntent = { up: false, down: false, left: false, right: false };
    for (const source of this.sources) {
      const i = source.getIntent();
      intent.up ||= i.up;
      intent.down ||= i.down;
      intent.left ||= i.left;
      intent.right ||= i.right;
    }
    return intent;
  }
}
