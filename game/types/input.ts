export interface MovementIntent {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Produces movement intent from some input device. Keyboard now, touch later. */
export interface InputSource {
  getIntent(): MovementIntent;
}
