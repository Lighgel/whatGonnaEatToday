import { gcj02ToWgs84, wgs84ToGcj02, type Coords, type Origin } from "./geo";
import type { ShopCandidate, TravelMode } from "./types";

export class AmapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmapError";
  }
}

type AmapGeo = {
  formatted_address?: string;
  province?: string;
  city?: string | string[];
  district?: string;
  adcode?: string;
  location?: string;
};

type AmapRegeo = {
  formatted_address?: string;
  addressComponent?: {
    province?: string;
    city?: string | string[];
    district?: string;
    township?: string | string[];
    adcode?: string;
    streetNumber?: { street?: string; number?: string };
  };
};

export type Leg = {
  meters: number;
  seconds: number;
  mode: TravelMode;
};

let lastCall = 0;
const aroundCache = new Map<string, { at: number; shops: ShopCandidate[] }>();

export function amapConfigured(): boolean {
  return Boolean(process.env.AMAP_KEY?.trim());
}

type AmapPoi = {
  id?: string | unknown[];
  name?: string | unknown[];
  location?: string | unknown[];
  pname?: string | unknown[];
  cityname?: string | unknown[];
  adname?: string | unknown[];
  address?: string | unknown[];
  tel?: string | string[];
  type?: string | unknown[];
  business_time?: string | unknown[];
  alias?: string | unknown[];
  biz_ext?: { rating?: string; cost?: string; open_time?: string; tag?: string } | unknown[];
  business?: {
    rating?: string;
    cost?: string;
    opentime_week?: string;
    opentime_today?: string;
    tel?: string;
    tag?: string;
  };
  photos?: Array<{ title?: string; url?: string }>;
  typecode?: string | unknown[];
};

export async function findSavedPlace(name: string, cityBias?: string): Promise<Origin | undefined> {
  const raw = name.trim();
  if (!raw) return undefined;
  const core = raw.replace(/[（(].*?[）)]/g, "").trim() || raw;
  const bias = cityBias?.trim() || "";
  const queries = [...new Set([core, raw])];
  for (const query of queries) {
    const pois = await searchPois(query, bias || undefined, Boolean(bias));
    const hit = pois.find((poi) => nameMatches(text(poi.name), core) && (!bias || cityMatches(poi, bias)));
    if (hit) return poiOrigin(hit);
  }
  if (!bias) return undefined;
  const open = await searchPois(core, undefined, false);
  const hit = open.find((poi) => nameMatches(text(poi.name), core) && cityMatches(poi, bias));
  return hit ? poiOrigin(hit) : undefined;
}

export type PlaceHint = {
  name: string;
  label: string;
  lat?: number;
  lng?: number;
};

export function placeQueryVariants(query: string): string[] {
  const raw = query.trim();
  if (!raw) return [];
  const stripped = raw
    .replace(/附近|周围|一带|左右|外面|外边|外头|那边|那儿|那里|这边|这儿|这里|旁边|门口|对面|那块|这块|附近的/g, " ")
    .replace(/[的了呢吧啊呀嘛，。、!！?？]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set([raw, stripped].filter((item) => item.length >= 2))];
}

export async function findPlace(query: string, cityBias?: string): Promise<Origin | undefined> {
  const bias = cityBias?.trim() || "";
  for (const text of placeQueryVariants(query)) {
    const limited = await searchPois(text, bias || undefined, Boolean(bias));
    const hit = pickPoi(limited, text, bias) ?? (limited[0] ? poiOrigin(limited[0]) : undefined);
    if (hit) return hit;
    const tips = await searchTips(text, bias || undefined);
    const tip = tips.find((item) => item.lat != null && item.lng != null);
    if (tip?.lat != null && tip.lng != null) return { lat: tip.lat, lng: tip.lng, label: tip.label };
    const open = await searchPois(text, undefined, false);
    const worldwide = pickPoi(open, text, bias) ?? (open[0] ? poiOrigin(open[0]) : undefined);
    if (worldwide) return worldwide;
  }
  return undefined;
}

export type ShopMatchHint = {
  area?: string;
  cuisine?: string;
  tags?: string[];
};

export async function searchShopCandidates(query: string, cityBias?: string): Promise<ShopCandidate[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const bias = cityBias?.trim() || "";
  const limited = await searchPois(text, bias || undefined, Boolean(bias), { details: true });
  const food = limited.length ? limited : await searchPois(text, undefined, false, { details: true });
  let open = food.length ? food : await searchPois(text, bias || undefined, Boolean(bias), { restaurants: true, details: true });
  if (!takeShops(open).length) {
    const tips = await searchTips(text, bias || undefined);
    for (const tip of tips.slice(0, 3)) {
      if (!tip.name || foldName(tip.name) === foldName(text)) continue;
      const extra = await searchPois(tip.name, bias || undefined, Boolean(bias), { details: true });
      if (extra.length) {
        open = extra;
        break;
      }
    }
  }
  return takeShops(open);
}

export function pickBestShop(
  placeName: string,
  shops: ShopCandidate[],
  hint: ShopMatchHint = {},
): ShopCandidate | undefined {
  if (!placeName.trim() || !shops.length) return undefined;
  const ranked = shops
    .map((shop) => ({ shop, score: shopMatchScore(placeName, shop, hint) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score <= 0) return undefined;
  if (best.score >= 36) return best.shop;
  const brand = foldName(brandKey(placeName));
  const blob = foldName(shopBlob(best.shop));
  if (brand.length >= 3 && blob.includes(brand)) return best.shop;
  if (areaClose(hint.area, best.shop) && best.score >= 24) return best.shop;
  return undefined;
}

export async function matchShopForPlace(
  name: string,
  cityBias?: string,
  hint: ShopMatchHint = {},
): Promise<ShopCandidate | undefined> {
  const full = name.trim();
  if (full.length < 2) return undefined;
  const seen = new Set<string>();
  const shops: ShopCandidate[] = [];
  const bias = cityBias?.trim() || "";
  const extraCity = cityFromHint(hint);

  const pull = async (city?: string) => {
    for (const query of shopQueryVariants(full, hint)) {
      for (const shop of await searchShopCandidates(query, city)) {
        if (seen.has(shop.poiId)) continue;
        seen.add(shop.poiId);
        shops.push(shop);
      }
      const early = pickBestShop(full, shops, hint);
      if (early && shopMatchScore(full, early, hint) >= 80) return early;
    }
    return pickBestShop(full, shops, hint);
  };

  const first = await pull(bias || undefined);
  const picked =
    first ?? (extraCity && extraCity !== bias ? await pull(extraCity) : undefined) ?? pickBestShop(full, shops, hint);
  if (!picked) return undefined;
  return withShopDetail(picked);
}

async function withShopDetail(picked: ShopCandidate): Promise<ShopCandidate> {
  const detail = await fetchShopDetail(picked.poiId);
  return detail ? { ...picked, ...detail, poiId: picked.poiId, name: picked.name || detail.name } : picked;
}

function isJunkShopName(name: string): boolean {
  return /停车场|停车楼|停车位|加油站|充电站|厕所|洗手间|出入口|\batm\b|电梯|电器|厨卫|京东/.test(name.toLowerCase());
}

function isUnusablePoi(poi: AmapPoi): boolean {
  const code = text(poi.typecode);
  const type = text(poi.type);
  if (/^(11|12|18|19)/.test(code)) return true;
  if (/风景名胜|地名地址|道路|交通设施|通行设施/.test(type)) return true;
  return isJunkShopName(text(poi.name));
}

function takeShops(pois: AmapPoi[]): ShopCandidate[] {
  const seen = new Set<string>();
  const shops: ShopCandidate[] = [];
  for (const poi of pois) {
    if (isUnusablePoi(poi)) continue;
    const shop = toShopCandidate(poi) ?? toShopCandidate(poi, { anyType: true });
    if (!shop || seen.has(shop.poiId) || isJunkShopName(shop.name)) continue;
    seen.add(shop.poiId);
    shops.push(shop);
    if (shops.length >= 8) break;
  }
  return shops;
}

const TRADITIONAL_TO_SIMPLE: Record<string, string> = {
  魚: "鱼",
  飛: "飞",
  東: "东",
  傳: "传",
  長: "长",
  處: "处",
  葉: "叶",
  繪: "绘",
  廳: "厅",
  龍: "龙",
  國: "国",
  門: "门",
  風: "风",
  鳥: "鸟",
  專: "专",
  業: "业",
  園: "园",
  館: "馆",
  飯: "饭",
  燒: "烧",
  雞: "鸡",
  點: "点",
  線: "线",
  後: "后",
  從: "从",
  會: "会",
  這: "这",
  還: "还",
  對: "对",
  開: "开",
  關: "关",
  條: "条",
  號: "号",
  電: "电",
  話: "话",
  樂: "乐",
  廣: "广",
  場: "场",
  區: "区",
  縣: "县",
  島: "岛",
  灣: "湾",
  樓: "楼",
  層: "层",
  飲: "饮",
  總: "总",
  興: "兴",
  漢: "汉",
  華: "华",
  無: "无",
  爲: "为",
  創: "创",
  澤: "泽",
  時: "时",
  間: "间",
  記: "记",
  語: "语",
  銀: "银",
  氣: "气",
  裏: "里",
  麵: "面",
  餃: "饺",
  燈: "灯",
  舊: "旧",
  藝: "艺",
  壽: "寿",
  勝: "胜",
  濱: "滨",
  櫻: "樱",
  萬: "万",
  與: "与",
  發: "发",
  質: "质",
  員: "员",
  際: "际",
  體: "体",
  實: "实",
  產: "产",
  經: "经",
  鄉: "乡",
  鎮: "镇",
  衛: "卫",
  並: "并",
  廠: "厂",
  鷹: "鹰",
  於: "于",
};

const MENU_NOISE =
  /海胆饭|生鱼饭|鱼生饭|海鲜饭|海肠捞饭|炉端烧|烧鸟酒场|烧鸟|刺身|雪蟹|活鳗鱼|活鳗|活鱼|和牛|海胆|放题|自助烤肉|自助餐|自助|omakase|日本料理|日式料理|创意菜|融合日料|专门店|小酒馆|居酒屋|酒场|餐酒馆|大排档|酒店|餐厅|饭店|餐馆|悦全日/gi;

const GENERIC_TOKENS = new Set([
  "大连",
  "辽宁",
  "中国",
  "餐饮",
  "美食",
  "分店",
  "总店",
  "总",
  "店",
  "悦全日",
  "全日",
  "咖啡",
  "酒吧",
  "烧烤",
  "火锅",
  "日料",
  "料理",
  "santa",
  "coffee",
  "cafe",
  "bar",
  "bakery",
  "pizza",
  "kitchen",
  "house",
  "store",
]);
const FAR_REGIONS = ["瓦房店", "金州", "旅顺", "普兰店", "庄河", "长海", "金石滩", "长兴岛", "三十里堡", "开发区"];

function simplifyHan(value: string): string {
  return [...value].map((char) => TRADITIONAL_TO_SIMPLE[char] ?? char).join("");
}

function foldName(value: string): string {
  return simplifyHan(value)
    .replace(/[ぁ-んァ-ン]/g, "")
    .replace(/[\s·・.。,，、&＆'’"“”/\\|_+~!！?？:：;；#@*★☆（）()[\]【】\-—～~]/g, "")
    .toLowerCase();
}

function stripMenuNoise(value: string): string {
  return value.replace(MENU_NOISE, " ").replace(/[·・.\s]+/g, " ").trim();
}

function shopQueryVariants(name: string, hint: ShopMatchHint = {}): string[] {
  const full = name.trim();
  const core = branchless(full);
  const simplified = simplifyHan(core).replace(/[ぁ-んァ-ン]/g, "").replace(/\s+/g, " ").trim();
  const quiet = stripMenuNoise(simplified);
  const chinese = simplified.replace(/[A-Za-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const latin = simplified.match(/[A-Za-z][A-Za-z0-9' ]{1,}/)?.[0]?.trim() ?? "";
  const brand = brandKey(quiet || simplified);
  const rawBranch = full.match(/[（(]([^）)]+)[）)]\s*$/)?.[1]?.replace(/(店|总店)$/g, "").trim() ?? "";
  const queries: string[] = [];
  for (const alt of confusableQueries(full)) queries.push(alt);
  if (brand.length >= 2 && rawBranch.length >= 2) {
    queries.push(`${brand}${rawBranch}店`, `${brand} ${rawBranch}`);
  }
  if (brand.length >= 2 && hint.area?.trim()) queries.push(`${brand} ${hint.area.trim()}`);
  if (full.length <= 16) queries.push(full);
  for (const item of [quiet, simplified, chinese, latin, latin.replace(/['’]/g, ""), brand, core]) {
    if (item && item.length >= 2) queries.push(item);
  }
  const unique: string[] = [];
  for (const item of queries) {
    if (!unique.some((seen) => foldName(seen) === foldName(item))) unique.push(item);
    if (unique.length >= 5) break;
  }
  return unique;
}

function confusableQueries(name: string): string[] {
  const swapped = name
    .replace(/の/g, "")
    .replace(/亨/g, "亭")
    .replace(/粥店/g, "汤店")
    .replace(/山夏/g, "山下");
  return swapped !== name ? [swapped, branchless(swapped)] : [];
}

function brandKey(name: string): string {
  let folded = foldName(stripMenuNoise(name));
  for (const generic of GENERIC_TOKENS) {
    if (folded.startsWith(generic)) folded = folded.slice(generic.length);
  }
  const latin = folded.match(/^[a-z0-9]{3,}/)?.[0];
  if (latin && /^[a-z]/.test(folded)) return latin;
  const cjk2 = folded.match(/^[\u4e00-\u9fff]{2}/)?.[0];
  if (cjk2 && !GENERIC_TOKENS.has(cjk2)) return cjk2;
  const cjk = folded.match(/^[\u4e00-\u9fff]{2,4}/)?.[0];
  return cjk || latin || folded.slice(0, 4);
}

function brandsConfusable(left: string, right: string): boolean {
  if (!left || !right || left === right) return left.length >= 2 && left === right;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) >= 2;
  if (left.length !== 2 || right.length !== 2) return false;
  const pairs = [
    ["亨", "亭"],
    ["粥", "汤"],
    ["夏", "下"],
  ];
  if (left[0] === right[0] && pairs.some(([a, b]) => (left[1] === a && right[1] === b) || (left[1] === b && right[1] === a))) {
    return true;
  }
  let diff = 0;
  for (let i = 0; i < 2; i += 1) if (left[i] !== right[i]) diff += 1;
  return diff === 1 && left[0] === right[0];
}

function tokensOf(name: string): string[] {
  const folded = foldName(stripMenuNoise(name));
  return [...folded.matchAll(/[a-z0-9]{2,}|[\u4e00-\u9fff]{2,}/g)]
    .map((match) => match[0])
    .filter((token) => !GENERIC_TOKENS.has(token));
}

function tokenClose(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (GENERIC_TOKENS.has(left) || GENERIC_TOKENS.has(right)) return false;
  if (left === right) return left.length >= 2;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return shorter.length >= 4 && longer.includes(shorter);
}

function parseShopBranch(name: string): { stem: string; branch: string } {
  const raw = name.trim();
  const matched = raw.match(/^(.*?)[（(]([^）)]+)[）)]\s*$/);
  return {
    stem: foldName(stripMenuNoise(matched ? matched[1] : raw)),
    branch: foldName(matched ? matched[2] : ""),
  };
}

function branchesClose(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  return left === "本店" || left === "总店" || right === "本店" || right === "总店";
}

function regionOf(blob: string): string | undefined {
  const folded = foldName(blob);
  return FAR_REGIONS.find((region) => folded.includes(foldName(region)));
}

function cityFromHint(hint: ShopMatchHint): string {
  const blob = hint.area?.trim() ?? "";
  return FAR_REGIONS.find((region) => blob.includes(region)) ?? "";
}

function shopBlob(shop: ShopCandidate): string {
  return [shop.name, shop.area, shop.address, shop.label, shop.cuisine, ...(shop.tags ?? [])].filter(Boolean).join(" ");
}

const AREA_KEYS = [
  "星海",
  "东港",
  "南山",
  "西安路",
  "人民路",
  "天津街",
  "民主",
  "友好",
  "奥林匹克",
  "港湾",
  "高新",
  "黑石礁",
  "香炉礁",
  "老虎滩",
  "森林动物园",
  "胜利广场",
  "三八",
  "中山广场",
  "罗斯福",
  "恒隆",
  "万达",
  "五四",
  "梭鱼湾",
  "钻石湾",
  "长兴岛",
  "八一路",
  "北京街",
  "凌水",
  "红凌",
  "山东路",
  "华南",
  "勤俭",
  "一方国际",
  "民主广场",
  "中山广场",
];

function areaClose(hintArea: string | undefined, shop: ShopCandidate): boolean {
  const a = foldName(hintArea ?? "");
  if (a.length < 2) return false;
  const b = foldName(shopBlob(shop));
  if (b.includes(a) || a.includes(b)) return true;
  return AREA_KEYS.some((key) => {
    const token = foldName(key);
    return token.length >= 2 && a.includes(token) && b.includes(token);
  });
}

function placeWantsNonFood(hint: ShopMatchHint): boolean {
  const blob = `${hint.cuisine ?? ""} ${(hint.tags ?? []).join(" ")}`;
  return /酒店|超市|便利|livehouse/.test(blob);
}

function shopMatchScore(placeName: string, shop: ShopCandidate, hint: ShopMatchHint = {}): number {
  if (isJunkShopName(shop.name)) return 0;
  const shopType = `${shop.cuisine ?? ""} ${shop.tags.join(" ")} ${shop.name}`;
  if (!placeWantsNonFood(hint) && /住宅|小区|公寓|电器|写字楼/.test(shopType) && !/餐|料理|寿司|火锅|烧烤|咖啡|酒吧|面|饭|茶/.test(shop.name)) {
    return 0;
  }
  const placeBranch = parseShopBranch(placeName);
  const shopBranch = parseShopBranch(shop.name);
  if (placeBranch.branch && shopBranch.branch && !branchesClose(placeBranch.branch, shopBranch.branch)) return 0;

  const placeRegion = regionOf(`${placeName} ${hint.area ?? ""}`);
  const shopRegion = regionOf(shopBlob(shop));
  const placeBlob = foldName(`${placeName} ${hint.area ?? ""}`);
  if (placeRegion && shopRegion && placeRegion !== shopRegion) return 0;
  if (placeRegion && !foldName(shopBlob(shop)).includes(foldName(placeRegion))) return 0;
  if (shopRegion && !placeBlob.includes(foldName(shopRegion))) return 0;

  const needle = foldName(stripMenuNoise(branchless(placeName)));
  const hit = foldName(stripMenuNoise(branchless(shop.name)));
  if (!needle || !hit) return 0;

  let score = 0;
  if (needle === hit) score = 100;
  else if (hit.includes(needle) || needle.includes(hit)) score = 82;
  else {
    const shorter = needle.length < hit.length ? needle : hit;
    const longer = needle.length < hit.length ? hit : needle;
    if (shorter.length >= 3 && longer.includes(shorter)) score = 76;
    else if (shorter.length >= 4 && longer.includes(shorter.slice(0, Math.min(6, shorter.length)))) score = 62;
  }

  const placeBrand = brandKey(placeName);
  const shopBrand = brandKey(shop.name);
  if (placeBrand && shopBrand && brandsConfusable(placeBrand, shopBrand)) {
    score = Math.max(score, placeBrand.length >= 4 || shopBrand.length >= 4 ? 74 : 68);
  }

  const placeCjk = foldName(stripMenuNoise(branchless(placeName))).match(/[\u4e00-\u9fff]{2}/)?.[0] ?? "";
  const shopCjk = foldName(stripMenuNoise(branchless(shop.name))).match(/[\u4e00-\u9fff]{2}/)?.[0] ?? "";
  if (placeCjk.length === 2 && shopCjk.length === 2 && !brandsConfusable(placeCjk, shopCjk) && score < 82 && !areaClose(hint.area, shop)) {
    return 0;
  }

  const placeTokens = tokensOf(placeName);
  const shopTokens = tokensOf(shop.name);
  const overlap = placeTokens.filter((token) => shopTokens.some((item) => tokenClose(token, item)));
  if (overlap.length) {
    const ratio = overlap.length / Math.min(placeTokens.length || 1, shopTokens.length || 1);
    score = Math.max(score, Math.round(40 + ratio * 40));
  }

  if (areaClose(hint.area, shop)) score += 18;
  const cuisine = foldName(hint.cuisine ?? "");
  if (cuisine.length >= 2 && foldName(shopBlob(shop)).includes(cuisine)) score += 8;

  return Math.min(100, score);
}

export async function fetchShopDetail(poiId: string): Promise<ShopCandidate | undefined> {
  const id = poiId.trim();
  if (!id) return undefined;
  let fromV3: ShopCandidate | undefined;
  try {
    const v3 = (await amapGet("/v3/place/detail", { id, extensions: "all" })) as { pois?: AmapPoi[] };
    fromV3 = v3.pois?.[0] ? toShopCandidate(v3.pois[0], { anyType: true }) : undefined;
  } catch {
    fromV3 = undefined;
  }
  let fromV5: ShopCandidate | undefined;
  try {
    const v5 = (await amapGet("/v5/place/detail", { id, show_fields: "business" })) as { pois?: AmapPoi[] };
    fromV5 = v5.pois?.[0] ? toShopCandidate(v5.pois[0], { anyType: true }) : undefined;
  } catch {
    fromV5 = undefined;
  }
  return mergeShop(fromV3, fromV5);
}

function branchless(name: string): string {
  return name.replace(/[（(].*?[）)]/g, "").replace(/(总店|分店)$/g, "").trim() || name.trim();
}

export async function suggestPlaces(query: string, cityBias?: string): Promise<PlaceHint[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const bias = cityBias?.trim() || "";
  const [tips, pois] = await Promise.all([
    searchTips(text, bias || undefined),
    searchPois(placeQueryVariants(text)[0] ?? text, bias || undefined, Boolean(bias)),
  ]);
  const seen = new Set<string>();
  const merged: PlaceHint[] = [];
  for (const item of [...tips, ...pois.map(poiToHint).filter((hint): hint is PlaceHint => Boolean(hint))]) {
    const key = item.label || item.name;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 8) break;
  }
  return merged;
}

export async function geocodeAddress(query: string, cityBias?: string): Promise<Origin | undefined> {
  const address = query.trim();
  if (!address) return undefined;
  const bias = cityBias?.trim() || "";
  const biased = bias ? await searchGeo(address, bias) : [];
  const preferred = biased.find((item) => coversCity(item, bias));
  if (preferred) return toOrigin(preferred);
  const worldwide = await searchGeo(address);
  const hit = worldwide[0] ?? biased[0];
  return hit ? toOrigin(hit) : undefined;
}

export async function reverseArea(coord: Coords): Promise<{ label: string; adcode?: string; city?: string }> {
  const gcj = wgs84ToGcj02(coord);
  const body = (await amapGet("/v3/geocode/regeo", {
    location: pair(gcj),
    extensions: "base",
    radius: "500",
  })) as { regeocode?: AmapRegeo };
  const regeo = body.regeocode;
  const part = regeo?.addressComponent;
  const township = text(part?.township);
  const street = [part?.streetNumber?.street, part?.streetNumber?.number].filter(Boolean).join("");
  const city = text(part?.city) || text(part?.province);
  const label = [township || text(part?.district), street, city].filter(Boolean).join(" · ");
  return {
    label: label || regeo?.formatted_address?.trim() || `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`,
    adcode: part?.adcode?.trim() || undefined,
    city: city || undefined,
  };
}

export async function reverseLabel(coord: Coords): Promise<string> {
  return (await reverseArea(coord)).label;
}

export async function fetchLiveWeather(adcode: string): Promise<{ weather: string; temperature: number; city: string } | undefined> {
  const city = adcode.trim();
  if (!city) return undefined;
  const body = (await amapGet("/v3/weather/weatherInfo", { city, extensions: "base" })) as {
    lives?: Array<{ weather?: string; temperature?: string; city?: string }>;
  };
  const live = body.lives?.[0];
  const weather = live?.weather?.trim();
  const temperature = Number(live?.temperature);
  if (!weather) return undefined;
  return {
    weather,
    temperature: Number.isFinite(temperature) ? temperature : 0,
    city: live?.city?.trim() || "",
  };
}

export async function locateByIp(ip?: string): Promise<Origin | undefined> {
  const params: Record<string, string> = {};
  if (ip) params.ip = ip;
  const body = (await amapGet("/v3/ip", params)) as {
    province?: unknown;
    city?: unknown;
    adcode?: unknown;
    rectangle?: unknown;
  };
  const province = text(body.province);
  const city = text(body.city);
  const adcode = text(body.adcode);
  const place = city || province;
  const coords = rectangleCenter(text(body.rectangle));
  if (!place || !coords) return undefined;
  return {
    ...coords,
    label: `${place}（按网络位置）`,
    adcode: adcode || undefined,
    fromIp: true,
  };
}

function rectangleCenter(rectangle: string): Coords | undefined {
  const chunks = rectangle.split(";").map((part) => part.split(",").map(Number));
  if (chunks.length !== 2) return undefined;
  const [lng1, lat1] = chunks[0];
  const [lng2, lat2] = chunks[1];
  if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return undefined;
  return gcj02ToWgs84({
    lat: (lat1 + lat2) / 2,
    lng: (lng1 + lng2) / 2,
  });
}

export async function searchAroundShops(
  origin: Coords,
  radiusKm: number,
  keywords?: string,
): Promise<ShopCandidate[]> {
  const gcj = wgs84ToGcj02(origin);
  const radius = Math.round(Math.min(8, Math.max(1, radiusKm)) * 1000);
  const needle = keywords?.trim() ?? "";
  const cacheKey = `${gcj.lat.toFixed(3)},${gcj.lng.toFixed(3)},${radius},${needle}`;
  const cached = aroundCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 15 * 60_000) return cached.shops;
  const params: Record<string, string> = {
    location: pair(gcj),
    radius: String(radius),
    types: "050000",
    offset: "15",
    page: "1",
    extensions: "all",
    sortrule: needle ? "weight" : "distance",
  };
  if (needle) params.keywords = needle;
  const body = (await amapGet("/v3/place/around", params)) as { pois?: AmapPoi[] };
  const shops: ShopCandidate[] = [];
  const seen = new Set<string>();
  for (const poi of body.pois ?? []) {
    const shop = toShopCandidate(poi, { anyType: Boolean(needle) });
    if (!shop || seen.has(shop.poiId)) continue;
    seen.add(shop.poiId);
    shops.push(shop);
    if (shops.length >= 12) break;
  }
  aroundCache.set(cacheKey, { at: Date.now(), shops });
  return shops;
}

export async function measureLegs(origin: Coords, targets: Coords[], mode: TravelMode): Promise<Array<Leg | undefined>> {
  if (!targets.length) return [];
  const body = (await amapGet("/v3/distance", {
    origins: targets.map((item) => pair(wgs84ToGcj02(item))).join("|"),
    destination: pair(wgs84ToGcj02(origin)),
    type: mode === "walk" ? "3" : "1",
  })) as { results?: Array<{ origin_id?: string; distance?: string; duration?: string }> };
  const legs: Array<Leg | undefined> = targets.map(() => undefined);
  for (const row of body.results ?? []) {
    const index = Number(row.origin_id) - 1;
    const meters = Number(row.distance);
    const seconds = Number(row.duration);
    if (!Number.isInteger(index) || index < 0 || index >= targets.length) continue;
    if (!Number.isFinite(meters) || !Number.isFinite(seconds) || meters <= 0 || seconds <= 0) continue;
    legs[index] = { meters, seconds, mode };
  }
  return legs;
}

type AmapTip = {
  name?: string;
  district?: string;
  address?: string | string[];
  location?: string;
};

async function searchTips(keywords: string, city?: string): Promise<PlaceHint[]> {
  const params: Record<string, string> = { keywords, datatype: "all" };
  if (city) params.city = city;
  const body = (await amapGet("/v3/assistant/inputtips", params)) as { tips?: AmapTip[] };
  return (body.tips ?? []).map(tipToHint).filter((item): item is PlaceHint => Boolean(item));
}

function tipToHint(tip: AmapTip): PlaceHint | undefined {
  const name = text(tip.name);
  if (!name) return undefined;
  const label = [name, text(tip.address), text(tip.district)].filter(Boolean).join(" · ");
  const [lng, lat] = text(tip.location).split(",").map(Number);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const wgs = gcj02ToWgs84({ lat, lng });
    return { name, label, lat: wgs.lat, lng: wgs.lng };
  }
  return { name, label };
}

function poiToHint(poi: AmapPoi): PlaceHint | undefined {
  const origin = poiOrigin(poi);
  if (!origin) return undefined;
  return { name: text(poi.name) || origin.label, label: origin.label, lat: origin.lat, lng: origin.lng };
}

function pickPoi(pois: AmapPoi[], query: string, cityBias: string): Origin | undefined {
  const needle = compact(query);
  const ranked = pois
    .map((poi) => ({ poi, origin: poiOrigin(poi) }))
    .filter((item): item is { poi: AmapPoi; origin: Origin } => Boolean(item.origin))
    .map((item) => {
      const blob = compact([item.poi.name, item.poi.address, item.poi.adname, item.poi.cityname].map(text).join(""));
      let score = 0;
      if (cityBias && cityMatches(item.poi, cityBias)) score += 5;
      if (needle && (blob.includes(needle) || needle.includes(compact(text(item.poi.name))))) score += 3;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.origin;
}

async function searchPois(
  keywords: string,
  city: string | undefined,
  citylimit: boolean,
  options: { restaurants?: boolean; details?: boolean } = {},
): Promise<AmapPoi[]> {
  const params: Record<string, string> = {
    keywords,
    offset: "8",
    page: "1",
    extensions: options.details ? "all" : "base",
  };
  if (options.restaurants) params.types = "050000";
  if (city) params.city = city;
  if (citylimit) params.citylimit = "true";
  const body = (await amapGet("/v3/place/text", params)) as { pois?: AmapPoi[] };
  return body.pois ?? [];
}

function mergeShop(a?: ShopCandidate, b?: ShopCandidate): ShopCandidate | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    ...a,
    tel: a.tel || b.tel,
    rating: a.rating ?? b.rating,
    cost: a.cost ?? b.cost,
    openTime: a.openTime || b.openTime,
    feature: a.feature || b.feature,
    address: a.address || b.address,
    cuisine: a.cuisine || b.cuisine,
    tags: a.tags.length ? a.tags : b.tags,
  };
}

function toShopCandidate(poi: AmapPoi, options: { anyType?: boolean } = {}): ShopCandidate | undefined {
  const origin = poiOrigin(poi);
  const poiId = text(poi.id);
  const name = text(poi.name);
  if (!origin || !poiId || !name) return undefined;
  if (!options.anyType && !isFoodPoi(poi)) return undefined;
  const ext = asBiz(poi.biz_ext);
  const biz = poi.business;
  const generic = new Set(["餐饮服务", "餐饮相关场所", "餐饮相关", "中餐店", "中餐厅"]);
  const typeParts = text(poi.type)
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !generic.has(part));
  const cuisine = typeParts.at(-1) || typeParts[0];
  const tags = typeParts.slice(0, 4);
  const rating = parseLooseNumber(ext.rating ?? biz?.rating);
  const cost = parseLooseNumber(ext.cost ?? biz?.cost);
  const feature = text(ext.tag) || text(biz?.tag) || text(poi.alias);
  return {
    poiId,
    name,
    label: origin.label,
    address: text(poi.address) || undefined,
    area: [text(poi.adname), text(poi.cityname)].filter(Boolean).join(" · ") || undefined,
    tel: firstTel(poi.tel) || firstTel(biz?.tel),
    cuisine,
    tags,
    rating: rating != null && rating > 0 ? rating : undefined,
    cost: cost != null && cost > 0 ? Math.round(cost) : undefined,
    openTime:
      text(ext.open_time) ||
      text(poi.business_time) ||
      text(biz?.opentime_week) ||
      text(biz?.opentime_today) ||
      undefined,
    feature: feature || undefined,
    lat: origin.lat,
    lng: origin.lng,
  };
}

function isFoodPoi(poi: AmapPoi): boolean {
  const type = text(poi.type);
  const code = text(poi.typecode);
  if (code.startsWith("05")) return true;
  if (!type && !code) return true;
  return /餐饮|美食|火锅|小吃|甜品|咖啡|烧烤|面|餐厅|酒楼|糕|面包|烘焙|茶|饮|酒吧|餐/.test(type);
}

function asBiz(raw: AmapPoi["biz_ext"]): { rating?: string; cost?: string; open_time?: string; tag?: string } {
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return {};
  return raw;
}

function parseLooseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value) return undefined;
  const matched = value.match(/[\d.]+/);
  if (!matched) return undefined;
  const num = Number(matched[0]);
  return Number.isFinite(num) ? num : undefined;
}

function firstTel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() && value !== "[]") return value.split(";")[0]?.trim();
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim() || undefined;
  return undefined;
}

function poiOrigin(poi: AmapPoi): Origin | undefined {
  const [lng, lat] = text(poi.location).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const wgs = gcj02ToWgs84({ lat, lng });
  const label = [poi.name, poi.address, poi.adname, poi.cityname].map(text).filter(Boolean).join(" · ");
  return { ...wgs, label: label || `${wgs.lat.toFixed(4)}, ${wgs.lng.toFixed(4)}` };
}

function nameMatches(poiName: string, core: string): boolean {
  const left = compact(poiName);
  const right = compact(core);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function cityMatches(poi: AmapPoi, bias: string): boolean {
  return [poi.cityname, poi.pname, poi.adname, poi.address].map(text).filter(Boolean).join("").includes(bias);
}

function compact(value: string): string {
  return foldName(value);
}

async function searchGeo(address: string, city?: string): Promise<AmapGeo[]> {
  const params: Record<string, string> = { address };
  if (city) params.city = city;
  const body = (await amapGet("/v3/geocode/geo", params)) as { geocodes?: AmapGeo[] };
  return body.geocodes ?? [];
}

async function amapGet(path: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.AMAP_KEY?.trim();
  if (!key) {
    throw new AmapError("还没有高德 Key。在项目根目录的 .env.local 里写 AMAP_KEY=你的 Web 服务密钥。");
  }
  const url = new URL(`https://restapi.amap.com${path}`);
  url.searchParams.set("key", key);
  url.searchParams.set("output", "JSON");
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  let lastInfo = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt) await delay(900 * attempt);
    const response = await pacedFetch(url);
    if (!response.ok) {
      lastInfo = `HTTP ${response.status}`;
      continue;
    }
    const body = (await response.json()) as { status?: string; info?: string; infocode?: string };
    if (body.status === "1") return body;
    const problem = keyProblem(body.info);
    if (problem) throw new AmapError(problem);
    if (qpsLimited(body.info, body.infocode)) {
      lastInfo = body.info ?? "CUQPS";
      continue;
    }
    if (emptyResult(body.info, body.infocode)) {
      return { ...body, geocodes: [], pois: [], tips: [] };
    }
    throw new AmapError(`高德没有返回结果（${body.info ?? "未知错误"}）。`);
  }
  throw new AmapError(`高德没有返回结果（${lastInfo || "未知错误"}）。`);
}

function emptyResult(info?: string, infocode?: string): boolean {
  return (
    info === "ENGINE_RESPONSE_DATA_ERROR" ||
    info === "UNKNOWN_ERROR" ||
    infocode === "20000" ||
    infocode === "30001"
  );
}

function qpsLimited(info?: string, infocode?: string): boolean {
  return info === "CUQPS_HAS_EXCEEDED_THE_LIMIT" || infocode === "10021" || Boolean(info?.includes("CUQPS"));
}

function keyProblem(info?: string): string | undefined {
  if (info === "INVALID_USER_KEY") return "高德 Key 无效。";
  if (info === "USERKEY_PLAT_NOMATCH") return "这个 Key 不是 Web 服务类型。";
  if (info === "DAILY_QUERY_OVER_LIMIT" || info === "USER_DAILY_QUERY_OVER_LIMIT") return "高德今天的免费额度用完了。";
  return undefined;
}

async function pacedFetch(url: URL): Promise<Response> {
  const wait = Math.max(0, 650 - (Date.now() - lastCall));
  if (wait) await delay(wait);
  lastCall = Date.now();
  return fetch(url, { cache: "no-store" });
}

function toOrigin(geo: AmapGeo): Origin | undefined {
  const [lng, lat] = text(geo.location).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const wgs = gcj02ToWgs84({ lat, lng });
  const city = text(geo.city);
  const label = text(geo.formatted_address) || [text(geo.province), city, text(geo.district)].filter(Boolean).join("");
  return {
    ...wgs,
    label: label || `${wgs.lat.toFixed(4)}, ${wgs.lng.toFixed(4)}`,
    adcode: text(geo.adcode) || undefined,
  };
}

function coversCity(geo: AmapGeo, cityBias: string): boolean {
  const city = text(geo.city);
  const blob = [text(geo.formatted_address), text(geo.province), city, text(geo.district)].filter(Boolean).join("");
  return blob.includes(cityBias);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pair(coord: Coords): string {
  return `${coord.lng.toFixed(6)},${coord.lat.toFixed(6)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
