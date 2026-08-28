import GameCanvas from "@/components/game/GameCanvas";

export default function Home() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <GameCanvas />
    </div>
  );
}
