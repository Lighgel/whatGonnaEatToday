import { getDb } from "../src/db/client";
import { addDishRow, queryPlaces } from "../src/db/places";

const DISHES: { match: string; names: string[] }[] = [
  { match: "仙生生", names: ["鹅肝寿司"] },
  { match: "寅一面屋", names: ["豚骨博多拉面"] },
  { match: "卢布里", names: ["奶酪包"] },
  { match: "亚桥咖喱", names: ["红色羊肉", "芝士烤饼"] },
  { match: "日丰园", names: ["海肠水饺"] },
  { match: "翔峰", names: ["鳗鱼饭"] },
  { match: "潮彩四季", names: ["卤鹅"] },
  { match: "大树餐厅", names: ["乳鸽"] },
  { match: "放牛班", names: ["极品牛肋", "燕翅"] },
  { match: "our bakery", names: ["蒜香牛肉饭", "罗杰意面"] },
  { match: "金湖麻小", names: ["冰醉小龙虾"] },
  { match: "天颜", names: ["过桥米线"] },
  { match: "争鲜", names: ["三文鱼厚切", "赤虾刺身", "满汁鹅肝", "焦糖三文鱼"] },
  { match: "喜鼎", names: ["海胆水饺"] },
  { match: "君霖", names: ["苔菜黄花鱼"] },
  { match: "正黄旗", names: ["烤海鲜"] },
  { match: "a dopo", names: ["gelato"] },
  { match: "千熬鱼汤面", names: ["鱼汤面"] },
  { match: "燚薪", names: ["牛肉饭"] },
  { match: "虎滩羊汤", names: ["羊肉串", "烤羊腿"] },
  { match: "大福饺子馆", names: ["饺子"] },
  { match: "抄麻", names: ["抄手"] },
  { match: "品味居", names: ["海肠捞饭"] },
  { match: "惠·日式拉面", names: ["博多拉面", "酱油拉面"] },
  { match: "常连客", names: ["札幌味增拉面"] },
  { match: "solo tree", names: ["披萨"] },
  { match: "喜欢大盘鸡", names: ["大盘鸡"] },
  { match: "大宝罗", names: ["海胆披萨"] },
  { match: "良渔海屋", names: ["寿喜锅", "烧鸟", "天妇罗"] },
  { match: "龙鮨", names: ["omakase"] },
  { match: "四季酒店", names: ["冰层三烧肉"] },
  { match: "玺玥轩", names: ["冰层三烧肉"] },
];

function compact(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "").replace(/[（）()·・\-]/g, "");
}

async function main() {
  const db = await getDb();
  const places = await queryPlaces(db);
  let added = 0;
  for (const rule of DISHES) {
    const key = compact(rule.match);
    const hits = places.filter((place) => compact(place.name).includes(key) || key.includes(compact(place.name)));
    for (const place of hits) {
      for (const name of rule.names) {
        const before = place.dishes?.some((dish) => dish.name === name);
        const dish = await addDishRow(db, place.id, name);
        if (dish && !before) added += 1;
      }
    }
  }
  console.log(JSON.stringify({ places: places.length, added }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
