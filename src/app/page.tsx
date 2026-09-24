import { RecommendPanel } from "./recommend-panel";

export default function HomePage() {
  return (
    <main>
      <p className="mb-4 max-w-xl text-[#6b5e55]">
        从你的店库里挑，不编假店名。想吃什么、在哪附近都可以搜；地点按真实地理编码，不限城市。结果能开导航。
      </p>
      <RecommendPanel />
    </main>
  );
}
