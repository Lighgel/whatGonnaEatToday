import { RecommendPanel } from "./recommend-panel";

export default function HomePage() {
  return (
    <main>
      <p className="mb-4 max-w-xl text-[#6b5e55]">
        从你自己的店库里选，不从全城海量商家里滑。先用示例数据试一下，再到「我的店库」粘贴美团/抖音收藏。
      </p>
      <RecommendPanel />
    </main>
  );
}
