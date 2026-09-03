import GameCanvas from "@/components/game/GameCanvas";
import { listFurnitureAssetFiles } from "@/lib/furnitureAssets";

export default function Home() {
  const furnitureAssetFiles = listFurnitureAssetFiles();
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#2b1a12]">
      <GameCanvas furnitureAssetFiles={furnitureAssetFiles} />
    </div>
  );
}
