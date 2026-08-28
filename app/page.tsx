import GameCanvas from "@/components/game/GameCanvas";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-black">
      <div className="aspect-video w-full max-w-4xl">
        <GameCanvas />
      </div>
    </div>
  );
}
