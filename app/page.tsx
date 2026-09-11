import GameCanvas from "@/components/game/GameCanvas";
import { listFurnitureAssetFiles } from "@/lib/furnitureAssets";

export default function Home() {
  const furnitureAssetFiles = listFurnitureAssetFiles();
  return (
    // h-[100dvh] rather than relying on inset-0 alone: on mobile a fixed
    // element is sized against the LARGE viewport, so the bottom strip sits
    // behind the browser's own chrome until it auto-hides. dvh tracks the
    // visible viewport instead, which is what "fills the phone screen with no
    // overflow" actually needs.
    <div className="fixed inset-0 h-[100dvh] overflow-hidden bg-[#2b1a12]">
      <GameCanvas furnitureAssetFiles={furnitureAssetFiles} />
    </div>
  );
}
