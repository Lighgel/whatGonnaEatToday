import { PlacesPanel } from "./places-panel";

export default function PlacesPage() {
  return (
    <main>
      <p className="mb-4 max-w-xl text-[#6b5e55]">
        用类型、附近地点或菜名缩小范围。每家店可以记招牌菜、开导航、看最近到店。粘贴导入时重名会跳过。
      </p>
      <PlacesPanel />
    </main>
  );
}
