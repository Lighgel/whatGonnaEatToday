import { PlacesPanel } from "./places-panel";

export default function PlacesPage() {
  return (
    <main>
      <p className="mb-4 max-w-xl text-[#6b5e55]">
        把美团/抖音收藏复制出来贴在这里。第一版不爬平台，避免账号风险。
      </p>
      <PlacesPanel />
    </main>
  );
}
