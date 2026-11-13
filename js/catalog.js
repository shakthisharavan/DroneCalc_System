// Drone parts catalog, currencies and regional stores. Prices/links checked on 2026-11-06, may drift.
// Item links are product pages seen live (search results or fetched) on 2026-11-06; stock and prices change.
// Each link carries its store's region (STORE_REGION); brand stores and worldwide shippers are GLOBAL.
// Search links are not stored: localLinks() builds them from the REGIONS store search templates.
// Specs are manufacturer or retailer ballpark figures, not bench data. "est." marks values with no published figure.
// v3 (2026-11-07): fixed-wing airframes, tiltrotor airframes + tilt kits/servos, FPV 5/7/10 classes (specs.fpvClass); URLs seen in live search results.
// v4 (2026-11-08): specs.connector on batteries and ESCs (stock lead; "pads" = bare leads, solder your own), ESC minCells,
// frame maxPropInch (adjacent motor spacing less ~1 in clearance; FPV frames per maker). Pixhawk bundle connector = its power module input.

// Mid-market rates from open.er-api.com on 2026-11-06, cross-checked with the ECB rates (frankfurter.dev, 2026-11-05).
export const CURRENCIES = {
  USD: { name: "US dollar", symbol: "$", perUsd: 1, decimals: 2 },
  EUR: { name: "Euro", symbol: "€", perUsd: 0.8905, decimals: 2 },
  GBP: { name: "British pound", symbol: "£", perUsd: 0.7429, decimals: 2 },
  INR: { name: "Indian rupee", symbol: "₹", perUsd: 94.54, decimals: 2 },
  CAD: { name: "Canadian dollar", symbol: "CA$", perUsd: 1.399, decimals: 2 },
  AUD: { name: "Australian dollar", symbol: "A$", perUsd: 1.438, decimals: 2 },
  AED: { name: "UAE dirham", symbol: "AED", perUsd: 3.6725, decimals: 2 },
  SGD: { name: "Singapore dollar", symbol: "S$", perUsd: 1.278, decimals: 2 },
  JPY: { name: "Japanese yen", symbol: "¥", perUsd: 157.8, decimals: 0 },
  CNY: { name: "Chinese yuan", symbol: "CN¥", perUsd: 6.683, decimals: 2 },
  CHF: { name: "Swiss franc", symbol: "CHF", perUsd: 0.8162, decimals: 2 },
  ZAR: { name: "South African rand", symbol: "R", perUsd: 16.45, decimals: 2 },
  BRL: { name: "Brazilian real", symbol: "R$", perUsd: 5.468, decimals: 2 },
  SAR: { name: "Saudi riyal", symbol: "SAR", perUsd: 3.75, decimals: 2 },
  NZD: { name: "New Zealand dollar", symbol: "NZ$", perUsd: 1.784, decimals: 2 },
  KRW: { name: "South Korean won", symbol: "₩", perUsd: 1348, decimals: 0 },
  MYR: { name: "Malaysian ringgit", symbol: "RM", perUsd: 4.046, decimals: 2 },
};
export const RATES_NOTE = "Approximate exchange rates as of 2026-11-06. Prices are converted from USD list prices; local prices differ (duties, shipping). Verify at checkout.";

// Search templates, {q} = encodeURIComponent(brand + " " + name). Checked 2026-11-06: Flying Tech and Lazada fetched;
// Amazon, RotorGeeks, Rakuten, noon, eBay and AliExpress seen live in this exact pattern; RaceDayQuads and Phaser FPV
// (Shopify /search), Zbotic (WooCommerce ?s=) and GetFPV (Magento catalogsearch) follow their platform's standard route.
export const REGIONS = {
  US: { name: "United States", currency: "USD", stores: [
    { store: "GetFPV", searchUrl: "https://www.getfpv.com/catalogsearch/result/?q={q}" },
    { store: "RaceDayQuads", searchUrl: "https://www.racedayquads.com/search?q={q}" },
    { store: "Amazon.com", searchUrl: "https://www.amazon.com/s?k={q}" }] },
  CA: { name: "Canada", currency: "CAD", stores: [
    { store: "Amazon.ca", searchUrl: "https://www.amazon.ca/s?k={q}" },
    { store: "RotorGeeks", searchUrl: "https://rotorgeeks.com/index.php?route=product/search&search={q}" }] },
  GB: { name: "United Kingdom", currency: "GBP", stores: [
    { store: "Amazon.co.uk", searchUrl: "https://www.amazon.co.uk/s?k={q}" },
    { store: "Flying Tech", searchUrl: "https://www.flyingtech.co.uk/search/{q}/" }] },
  EU: { name: "European Union", currency: "EUR", stores: [
    { store: "Amazon.de", searchUrl: "https://www.amazon.de/s?k={q}" },
    { store: "eBay.de", searchUrl: "https://www.ebay.de/sch/i.html?_nkw={q}" }] },
  IN: { name: "India", currency: "INR", stores: [
    { store: "Amazon.in", searchUrl: "https://www.amazon.in/s?k={q}" },
    { store: "Zbotic", searchUrl: "https://zbotic.in/?s={q}&post_type=product" }] },
  AU: { name: "Australia", currency: "AUD", stores: [
    { store: "Amazon.com.au", searchUrl: "https://www.amazon.com.au/s?k={q}" },
    { store: "Phaser FPV", searchUrl: "https://phaserfpv.com.au/search?q={q}" }] },
  AE: { name: "United Arab Emirates", currency: "AED", stores: [
    { store: "Amazon.ae", searchUrl: "https://www.amazon.ae/s?k={q}" },
    { store: "noon", searchUrl: "https://www.noon.com/uae-en/search?q={q}" }] },
  SG: { name: "Singapore", currency: "SGD", stores: [
    { store: "Amazon.sg", searchUrl: "https://www.amazon.sg/s?k={q}" },
    { store: "Lazada", searchUrl: "https://www.lazada.sg/catalog/?q={q}" }] },
  JP: { name: "Japan", currency: "JPY", stores: [
    { store: "Amazon.co.jp", searchUrl: "https://www.amazon.co.jp/s?k={q}" },
    { store: "Rakuten", searchUrl: "https://search.rakuten.co.jp/search/mall/{q}/" }] },
  GLOBAL: { name: "International", currency: "USD", stores: [
    { store: "eBay", searchUrl: "https://www.ebay.com/sch/i.html?_nkw={q}" },
    { store: "AliExpress", searchUrl: "https://www.aliexpress.com/w/wholesale-{q}.html" }] },
};

const has = (o, k) => typeof k === "string" && Object.hasOwn(o, k);
export const regionForCurrency = (code) => Object.keys(REGIONS).find((r) => r !== "GLOBAL" && REGIONS[r].currency === code) ?? "GLOBAL";
const rate = (cur) => (has(CURRENCIES, cur) ? CURRENCIES[cur].perUsd : 1);
export const toUsd = (amount, cur) => amount / rate(cur);
export const fromUsd = (usd, cur) => usd * rate(cur);

export function formatMoney(usd, cur, { iso = false } = {}) {
  const code = has(CURRENCIES, cur) ? cur : "USD", d = CURRENCIES[code].decimals;
  const v = fromUsd(Number.isFinite(Number(usd)) ? Number(usd) : 0, code);
  const digits = { minimumFractionDigits: d, maximumFractionDigits: d };
  // en-US keeps the iso form ASCII: digits, "," grouping, "." decimals, "-" sign
  return iso ? `${code} ${new Intl.NumberFormat("en-US", digits).format(v)}` : new Intl.NumberFormat("en-US", { style: "currency", currency: code, ...digits }).format(v);
}

// Local product listings first, then the region's store searches, then GLOBAL listings and searches; deduped by URL.
export function localLinks(item, region) {
  const reg = has(REGIONS, region) ? region : "GLOBAL", q = encodeURIComponent(`${item.brand} ${item.name}`);
  const own = (r) => (item.links || []).filter((l) => l.kind === "product" && (l.region || "GLOBAL") === r)
    .map((l) => ({ store: l.store, url: l.url, kind: "product", region: r, local: r === reg }));
  const search = (r) => REGIONS[r].stores.map((s) => ({ store: s.store, url: s.searchUrl.replace("{q}", q), kind: "search", region: r, local: r === reg }));
  const seen = new Set();
  return [...own(reg), ...search(reg), ...own("GLOBAL"), ...search("GLOBAL")].filter((l) => !seen.has(l.url) && seen.add(l.url));
}

const STORE_REGION = {
  GetFPV: "US", RaceDayQuads: "US", "IR-Lock": "US", WREKD: "US", Lumenier: "US", Pyrodrone: "US", HeliDirect: "US",
  "Aloft Hobbies": "US", "ReadyMadeRC": "US", MAPIR: "US", "AVC Store": "US", Genstattu: "US",
  "Epic FPV": "CA", RotorGeeks: "CA", "WREKD Canada": "CA", "Amazon.ca": "CA",
  "Flying Tech": "GB", "Unmanned Tech Shop": "GB", "3DXR": "GB", HobbyRC: "GB", "Amazon.co.uk": "GB",
  Studiosport: "EU", FPV24: "EU", Rotorama: "EU", "Drone-FPV-Racer": "EU", "N-Factory": "EU", Maxterdrone: "EU",
  "Gens Ace EU": "EU", OneDrone: "EU", "Baltic Drones": "EU", "HobbyDrone.cz": "EU",
  "Robu.in": "IN", Zbotic: "IN", "Amazon.in": "IN", "DRK Store": "IN", Robocraze: "IN", "Emax USA": "US", RobotShop: "US",
  "Phaser FPV": "AU", "FPV Faster": "AU", "Amazon.com.au": "AU",
  "RC Corner": "AE", "Amazon.ae": "AE", "Amazon.sg": "SG", "Amazon.co.jp": "JP",
  // v3 stores
  MyFPVStore: "US", BuddyRC: "US", "Flite Test": "US", "Rotor Village": "CA", "RobotShop CA": "CA", "RobotShop UK": "GB",
  "RobotShop EU": "EU", "Racer.lt": "EU", "Motion RC EU": "EU", "BZB UAS": "EU", "iFlight-RC EU": "EU", xboom: "IN", "Indian Robo Store": "IN", Probots: "IN",
  Megadron: "EU", Sigmanortec: "EU", "Think Robotics": "IN", BuzzFPV: "AU",
};
const P = (store, url) => ({ store, url, kind: "product", region: STORE_REGION[store] ?? "GLOBAL" });

const ALL = ["delivery", "inspection", "agriculture", "interceptor", "mapping", "fpv"];
const VELOX = "https://www.getfpv.com/t-motor-velox-v2306-v3-motor-1750kv-1950kv-2550kv.html";
const VELOX_AU = [P("Phaser FPV", "https://phaserfpv.com.au/products/t-motor-velox-v2306-v30-motor"),
  P("FPV Faster", "https://fpvfaster.com.au/products/t-motor-velox-v3-v2306-brushless-racing-4-6s-motor-1750-1950-2550kv")];

export const CATALOG = [
  // ---- frames ----
  { id: "frame-evoque-f5x", category: "frame", name: "Nazgul Evoque F5X V2.5 Frame Kit", brand: "iFlight", priceUsd: 90, weightG: 240,
    specs: { sizeMm: 225, material: "carbon", configuration: "quad", fpvClass: "5", maxPropInch: 5.1 }, tags: ["fpv", "interceptor"],
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/iflight-nazgul-evoque-f5x-v2-5-frame-kit-w-led-side-plates"), P("GetFPV", "https://www.getfpv.com/iflight-nazgul-evoque-f5-hd-analog-frame-kit-f5x-squashed-x.html")] },
  { id: "frame-evoque-f5d", category: "frame", name: "Nazgul Evoque F5D V2 DeadCat Frame Kit", brand: "iFlight", priceUsd: 108, weightG: 242,
    specs: { sizeMm: 223, material: "carbon", configuration: "quad", fpvClass: "5", maxPropInch: 5.1 }, tags: ["fpv", "mapping", "inspection"],
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/iflight-nazgul-evoque-f5d-v2-hd-o3-deadcat-5-freestyle-frame-kit-w-led-side-plates"), P("GetFPV", "https://www.getfpv.com/iflight-nazgul-evoque-f5-hd-analog-frame-kit-f5d-deadcat.html")] },
  { id: "frame-x500v2", category: "frame", name: "X500 V2 Frame Kit", brand: "Holybro", priceUsd: 190, weightG: 610,
    specs: { sizeMm: 500, material: "carbon", configuration: "quad", maxPropInch: 13 }, tags: ["inspection", "mapping", "delivery"],
    links: [P("Holybro", "https://holybro.com/products/x500-v2-kits"), P("GetFPV", "https://www.getfpv.com/holybro-x500-v2-arf-kit.html"), P("Studiosport", "https://www.studiosport.fr/kit-x500-v2-holybro-a30133.html")] },
  { id: "frame-s500v2", category: "frame", name: "S500 V2 Frame Kit", brand: "Holybro", priceUsd: 40, weightG: 400,
    specs: { sizeMm: 480, material: "glass", configuration: "quad", maxPropInch: 12 }, tags: ["delivery", "inspection", "mapping"],
    links: [P("Flying Tech", "https://www.flyingtech.co.uk/product/holybro-s500-v2-quadcopter-frame-kit/")] },
  { id: "frame-f450", category: "frame", name: "F450 Quadcopter Frame (nylon)", brand: "Generic", priceUsd: 25, weightG: 282,
    specs: { sizeMm: 450, material: "plastic", configuration: "quad", maxPropInch: 11 }, tags: ["delivery", "inspection", "agriculture"], links: [] },
  { id: "frame-tarot-x6", category: "frame", name: "X6 960mm Folding Hexacopter Frame (TL6X001)", brand: "Tarot", priceUsd: 400, weightG: 1500,
    specs: { sizeMm: 960, material: "carbon", configuration: "hex", maxPropInch: 18 }, tags: ["agriculture", "delivery", "mapping", "inspection"],
    links: [P("Flying Tech", "https://www.flyingtech.co.uk/product/tarot-x6-960mm-carbon-fibre-foldable-hexacopter-frame/"), P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/tarot-x6-heavy-lift-professional-uav-quadcopter-frame")] },
  { id: "frame-tarot-680", category: "frame", name: "680PRO Folding Hexacopter Frame", brand: "Tarot", priceUsd: 150, weightG: 900,
    specs: { sizeMm: 680, material: "carbon", configuration: "hex", maxPropInch: 13 }, tags: ["inspection", "mapping", "delivery"], links: [] },
  { id: "frame-kopis-x8", category: "frame", name: "Kopis Cinematic X8 7in Octocopter Frame (396 mm)", brand: "Holybro", priceUsd: 320, weightG: 450, // v4: coaxial X8 cinelifter; weight est.
    specs: { sizeMm: 396, material: "carbon", configuration: "octo", maxPropInch: 7 }, tags: ["interceptor", "fpv", "inspection"],
    links: [P("Holybro", "https://holybro.com/products/kopis-cinematic-x8-kit"), P("Flying Tech", "https://www.flyingtech.co.uk/product/holybro-kopis-cinematic-x8-octocopter-frame")] },
  { id: "frame-tarot-x8", category: "frame", name: "X8 Octocopter Frame (coaxial)", brand: "Tarot", priceUsd: 450, weightG: 2000,
    specs: { sizeMm: 1000, material: "carbon", configuration: "octo", maxPropInch: 26 }, tags: ["agriculture", "delivery"], links: [] },
  { id: "frame-chimera7", category: "frame", name: "Chimera7 Pro V2 7.5in Long Range Frame Kit", brand: "iFlight", priceUsd: 90, weightG: 175, // price est.
    specs: { sizeMm: 327, material: "carbon", configuration: "quad", fpvClass: "7", maxPropInch: 7.5 }, tags: ["fpv", "mapping", "interceptor"],
    links: [P("iFlight", "https://shop.iflight.com/Chimera7-Pro-V2-Frame-Kit-Pro1890"), P("GetFPV", "https://www.getfpv.com/iflight-chimera7-pro-v2-7-5-lr-frame-kit.html"),
      P("RobotShop EU", "https://eu.robotshop.com/products/iflight-chimera7-pro-v2-frame-kit"), P("RobotShop UK", "https://uk.robotshop.com/products/iflight-chimera7-pro-v2-frame-kit"),
      P("FPV24", "https://fpv24.com/en/iflight/iflight-chimera7-pro-v2-frame-75-zoll-kit"), P("Phaser FPV", "https://phaserfpv.com.au/products/chimera7-pro-v2-frame-kit"),
      P("RobotShop CA", "https://ca.robotshop.com/products/iflight-chimera7-pro-v2-frame-kit")] },
  // gap fill 2026-11-07: hex 500-600 mm, agriculture quad 960 mm
  { id: "frame-probots-hex500", category: "frame", name: "6-Axis Hexcopter Frame Kit 500mm (HJ550 type)", brand: "Generic", priceUsd: 35, weightG: 450, // price, weight, material est.
    specs: { sizeMm: 500, material: "plastic", configuration: "hex", maxPropInch: 9 }, tags: ["inspection", "mapping", "delivery"],
    links: [P("Probots", "https://probots.co.in/6-axis-hexcopter-frame-kit.html")] },
  { id: "frame-s550-hex", category: "frame", name: "S550 Hexcopter Frame Kit with Integrated PCB 550mm", brand: "Generic", priceUsd: 40, weightG: 445, // price est.
    specs: { sizeMm: 550, material: "plastic", configuration: "hex", maxPropInch: 10 }, tags: ["delivery", "mapping", "inspection"],
    links: [P("HobbyKing", "https://hobbyking.com/en_us/s550-hexcopter-frame-kit-with-integrated-pcb-550mm-black.html"), P("Speedy FPV", "https://speedyfpv.com/products/s550-550mm-hexacopter-drone-frame-kit-with-landing-gear")] },
  { id: "frame-f550-hex", category: "frame", name: "F550 Hexacopter Frame (glass fibre)", brand: "Generic", priceUsd: 30, weightG: 431, // price est.
    specs: { sizeMm: 550, material: "glass", configuration: "hex", maxPropInch: 10 }, tags: ["delivery", "mapping", "inspection"],
    links: [P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/f550-hexacopter-frame-1"), P("Think Robotics", "https://thinkrobotics.com/products/f550-hexa-copter-frame-with-landing-gears-pcb-kit-online"),
      P("Sigmanortec", "https://sigmanortec.ro/en/drone-frame-f550-atf-hexacopter")] },
  { id: "frame-x600-hex", category: "frame", name: "X600-X6 Carbon Hexacopter Frame 600mm", brand: "Generic", priceUsd: 90, weightG: 700, // price, weight est.
    specs: { sizeMm: 600, material: "carbon", configuration: "hex", maxPropInch: 11 }, tags: ["delivery", "mapping", "inspection"],
    links: [P("Sigmanortec", "https://sigmanortec.ro/en/hexacopter-x600-x6-drone-frame-carbon-fiber-600mm")] },
  { id: "frame-tarot-x4", category: "frame", name: "X4 960mm Folding Quadcopter Frame (TL4X001)", brand: "Tarot", priceUsd: 339, weightG: 1600, // 8 kg MTOW (retailer claim)
    specs: { sizeMm: 960, material: "carbon", configuration: "quad", maxPropInch: 25 }, tags: ["agriculture", "delivery", "mapping"],
    links: [P("Robu.in", "https://robu.in/product/tarot-x4-quadcopter-frame-tl4x001/"), P("Zbotic", "https://zbotic.in/product/tarot-x4-quadcopter-frame-tl4x001/"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/tarot-x4-heavy-lift-professional-uav-quadcopter-frame"), P("rcdrone.top", "https://rcdrone.top/products/tarot-x4-tl4x001-quadcopter-frame")] },
  // FPV size classes (SPEC-v3): specs.fpvClass "5" | "7" | "10"; sizeMm = motor-to-motor wheelbase
  { id: "frame-apex-evo5", category: "frame", name: "Apex EVO 5in FPV Frame Kit", brand: "ImpulseRC", priceUsd: 96.99, weightG: 120, // weight, wheelbase est.
    specs: { sizeMm: 224, material: "carbon", configuration: "quad", fpvClass: "5", maxPropInch: 5.1 }, tags: ["fpv", "interceptor"],
    links: [P("GetFPV", "https://www.getfpv.com/impulserc-apex-evo-5-fpv-frame-kit.html"), P("Phaser FPV", "https://phaserfpv.com.au/products/impulserc-apex-evo-5-frame-kit"),
      P("OneDrone", "https://www.onedrone.com/store/apex-evo-5-frame-kit-by-impulserc.html")] },
  { id: "frame-mark4-7", category: "frame", name: "Mark4 7in Frame Kit", brand: "GEPRC", priceUsd: 49.99, weightG: 121, // wheelbase est.
    specs: { sizeMm: 295, material: "carbon", configuration: "quad", fpvClass: "7", maxPropInch: 7 }, tags: ["fpv", "mapping"],
    links: [P("ReadyMadeRC", "https://www.readymaderc.com/products/details/86988-geprc-mark4-7-multirotor-frame"), P("HobbyRC", "https://www.hobbyrc.co.uk/geprc-mark4-7-frame-2"),
      P("Rotorama", "https://www.rotorama.com/product/geprc-mark4-7"), P("Zbotic", "https://zbotic.in/product/geprc-mark4-7-frame/"), P("BZB UAS", "https://www.bzbuas.com/shop/gp106119-geprc-gep-mark4-7-frame-kit-3401")] },
  { id: "frame-source-one-v5-7", category: "frame", name: "Source One V5 7in DeadCat Frame", brand: "TBS", priceUsd: 70, weightG: 144, // price est.
    specs: { sizeMm: 320, material: "carbon", configuration: "quad", fpvClass: "7", maxPropInch: 7.5 }, tags: ["fpv", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/tbs-source-one-v5-7-long-range-frame-deadcat.html"), P("Pyrodrone", "https://pyrodrone.com/products/tbs-source-one-v5-7-inch-deadcat-frame"),
      P("Flying Tech", "https://www.flyingtech.co.uk/product/tbs-source-one-v5-7inch-drone-frame"), P("FPV24", "https://www.fpv24.com/en/team-blacksheep/tbs-source-one-v5-7-inch-dc"),
      P("Epic FPV", "https://epicfpv.ca/products/tbs-source-one-v5-1-7inch-dc-frame"), P("WREKD Canada", "https://ca.wrekd.com/products/tbs-source-one-v5-7-inch-frame-kit"),
      P("Team BlackSheep", "https://team-blacksheep.com/products/product:7206")] },
  { id: "frame-xl10-v6", category: "frame", name: "Nazgul XL10 V6 10in Frame Kit", brand: "iFlight", priceUsd: 115.99, weightG: 345,
    specs: { sizeMm: 420, material: "carbon", configuration: "quad", fpvClass: "10", maxPropInch: 10 }, tags: ["fpv", "mapping", "delivery"],
    links: [P("GetFPV", "https://www.getfpv.com/iflight-nazgul-xl10-v6-10-frame-kit.html"), P("Pyrodrone", "https://pyrodrone.com/products/iflight-nazgul-xl10-v6-10-frame-kit"),
      P("ReadyMadeRC", "https://www.readymaderc.com/products/details/86869-iflight-nazgul-xl10-v6-10-inch-frame-kit"), P("FPV24", "https://www.fpv24.com/en/iflight/iflight-nazgul-xl10-v6-10-inch-frame-kit")] },
  { id: "frame-mark4-10", category: "frame", name: "Mark4 10in Long Range Frame Kit", brand: "GEPRC", priceUsd: 59.99, weightG: 270,
    specs: { sizeMm: 428, material: "carbon", configuration: "quad", fpvClass: "10", maxPropInch: 10 }, tags: ["fpv", "mapping", "delivery"],
    links: [P("GetFPV", "https://getfpv.com/geprc-mark4-10-frame-kit.html"), P("Pyrodrone", "https://pyrodrone.com/products/geprc-gep-mark4-10-fpv-10-long-range-frame-kit"),
      P("HobbyRC", "https://www.hobbyrc.co.uk/geprc-mark4-10-long-range-drone-frame"), P("rcdrone.top", "https://rcdrone.top/products/geprc-gep-mark4-10-429mm-wheelbase-10-inch-fpv-drone-frame")] },
  { id: "frame-geprc-ef10", category: "frame", name: "EF 10in Frame Kit", brand: "GEPRC", priceUsd: 90, weightG: 300, // price, weight, wheelbase est.
    specs: { sizeMm: 430, material: "carbon", configuration: "quad", fpvClass: "10", maxPropInch: 10 }, tags: ["fpv", "delivery"],
    links: [P("GetFPV", "https://www.getfpv.com/commercial-industry-drones/geprc-ef-10-frame-kit.html")] },

  // ---- fixed-wing airframes (SPEC-v3): launch from AUW, tail layout as sold. maxAuwKg = listed max flying weight. ----
  { id: "fw-skywalker-x8", category: "fixedwing", name: "X8 2120mm EPO Flying Wing Kit", brand: "Skywalker", priceUsd: 290, weightG: 1100, // weight est.
    specs: { wingspanMm: 2120, wingAreaDm2: 80, maxAuwKg: 3.5, material: "foam", launch: "bungee", tail: "flying wing" }, // AUW: listings 2.5-3.5 kg
    tags: ["mapping", "inspection", "fpv"],
    links: [P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/skywalker-x8-kit-2120mm-epo-fpv-wing"), P("Spexdrone", "https://spexdrone.com/products/skywalker-x8-black-xf-1108b"),
      P("HobbyKing", "https://hobbyking.com/en_us/skywalker-x-8-fpv-uav-flying-wing-2120mm.html")] },
  { id: "fw-skywalker-1900", category: "fixedwing", name: "Skywalker 1900 EPO FPV Glider Kit", brand: "Skywalker", priceUsd: 150, weightG: 900, // price, weight est.
    specs: { wingspanMm: 1900, wingAreaDm2: 46.3, maxAuwKg: 2.5, material: "foam", launch: "hand", tail: "T-tail" }, tags: ["mapping", "inspection", "fpv"],
    links: [P("HobbyKing", "https://hobbyking.com/en_us/skywalker-1900-fpv-glider-epo-1900mm-kit.html"), P("FPV24", "https://www.fpv24.com/en/skywalker/skywalker-new-1900-fpv-flugzeug-reverse-t-tail"),
      P("xboom", "https://www.xboom.in/shop/drones/fixed-wings/new-skywalker-1900-reverse-tail-fpv-aircraft"), P("rcdrone.top", "https://rcdrone.top/products/skywalker-1900-glider")] },
  { id: "fw-mfe-believer", category: "fixedwing", name: "Believer 1960mm Aerial Survey Aircraft Kit", brand: "MakeFlyEasy", priceUsd: 330, weightG: 2000, // price, weight est.
    specs: { wingspanMm: 1960, wingAreaDm2: 51, maxAuwKg: 5.5, material: "foam", launch: "bungee", tail: "twin-boom" }, // 4.2 kg recommended, 5.5 kg max
    tags: ["mapping", "inspection", "delivery"],
    links: [P("GetFPV", "https://www.getfpv.com/planes/believer-1960mm-aerial-survey-aircraft-kit.html"), P("Lumenier", "https://www.lumenier.com/products/believer-1960mm-aerial-survey-aircraft-kit"),
      P("3DXR", "https://www.3dxr.co.uk/products/make-fly-easy-mfe-believer-kit"), P("rcdrone.top", "https://rcdrone.top/products/makeflyeasy-believer")] },
  { id: "fw-volantex-ranger-2000", category: "fixedwing", name: "Ranger 2000 FPV Plane PNP", brand: "VolantexRC", priceUsd: 199, weightG: 900, // weight, wing area, max AUW est.
    specs: { wingspanMm: 2000, wingAreaDm2: 38, maxAuwKg: 1.8, material: "foam", launch: "hand", tail: "conventional" }, tags: ["mapping", "fpv", "inspection"],
    links: [P("HobbyRC", "https://hobbyrc.co.uk/volantexrc-ranger-2000mm-fpv-plane-pnp"), P("Exhobby UK", "https://uk.exhobby.com/products/volantexrc-ranger-2000-5-channel-fpv-airplane-with-2-meter-wingspan-and-unibody-plastic-f"),
      P("Exhobby CA", "https://ca.exhobby.com/products/volantexrc-ranger-2000-5-channel-fpv-airplane-with-2-meter-wingspan-and-unibody-plastic-f"), P("HobbyKing", "https://hobbyking.com/en_us/2m-pusher-glider-pnf.html")] },
  { id: "fw-mini-talon", category: "fixedwing", name: "Mini Talon 1300mm EPO V-Tail Kit", brand: "X-UAV", priceUsd: 120, weightG: 600, // price, weight, wing area est.
    specs: { wingspanMm: 1300, wingAreaDm2: 30, maxAuwKg: 1.9, material: "foam", launch: "hand", tail: "V-tail" }, // 1.45-1.9 kg flying (ArduPilot build page)
    tags: ["mapping", "fpv", "inspection"],
    links: [P("ReadyMadeRC", "https://www.readymaderc.com/products/details/xuav-mini-talon-kit"), P("HobbyRC", "https://www.hobbyrc.co.uk/x-uav-ly-t08-mini-talon"),
      P("Racer.lt", "https://racer.lt/item/x-uav-mini-talon-epo-1300mm-wingspan-v-tail-fpv-plane-aircraft-kit-30935.html"), P("xboom", "https://www.xboom.in/shop/drones/x-uav-mini-talon-epo-1300mm-fpv-plane-aircraft-kit/"),
      P("Indian Robo Store", "https://indianrobostore.com/product/x-uav-mini-talon-epo-1300mm-fpv-plane-aircraft-kit"), P("rcdrone.top", "https://rcdrone.top/products/x-uav-mini-talon-rc-kit")] },
  { id: "fw-zohd-talon-gt-rebel", category: "fixedwing", name: "Talon GT Rebel 1000mm V-Tail BEPP PNP", brand: "ZOHD", priceUsd: 219.99, weightG: 550, // weight est.
    specs: { wingspanMm: 1000, wingAreaDm2: 14, maxAuwKg: 1.3, material: "foam", launch: "hand", tail: "V-tail" }, // 1.3 kg = 92.8 g/dm2 max wing load x 14 dm2
    tags: ["fpv", "mapping", "interceptor"],
    links: [P("GetFPV", "https://www.getfpv.com/zohd-talon-gt-rebel-1000mm-wingspan-v-tail-bepp-fpv-aircraft-pnp.html"), P("Phaser FPV", "https://phaserfpv.com.au/products/zohdtalongtrebel1000mmwingspanv-tailbeppfpvwingpnp"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/zohd-talon-gt-rebel-pnp-kit"), P("Motion RC EU", "https://motionrc.com/eu/products/zohd-talon-gt-rebel-1000mm-39-37-pnp-zoh10045"),
      P("Defiance RC", "https://www.defiancerc.com/products/zohd-talon-gt-rebel-pnp-1000mm-v-tail")] },
  { id: "fw-ar-wing-pro", category: "fixedwing", name: "AR Wing Pro 1000mm EPP FPV Flying Wing PNP", brand: "SonicModell", priceUsd: 190, weightG: 500, // price, max AUW est.
    specs: { wingspanMm: 1000, wingAreaDm2: 18, maxAuwKg: 1.5, material: "foam", launch: "hand", tail: "flying wing" }, tags: ["fpv", "interceptor", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/sonicmodell-ar-wing-pro-1000mm-wingspan-epp-fpv-flying-wing-rc-airplane-pnp-version.html"), P("Pyrodrone", "https://pyrodrone.com/collections/all-products/products/sonicmodell-ar-wing-pro-pnp-1000mm-wingspan-epp-fpv-flying-wing"),
      P("HobbyRC", "https://www.hobbyrc.co.uk/sonicmodell-ar-wing-pro-pnp"), P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/sonicmodell-ar-wing-pro-fpv-airplane-1000mm"),
      P("Racer.lt", "https://www.racer.lt/item/sonicmodell-ar-wing-pro-1000mm-wingspan-epp-fpv-flying-wing-rc-airplane-kit-pnp-84460.html"), P("ReadyMadeRC", "https://www.readymaderc.com/products/details/sonic-modell-ar-wing-pro-pnp-epp-dji-ready")] },

  // ---- VTOL airframes (quadplane: 4 lift + 1 pusher) ----
  { id: "vtol-t1-ranger", category: "vtol", name: "T1 Ranger VTOL Tilt-Rotor PNP with FC (730 mm)", brand: "HEEWING", priceUsd: 390, weightG: 451,
    specs: { wingspanMm: 730, wingAreaDm2: 11, maxAuwKg: 0.75, material: "foam", type: "tiltrotor", tiltMotors: 2 }, // wing area est. (not published); 2 front tilting motors + 1 fixed rear (tilt-tricopter)
    tags: ["mapping", "inspection", "fpv"],
    links: [P("GetFPV", "https://www.getfpv.com/heewing-t1-ranger-vtol-wing-pnp-w-fc-gray.html"), P("RaceDayQuads", "https://www.racedayquads.com/products/heewing-pnp-t1-ranger-vtol-twin-motor-wing-grey-choose-version"),
      P("WREKD Canada", "https://ca.wrekd.com/products/hee-wing-pnp-t1-ranger-vtol-twin-motor-wing-grey-choose-version-1"), P("RotorGeeks", "https://rotorgeeks.com/heewing-t1-ranger-vtol-pnp-with-fc"),
      P("FPV Faster", "https://www.fpvfaster.com.au/products/hee-wing-t1-ranger-twin-motor-wing-vtol-pnp-w-fc"), P("Rotorama", "https://www.rotorama.com/product/heewing-t1-vtol-pnp-with-fc")] },
  { id: "vtol-nimbus-v2", category: "vtol", name: "Nimbus VTOL V2 1800 Mapping Airframe", brand: "Foxtech", priceUsd: 2099, weightG: 2850, // price: one listed combo; wing area est.
    specs: { wingspanMm: 1800, wingAreaDm2: 40, maxAuwKg: 4.8, material: "foam" }, tags: ["mapping", "inspection", "delivery"],
    links: [P("Foxtech", "https://www.foxtechfpv.com/filming-inspection/nimbus-vtol.html")] },
  { id: "vtol-striver-2100", category: "vtol", name: "Striver 2100 VTOL (Mini Striver) Kit", brand: "MakeFlyEasy", priceUsd: 772, weightG: 3000, // weight est.
    specs: { wingspanMm: 2100, wingAreaDm2: 59, maxAuwKg: 7.5, material: "foam" }, tags: ["mapping", "inspection", "delivery"],
    links: [P("MakeFlyEasy", "https://en.makeflyeasy.com/index.php/striver-mini-vtol/"), P("3DXR", "https://www.3dxr.co.uk/products/make-fly-easy-mfe-mini-striver-mini-fighter-2100m-wingspan-vtol"),
      P("rcdrone.top", "https://rcdrone.top/products/makeflyeasy-striver-vtol-version")] },
  { id: "vtol-striver-2430", category: "vtol", name: "Fighter VTOL 2430 (Striver 2430) Kit", brand: "MakeFlyEasy", priceUsd: 969, weightG: 4500, // weight est.
    specs: { wingspanMm: 2430, wingAreaDm2: 72.5, maxAuwKg: 11.5, material: "foam" }, tags: ["mapping", "inspection", "delivery"],
    links: [P("MakeFlyEasy", "https://en.makeflyeasy.com/index.php/fighter-vtol/"), P("3DXR", "https://www.3dxr.co.uk/products/make-fly-easy-mfe-fighter-2430mm-wingspan-vtol"),
      P("rcdrone.top", "https://rcdrone.top/products/makeflyeasy-fighter-2430mm-mfe-fighter-vtol")] },
  // tiltrotor-capable airframes (specs.type "tiltrotor"). Few quad-tilt kits are sold: these tilt the 2 front rotors (tiltMotors).
  { id: "vtol-t2-cruza", category: "vtol", name: "T2 Cruza VTOL Tilt-Rotor PNP (1200 mm)", brand: "HEEWING", priceUsd: 813, weightG: 1500, // EUR 723.79; weight, wing area est.
    specs: { wingspanMm: 1220, wingAreaDm2: 22, maxAuwKg: 3.5, material: "foam", type: "tiltrotor", tiltMotors: 2 }, // VTOL listing: 1220 mm span, 2.0-3.5 kg, 2 tilt servos
    tags: ["mapping", "inspection", "fpv"],
    links: [P("Rotorama", "https://www.rotorama.com/product/heewing-t2-cruza-vtol-pnp"), P("FPV24", "https://www.fpv24.com/en/heewing/heewing-t2-cruza-vtol-fpv-glider-airplane-pnp-black"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/hee-wing-t2-cruza-vtol-fpv-plane-pnp-fc-and-carry-case"), P("HobbyRC", "https://www.hobbyrc.co.uk/hee-wing-t2-cruza-ranger-fpv-plane-2")] },
  { id: "vtol-freeman-2100", category: "vtol", name: "Freeman 2100 Tilt-Rotor VTOL DIY Kit", brand: "MakeFlyEasy", priceUsd: 400, weightG: 2500, // price, weight, wing area est.; seller lists it as no longer available
    specs: { wingspanMm: 2100, wingAreaDm2: 55, maxAuwKg: 6.5, material: "foam", type: "tiltrotor", tiltMotors: 2 }, tags: ["mapping", "inspection", "delivery"],
    links: [P("BZB UAS", "https://bzbuas.com/en/shop/236004352-freeman-2100-diy-kit-467")] },
  { id: "vtol-va17", category: "vtol", name: "VA17 Tilt-Rotor VTOL DIY Kit (1700 mm)", brand: "TDR", priceUsd: 900, weightG: 2500, // price, weight, wing area est.; seller lists it as no longer available
    specs: { wingspanMm: 1700, wingAreaDm2: 40, maxAuwKg: 5.5, material: "foam", type: "tiltrotor", tiltMotors: 2 }, // carbon + EPP, front tilt motors + rear fixed motor
    tags: ["mapping", "inspection", "delivery"],
    links: [P("BZB UAS", "https://www.bzbuas.com/shop/va17-vtol-diy-kit-1193")] },

  // ---- tilt mechanisms (category tilt): tiltAxes = rotors one unit tilts; includesServos with the servo torque ----
  { id: "tilt-t2-cruza-kit", category: "tilt", name: "T2 Cruza VTOL Conversion Kit (3 motors, 2 tilt servos)", brand: "HEEWING", priceUsd: 250, weightG: 300, // price, weight, torque est.
    specs: { tiltAxes: 2, includesServos: true, torqueKgCm: 3, maxAuwKg: 3.5 }, tags: ["mapping", "inspection", "fpv"],
    links: [P("Rotorama", "https://www.rotorama.com/product/heewing-t2-cruza-vtol-conversion-pack")] },
  { id: "tilt-t1-servo-mount", category: "tilt", name: "T1 VTOL Replacement Tilt Servo Mount", brand: "HEEWING", priceUsd: 11.43, weightG: 10, // GBP 8.49; weight est.
    specs: { tiltAxes: 1, includesServos: false, maxAuwKg: 0.75 }, tags: ["fpv", "mapping"],
    links: [P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/replacement-t1-vtol-tilt-servo-mount")] },
  { id: "tilt-fimi-manta-mount", category: "tilt", name: "Manta VTOL Replacement Tilting Motor Mount", brand: "FIMI", priceUsd: 9.36, weightG: 10, // GBP 6.95; weight est.
    specs: { tiltAxes: 1, includesServos: false, maxAuwKg: 1.5 }, tags: ["fpv", "mapping"], // max AUW est.
    links: [P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/replacement-tilting-motor-mount-for-fimi-manta-vtol")] },
  { id: "tilt-flitetest-tough-tilt", category: "tilt", name: "Tough Tilt Motor Mount (half-inch boom)", brand: "Flite Test", priceUsd: 15, weightG: 15, // price, weight, max AUW est.; servo hardware not included
    specs: { tiltAxes: 1, includesServos: false, maxAuwKg: 2 }, tags: ["fpv", "mapping", "inspection"],
    links: [P("Flite Test", "https://store.flitetest.com/tough-tilt-motor-mount")] },

  // ---- motors (tag "pusher" = fixed-wing cruise motor, matched only as the VTOL pusher) ----
  { id: "motor-velox-v3-1750", category: "motor", name: "VELOX V2306 V3 1750KV", brand: "T-Motor", priceUsd: 15, weightG: 33,
    specs: { statorMm: "2306", kv: 1750, maxThrustG: 1500, maxCurrentA: 34.9, fpvClass: "5", minCells: 4, maxCells: 6 }, tags: ["fpv", "mapping", "interceptor"],
    links: [P("GetFPV", VELOX), P("Drone-FPV-Racer", "https://www.drone-fpv-racer.com/en/velox-v2306-v3-1750-kv-motor-by-t-motor-11518.html"), ...VELOX_AU] },
  { id: "motor-velox-v3-1950", category: "motor", name: "VELOX V2306 V3 1950KV", brand: "T-Motor", priceUsd: 15, weightG: 33,
    specs: { statorMm: "2306", kv: 1950, maxThrustG: 1700, maxCurrentA: 41.7, fpvClass: "5", minCells: 4, maxCells: 6 }, tags: ["fpv", "interceptor"],
    links: [P("GetFPV", VELOX), P("Drone-FPV-Racer", "https://www.drone-fpv-racer.com/en/velox-v2306-v3-1950-kv-motor-by-t-motor-11521.html"), P("N-Factory", "https://n-factory.de/T-Motor-Velox-V30-V2306-1950KV-5-6S-Freestyle-Motor_1"), ...VELOX_AU] },
  { id: "motor-velox-v3-2550", category: "motor", name: "VELOX V2306 V3 2550KV", brand: "T-Motor", priceUsd: 15, weightG: 33,
    specs: { statorMm: "2306", kv: 2550, maxThrustG: 1400, maxCurrentA: 49.7, fpvClass: "5", minCells: 3, maxCells: 4 }, tags: ["interceptor", "fpv"],
    links: [P("GetFPV", VELOX), P("Drone-FPV-Racer", "https://www.drone-fpv-racer.com/en/velox-v2306-v3-2550-kv-motor-by-t-motor-11522.html"), ...VELOX_AU] },
  { id: "motor-velox-v2-1950", category: "motor", name: "VELOX V2306 V2 1950KV", brand: "T-Motor", priceUsd: 13, weightG: 33,
    specs: { statorMm: "2306", kv: 1950, maxThrustG: 1600, maxCurrentA: 34, fpvClass: "5", minCells: 4, maxCells: 6 }, tags: ["fpv", "interceptor"],
    links: [P("GetFPV", "https://www.getfpv.com/t-motor-velox-v2306-1950kv-motor.html"), P("RaceDayQuads", "https://www.racedayquads.com/products/t-motor-velox-v2-2306-1950kv-motor")] },
  { id: "motor-mn3508-380", category: "motor", name: "MN3508 KV380", brand: "T-Motor", priceUsd: 70, weightG: 106,
    specs: { statorMm: "3508", kv: 380, maxThrustG: 1800, maxCurrentA: 14, minCells: 4, maxCells: 6 }, tags: ["delivery", "agriculture", "inspection", "mapping"],
    links: [P("T-Motor", "https://store.tmotor.com/product/mn3508-motor-navigator-type.html"), P("IR-Lock", "https://irlock.com/products/t-motor-mn3508-kv380"),
      P("Robu.in", "https://robu.in/product/t-motor-mn3508-kv380-brushless-motor-for-drone/"), P("3DXR", "https://www.3dxr.co.uk/products/t-motor-mn3508")] },
  { id: "motor-x2212-980", category: "motor", name: "X2212 KV980", brand: "SunnySky", priceUsd: 20, weightG: 56,
    specs: { statorMm: "2212", kv: 980, maxThrustG: 900, maxCurrentA: 20, minCells: 2, maxCells: 4 }, tags: ["delivery", "inspection", "mapping"], links: [] },
  { id: "motor-2216-920", category: "motor", name: "2216 KV920 (X500 V2 motor)", brand: "Holybro", priceUsd: 30, weightG: 70,
    specs: { statorMm: "2216", kv: 920, maxThrustG: 1000, maxCurrentA: 22, minCells: 3, maxCells: 4 }, tags: ["inspection", "mapping", "delivery"], links: [] },
  // 6-12S heavy-lift motors. T-Motor publishes case size only (55.6 mm); stator class est. from it.
  { id: "motor-mn501s-240", category: "motor", name: "MN501-S KV240 (6-12S)", brand: "T-Motor", priceUsd: 100, weightG: 170,
    specs: { statorMm: "5008", kv: 240, maxThrustG: 5200, maxCurrentA: 25, minCells: 6, maxCells: 12 }, tags: ["agriculture", "delivery", "mapping"],
    links: [P("T-Motor", "https://store.tmotor.com/product/mn501-s-kv240-motor-navigator-type.html")] },
  { id: "motor-v505-260", category: "motor", name: "V505 KV260 12S VTOL Lift Motor", brand: "T-Motor", priceUsd: 120, weightG: 255,
    specs: { statorMm: "5010", kv: 260, maxThrustG: 8741, maxCurrentA: 52, minCells: 6, maxCells: 12 }, tags: ["agriculture", "delivery", "mapping", "inspection"],
    links: [P("T-Motor", "https://store.tmotor.com/product/v505-vtol-motor.html"), P("Robu.in", "https://robu.in/product/t-motor-v505-kv260/")] },
  { id: "motor-at2814-900", category: "motor", name: "AT2814 Long Shaft KV900", brand: "T-Motor", priceUsd: 50, weightG: 108,
    specs: { statorMm: "2814", kv: 900, maxThrustG: 2216, maxCurrentA: 45, minCells: 3, maxCells: 6 }, tags: ["pusher", "mapping", "inspection", "fpv"],
    links: [P("T-Motor", "https://store.tmotor.com/product/at2814-long-shaft-fixed-wing-motor.html")] },
  { id: "motor-at2820-830", category: "motor", name: "AT2820 KV830", brand: "T-Motor", priceUsd: 82, weightG: 132,
    specs: { statorMm: "2820", kv: 830, maxThrustG: 2900, maxCurrentA: 45, minCells: 4, maxCells: 6 }, // retailer figures; current est.
    tags: ["pusher", "mapping", "inspection", "delivery"], links: [P("RC Corner", "https://www.rccorner.ae/t-motor-at2820-kv830")] },
  { id: "motor-at3520-550", category: "motor", name: "AT3520 Long Shaft KV550", brand: "T-Motor", priceUsd: 80, weightG: 218,
    specs: { statorMm: "3520", kv: 550, maxThrustG: 4116, maxCurrentA: 50, minCells: 4, maxCells: 6 }, tags: ["pusher", "mapping", "inspection", "delivery"],
    links: [P("T-Motor", "https://store.tmotor.com/product/at3520-long-shaft-fixed-wing-motor.html"), P("HeliDirect", "https://helidirect.com/products/t-motor-at3520-long-shaft-550kv-brushless-motor-fixed-wing")] },

  // lift and pusher motors sized to the engine's classes (added 2026-11-06)
  { id: "motor-x2814-1100", category: "motor", name: "X2814 V3 KV1100 (3-4S)", brand: "SunnySky", priceUsd: 40, weightG: 108, // v4: price est.
    specs: { statorMm: "2814", kv: 1100, maxThrustG: 2200, maxCurrentA: 55, minCells: 3, maxCells: 4 }, // ~600 W listed, 10in on 4S; thrust est. like the KV900
    tags: ["delivery", "inspection", "mapping"], links: [P("ReadyMadeRC", "https://www.readymaderc.com/products/details/sunny-sky-x2814-1100kv"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/sunnysky-x2814-1100kv-v3-brushless-motor-high-efficiency-rc-power")] },
  { id: "motor-x2814-900", category: "motor", name: "X2814 V3 KV900 (3-4S)", brand: "SunnySky", priceUsd: 40, weightG: 108,
    specs: { statorMm: "2814", kv: 900, maxThrustG: 2000, maxCurrentA: 50, minCells: 3, maxCells: 4 }, // no thrust table published: est. from 680 W on 4S, 11in
    tags: ["delivery", "inspection", "mapping"], links: [P("ReadyMadeRC", "https://www.readymaderc.com/products/details/sunny-sky-x-series-v3-x2814-brushless-motor-900kv")] },
  { id: "motor-eco2-2807-1300", category: "motor", name: "ECO II 2807 1300KV", brand: "Emax", priceUsd: 24, weightG: 54,
    specs: { statorMm: "2807", kv: 1300, maxThrustG: 2818, maxCurrentA: 45, fpvClass: "7", minCells: 4, maxCells: 6 }, // thrust: retailer max figure (6S); current est.
    tags: ["interceptor", "fpv", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/emax-eco-ii-2807-1300kv-motor.html"), P("RaceDayQuads", "https://www.racedayquads.com/products/emax-eco-ii-2807-1300kv-motor"),
      P("Emax USA", "https://shop.emax-usa.com/products/eco-ii-2807-brushless-motor-1300kv-1500kv-1700kv"), P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/emax-eco-ii-2807-1300kv-brushless-fpv-motor")] },
  { id: "motor-mn4006-380", category: "motor", name: "MN4006 Antigravity KV380 (4-6S) (pair)", brand: "T-Motor", priceUsd: 149.9, weightG: 68, // sold as a pair: price per pair, weight per motor
    specs: { statorMm: "4006", kv: 380, maxThrustG: 2228, maxCurrentA: 17.5, packOf: 2, minCells: 4, maxCells: 6 }, tags: ["delivery", "mapping", "inspection"], // 2228 g: 15x5 at 24 V
    links: [P("T-Motor", "https://store.tmotor.com/product/mn4006-kv380-motor-antigravity-type.html"), P("GetFPV", "https://www.getfpv.com/tiger-motor-mn4006-380kv-antigravity-2-black-motors.html"),
      P("IR-Lock", "https://irlock.com/products/t-motor-mn4006-antigravity-type-4-6s-uav-motor-kv380-2pcs-set")] },
  { id: "motor-mn6007ii-160", category: "motor", name: "MN6007 II KV160 (6-12S)", brand: "T-Motor", priceUsd: 130, weightG: 159,
    specs: { statorMm: "6007", kv: 160, maxThrustG: 6419, maxCurrentA: 24, minCells: 6, maxCells: 12 }, tags: ["agriculture", "delivery"], // 6419 g: P21x6.3 at 47 V; rated 12S, not 14S
    links: [P("Foxtech", "https://store.foxtech.com/t-motor-mn6007-ii-motor-kv160-kv320-for-vtol-multirotor"), P("Robu.in", "https://robu.in/product/t-motor-mn6007ii-antigravity-type-6-12s-uav-motor-160-kv-ip25"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/t-motor-mn6007-ii-vtol-uav-motor-kv160-kv320")] },
  { id: "motor-at2312-1400", category: "motor", name: "AT2312 Long Shaft KV1400", brand: "T-Motor", priceUsd: 35, weightG: 60, // price est.
    specs: { statorMm: "2312", kv: 1400, maxThrustG: 1300, maxCurrentA: 25, minCells: 2, maxCells: 4 }, tags: ["pusher", "fpv", "mapping", "interceptor"],
    links: [P("HobbyRC", "https://www.hobbyrc.co.uk/t-motor-at2312-1400kv-fixed-wing-motor"), P("DRK Store", "https://www.drkstore.in/t-motor-at2312-long-shaft-3d-trainer-glider-bldc-motor-kv1150-kv1400")] },
  { id: "motor-at2310-2200", category: "motor", name: "AT2310 2200KV FPV Wing Motor (3-4S)", brand: "T-Motor", priceUsd: 30, weightG: 45, // v4: FPVWRA spec race-wing motor; 650 W max (~44 A on 4S); price, weight est.
    specs: { statorMm: "2310", kv: 2200, maxThrustG: 1400, maxCurrentA: 44, minCells: 3, maxCells: 4 }, tags: ["pusher", "interceptor", "fpv"],
    links: [P("ReadyMadeRC", "https://www.readymaderc.com/products/details/t-motor-at2310-2200kv-fpvwra-spec-wing-motor"), P("Phaser FPV", "https://phaserfpv.com.au/products/t-motorat23102200kvbrushlessmotorforfpvwing"),
      P("Drone-FPV-Racer", "https://www.drone-fpv-racer.com/en/at2310-2200kv-motor-by-t-motor-12111.html"), P("T-Motor", "https://shop.tmotor.com/products/fpv-fixed-wing-brushless-motor-at2310")] },
  { id: "motor-hw-x6-plus", category: "motor", name: "XRotor X6 Plus 6218 150KV Power System (12-14S, ESC built in)", brand: "Hobbywing", priceUsd: 97, weightG: 790, // v4: weight = motor+ESC+24in prop combo; price: INR 9,199 listing
    specs: { statorMm: "6218", kv: 150, maxThrustG: 11800, maxCurrentA: 80,
      integratedEsc: true, continuousA: 80, minCells: 12, maxCells: 14, protocol: "PWM", connector: "pads" }, tags: ["agriculture", "delivery"], // built-in ESC: 80 A is the published max input (no continuous figure); bare power leads
    links: [P("Hobbywing", "https://www.hobbywing.com/en/products/xrotor-x6-plus269")] },
  { id: "motor-at4130-230", category: "motor", name: "AT4130 Long Shaft KV230 (6-12S)", brand: "T-Motor", priceUsd: 120, weightG: 406,
    specs: { statorMm: "4130", kv: 230, maxThrustG: 6000, maxCurrentA: 70, minCells: 6, maxCells: 12 }, // no thrust table published: est. from 3200 W max; current est.
    tags: ["pusher", "agriculture", "delivery"],
    links: [P("T-Motor", "https://shop.tmotor.com/products/at4130-long-shaft"), P("IR-Lock", "https://irlock.com/products/t-motor-at4130-3d-fixed-wing-airplane-long-shaft-brushless-motor-kv230")] },

  // FPV class motors (SPEC-v3 bands): 5in 2306/2207, 7in 2806.5/2807, 10in 3110/3115; thrust est. where no table was seen
  { id: "motor-eco2-2207-1900", category: "motor", name: "ECO II 2207 1900KV", brand: "Emax", priceUsd: 19, weightG: 31.5, // price, thrust, current est.
    specs: { statorMm: "2207", kv: 1900, maxThrustG: 1500, maxCurrentA: 40, fpvClass: "5", minCells: 4, maxCells: 6 }, tags: ["fpv", "interceptor"],
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/emax-eco-ii-series-2207-1900kv-motor"), P("GetFPV", "https://www.getfpv.com/emax-eco-ii-series-2207-motor-1700kv-1900kv-2400kv.html"),
      P("ReadyMadeRC", "https://www.readymaderc.com/products/details/EMAX-ECO-II-2207-Brushless-Motor-1900KV")] },
  { id: "motor-xing-28065-1300", category: "motor", name: "XING 2806.5 1300KV", brand: "iFlight", priceUsd: 28, weightG: 52, // price, thrust est.; 48.3 A peak
    specs: { statorMm: "2806.5", kv: 1300, maxThrustG: 1900, maxCurrentA: 48.3, fpvClass: "7", minCells: 4, maxCells: 6 }, tags: ["fpv", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/iflight-xing-2806-5-race-motor-1300kv-1800kv.html"), P("RaceDayQuads", "https://www.racedayquads.com/products/iflight-xing-2806-5-race-motor-1300kv-1800kv"),
      P("Rotorama", "https://www.rotorama.com/product/iflight-xing-2806-5-1300kv"), P("OneDrone", "https://www.onedrone.com/store/iflight-xing-unibell-2806-5-1300kv-race-motor.html"),
      P("Maxterdrone", "https://maxterdrone.com/en/motors/2304-iflight-xing-28065-1300-kv.html"), P("Rotor Village", "https://rotorvillage.ca/iflight-xing-x2806-5-1300-1800kv-motor"),
      P("RobotShop UK", "https://uk.robotshop.com/products/iflight-xing-28065-unibell-race-motor-1300kv")] },
  { id: "motor-velox-v3115-900", category: "motor", name: "VELOX V3115 900KV", brand: "T-Motor", priceUsd: 59, weightG: 113.1, // thrust est.; 83 A peak for 10 s
    specs: { statorMm: "3115", kv: 900, maxThrustG: 3500, maxCurrentA: 83, fpvClass: "10", minCells: 4, maxCells: 6 }, tags: ["fpv", "delivery", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/t-motor-velox-v3115-motor-400kv-640kv-900kv.html"), P("RaceDayQuads", "https://www.racedayquads.com/collections/new-products/products/t-motor-v3115-3115-900kv-motor"),
      P("Pyrodrone", "https://pyrodrone.com/products/t-motor-velox-v3115-cinematic-fpv-drone-motor-900kv"), P("Baltic Drones", "https://balticdrones.eu/products/motor-t-motor-velox-3115-900kv"),
      P("Rotor Village", "https://rotorvillage.ca/t-motor-velox-v3115-900kv-cinematic-motor-1pc/"), P("BZB UAS", "https://www.bzbuas.com/shop/ahd03010010-t-motor-velox-v3115-brushless-motor-kv900-3365")] },
  { id: "motor-avenger-3110-900", category: "motor", name: "Avenger 3110 900KV", brand: "BrotherHobby", priceUsd: 44.99, weightG: 76, // thrust, current est.
    specs: { statorMm: "3110", kv: 900, maxThrustG: 2800, maxCurrentA: 50, fpvClass: "10", minCells: 4, maxCells: 6 }, tags: ["fpv", "delivery", "mapping"],
    links: [P("Pyrodrone", "https://pyrodrone.com/products/brotherhobby-avenger-3110-900kv-cinelifter-motor"), P("HobbyDrone.cz", "https://www.hobbydrone.cz/motor-brotherhobby-avenger-3110-900kv"),
      P("Baltic Drones", "https://balticdrones.eu/products/motor-brotherhobby-avenger-3110-900kv")] },
  { id: "motor-bh-se-3115-900", category: "motor", name: "SE 3115 900KV", brand: "BrotherHobby", priceUsd: 35, weightG: 125.2, // price, current est.; 3784 g on 9x5x3 at 6S
    specs: { statorMm: "3115", kv: 900, maxThrustG: 3784, maxCurrentA: 65, fpvClass: "10", minCells: 4, maxCells: 6 }, tags: ["fpv", "delivery"],
    links: [P("Rotorama", "https://www.rotorama.com/product/brotherhobby-se-3115-900kv"), P("rcdrone.top", "https://rcdrone.top/products/src-168-brotherhobby-se-3115-900kv-motor-cw")] },

  // ---- ESCs (fourInOne: one board drives 4 motors) ----
  { id: "esc-tekko32-50", category: "esc", name: "Tekko32 F4 4in1 50A ESC (AM32)", brand: "Holybro", priceUsd: 75, weightG: 14,
    specs: { continuousA: 50, burstA: 60, maxCells: 6, protocol: "DShot1200", fourInOne: true, fpvClass: ["5", "7", "10"], minCells: 3, connector: "XT60" }, tags: ["fpv", "interceptor", "mapping", "inspection"],
    links: [P("GetFPV", "https://www.getfpv.com/holybro-tekko32-50a-4-6s-am32-4-in-1-esc-30-5x30-5-f4-mcu.html"), P("Holybro", "https://holybro.com/collections/fpv-esc/products/tekko32-f4-4in1-mini-50a-esc")] },
  { id: "esc-t55a", category: "esc", name: "F55A Pro II 6S 4in1 ESC", brand: "T-Motor", priceUsd: 70, weightG: 15,
    specs: { continuousA: 55, burstA: 65, maxCells: 6, protocol: "DShot600", fourInOne: true, fpvClass: ["5", "7", "10"], minCells: 3, connector: "XT60" }, tags: ["fpv", "interceptor", "mapping"], links: [] },
  { id: "esc-blitz-e55", category: "esc", name: "BLITZ E55 4-in-1 ESC", brand: "iFlight", priceUsd: 60, weightG: 16,
    specs: { continuousA: 55, burstA: 65, maxCells: 6, protocol: "DShot600", fourInOne: true, fpvClass: ["5", "7"], minCells: 3, connector: "XT60" }, tags: ["fpv", "interceptor"], links: [] },
  { id: "esc-bls60", category: "esc", name: "BLS 60A 4in1 ESC", brand: "SpeedyBee", priceUsd: 70, weightG: 20,
    specs: { continuousA: 60, burstA: 80, maxCells: 6, protocol: "DShot600", fourInOne: true, fpvClass: ["7", "10"], minCells: 3, connector: "XT60" }, tags: ["fpv", "interceptor", "mapping", "inspection"], links: [] },
  { id: "esc-xrotor-40", category: "esc", name: "XRotor Pro 40A 6S ESC", brand: "Hobbywing", priceUsd: 55, weightG: 40,
    specs: { continuousA: 40, burstA: 60, maxCells: 6, protocol: "PWM", minCells: 3, connector: "pads" }, tags: ["agriculture", "delivery", "inspection", "mapping"],
    links: [P("Hobbywing", "https://www.hobbywing.com/en/products/xrotor-pro-40a120")] },
  { id: "esc-flyfun-60a-v5", category: "esc", name: "FlyFun 60A V5 3-6S ESC", brand: "Hobbywing", priceUsd: 60, weightG: 73.5, // v4: 60 A single ESC for 45-50 A motors
    specs: { continuousA: 60, burstA: 80, minCells: 3, maxCells: 6, protocol: "PWM", connector: "pads" }, tags: ["delivery", "inspection", "mapping"],
    links: [P("HeliDirect", "https://www.helidirect.com/products/hobbywing-flyfun-60a-v5-esc-3-6s"), P("Aloft Hobbies", "https://alofthobbies.com/products/hobbywing-flyfun-60a-esc-v5")] },
  { id: "esc-air20", category: "esc", name: "Air 20A 3-4S ESC", brand: "T-Motor", priceUsd: 25, weightG: 25,
    specs: { continuousA: 20, burstA: 25, maxCells: 4, protocol: "PWM", minCells: 3, connector: "pads" }, tags: ["delivery", "inspection"], links: [] },
  { id: "esc-flame-60a-12s", category: "esc", name: "FLAME 60A 12S V2.0 ESC", brand: "T-Motor", priceUsd: 100, weightG: 74,
    specs: { continuousA: 60, burstA: 80, minCells: 6, maxCells: 12, protocol: "PWM", connector: "pads" }, tags: ["agriculture", "delivery", "mapping", "inspection"],
    links: [P("T-Motor", "https://store.tmotor.com/product/flame-60a-12s-V2-esc.html"), P("IR-Lock", "https://irlock.com/products/t-motor-flame-60a-12s")] },
  { id: "esc-xrotor-pro-80a-hv", category: "esc", name: "XRotor Pro 80A HV V3 6-14S ESC", brand: "Hobbywing", priceUsd: 97, weightG: 195,
    specs: { continuousA: 80, burstA: 100, minCells: 6, maxCells: 14, protocol: "PWM", connector: "pads" }, tags: ["agriculture", "delivery"],
    links: [P("Flying Tech", "https://www.flyingtech.co.uk/product/hobbywing-xrotor-pro-80a-v3-6-14s-opto-multirotor-esc/"), P("rcdrone.top", "https://rcdrone.top/products/hobbywing-xrotor-pro-80a-hv-v3-esc")] },

  // ---- flight controllers ----
  { id: "fc-pixhawk6c", category: "fc", name: "Pixhawk 6C", brand: "Holybro", priceUsd: 220, weightG: 60,
    specs: { motorOutputs: 16, hasGps: false, mcu: "STM32H743", firmware: "ArduPilot/PX4" }, tags: ["delivery", "inspection", "agriculture", "mapping"],
    links: [P("Holybro", "https://holybro.com/products/pixhawk-6c"), P("GetFPV", "https://www.getfpv.com/holybro-pixhawk-6c-fc-module-w-plastic-case.html"),
      P("Robu.in", "https://robu.in/product/holybro-pixhawk-6c-aluminium-body-no-gps-no-power-module/"), P("3DXR", "https://www.3dxr.co.uk/products/holybro-pixhawk-6c-plastic-case-11054"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/pixhawk-6c-flight-controller-aluminium-case"), P("Flying Tech", "https://www.flyingtech.co.uk/product/holybro-pixhawk-6c-autopilot-kit-px4-flight-controller/"),
      P("Studiosport", "https://www.studiosport.fr/controleur-de-vol-pixhawk-6c-holybro-a35315.html"), P("Epic FPV", "https://epicfpv.ca/products/holybro-pixhawk-6c")] },
  { id: "fc-pixhawk6c-gps", category: "fc", name: "Pixhawk 6C + Power Module + M9N GPS bundle", brand: "Holybro", priceUsd: 330, weightG: 130,
    specs: { motorOutputs: 16, hasGps: true, mcu: "STM32H743", firmware: "ArduPilot/PX4", connector: "XT60" }, tags: ["delivery", "inspection", "agriculture", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/holybro-pixhawk-6c-pm02-v3-m9n-gps-plastic-case.html"), P("Amazon.sg", "https://www.amazon.sg/Holybro-Pixhawk-Aluminum-Power-Module/dp/B0BB1TVBHH")] },
  { id: "fc-pixhawk6x", category: "fc", name: "Pixhawk 6X", brand: "Holybro", priceUsd: 380, weightG: 70,
    specs: { motorOutputs: 16, hasGps: false, mcu: "STM32H753", firmware: "ArduPilot/PX4" }, tags: ["delivery", "agriculture", "inspection", "mapping"], links: [] },
  { id: "fc-h743-slim", category: "fc", name: "H743-SLIM V3 Flight Controller", brand: "Matek", priceUsd: 80, weightG: 10,
    specs: { motorOutputs: 8, hasGps: false, mcu: "STM32H743", firmware: "ArduPilot/INAV/Betaflight", fpvClass: ["7", "10"] }, tags: ["mapping", "inspection", "fpv", "interceptor"], links: [] },
  { id: "fc-speedybee-f405", category: "fc", name: "F405 V4 BLS 55A Stack", brand: "SpeedyBee", priceUsd: 100, weightG: 25,
    specs: { motorOutputs: 4, hasGps: false, mcu: "STM32F405", firmware: "Betaflight", fpvClass: ["5", "7"] }, tags: ["fpv", "interceptor"],
    links: [P("Robu.in", "https://robu.in/product/speedybee-f405-v4-bls-55a-30x30-fc-amp-esc-stack/"), P("Amazon.co.uk", "https://www.amazon.co.uk/SpeedyBee-F405-Flight-Controller-Stack/dp/B0C2VKDLFK"),
      P("Amazon.ae", "https://www.amazon.ae/SPARKHOBBY-SpeedyBee-ICM42688P-BLHELIS-SB-F4V4-55-STACK/dp/B0DBYZ4DHT")] },
  { id: "fc-kakute-h7-mini", category: "fc", name: "Kakute H7 Mini Flight Controller", brand: "Holybro", priceUsd: 80, weightG: 8,
    specs: { motorOutputs: 8, hasGps: false, mcu: "STM32H743", firmware: "ArduPilot/Betaflight/INAV", fpvClass: ["5", "7", "10"] }, tags: ["fpv", "interceptor", "mapping", "inspection"],
    links: [P("Robu.in", "https://robu.in/product/holybro-kakute-h7-mini-1-3v-flight-controller/")] },

  // ---- batteries ----
  { id: "bat-cnhl-6s1500", category: "battery", name: "CNHL Black 6S 1500mAh 100C", brand: "CNHL", priceUsd: 32, weightG: 254,
    specs: { cells: 6, mah: 1500, cRating: 100, chemistry: "lipo", fpvClass: "5", connector: "XT60" }, tags: ["fpv", "interceptor"],
    links: [P("RaceDayQuads", "https://racedayquads.com/products/cnhl-black-series-22-2v-6s-1500mah-100c-lipo-battery-xt60"), P("GetFPV", "https://www.getfpv.com/cnhl-black-series-100c-6s-lipo-battery-1500mah.html")] },
  { id: "bat-cnhl-6s1300", category: "battery", name: "CNHL Black 6S 1300mAh 100C", brand: "CNHL", priceUsd: 30, weightG: 230,
    specs: { cells: 6, mah: 1300, cRating: 100, chemistry: "lipo", fpvClass: "5", connector: "XT60" }, tags: ["fpv", "interceptor"],
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/cnhl-black-series-22-2v-6s-1300mah-100c-lipo-battery-xt60"), P("Epic FPV", "https://epicfpv.ca/products/cnhl-6s-lipo-battery-1300mah-22-2v-100c-black-series-with-xt60-pluh")] },
  { id: "bat-tattu-6s1300", category: "battery", name: "Tattu R-Line V6 6S 1300mAh 160C", brand: "Tattu", priceUsd: 38, weightG: 215,
    specs: { cells: 6, mah: 1300, cRating: 160, chemistry: "lipo", fpvClass: "5", connector: "XT60" }, tags: ["fpv", "interceptor"], links: [] },
  { id: "bat-tattu-6s5200", category: "battery", name: "Tattu 6S 5200mAh 45C LiPo", brand: "Tattu", priceUsd: 95, weightG: 720,
    specs: { cells: 6, mah: 5200, cRating: 45, chemistry: "lipo", fpvClass: ["7", "10"], connector: "XT60" }, tags: ["inspection", "mapping", "delivery", "fpv"], links: [] },
  { id: "bat-tattu-6s16000", category: "battery", name: "Tattu Plus 6S 16000mAh 15C UAV LiPo", brand: "Tattu", priceUsd: 280, weightG: 2000,
    specs: { cells: 6, mah: 16000, cRating: 15, chemistry: "lipo", connector: "AS150" }, tags: ["agriculture", "delivery", "mapping"],
    links: [P("Robu.in", "https://robu.in/product/tattu-plus-16000mah-6s-25c-22-2v-lipo-battery-pack-with-xt90s/")] },
  { id: "bat-tattu-6s22000", category: "battery", name: "Tattu 6S 22000mAh 25C LiPo (AS150)", brand: "Tattu", priceUsd: 500, weightG: 2700, // weight: listings say 2.65-3.0 kg
    specs: { cells: 6, mah: 22000, cRating: 25, chemistry: "lipo", connector: "AS150" }, tags: ["agriculture", "delivery", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/tattu-22000mah-6s-25c-lipo-battery-5341.html"), P("RC Corner", "https://www.rccorner.ae/tattu-22000mah-22-2v-25c-6s1p-lipo-battery-pack")] },
  { id: "bat-tattu-12s16000", category: "battery", name: "Tattu Pro LiHV 12S 16000mAh 25C Smart", brand: "Tattu", priceUsd: 710, weightG: 4550,
    specs: { cells: 12, mah: 16000, cRating: 25, chemistry: "lipo", connector: "AS150" }, tags: ["agriculture", "delivery"],
    links: [P("Genstattu", "https://genstattu.com/tattu-Pro-25c-16000mah-12s1p-as150-smart-lipo-battery.html"), P("Gens Ace EU", "https://gensace.de/products/tattu-pro-16000mah-45-6v-25c-12s1p-lipo-battery-pack-with-as150u-f-plug"),
      P("Robu.in", "https://robu.in/product/tattu-pro-lihv-16000mah-12s1p-25c-45-6v-lipo-battery-pack/")] },
  { id: "bat-tattu-12s22000", category: "battery", name: "Tattu Plus 12S 22000mAh 25C Smart", brand: "Tattu", priceUsd: 870, weightG: 6058,
    specs: { cells: 12, mah: 22000, cRating: 25, chemistry: "lipo", connector: "AS150" }, tags: ["agriculture", "delivery"],
    links: [P("Genstattu", "https://genstattu.com/tattu-plus-22000mah-44-4v-25c-12s1p-lipo-smart-battery-pack-with-as150-plug/"), P("Gens Ace EU", "https://gensace.de/fr/products/tattu-plus-1-0-22000mah-44-4v-25c-12s1p-lipo-battery-pack-with-as150u-plug"),
      P("3DXR", "https://www.3dxr.co.uk/products/gensace-gens-ace-tattu-plus-1-0-22000mah-25c-12s1p-44-4v-lipo-with-as150u"), P("Grepow", "https://www.grepow.com/uav-battery/tattu-plus-1-0-12s-22000mah-44-4v-25c-lipo-drone-battery.html")] },
  { id: "bat-herewin-14s16000", category: "battery", name: "Herewin 14S 16000mAh 30C Agricultural Drone LiPo", brand: "Herewin", priceUsd: 700, weightG: 5400, // v4: price, weight, plug est.
    specs: { cells: 14, mah: 16000, cRating: 30, chemistry: "lipo", connector: "AS150" }, tags: ["agriculture", "delivery"],
    links: [P("Herewin", "https://www.herewinpower.com/product/30c-14s1p-51-8v-16000mah-agricultural-drone-battery/")] },
  { id: "bat-tattu-14s28000", category: "battery", name: "Tattu 3.0 14S 28000mAh 25C HV Smart", brand: "Tattu", priceUsd: 1570, weightG: 9100,
    specs: { cells: 14, mah: 28000, cRating: 25, chemistry: "lipo", connector: "AS150" }, tags: ["agriculture", "delivery"],
    links: [P("Gens Ace EU", "https://gensace.de/products/tattu-3-0-28000mah-53-2v-25c-14s1p-hv-lipo-battery-pack-with-molex-plug"), P("Grepow", "https://www.grepow.com/uav-battery/tattu-3-0-14s-28000mah-53-2v-25c-lipo-smart-drone-battery.html")] },
  // 4S packs (prices est. where no list price was seen)
  { id: "bat-tattu-4s6750", category: "battery", name: "Tattu 4S 6750mAh 25C LiPo (XT90)", brand: "Tattu", priceUsd: 90, weightG: 605,
    specs: { cells: 4, mah: 6750, cRating: 25, chemistry: "lipo", connector: "XT90" }, tags: ["inspection", "mapping", "delivery"],
    links: [P("OneDrone", "https://www.onedrone.com/store/b-brands/gensace-tattu/batteries/gens-ace-tattu-6750mah-14-8v-25c-4s1p-lipo-battery-xt90.html"), P("Gens Ace EU", "https://www.gensace.de/tattu-6750mah-14-8v-25c-4s1p-lipo-battery-with-xt90.html")] },
  { id: "bat-tattu-4s10000", category: "battery", name: "Tattu 4S 10000mAh 25C LiPo", brand: "Tattu", priceUsd: 130, weightG: 940,
    specs: { cells: 4, mah: 10000, cRating: 25, chemistry: "lipo", connector: "XT90" }, tags: ["inspection", "mapping", "delivery"],
    links: [P("ReadyMadeRC", "https://readymaderc.com/products/details/tattu-4s-25c-10ah-lipo-no-plug")] },
  { id: "bat-tattu-4s22000", category: "battery", name: "Tattu 4S 22000mAh 25C LiPo (XT90-S)", brand: "Tattu", priceUsd: 330, weightG: 2450,
    specs: { cells: 4, mah: 22000, cRating: 25, chemistry: "lipo", connector: "XT90-S" }, tags: ["delivery", "mapping", "agriculture"],
    links: [P("Genstattu", "https://genstattu.com/tattu-14-8v-25c-4s-22000mah-lipo-battery-with-xt90-s-plug-for-uav"), P("GetFPV", "https://www.getfpv.com/tattu-22000mah-4s-25c-lipo-battery.html")] },
  { id: "bat-molicel-4s2p", category: "battery", name: "4S2P 8400mAh Molicel P42A Li-ion Pack", brand: "WREKD", priceUsd: 192, weightG: 600,
    specs: { cells: 4, mah: 8400, cRating: 8, chemistry: "liion", fpvClass: ["7", "10"], connector: "XT60" }, tags: ["inspection", "mapping", "delivery", "fpv"],
    links: [P("WREKD Canada", "https://ca.wrekd.com/products/4s2p-14-4v-molicel-p42a-8400mah-li-ion-battery-pack")] },
  { id: "bat-molicel-4s4p", category: "battery", name: "4S4P 16800mAh Molicel P42A Li-ion Pack", brand: "Generic", priceUsd: 230, weightG: 1180, // v4: price, weight est. (16 x 70 g cells)
    specs: { cells: 4, mah: 16800, cRating: 8, chemistry: "liion", connector: "XT90" }, tags: ["inspection", "mapping", "delivery"], links: [] },
  { id: "bat-molicel-6s3p", category: "battery", name: "6S3P 12600mAh Molicel P42A Li-ion Pack", brand: "WREKD", priceUsd: 160, weightG: 1050,
    specs: { cells: 6, mah: 12600, cRating: 8, chemistry: "liion", connector: "XT60" }, tags: ["mapping", "inspection", "fpv"],
    links: [P("WREKD", "https://wrekd.com/products/6s3p-21-6v-molicel-p42a-12600mah-li-ion-battery-pack")] },
  { id: "bat-molicel-6s4p", category: "battery", name: "6S4P 16800mAh Molicel P42A Li-ion Pack", brand: "WREKD", priceUsd: 210, weightG: 1800,
    specs: { cells: 6, mah: 16800, cRating: 8, chemistry: "liion", connector: "XT90" }, tags: ["mapping", "inspection", "agriculture"],
    links: [P("WREKD", "https://es.wrekd.com/products/6s4p-21-6v-molicel-p42a-16800mah-li-ion-battery-pack")] },
  { id: "bat-siliconbirds-6s1p", category: "battery", name: "SBB 6S1P 4200mAh Li-ion (Molicel P42A)", brand: "Siliconbirds", priceUsd: 90, weightG: 400,
    specs: { cells: 6, mah: 4200, cRating: 8, chemistry: "liion", fpvClass: "7", connector: "XT60" }, tags: ["fpv", "mapping", "inspection"],
    links: [P("Maxterdrone", "https://maxterdrone.com/en/batteries/2548-sbb-6s1p-4200mah-li-ion-fpv-battery-molicel-p42a-21700.html")] },

  // gap fill 2026-11-07: 6S 9-12 Ah LiPo (delivery quads), 4S 2.2-5 Ah LiPo (interceptor, fixed wing), 4S1P 3 Ah Li-ion (fixed wing)
  { id: "bat-tattu-6s9000", category: "battery", name: "Tattu 6S 9000mAh 25C LiPo (XT60)", brand: "Tattu", priceUsd: 170, weightG: 1250, // price, weight est.
    specs: { cells: 6, mah: 9000, cRating: 25, chemistry: "lipo", connector: "XT60" }, tags: ["delivery", "inspection", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/tattu-9000mah-6s-25c-22-2v-lipo-battery-xt60.html"), P("BuddyRC", "https://www.buddyrc.com/products/tattu-9000mah-22-2v-6s1p-25c-lipo-battery-pack-with-na-plug")] },
  { id: "bat-tattu-6s10000", category: "battery", name: "Tattu 6S 10000mAh 25C LiPo", brand: "Tattu", priceUsd: 229, weightG: 1400,
    specs: { cells: 6, mah: 10000, cRating: 25, chemistry: "lipo", connector: "XT90" }, tags: ["delivery", "inspection", "mapping"],
    links: [P("rcdrone.top", "https://rcdrone.top/products/tattu-6s-10000mah-25c-22-2v-lipo-battery-for-drone"), P("FPV Faster", "https://www.fpvfaster.com.au/products/tattu-plus-10000mah-6s-25c-22-2v-lipo-smart-battery-pack-xt150-dg")] },
  { id: "bat-tattu-6s12000", category: "battery", name: "Tattu 6S 12000mAh 30C LiPo (EC5)", brand: "Tattu", priceUsd: 250, weightG: 1600, // price, weight est.
    specs: { cells: 6, mah: 12000, cRating: 30, chemistry: "lipo", connector: "EC5" }, tags: ["delivery", "agriculture", "mapping"],
    links: [P("Genstattu", "https://www.genstattu.com/ta-30c-12000-6s1p-ec5.html"), P("OneDrone", "https://www.onedrone.com/store/batteries/gensace-tattu-12000-mah-22-2v-30c-6s1p-lipo-battery-ec5.html"),
      P("xboom", "https://www.xboom.in/shop/drones/drone-accessories/tattu-22-2v-30c-6s-12000mah-lipo-battery-pack-with-ec5-plug-for-uav-drone/")] },
  { id: "bat-cnhl-4s5000", category: "battery", name: "CNHL Black 4S 5000mAh 65C LiPo (EC5)", brand: "CNHL", priceUsd: 60, weightG: 540, // price, weight est.
    specs: { cells: 4, mah: 5000, cRating: 65, chemistry: "lipo", connector: "EC5" }, tags: ["interceptor", "fpv", "mapping"],
    links: [P("CNHL", "https://chinahobbyline.com/products/cnhl-black-series-5000mah-14-8v-4s-65c-lipo-battery-with-ec5-plug"), P("Megadron", "https://megadron.pl/en/products/cnhl-5000mah-14-8v-4s-65c-black-ec5-battery-29812.html")] },
  { id: "bat-cnhl-4s5000-40c", category: "battery", name: "CNHL Black 4S 5000mAh 40C LiPo (XT60)", brand: "CNHL", priceUsd: 55, weightG: 520, // price, weight est.
    specs: { cells: 4, mah: 5000, cRating: 40, chemistry: "lipo", connector: "XT60" }, tags: ["interceptor", "delivery", "mapping"],
    links: [P("Zbotic", "https://zbotic.in/product/cnhl-black-series-5000mah-14-8v-4s-40c-lipo-battery-with-xt60-plug/")] },
  { id: "bat-tattu-4s3200", category: "battery", name: "Tattu 4S 3200mAh 45C LiPo (XT60)", brand: "Tattu", priceUsd: 45, weightG: 340, // price, weight est.
    specs: { cells: 4, mah: 3200, cRating: 45, chemistry: "lipo", connector: "XT60" }, tags: ["interceptor", "delivery", "mapping"],
    links: [P("ReadyMadeRC", "https://www.readymaderc.com/products/details/tattu-3200mah-45c-4s-xt60")] },
  { id: "bat-cnhl-4s2200", category: "battery", name: "CNHL Black 4S 2200mAh 40C LiPo (XT60)", brand: "CNHL", priceUsd: 31.95, weightG: 211,
    specs: { cells: 4, mah: 2200, cRating: 40, chemistry: "lipo", connector: "XT60" }, tags: ["interceptor", "delivery", "fpv"],
    links: [P("CNHL", "https://chinahobbyline.com/products/cnhl-black-series-2200mah-14-8v-4s-40c-lipo-battery-with-xt60-plug"), P("BuzzFPV", "https://buzzfpv.com.au/products/cnhl-black-series-2200mah-14-8v-4s-40c-lipo-battery-with-xt60-plug"),
      P("FPV24", "https://www.fpv24.com/en/cnhl/cnhl-gplus-2200mah-4s-lipo-battery-70c-148v-xt60")] }, // FPV24 link is the 70C G+Plus variant
  { id: "bat-flywoo-4s1p-3000", category: "battery", name: "Explorer 4S1P 3000mAh Li-ion (Molicel P30B)", brand: "Flywoo", priceUsd: 50, weightG: 196.5, // price est.; 35 A
    specs: { cells: 4, mah: 3000, cRating: 11, chemistry: "liion", connector: "XT60" }, tags: ["mapping", "inspection", "fpv"],
    links: [P("Flywoo", "https://flywoo.net/products/flywoo-explorer-molicell-p30b-18650-4s1p-3000mah-lionpack-battery"), P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/de/products/flywoo-explorer-molicell-p30b-18650-4s1p-3000mah-li-ionpack-battery")] },
  { id: "bat-auline-4s-3000", category: "battery", name: "Auline VTC6 4S 3000mAh Li-ion (XT60)", brand: "Auline", priceUsd: 50, weightG: 200, // price est.; 30 A
    specs: { cells: 4, mah: 3000, cRating: 10, chemistry: "liion", connector: "XT60" }, tags: ["mapping", "inspection", "delivery"],
    links: [P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/auline-vtc6-3000mah-4s-14-8v-30a-xt60-18650-li-ion-battery")] },

  // FPV 7in / 10in packs: 6S LiPo 3000-5000 mAh, 6S Li-ion 6000-10000 mAh (C = max continuous A / Ah)
  { id: "bat-gnb-6s3000", category: "battery", name: "GNB 6S 3000mAh 100C LiPo (XT60)", brand: "GAONENG", priceUsd: 65, weightG: 450, // price, weight est.
    specs: { cells: 6, mah: 3000, cRating: 100, chemistry: "lipo", fpvClass: "7", connector: "XT60" }, tags: ["fpv", "interceptor"],
    links: [P("MyFPVStore", "https://myfpvstore.com/p4r6")] },
  { id: "bat-cnhl-6s5000", category: "battery", name: "CNHL Black 6S 5000mAh 65C LiPo (XT90)", brand: "CNHL", priceUsd: 85, weightG: 770, // price, weight est.
    specs: { cells: 6, mah: 5000, cRating: 65, chemistry: "lipo", fpvClass: ["7", "10"], connector: "XT90" }, tags: ["fpv", "mapping"],
    links: [P("CNHL", "https://chinahobbyline.com/products/cnhl-black-series-5000mah-22-2v-6s-65c-lipo-battery-with-xt90-plug")] },
  { id: "bat-auline-6s2p-6000", category: "battery", name: "Auline 18650 V45 6S2P 6000mAh Li-ion (XT60)", brand: "Auline", priceUsd: 120, weightG: 620, // price, weight est.; 90 A max
    specs: { cells: 6, mah: 6000, cRating: 15, chemistry: "liion", fpvClass: "7", connector: "XT60" }, tags: ["fpv", "mapping"],
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/auline-18650-v45-6s2p-6000mah-22-2v-90a-li-ion-battery-xt60")] },
  { id: "bat-auline-6s-4500-s70", category: "battery", name: "Auline 21700 S70 6S 4500mAh Li-ion (XT60)", brand: "Auline", priceUsd: 110, weightG: 450, // price, weight est.; 70 A
    specs: { cells: 6, mah: 4500, cRating: 15, chemistry: "liion", fpvClass: "7", connector: "XT60" }, tags: ["fpv", "mapping", "inspection"],
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/auline-21700-s70-4500mah-6s-22-2v-70a-li-ion-battery-xt60")] },
  { id: "bat-ue-dark-4s4200", category: "battery", name: "Dark Lithium V2 21700 4S 4200mAh Li-ion (XT60)", brand: "Upgrade Energy", priceUsd: 70, weightG: 290, // price, weight est.; 45 A max
    specs: { cells: 4, mah: 4200, cRating: 10, chemistry: "liion", connector: "XT60" }, tags: ["fpv", "mapping", "inspection"],
    links: [P("GetFPV", "https://www.getfpv.com/batteries/18650-batteries/upgrade-energy-dark-lithium-v2-21700-4200mah-4s-14-8v-25c-li-ion-battery-xt60.html")] },
  { id: "bat-fullsend-6s8000", category: "battery", name: "FullSend 6S2P 8000mAh Li-ion (XT60H)", brand: "iFlight", priceUsd: 160, weightG: 840, // price, weight est.; 35 A continuous
    specs: { cells: 6, mah: 8000, cRating: 4, chemistry: "liion", fpvClass: ["7", "10"], connector: "XT60" }, tags: ["fpv", "mapping"],
    links: [P("iFlight-RC EU", "https://iflight-rc.eu/en/products/fullsend-6s-8000mah-li-ion-battery")] },
  { id: "bat-sbb-6s2p-8400", category: "battery", name: "SBB 6S2P 8400mAh Li-ion (Molicel P42A)", brand: "Siliconbirds", priceUsd: 175, weightG: 820, // price, weight est.; 90 A max
    specs: { cells: 6, mah: 8400, cRating: 10, chemistry: "liion", fpvClass: ["7", "10"], connector: "XT60" }, tags: ["fpv", "mapping", "inspection"],
    links: [P("Maxterdrone", "https://maxterdrone.com/en/batteries/2546-sbb-6s2p-8400mah-li-ion-fpv-battery-molicel-p42a-21700.html")] },
  { id: "bat-flywoo-6s2p-9000", category: "battery", name: "Explorer 6S2P 9000mAh Li-ion (Molicel P45B)", brand: "Flywoo", priceUsd: 190, weightG: 861, // price est.; 45 A continuous
    specs: { cells: 6, mah: 9000, cRating: 5, chemistry: "liion", fpvClass: "10", connector: "XT60" }, tags: ["fpv", "mapping"],
    links: [P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/product/flywoo-explorer-molicell-p45b-21700-6s2p-9000mah-lionpack-battery")] },

  // ---- props: priceUsd per pack of specs.packOf props (pack size as in the name), weightG per prop; qty = packs ----
  { id: "prop-gemfan-7040-3", category: "prop", name: "Flash 7040 3-Blade 7in (4 pack)", brand: "Gemfan", priceUsd: 4.4, weightG: 7.9, specs: { inch: 7, blades: 3, fpvClass: "7", packOf: 4 }, tags: ["fpv", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/gemfan-flash-7040-durable-3-blade-propeller-set-of-4-clear.html"), P("RaceDayQuads", "https://racedayquads.com/products/gemfan-flash-7040-tri-blade-7-prop-4-pack-choose-your-color"),
      P("WREKD Canada", "https://ca.wrekd.com/products/gemfan-flash-7040-tri-blade-7-prop-4-pack-choose-color"), P("Rotorama", "https://www.rotorama.com/vrtule/gemfan-7042-3-flash"),
      P("Probots", "https://probots.co.in/7inch-3-blade-gemfan-propeller-black.html")] },
  { id: "prop-gemfan-1050-3", category: "prop", name: "1050 3-Blade Glass Fiber Nylon 10in (pair)", brand: "Gemfan", priceUsd: 6.3, weightG: 17, specs: { inch: 10, blades: 3, fpvClass: "10", packOf: 2 }, tags: ["fpv", "delivery", "mapping"],
    links: [P("GetFPV", "https://www.getfpv.com/gemfan-1050-cl-cinelifter-3-blade-propeller-set-of-2-glass-fiber-nylon.html"), P("Zbotic", "https://zbotic.in/product/gemfan-propellers-1050-3-glass-fiber-nylon-propeller/"),
      P("FPV24", "https://www.fpv24.com/en/gemfan/gemfan-1050-3-10-inch-3-blade-propeller-fiberglass-nylon-black")] },
  { id: "prop-hq-5x43x3", category: "prop", name: "HQProp 5x4.3x3 (set of 4)", brand: "HQProp", priceUsd: 4, weightG: 4.5, specs: { inch: 5, blades: 3, fpvClass: "5", packOf: 4 }, tags: ["fpv", "interceptor"], links: [] },
  { id: "prop-gemfan-51466", category: "prop", name: "Hurricane 51466 5in (set of 4)", brand: "Gemfan", priceUsd: 4, weightG: 4.3, specs: { inch: 5, blades: 3, fpvClass: "5", packOf: 4 }, tags: ["fpv", "interceptor"], links: [] }, // pack size est.
  { id: "prop-hq-7x4x3", category: "prop", name: "HQProp 7x4x3 (set of 4)", brand: "HQProp", priceUsd: 5, weightG: 8, specs: { inch: 7, blades: 3, fpvClass: "7", packOf: 4 }, tags: ["fpv", "mapping"], links: [] }, // pack size est.
  { id: "prop-hq-10x5", category: "prop", name: "HQProp 10x5 CF-reinforced (pair)", brand: "HQProp", priceUsd: 10, weightG: 14, specs: { inch: 10, fpvClass: "10", packOf: 2 }, tags: ["inspection", "mapping", "delivery", "fpv"], links: [] }, // pack size est.
  { id: "prop-t15x5", category: "prop", name: "P15x5 Carbon Fiber Prop (pair)", brand: "T-Motor", priceUsd: 90, weightG: 17, specs: { inch: 15, packOf: 2 }, tags: ["delivery", "agriculture", "inspection", "mapping"], links: [] }, // pair price est.
  { id: "prop-hq-4x3x3", category: "prop", name: "HQProp 4x3x3 V2 (set of 4)", brand: "HQProp", priceUsd: 4, weightG: 3, specs: { inch: 4, packOf: 4 }, tags: ["fpv"], // price, weight est.
    links: [P("GetFPV", "https://www.getfpv.com/hqprop-4x3x3-v2-3-blade-propeller-set-of-4.html")] },
  { id: "prop-hq-6x4x3", category: "prop", name: "HQProp DP 6x4x3 (4 pack)", brand: "HQProp", priceUsd: 4.4, weightG: 6.3, specs: { inch: 6, packOf: 4 }, tags: ["fpv", "interceptor"], // price est.
    links: [P("GetFPV", "https://www.getfpv.com/hqprop-dp-6x4x3b-propeller-black-4-pack.html"), P("RaceDayQuads", "https://www.racedayquads.com/products/hq-prop-6x4-5x3-tri-blade-6-prop-4-pack-gray")] },
  { id: "prop-hq-cine8", category: "prop", name: "HQProp Cine8 8x4.5x3 (set of 4)", brand: "HQProp", priceUsd: 17, weightG: 6.5, specs: { inch: 8, packOf: 4 }, tags: ["inspection", "mapping", "interceptor"],
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/hqprop-cine8-8x4-5x3-3-blade-propeller-set-of-4"), P("GetFPV", "https://www.getfpv.com/hqprop-cine-8x4-5x3-3-blade-macro-quad-propeller-set-of-2-black.html")] },
  { id: "prop-hq-9x5x3", category: "prop", name: "HQProp MacroQuad 9x5x3 (set of 4)", brand: "HQProp", priceUsd: 23.6, weightG: 12, specs: { inch: 9, packOf: 4 }, tags: ["inspection", "mapping"], // weight est.
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/hqprop-macroquad-9x5x3-3-blade-propeller-set-of-4")] },
  { id: "prop-hq-11x45x3", category: "prop", name: "HQProp MacroQuad 11x4.5x3 (set of 2)", brand: "HQProp", priceUsd: 14, weightG: 16, specs: { inch: 11, packOf: 2 }, tags: ["inspection", "mapping", "delivery"],
    links: [P("RaceDayQuads", "https://www.racedayquads.com/products/hqprop-macroquad-11x4-5x3-3-blade-propeller-set-of-2"), P("GetFPV", "https://www.getfpv.com/hqprop-11x4-5x3-3-blade-macro-quad-propeller-black.html")] },
  { id: "prop-t12x4", category: "prop", name: "P12x4 Carbon Fiber Prop (pair)", brand: "T-Motor", priceUsd: 39, weightG: 14.5, specs: { inch: 12, packOf: 2 }, tags: ["delivery", "mapping", "inspection"],
    links: [P("T-Motor", "https://store.tmotor.com/product/polish-carbon-fiber-12x4-prop.html"), P("RobotShop", "https://www.robotshop.com/products/t-motor-12-4-carbon-fiber-propeller-pair")] },
  { id: "prop-t13x44", category: "prop", name: "P13x4.4 Carbon Fiber Prop (pair)", brand: "T-Motor", priceUsd: 45, weightG: 14.2, specs: { inch: 13, packOf: 2 }, tags: ["delivery", "mapping", "inspection"], // price est.
    links: [P("Zbotic", "https://zbotic.in/product/t-motor-p134-4-prop-2pcs-pair/"), P("Robocraze", "https://robocraze.com/products/t-motor-p13-4-4-propeller-2pcs-pair")] },
  { id: "prop-t16x54", category: "prop", name: "P16x5.4 Carbon Fiber Prop (pair)", brand: "T-Motor", priceUsd: 100, weightG: 20, specs: { inch: 16, packOf: 2 }, tags: ["agriculture", "delivery"], links: [] }, // v4: price, weight est.
  { id: "prop-t17x58", category: "prop", name: "P17x5.8 Carbon Fiber Prop (pair)", brand: "T-Motor", priceUsd: 110, weightG: 25, specs: { inch: 17, packOf: 2 }, tags: ["agriculture", "delivery"], // price, weight est.
    links: [P("GetFPV", "https://www.getfpv.com/tiger-17x5-8-carbon-fiber-props-pair.html")] },
  { id: "prop-t20x6", category: "prop", name: "P20x6 Carbon Fiber Prop (pair)", brand: "T-Motor", priceUsd: 109, weightG: 40, specs: { inch: 20, packOf: 2 }, tags: ["agriculture", "delivery"], // weight est.
    links: [P("IR-Lock", "https://irlock.com/products/t-motor-p20x6-prop-2pcs-pair")] },
  { id: "prop-mf2211", category: "prop", name: "MF2211 Folding Polymer Prop 22.4in (pair)", brand: "T-Motor", priceUsd: 55, weightG: 71, specs: { inch: 22.4, packOf: 2 }, tags: ["agriculture", "delivery"],
    links: [P("T-Motor", "https://store.tmotor.com/product/mf2211-polymer-folding-prop.html"), P("GetFPV", "https://www.getfpv.com/t-motor-folding-polymer-propeller-mf2211-pair.html")] },
  { id: "prop-t18", category: "prop", name: "G18x6.1 Carbon Fiber Prop (pair)", brand: "T-Motor", priceUsd: 120, weightG: 28, specs: { inch: 18, packOf: 2 }, tags: ["agriculture", "delivery"], links: [] }, // pair price est.

  // ---- cameras (kind matches requirements.camera.kind) ----
  { id: "cam-ratel2", category: "camera", name: "Ratel 2 Starlight Analog FPV Camera", brand: "Caddx", priceUsd: 37, weightG: 6,
    specs: { kind: "fpv", weightG: 6, resolution: "1200TVL", fpvClass: ["5", "7", "10"] }, tags: ["fpv", "interceptor", "delivery", "agriculture"],
    links: [P("Lumenier", "https://www.lumenier.com/products/caddx-ratel-2-micro-starlight-1200tvl-low-latency-fpv-camera"), P("DIYFPV", "https://www.diyfpv.com/product/caddx-ratel-2-micro-1200tvl-cmos-43169-ntscpal-fpv-camera-21mm"),
      P("Robu.in", "https://robu.in/product/caddx-ratel-2-1-1-8-1200tvl-2-1mm-camera-red/"), P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/caddx-ratel-2-1200tvl-fpv-camera-2-1mm"),
      P("FPV24", "https://www.fpv24.com/en/caddx/caddx-ratel-2-analog-fpv-camera-1200tvl-black"), P("N-Factory", "https://n-factory.de/Caddx-Ratel-2-1200TVL-FPV-Cam-Starlight-Low-Latency"),
      P("RotorGeeks", "https://rotorgeeks.com/fpv/fpv-cameras/caddx-ratel-2"), P("Amazon.ca", "https://www.amazon.ca/Caddx-Micro-Camera-Starlight-1200TVL/dp/B08T74F3WB"),
      P("Phaser FPV", "https://phaserfpv.com.au/products/caddx-ratel-2-analog-camera-1200tvl-cmos-43169-ntscpal-fpv-camera21mm"), P("Amazon.co.jp", "https://www.amazon.co.jp/Caddx-Ratel-1200TVL-FPV%E3%82%AB%E3%83%A1%E3%83%A9-NTSC/dp/B0915LXXDX")] },
  { id: "cam-predator", category: "camera", name: "Predator V5 Racing Camera", brand: "Foxeer", priceUsd: 28, weightG: 8,
    specs: { kind: "fpv", weightG: 8, resolution: "1000TVL", fpvClass: "5" }, tags: ["interceptor", "fpv"], links: [] },
  { id: "cam-siyi-a8", category: "camera", name: "A8 mini 4K Gimbal Camera", brand: "SIYI", priceUsd: 259, weightG: 95,
    specs: { kind: "gimbal4k", weightG: 95, resolution: "4K 8MP, 6x digital zoom" }, tags: ["inspection", "mapping", "agriculture"],
    links: [P("SIYI", "https://shop.siyi.biz/products/siyi-a8-mini-gimbal-camera"), P("Robu.in", "https://robu.in/product/siyi-a8-mini-ultra-hd-6x-digital-zoom-gimbal-camera/"),
      P("Studiosport", "https://www.studiosport.fr/nacelle-camera-a8-mini-pour-drone-siyi-a31536.html"), P("Amazon.co.jp", "https://amazon.co.jp/-/en/SIYI-Ultra-Digital-Gimbal-Camera/dp/B0C4XL4TBN")] },
  { id: "cam-siyi-zr10", category: "camera", name: "ZR10 2K 30x Hybrid Zoom Gimbal Camera", brand: "SIYI", priceUsd: 550, weightG: 381,
    specs: { kind: "zoom", weightG: 381, resolution: "2K 4MP, 10x optical / 30x hybrid" }, tags: ["inspection"],
    links: [P("SIYI", "https://shop.siyi.biz/products/siyi-zr10-gimbal-camera"), P("Robu.in", "https://robu.in/product/siyi-zr10-hybrid-zoom-gimbal-camera-with-hdr-starlight-night-vision-3-axis-stabilizer/")] },
  { id: "cam-siyi-zt6", category: "camera", name: "ZT6 Thermal + 4K Dual-Sensor Gimbal", brand: "SIYI", priceUsd: 2600, weightG: 197, // price est. (listings 2,575-3,700 USD)
    specs: { kind: "thermal", weightG: 197, resolution: "640x512 thermal + 4K" }, tags: ["inspection", "agriculture"],
    links: [P("IR-Lock", "https://irlock.com/products/siyi-zt6-mini-optical-pod-dual-sensors-4k-8mp-6x-digital-zoom-gimbal-camera"), P("SIYI", "https://siyi.biz/en/product/tri-axis-multi-sensor-gimbal-pod/zt6/"),
      P("Zbotic", "https://zbotic.in/product/siyi-zt6-mini-optical-pod-dual-sensors-4k-8mp-6x-digital-zoom-gimbal-camera/"), P("Baltic Drones", "https://balticdrones.eu/products/fpv-hd-camera-siyi-zt6-mini-optical-pod-dual-sensor"),
      P("HobbyDrone.cz", "https://www.hobbydrone.cz/fpv-hd-camera-siyi-zt6-mini-optical-pod-dual-sensor")] },
  { id: "cam-siyi-zt30", category: "camera", name: "ZT30 Four-Sensor Thermal Zoom Pod", brand: "SIYI", priceUsd: 7635, weightG: 854,
    specs: { kind: "thermal", weightG: 854, resolution: "640x512 thermal + 4K 30x optical + rangefinder" }, tags: ["inspection"],
    links: [P("SIYI", "https://shop.siyi.biz/products/siyi-zt30"), P("3DXR", "https://www.3dxr.co.uk/products/siyi-technology-siyi-zt30-thermal-gimbal-camera")] },
  { id: "cam-mapir-survey3w", category: "camera", name: "Survey3W RGB Mapping Camera", brand: "MAPIR", priceUsd: 400, weightG: 50,
    specs: { kind: "survey", weightG: 50, resolution: "12MP RGB, 87° HFOV" }, tags: ["mapping", "agriculture"],
    links: [P("MAPIR", "https://www.mapir.camera/products/survey3w-camera-visible-light-rgb")] },
  { id: "cam-sony-ilx-lr1", category: "camera", name: "ILX-LR1 61MP Mapping Camera (body only)", brand: "Sony", priceUsd: 3198, weightG: 243,
    specs: { kind: "survey", weightG: 243, resolution: "61MP full frame, E-mount" }, tags: ["mapping"],
    links: [P("AVC Store", "https://avcstore.com/products/sony-ilxlr1-industrial-camera")] },
  { id: "cam-gopro13", category: "camera", name: "HERO13 Black Action Camera", brand: "GoPro", priceUsd: 399, weightG: 159,
    specs: { kind: "action", weightG: 159, resolution: "5.3K60, 27MP" }, tags: ["fpv"],
    links: [P("Amazon.in", "https://www.amazon.in/GoPro-HERO13-Black-Compatability-International/dp/B0DFY1SYNJ"), P("Amazon.sg", "https://www.amazon.sg/GoPro-HERO13-Black-Compatability-HB/dp/B0DCM34GXX"),
      P("Amazon.co.jp", "https://www.amazon.co.jp/-/en/GoPro-4K120fps-Waterproof-Climates-CHDHX-131-FW/dp/B0DRCQTXFF")] },
  { id: "cam-osmo-action5", category: "camera", name: "Osmo Action 5 Pro Standard Combo", brand: "DJI", priceUsd: 349, weightG: 146,
    specs: { kind: "action", weightG: 146, resolution: "4K120, 40MP" }, tags: ["fpv"],
    links: [P("Amazon.ca", "https://www.amazon.ca/DJI-Standard-Waterproof-Stabilization-Touchscreens/dp/B0D1YH4B2R"), P("Amazon.sg", "https://www.amazon.sg/DJI-Osmo-Action-Standard-Combo/dp/B0D1YH4B2R"),
      P("Amazon.co.jp", "https://amazon.co.jp/-/en/Standard-Waterproof-Subject-Tracking-Stabilization/dp/B0DBQTC2P7")] },

  // ---- extras ----
  { id: "vtx-o4", category: "vtx", name: "O4 Air Unit (digital HD video)", brand: "DJI", priceUsd: 119, weightG: 8,
    specs: { type: "digital", fpvClass: ["5", "7", "10"] }, tags: ["fpv", "interceptor", "inspection", "mapping"],
    links: [P("WREKD", "https://wrekd.com/products/dji-o4-air-unit"), P("Pyrodrone", "https://pyrodrone.com/products/dji-o4-air-unit-digital-transmission-system"),
      P("Amazon.ca", "https://www.amazon.ca/DJI-6941565997395-Air-Unit/dp/B07FTGBT64"), P("Amazon.com.au", "https://www.amazon.com.au/DJI-Digital-Transmission-Recording-Lightweight/dp/B07FTGBT64"),
      P("Amazon.sg", "https://www.amazon.sg/DJI-6941565997395-O4-Air-Unit/dp/B07FTGBT64")] },
  { id: "vtx-rush-tank", category: "vtx", name: "Tank Ultimate 5.8GHz 800mW VTX", brand: "Rush", priceUsd: 45, weightG: 8, specs: { type: "analog", fpvClass: ["5", "7", "10"] }, tags: ["interceptor", "fpv"], links: [] },
  { id: "gps-m10", category: "gps", name: "M10 GPS (standard)", brand: "Holybro", priceUsd: 35, weightG: 32, specs: { constellations: 4 }, tags: ALL,
    links: [P("Holybro", "https://holybro.com/products/m10-gps"), P("GetFPV", "https://www.getfpv.com/holybro-m10-standard-gps-w-10-pin-cable.html"),
      P("Robu.in", "https://robu.in/product/holybro-m10-gps-standard-gps-ghr-1-25mm-10pin/"), P("Epic FPV", "https://epicfpv.ca/products/holybro-m10-gps-secondary-gps")] },
  { id: "gps-m9n", category: "gps", name: "M9N GPS", brand: "Holybro", priceUsd: 50, weightG: 33, specs: { constellations: 4 }, tags: ["delivery", "inspection", "agriculture", "mapping"], links: [] },
  { id: "radio-boxer", category: "radio", name: "Boxer Radio (ELRS)", brand: "RadioMaster", priceUsd: 160, weightG: 600, specs: { protocol: "ELRS" }, tags: ALL,
    links: [P("Robu.in", "https://robu.in/product/radiomaster-boxer-radio-controller-elrs-version/"), P("HobbyRC", "https://www.hobbyrc.co.uk/radiomaster-boxer-transmitter-elrs"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/radiomaster-boxer-radio-transmitter"), P("FPV24", "https://www.fpv24.com/en/radiomaster/radiomaster-boxer-elrs-remote-control"),
      P("Rotorama", "https://www.rotorama.com/product/radiomaster-boxer-elrs"), P("Drone-FPV-Racer", "https://www.drone-fpv-racer.com/radio-boxer-elrs-24g-radiomaster-10582.html"),
      P("Phaser FPV", "https://phaserfpv.com.au/products/radiomaster-boxer-radio-transmitter-4-in-1-multi-protocolelrs-2ghz"), P("Amazon.ca", "https://www.amazon.ca/Radiomaster-Controller-Fixed-Wing-Helicopters-Transparent/dp/B0FGD3JSXZ"),
      P("Amazon.ae", "https://amazon.ae/RadioMaster-Gimbals-Controller-Carrying-Multi-Protocol/dp/B0BTMZDT4X"), P("Amazon.sg", "https://www.amazon.sg/RadioMaster-2-4GHz-Gimbals-Controller-Carrying/dp/B0DQ5XDPFQ"),
      P("Amazon.co.jp", "https://www.amazon.co.jp/-/en/Radiomaster-Control-Gimbal-Transmitter-Version/dp/B0DXZW5R51")] },
  { id: "radio-rp2", category: "radio", name: "RP2 V2 ExpressLRS 2.4GHz Nano Receiver", brand: "RadioMaster", priceUsd: 18, weightG: 1, specs: { protocol: "ELRS" }, tags: ALL,
    links: [P("Lumenier", "https://www.lumenier.com/products/radiomaster-rp2-v2-expresslrs-2-4ghz-nano-receiver-w-fixed-smt-antenna"), P("Robu.in", "https://robu.in/product/radiomaster-rp2-v2-expresslrs-2-4ghz-nano-receiver/"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/radiomaster-rp2-v2-expresslrs-2-4ghz-nano-receiver"), P("FPV Faster", "https://www.fpvfaster.com.au/products/radiomaster-rp2-v2-expresslrs-2-4ghz-nano-receiver-2-4ghz"),
      P("Amazon.ae", "https://www.amazon.ae/RadioMaster-ExpressLRS-2-4ghz-Receiver-Fixed-Wings/dp/B0BRNYGTWN")] },
  { id: "servo-es08ma2", category: "servo", name: "ES08MA II 12g Metal Gear Servo", brand: "EMAX", priceUsd: 13, weightG: 12,
    specs: { torqueKgCm: 2.0, maxVoltage: 6 }, tags: ["mapping", "inspection", "delivery", "fpv"],
    links: [P("GetFPV", "https://www.getfpv.com/emax-es08ma-ii-12g-mini-metal-gear-analog-servo-for-rc-model.html"), P("RaceDayQuads", "https://www.racedayquads.com/products/emax-es08ma-ii-12g-analog-metal-gear-servo")] },
  { id: "servo-kst-x10mini", category: "servo", name: "X10 Mini HV Wing Servo 7.5kg", brand: "KST", priceUsd: 45, weightG: 23,
    specs: { torqueKgCm: 7.5, maxVoltage: 8.4, tilt: true }, tags: ["mapping", "inspection", "delivery"], // tilt: metal gear, 7.5 kg·cm
    links: [P("HeliDirect", "https://www.helidirect.com/products/kst-x10-mini-servo"), P("Aloft Hobbies", "https://alofthobbies.com/kst-x10-mini.html"), P("Rotorama", "https://www.rotorama.com/product/kst-x10-mini-23g-0-1s-7-5kg")] },
  // tilt-capable servos (specs.tilt): metal gear, fast, sized for the motor tilt load; qty = tilt servoCount
  { id: "servo-heewing-t1-tilt", category: "servo", name: "T1 VTOL Tilt Servo with Motor Mount", brand: "HEEWING", priceUsd: 20, weightG: 15, // price, weight est.
    specs: { torqueKgCm: 3, maxVoltage: 6, tilt: true }, tags: ["fpv", "mapping"],
    links: [P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/replacement-heewing-t1-vtol-tilt-servo")] },
  { id: "servo-kst-ms325", category: "servo", name: "MS325 HV Coreless Metal Gear Servo 5.2kg", brand: "KST", priceUsd: 50.4, weightG: 25, // EUR 44.88; weight est.
    specs: { torqueKgCm: 5.2, maxVoltage: 8.4, tilt: true }, tags: ["mapping", "inspection", "delivery"],
    links: [P("Aloft Hobbies", "https://alofthobbies.com/kst-ms-325-servo-5-2kg-76-38-oz-in-07-sec-high-voltage.html"), P("BuddyRC", "https://buddyrc.com/products/kst-ms325-digital-servo-8-4v-0-07s-5-2kg-cm-72oz-in"),
      P("Racer.lt", "https://www.racer.lt/item/kst-ms325-6-5kg-torque-magnetic-sensor-digital-servo-for-goblin-380-trex-450-3606.html")] },
  { id: "sensor-airspeed-ms4525", category: "sensor", name: "Digital Air Speed Sensor MS4525DO", brand: "Holybro", priceUsd: 26, weightG: 15, // weight est.
    specs: { type: "airspeed", interface: "I2C" }, tags: ALL,
    links: [P("Holybro", "https://holybro.com/collections/sensors/products/digital-air-speed-sensor-ms4525do"), P("GetFPV", "https://www.getfpv.com/holybro-air-speed-sensor.html"),
      P("Robu.in", "https://robu.in/product/holybro-ms4525do-digital-airspeed-sensor/"), P("Flying Tech", "https://www.flyingtech.co.uk/product/holybro-digital-airspeed-sensor-ms4525-pt40-pt60/"),
      P("Unmanned Tech Shop", "https://www.unmannedtechshop.co.uk/products/holybro-digital-airspeed-sensor-ms4525"), P("FPV24", "https://www.fpv24.com/en/holybro/holybro-air-speed-sensor-digital")] },
  { id: "payload-release", category: "payload", name: "Servo Payload Release Mechanism", brand: "Generic", priceUsd: 30, weightG: 40, specs: { maxKg: 2 }, tags: ["delivery"], links: [] },
  { id: "payload-winch", category: "payload", name: "Drone Winch Package Delivery Kit", brand: "Generic", priceUsd: 120, weightG: 250, specs: { maxKg: 3 }, tags: ["delivery"], links: [] },
  { id: "payload-sprayer", category: "payload", name: "Agricultural Spray Pump Kit", brand: "Generic", priceUsd: 90, weightG: 600, specs: { maxKg: 5 }, tags: ["agriculture"], links: [] },
];

// Region codes where an item has a local product listing (GLOBAL = brand store or worldwide shipper).
for (const i of CATALOG) i.regions = [...new Set(i.links.map((l) => l.region))];
