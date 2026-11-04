
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") root.addEventListener("DOMContentLoaded", function () { api.attach(document); });
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FIO = "https://rest.fnar.net";
  const PLANNER_EXCHANGES = "https://api.prunplanner.org/data/exchanges/";
  const BOOK_VWAP = "Universe · VWAP 30D";
  const CENTRAL_EXCHANGES = ["AI1", "CI1", "CI2", "IC1", "NC1", "NC2"];
  const FALLBACK_EXCHANGES = ["CI1", "CI2", "AI1", "IC1", "NC1", "NC2"];
  const DEFAULT_CX = "CI1";
  const MS_WEEK = 7 * 86400000;

  function normalizeExchange(code) {
    const cx = String(code || "").trim().toUpperCase();
    return CENTRAL_EXCHANGES.indexOf(cx) >= 0 ? cx : DEFAULT_CX;
  }

  function lastTradeLabel(cx) {
    return normalizeExchange(cx) + " last trade";
  }

  const HQ_LEVELS = {
    2: { BBH: 6, BDE: 4, BSE: 4, BTA: 2, MCG: 12, TRU: 4 },
    3: { BBH: 16, BDE: 12, BSE: 12, BTA: 6, MCG: 36, TRU: 12, OFF: 20 },
    4: { BBH: 24, BDE: 16, BSE: 16, BTA: 8, MCG: 48, MFK: 8, TRU: 16, UTS: 4 },
    5: { OFF: 40, SUN: 20, UTS: 8, MFK: 16 },
    6: { LBH: 6, LDE: 4, LSE: 4, LTA: 2, MCG: 24, TRU: 12, POW: 10 },
    7: { LBH: 12, LDE: 8, LSE: 8, LTA: 4, MCG: 36, TRU: 16, SP: 10 },
    8: { LBH: 16, LDE: 12, LSE: 12, LTA: 6, MCG: 48, TRU: 20, OFF: 60, SP: 2 },
    9: { LBH: 24, LDE: 16, LSE: 16, LTA: 8, MCG: 60, TRU: 24, SP: 10, POW: 10 },
    10: { OFF: 100, SP: 14, POW: 10 },
    11: { RBH: 6, RDE: 4, RSE: 4, RTA: 2, MCG: 48, TRU: 20, AAR: 4 },
    12: { RBH: 12, RDE: 8, RSE: 8, RTA: 4, MCG: 60, TRU: 24, BWS: 2 },
    13: { OFF: 200, BWS: 1, BMF: 1, AAR: 1 },
    14: { RBH: 16, RDE: 12, RSE: 12, RTA: 6, MCG: 100, TRU: 28, BWS: 2, AAR: 2 },
    15: { RBH: 24, RDE: 16, RSE: 16, RTA: 8, MCG: 150, TRU: 32, BWS: 2, BMF: 2 },
    16: { OFF: 300, LOG: 1 },
    17: { ABH: 12, ADE: 8, ASE: 8, ATA: 4, MCG: 200, TRU: 40, COM: 1 },
    18: { ADS: 1, OFF: 400 },
    19: { ABH: 24, ADE: 16, ADS: 1, ASE: 16, ATA: 8, COM: 1, LOG: 1, MCG: 500, TRU: 80 },
    20: { ADS: 1, COM: 1, LOG: 1, OFF: 500 },
  };

  const PIONEER_PER_100_PER_DAY = [
    ["DW", 4],
    ["RAT", 4],
    ["OVE", 0.5],
    ["COF", 0.5],
    ["PWO", 0.2],
  ];

  const EXPERT_BONUS = [0, 0.0306, 0.0696, 0.1248, 0.1974, 0.2840];
  // Handbook "Days required", in hundredths of a day. Each row starts over after the previous expert.
  // Calendar days for a row = listed days / building weight / (1 + bonus already active).
  const EXPERT_UNLOCK_HUNDREDTHS = [0, 1000, 1250, 5757, 27650, 91510];
  // Bonus already active on the unlock clock, indexed by experts owned.
  // Owned 0–3 use that count's handbook bonus. The fifth interval uses 28.40%
  // (915.10 / N / 1.2840), so 21 buildings reach expert 5 in ~49.26 days.
  const EXPERT_CLOCK_BONUS = [0, 0.0306, 0.0696, 0.1248, 0.2840];
  const MAX_EXPERTS_PER_CATEGORY = 5;
  const MAX_EXPERTS_TOTAL = 6;
  const VWAP_CURRENCY = "CIS";
  const EXCHANGE_CURRENCY = {
    AI1: "AIC",
    CI1: "CIS",
    CI2: "CIS",
    IC1: "ICA",
    NC1: "NCC",
    NC2: "NCC",
  };
  // PRUNplanner publishes vwap_30d for AI1, CI1, IC1, NC1, and UNIVERSE.
  // CI2 has no series, so CIS uses CI1. NC2 has no series, so NCC uses NC1.
  // UNIVERSE is the CIS blend and stays a fallback.
  const VWAP_MARKET = {
    AI1: "AI1",
    CI1: "CI1",
    CI2: "CI1",
    IC1: "IC1",
    NC1: "NC1",
    NC2: "NC1",
  };

  function exchangeCurrency(code) {
    return EXCHANGE_CURRENCY[normalizeExchange(code)] || VWAP_CURRENCY;
  }

  function vwapMarket(code) {
    return VWAP_MARKET[normalizeExchange(code)] || "CI1";
  }

  function vwapColumnLabel(code) {
    return vwapMarket(code) + " · VWAP 30D";
  }

  function vwapSeriesName(row, exchange) {
    if (row && row.vwapExchange === "UNIVERSE") return BOOK_VWAP;
    if (row && row.vwapExchange) return row.vwapExchange + " · VWAP 30D";
    return vwapColumnLabel(exchange);
  }

  const EXPERTISE_TO_EXPERT = {
    AGRICULTURE: "Agriculture",
    CHEMISTRY: "Chemistry",
    CONSTRUCTION: "Construction",
    ELECTRONICS: "Electronics",
    FOOD_INDUSTRIES: "Food_Industries",
    FUEL_REFINING: "Fuel_Refining",
    MANUFACTURING: "Manufacturing",
    METALLURGY: "Metallurgy",
    RESOURCE_EXTRACTION: "Resource_Extraction",
  };

  const WORKER_FIELDS = [
    ["pioneer", "Pioneers"],
    ["settler", "Settlers"],
    ["technician", "Technicians"],
    ["engineer", "Engineers"],
    ["scientist", "Scientists"],
  ];

  const WORKFORCE_NEEDS = {
    pioneer: [
      ["DW", 4 / 100, ""],
      ["RAT", 4 / 100, ""],
      ["OVE", 0.5 / 100, ""],
      ["PWO", 0.2 / 100, "lux1"],
      ["COF", 0.5 / 100, "lux2"],
    ],
    settler: [
      ["DW", 5 / 100, ""],
      ["RAT", 6 / 100, ""],
      ["EXO", 0.5 / 100, ""],
      ["PT", 0.5 / 100, ""],
      ["REP", 0.2 / 100, "lux1"],
      ["KOM", 1 / 100, "lux2"],
    ],
    technician: [
      ["DW", 7.5 / 100, ""],
      ["RAT", 7 / 100, ""],
      ["MED", 0.5 / 100, ""],
      ["HMS", 0.5 / 100, ""],
      ["SCN", 0.1 / 100, ""],
      ["SC", 0.1 / 100, "lux1"],
      ["ALE", 1 / 100, "lux2"],
    ],
    engineer: [
      ["DW", 10 / 100, ""],
      ["MED", 0.5 / 100, ""],
      ["FIM", 7 / 100, ""],
      ["HSS", 0.2 / 100, ""],
      ["PDA", 0.1 / 100, ""],
      ["VG", 0.2 / 100, "lux1"],
      ["GIN", 1 / 100, "lux2"],
    ],
    scientist: [
      ["DW", 10 / 100, ""],
      ["MED", 0.5 / 100, ""],
      ["MEA", 7 / 100, ""],
      ["LC", 0.2 / 100, ""],
      ["WS", 0.05 / 100, ""],
      ["NST", 0.1 / 100, "lux1"],
      ["WIN", 1 / 100, "lux2"],
    ],
  };

  const WORKFORCE_COGC = {
    PIONEERS: "pioneer",
    SETTLERS: "settler",
    TECHNICIANS: "technician",
    ENGINEERS: "engineer",
    SCIENTISTS: "scientist",
  };

  function stableFloor(value) {
    if (!Number.isFinite(value)) return NaN;
    const nearest = Math.round(value);
    if (Math.abs(value - nearest) <= 1e-6) return nearest;
    return Math.floor(value);
  }

  function ceilUnits(value) {
    if (!(value > 0)) return 0;
    const nearest = Math.round(value);
    if (Math.abs(value - nearest) <= 1e-6) return nearest;
    return Math.ceil(value);
  }

  function permitMaterials(level) {
    if (!Number.isInteger(level) || level < 2) return {};
    if (level <= 20) return Object.assign({}, HQ_LEVELS[level]);
    const x = level - 20;
    const factor = x + Math.pow(2, x / 5);
    const specs = [["MCG", 100], ["TRU", 40], ["ABH", 24], ["ADE", 16], ["ASE", 16], ["ATA", 8]];
    const out = {};
    for (const [ticker, coef] of specs) {
      const raw = coef * factor;
      if (!Number.isFinite(raw)) {
        return { error: "That HQ level overflows the formula on pct.fnar.net/hq." };
      }
      const amount = stableFloor(raw);
      if (amount > 0) out[ticker] = amount;
    }
    const special = stableFloor((2 * level) / 15);
    if (!Number.isFinite(special)) {
      return { error: "That HQ level overflows the formula on pct.fnar.net/hq." };
    }
    if (special > 0) {
      out.ADS = special;
      out.COM = special;
      out.LOG = special;
    }
    return out;
  }

  function parseHq(value) {
    const raw = value == null ? "" : String(value).trim();
    if (raw === "" || raw === "0") return { level: null, materials: null };
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return { error: "HQ level is a whole number. 0 leaves the permit out." };
    }
    const level = Math.floor(n);
    const capped = level !== n;
    if (level <= 0) return { level: null, materials: null, capped: true, requested: n };
    if (level === 1) {
      return {
        level: 1,
        materials: {},
        note: "HQ level 1 has no upgrade row. The permit list starts at level 2, so the permit cost is zero.",
        capped: capped,
        requested: n,
      };
    }
    const materials = permitMaterials(level);
    if (materials.error) return materials;
    const note = level <= 20
      ? "HQ " + level + " uses the fixed material counts."
      : "HQ " + level + " uses the level 21 formula on pct.fnar.net/hq, with x = " + (level - 20) + ".";
    return { level: level, materials: materials, note: note, capped: capped, requested: n };
  }

  function expertFactor(count) {
    const n = Number.isInteger(count) && count > 0 ? count : 0;
    const bonus = EXPERT_BONUS[Math.min(n, EXPERT_BONUS.length - 1)];
    return 1 + bonus;
  }

  function clockBonus(owned) {
    const n = Math.max(0, Math.floor(Number(owned) || 0));
    if (n <= 0) return 0;
    return EXPERT_CLOCK_BONUS[Math.min(n, EXPERT_CLOCK_BONUS.length - 1)] || 0;
  }

  function expertStageDays(stage, weight) {
    const index = Math.floor(Number(stage) || 0);
    if (index < 1 || index >= EXPERT_UNLOCK_HUNDREDTHS.length) return Infinity;
    const listed = EXPERT_UNLOCK_HUNDREDTHS[index] / 100;
    const pace = Number(weight) * (1 + clockBonus(index - 1));
    if (!(pace > 0)) return Infinity;
    return listed / pace;
  }

  function expertUnlockDay(count, weight) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const last = Math.min(n, EXPERT_UNLOCK_HUNDREDTHS.length - 1);
    const pace = weight == null || weight === "" ? 1 : Number(weight);
    let day = 0;
    for (let stage = 1; stage <= last; stage += 1) {
      const span = expertStageDays(stage, pace);
      if (!Number.isFinite(span)) return Infinity;
      day += span;
    }
    return day;
  }

  function expertBounds(start, end, weight) {
    const from = Math.max(0, Math.floor(Number(start) || 0));
    let to = Math.max(0, Math.floor(Number(end) || 0));
    if (to < from) to = from;
    const cap = EXPERT_UNLOCK_HUNDREDTHS.length - 1;
    const owned = Math.min(from, cap);
    const goal = Math.min(to, cap);
    const pace = Number(weight) > 0 ? Number(weight) : 0;
    const bounds = [{ count: owned, day: 0 }];
    let day = 0;
    for (let n = owned + 1; n <= goal; n += 1) {
      const span = expertStageDays(n, pace);
      if (!Number.isFinite(span)) break;
      day += span;
      bounds.push({ count: n, day: day });
    }
    return bounds;
  }

  function expertFactorOverWeek(start, end, weight, week) {
    const weekIndex = Math.max(1, Math.floor(Number(week) || 1));
    const week0 = (weekIndex - 1) * 7;
    const week1 = week0 + 7;
    const bounds = expertBounds(start, end, weight);
    let acc = 0;
    let bonus = false;
    for (let i = 0; i < bounds.length; i += 1) {
      const begin = Math.max(week0, bounds[i].day);
      const next = i + 1 < bounds.length ? bounds[i + 1].day : Infinity;
      const endDay = Math.min(week1, next);
      if (!(endDay > begin)) continue;
      acc += expertFactor(bounds[i].count) * (endDay - begin);
      if (bounds[i].count > 0) bonus = true;
    }
    return { factor: acc / 7, expertBonus: bonus };
  }

  function expertCountAtWeek(start, end, week, weight) {
    const weekStart = (Math.max(1, Math.floor(Number(week) || 1)) - 1) * 7;
    const pace = weight == null || weight === "" ? 1 : Number(weight);
    const bounds = expertBounds(start, end, pace);
    let active = bounds[0].count;
    for (let i = 0; i < bounds.length; i += 1) {
      if (bounds[i].day <= weekStart) active = bounds[i].count;
      else break;
    }
    return active;
  }

  function expertRamp(start, end) {
    const from = Math.max(0, Math.floor(Number(start) || 0));
    const to = Math.max(from, Math.floor(Number(end) || 0));
    const factorStart = expertFactor(from);
    const factorEnd = expertFactor(to);
    return {
      start: from,
      end: to,
      factorStart: factorStart,
      factorEnd: factorEnd,
      factor: factorStart,
    };
  }

  const MAX_TERM_WEEKS = 52;

  function parseWeeks(value) {
    if (value == null || String(value).trim() === "") return { weeks: 4, capped: false, requested: 4 };
    const n = Number(String(value).trim());
    if (!Number.isFinite(n)) return { error: "Weeks to run is a whole number from 1 to 52." };
    const whole = Math.floor(n);
    if (whole < 1) return { weeks: 1, capped: true, requested: n };
    if (whole > MAX_TERM_WEEKS) return { weeks: MAX_TERM_WEEKS, capped: true, requested: n };
    return { weeks: whole, capped: whole !== n, requested: n };
  }

  function workforceEfficiencyValue(capacity, required, lux1, lux2) {
    if (!(required > 0)) return 0;
    const satisfaction = required < capacity ? 1 : capacity / required;
    const base = 0.02 * (1 + 10 / 3) * (1 + 4) * (1 + 5 / 6);
    const lux1Factor = 1 + 1 / 11;
    const lux2Factor = 1 + 2 / 13;
    let efficiency = base;
    if (lux1 && lux2) efficiency *= lux1Factor * lux2Factor;
    else if (lux1) efficiency *= lux1Factor;
    else if (lux2) efficiency *= lux2Factor;
    return satisfaction * efficiency;
  }

  function workerSeats(building) {
    const seats = {};
    for (const [tier, field] of WORKER_FIELDS) seats[tier] = Number(building[field]) || 0;
    return seats;
  }

  function buildingWorkforceEfficiency(building, workforce) {
    const seats = workerSeats(building);
    let total = 0;
    for (const tier of Object.keys(seats)) total += seats[tier];
    if (!(total > 0)) return 1;
    let efficiency = 0;
    for (const tier of Object.keys(seats)) {
      if (!(seats[tier] > 0)) continue;
      const tierEfficiency = workforce && workforce[tier] ? workforce[tier].efficiency : 0;
      efficiency += (seats[tier] / total) * tierEfficiency;
    }
    return efficiency;
  }

  const INDUSTRY_COGC = {
    AGRICULTURE: "Agriculture",
    CHEMISTRY: "Chemistry",
    CONSTRUCTION: "Construction",
    ELECTRONICS: "Electronics",
    FOOD_INDUSTRIES: "Food Industries",
    FUEL_REFINING: "Fuel Refining",
    MANUFACTURING: "Manufacturing",
    METALLURGY: "Metallurgy",
    RESOURCE_EXTRACTION: "Resource Extraction",
  };

  const WORKFORCE_COGC_NAME = {
    PIONEERS: "Pioneers",
    SETTLERS: "Settlers",
    TECHNICIANS: "Technicians",
    ENGINEERS: "Engineers",
    SCIENTISTS: "Scientists",
  };

  function cogcName(cogc) {
    const program = cogcProgram(cogc);
    if (!program) return "";
    if (INDUSTRY_COGC[program]) return INDUSTRY_COGC[program];
    if (WORKFORCE_COGC_NAME[program]) return WORKFORCE_COGC_NAME[program];
    return program.replace(/_/g, " ");
  }

  function cogcProgram(value) {
    const raw = String(value || "").trim();
    if (!raw || raw === "---" || raw === "-" || raw.toUpperCase() === "NONE") return "";
    const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
    if (!upper || upper === "_" || upper === "NONE") return "";
    if (INDUSTRY_COGC[upper] || WORKFORCE_COGC[upper]) return upper;
    const workforce = Object.keys(WORKFORCE_COGC);
    for (let i = 0; i < workforce.length; i += 1) {
      const tier = WORKFORCE_COGC[workforce[i]].toUpperCase();
      if (upper === tier || upper === tier + "S") return workforce[i];
    }
    return upper;
  }

  function cogcMultiplier(building, cogc) {
    const program = String(cogc || "").toUpperCase();
    if (!program || program === "---") return 1;
    const expertise = String(building.Expertise || "").toUpperCase();
    if (expertise && program === expertise) return 1.25;
    const tier = WORKFORCE_COGC[program];
    if (tier && (workerSeats(building)[tier] || 0) > 0) return 1.1;
    return 1;
  }

  function fertilityMultiplier(building, planet) {
    const ticker = String(building.Ticker || "").toUpperCase();
    if (ticker !== "FRM" && ticker !== "ORC") return 1;
    if (!planet || planet.Fertility == null || planet.Fertility === "") return 0;
    const fertility = Number(planet.Fertility);
    if (!Number.isFinite(fertility) || fertility === -1) return 0;
    return 1 + fertility * (10 / 33);
  }

  function buildingBaseFactor(building, planet, cogc, workforce) {
    const fertility = fertilityMultiplier(building, planet);
    const cogcFactor = cogcMultiplier(building, cogc);
    const workers = buildingWorkforceEfficiency(building, workforce);
    return {
      factor: fertility * cogcFactor * workers,
      fertility: fertility,
      cogc: cogcFactor,
      workforce: workers,
    };
  }

  function cannotRunNote(ticker, parts) {
    let why = "it does not run";
    if (!(parts.workforce > 0) && !(parts.fertility > 0)) why = "workforce efficiency is 0 and fertility does not run";
    else if (!(parts.workforce > 0)) why = "workforce efficiency is 0";
    else if (!(parts.fertility > 0)) why = "fertility does not run";
    return ticker + " cannot run here because " + why + ", and the selected recipe is still counted.";
  }

  function cannotGrowWarning(ticker) {
    return ticker + ": the planet cannot grow it.";
  }

  function planetSpecials(planet, areaCost) {
    if (!planet) return [];
    const area = Number(areaCost) || 0;
    const out = [];
    if (planet.Surface) out.push({ ticker: "MCG", amount: area * 4 });
    else out.push({ ticker: "AEF", amount: Math.ceil(area / 3) });
    const gravity = Number(planet.Gravity);
    const pressure = Number(planet.Pressure);
    const temperature = Number(planet.Temperature);
    if (gravity < 0.25) out.push({ ticker: "MGC", amount: 1 });
    else if (gravity > 2.5) out.push({ ticker: "BL", amount: 1 });
    if (pressure < 0.25) out.push({ ticker: "SEA", amount: area });
    else if (pressure > 2) out.push({ ticker: "HSE", amount: 1 });
    if (temperature < -25) out.push({ ticker: "INS", amount: area * 10 });
    else if (temperature > 75) out.push({ ticker: "TSH", amount: 1 });
    return out.filter(function (row) { return row.amount > 0; });
  }

  function defaultLux() {
    return { lux1: true, lux2: true };
  }

  function luxFor(luxMap, tier) {
    const row = luxMap && luxMap[tier];
    if (!row) return defaultLux();
    return { lux1: !!row.lux1, lux2: !!row.lux2 };
  }

  function workforceRecord(groups, habitations, luxMap) {
    const rec = {};
    for (let i = 0; i < WORKER_FIELDS.length; i += 1) {
      const tier = WORKER_FIELDS[i][0];
      const lux = luxFor(luxMap, tier);
      rec[tier] = {
        required: 0,
        capacity: 0,
        lux1: lux.lux1,
        lux2: lux.lux2,
        efficiency: 0,
        consuming: 0,
      };
    }
    for (let g = 0; g < groups.length; g += 1) {
      const group = groups[g];
      for (let i = 0; i < WORKER_FIELDS.length; i += 1) {
        const tier = WORKER_FIELDS[i][0];
        rec[tier].required += (group.workersEach[tier] || 0) * group.count;
      }
      const hab = habitations && habitations[group.ticker];
      if (!hab) continue;
      rec.pioneer.capacity += (Number(hab.pioneers) || 0) * group.count;
      rec.settler.capacity += (Number(hab.settlers) || 0) * group.count;
      rec.technician.capacity += (Number(hab.technicians) || 0) * group.count;
      rec.engineer.capacity += (Number(hab.engineers) || 0) * group.count;
      rec.scientist.capacity += (Number(hab.scientists) || 0) * group.count;
    }
    for (let i = 0; i < WORKER_FIELDS.length; i += 1) {
      const row = rec[WORKER_FIELDS[i][0]];
      row.efficiency = workforceEfficiencyValue(row.capacity, row.required, row.lux1, row.lux2);
      row.consuming = row.required > row.capacity ? row.capacity : row.required;
    }
    return rec;
  }

  function industryExpertCount(building, input) {
    if (!input.expertsByType) return null;
    const key = EXPERTISE_TO_EXPERT[String(building.Expertise || "").toUpperCase()];
    if (!key) return 0;
    return Number(input.expertsByType[key]) || 0;
  }

  function expertCountForBuilding(building, input) {
    if (!(input.usePlanExpertTypes && input.expertsByType)) return null;
    return industryExpertCount(building, input);
  }

  function parseExpertCount(value, label) {
    if (value == null || String(value).trim() === "") return { count: 0 };
    const n = Number(String(value).trim());
    if (!Number.isFinite(n)) return { error: label + " is a whole number, 0 or higher." };
    if (n < 0) return { count: 0, capped: true, requested: n };
    const whole = Math.floor(n);
    return { count: whole, capped: whole !== n, requested: n };
  }

  function expertCategoryOrder() {
    return Object.keys(EXPERTISE_TO_EXPERT).map(function (key) { return EXPERTISE_TO_EXPERT[key]; });
  }

  function categoryLabel(key) {
    return String(key || "").replace(/_/g, " ");
  }

  function wholeExperts(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }

  function sumExpertMap(byType) {
    return Object.keys(byType || {}).reduce(function (sum, key) {
      return sum + (Number(byType[key]) || 0);
    }, 0);
  }

  function describeExperts(byType) {
    const order = expertCategoryOrder();
    const keys = Object.keys(byType || {}).filter(function (key) { return (Number(byType[key]) || 0) > 0; });
    keys.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    if (!keys.length) return "0 experts";
    return keys.map(function (key) { return byType[key] + " " + categoryLabel(key); }).join(" and ");
  }

  function maxEndExperts(categoryCount) {
    return categoryCount >= 2 ? MAX_EXPERTS_TOTAL : MAX_EXPERTS_PER_CATEGORY;
  }

  function runningExpertTypes(rows, catalog) {
    const seen = {};
    const found = [];
    (rows || []).forEach(function (row) {
      if (!(Number(row.count) > 0)) return;
      const building = getBuilding(catalog, row.ticker);
      if (!building) return;
      const key = EXPERTISE_TO_EXPERT[String(building.Expertise || "").toUpperCase()];
      if (!key || seen[key]) return;
      seen[key] = true;
      found.push(key);
    });
    const order = expertCategoryOrder();
    found.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    return found;
  }

  function adjustExpertTotal(weights, categories, target) {
    const amounts = {};
    categories.forEach(function (key) {
      amounts[key] = Math.min(MAX_EXPERTS_PER_CATEGORY, wholeExperts(weights && weights[key]));
    });
    let total = categories.reduce(function (sum, key) { return sum + amounts[key]; }, 0);
    let guard = 0;
    while (total > target && guard < 200) {
      let pick = null;
      categories.forEach(function (key) {
        if (!(amounts[key] > 0)) return;
        if (pick == null || amounts[key] > amounts[pick]) pick = key;
      });
      if (pick == null) break;
      amounts[pick] -= 1;
      total -= 1;
      guard += 1;
    }
    while (total < target && guard < 400) {
      let pick = null;
      categories.forEach(function (key) {
        if (amounts[key] >= MAX_EXPERTS_PER_CATEGORY) return;
        if (pick == null || amounts[key] < amounts[pick]) pick = key;
      });
      if (pick == null) break;
      amounts[pick] += 1;
      total += 1;
      guard += 1;
    }
    if (target >= MAX_EXPERTS_TOTAL && categories.length >= 2) {
      const positive = categories.filter(function (key) { return amounts[key] > 0; });
      if (positive.length < 2) {
        let donor = null;
        categories.forEach(function (key) {
          if (amounts[key] > 1 && (donor == null || amounts[key] > amounts[donor])) donor = key;
        });
        const receiver = categories.filter(function (key) { return amounts[key] === 0; })[0];
        if (donor && receiver) {
          amounts[donor] -= 1;
          amounts[receiver] += 1;
        }
      }
    }
    return amounts;
  }

  function resolveEndExperts(requested, categories, planByType) {
    const cats = (categories || []).slice();
    const requestedInt = wholeExperts(requested);
    const maxTotal = maxEndExperts(cats.length);
    const total = requestedInt > maxTotal ? maxTotal : requestedInt;
    const allocated = cats.length ? adjustExpertTotal(planByType, cats, total) : {};
    const count = cats.length ? sumExpertMap(allocated) : total;
    return {
      count: count,
      byType: allocated,
      notes: [],
      capped: requestedInt !== count,
      requested: requestedInt,
    };
  }

  function capLoadedExperts(planByType, categories) {
    const order = expertCategoryOrder();
    const cats = (categories || []).slice();
    if (!cats.length) {
      Object.keys(planByType || {}).forEach(function (key) {
        if (wholeExperts(planByType[key]) > 0) cats.push(key);
      });
      cats.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    }
    const raw = {};
    cats.forEach(function (key) { raw[key] = wholeExperts(planByType && planByType[key]); });
    const rawTotal = sumExpertMap(raw);
    const resolved = resolveEndExperts(rawTotal, cats, raw);
    const usedDiffers = cats.some(function (key) {
      return (raw[key] || 0) !== (resolved.byType[key] || 0);
    });
    return {
      count: resolved.count,
      byType: resolved.byType,
      note: "",
      capped: rawTotal !== resolved.count || usedDiffers,
      rawCount: rawTotal,
    };
  }

  function categoryAmount(building, byType) {
    const key = EXPERTISE_TO_EXPERT[String(building && building.Expertise || "").toUpperCase()];
    if (!key) return 0;
    return Number(byType && byType[key]) || 0;
  }

  function planExpertCount(planData) {
    const experts = planData && Array.isArray(planData.experts) ? planData.experts : [];
    const parts = [];
    const byType = {};
    let count = 0;
    for (let i = 0; i < experts.length; i += 1) {
      const amount = Number(experts[i].amount);
      if (!(amount > 0)) continue;
      const raw = String(experts[i].type || "");
      const type = raw.replace(/_/g, " ");
      parts.push({ type: type, amount: amount, key: raw });
      byType[raw] = (byType[raw] || 0) + amount;
      count += amount;
    }
    return { count: count, parts: parts, byType: byType };
  }

  function planWorkforceLux(planData) {
    const lux = {};
    const rows = planData && Array.isArray(planData.workforce) ? planData.workforce : [];
    for (let i = 0; i < rows.length; i += 1) {
      const tier = String(rows[i].type || "").toLowerCase();
      if (!tier) continue;
      lux[tier] = { lux1: !!rows[i].lux1, lux2: !!rows[i].lux2 };
    }
    return lux;
  }

  function parseMultiplier(value) {
    if (value == null || String(value).trim() === "") {
      return { error: "Enter a profit multiplier from 0 to 2." };
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return { error: "The profit multiplier is a number from 0 to 2." };
    if (n < 0) return { multiplier: 0, capped: true, requested: n };
    if (n > 2) return { multiplier: 2, capped: true, requested: n };
    return { multiplier: n, capped: false, requested: n };
  }

  function multiplierCapNote(requested) {
    if (requested > 2) return "The profit multiplier is at most 2. " + formatQty(requested) + " is above that, so this uses 2.";
    if (requested < 0) return "The profit multiplier is at least 0. " + formatQty(requested) + " is below that, so this uses 0.";
    return "";
  }

  function parseOtherCis(value) {
    if (value == null || String(value).trim() === "") return { otherCis: 0 };
    const n = Number(value);
    if (!Number.isFinite(n)) return { error: "Other CIS is blank or a positive amount." };
    if (n < 0) return { otherCis: 0, capped: true, requested: n };
    return { otherCis: n };
  }

  function parseTickerAmount(text, emptyLabel) {
    const extras = {};
    if (!text || !String(text).trim()) return { extras: extras };
    for (const line of String(text).split(/[\n,;]+/)) {
      const s = line.trim();
      if (!s) continue;
      const compact = s.match(/^(\d+(?:\.\d+)?)x([A-Za-z][A-Za-z0-9]{0,2})$/i)
        || s.match(/^([A-Za-z][A-Za-z0-9]{0,2})x(\d+(?:\.\d+)?)$/i);
      let ticker;
      let amount;
      if (compact) {
        if (/^[A-Za-z]/.test(compact[1])) {
          ticker = compact[1].toUpperCase();
          amount = Number(compact[2]);
        } else {
          ticker = compact[2].toUpperCase();
          amount = Number(compact[1]);
        }
      } else {
        const parts = s.split(/\s+/);
        if (parts.length !== 2) {
          return { error: 'Could not read "' + s + '". Use a ticker and an amount, such as ' + emptyLabel + "." };
        }
        if (/^[A-Za-z][A-Za-z0-9]{0,2}$/.test(parts[0]) && /^\d+(?:\.\d+)?$/.test(parts[1])) {
          ticker = parts[0].toUpperCase();
          amount = Number(parts[1]);
        } else if (/^[A-Za-z][A-Za-z0-9]{0,2}$/.test(parts[1]) && /^\d+(?:\.\d+)?$/.test(parts[0])) {
          ticker = parts[1].toUpperCase();
          amount = Number(parts[0]);
        } else {
          return { error: 'Could not read "' + s + '". Use a ticker and an amount, such as ' + emptyLabel + "." };
        }
      }
      if (!(amount > 0)) return { error: "The amount for " + ticker + " needs to be above zero." };
      extras[ticker] = (extras[ticker] || 0) + amount;
    }
    return { extras: extras };
  }

  function parseExtras(text) {
    return parseTickerAmount(text, "MCG 100");
  }

  function parseBuyAnyway(text) {
    const list = [];
    if (!text || !String(text).trim()) return { buyAnyway: list };
    for (const part of String(text).split(/[\s,;]+/)) {
      if (!part) continue;
      if (!/^[A-Za-z][A-Za-z0-9]{0,2}$/.test(part)) {
        return { error: 'Could not read ticker "' + part + '".' };
      }
      const ticker = part.toUpperCase();
      if (list.indexOf(ticker) < 0) list.push(ticker);
    }
    return { buyAnyway: list };
  }

  function parseOwed(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return { error: "Enter each material and the percent of that output owed each week, such as HER 50 or HER 100." };
    }
    const items = [];
    for (const part of raw.split(/[,;\n]+/)) {
      const s = part.trim();
      if (!s) continue;
      const m = s.match(/^([A-Za-z][A-Za-z0-9]{0,2})(?:\s+(\d+(?:\.\d+)?))?\s*%?$/);
      if (!m) {
        return { error: 'Could not read "' + s + '". Use a ticker and a percent of that output, such as HER 50 or RAT 50, DW 100.' };
      }
      if (m[2] == null) {
        return { error: "Add the percent of " + m[1].toUpperCase() + " owed each week. 50 and 100 are both valid." };
      }
      const percent = Number(m[2]);
      if (!(percent > 0) || percent > 100) {
        return { error: m[1].toUpperCase() + " needs a percent above 0 and up to 100. 100 is all of that output." };
      }
      items.push({ ticker: m[1].toUpperCase(), percent: percent });
    }
    if (!items.length) {
      return { error: "Enter each material and the percent of that output owed each week." };
    }
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.ticker)) return { error: item.ticker + " is listed twice." };
      seen.add(item.ticker);
    }
    return { owed: items };
  }

  function owedEntryTicker(chunk) {
    const match = String(chunk || "").trim().match(/^([A-Za-z][A-Za-z0-9]{0,2})(?:\s+(?:\d+(?:\.\d+)?))?\s*%?$/);
    return match ? match[1].toUpperCase() : "";
  }

  function appendOwedText(text, tickers) {
    let next = String(text == null ? "" : text);
    const present = {};
    next.split(/[,;\n]+/).forEach(function (part) {
      const ticker = owedEntryTicker(part);
      if (ticker) present[ticker] = true;
    });
    const adding = [];
    (tickers || []).forEach(function (ticker) {
      const name = String(ticker || "").toUpperCase();
      if (!/^[A-Z][A-Z0-9]{0,2}$/.test(name) || present[name]) return;
      present[name] = true;
      adding.push(name);
    });
    if (!adding.length) return next;
    const block = adding.map(function (name) { return name + " 100"; }).join("\n");
    if (!next.trim()) return block;
    return next.replace(/\s+$/, "") + "\n" + block;
  }

  function stripOwedText(text, drop) {
    const dropSet = {};
    (drop || []).forEach(function (ticker) {
      const name = String(ticker || "").toUpperCase();
      if (name) dropSet[name] = true;
    });
    if (!Object.keys(dropSet).length) return String(text == null ? "" : text);
    const parts = String(text == null ? "" : text).split(/([,;\n])/);
    const kept = [];
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part === "," || part === ";" || part === "\n") {
        kept.push(part);
        continue;
      }
      const ticker = owedEntryTicker(part);
      if (ticker && dropSet[ticker]) continue;
      kept.push(part);
    }
    let out = kept.join("");
    out = out.replace(/^[,\s;]+/, "").replace(/[,\s;]+$/, "");
    out = out.replace(/([,;])(?:\s*[,;])+/g, "$1");
    out = out.replace(/\n(?:[ \t]*\n)+/g, "\n");
    out = out.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
    return out.trim();
  }

  function parsePlanId(text) {
    const s = String(text || "").trim();
    if (!s) return { error: "Paste a PRUNplanner share link or a plan id." };
    const m = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (!m) {
      return { error: "That text has no plan id. A share link looks like https://prunplanner.org/shared/ and a long id." };
    }
    return { id: m[0].toLowerCase() };
  }

  function normalizePlanetId(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const m = s.match(/^([A-Za-z0-9]{2,3})-([0-9]{3})([A-Za-z])$/);
    if (!m) return s;
    return m[1].toUpperCase() + "-" + m[2] + m[3].toLowerCase();
  }

  function planetIdOrError(raw) {
    const s = String(raw || "").trim();
    if (!s) return { id: "" };
    if (!/^([A-Za-z0-9]{2,3})-([0-9]{3})([A-Za-z])$/.test(s)) {
      return { error: "Planet id looks like JS-299a." };
    }
    return { id: normalizePlanetId(s) };
  }

  function sideTokens(side) {
    const out = [];
    const re = /(\d+(?:\.\d+)?)x([A-Za-z][A-Za-z0-9]{0,2})/g;
    let m;
    while ((m = re.exec(String(side || "")))) out.push(m[2].toUpperCase() + ":" + String(Number(m[1])));
    out.sort();
    return out.join(",");
  }

  function recipeSignature(name) {
    const parts = String(name).split("=>");
    return sideTokens(parts[0] || "") + "=>" + sideTokens(parts.slice(1).join("=>") || "");
  }

  function orderLabel(recipeName, resource) {
    const name = String(recipeName || "").trim();
    if (/[A-Za-z]/.test(name)) return name;
    const ticker = String(resource || "").trim().toUpperCase();
    if (/^[A-Z][A-Z0-9]{0,2}$/.test(ticker)) return ticker;
    return "";
  }

  function getBuilding(catalog, ticker) {
    if (!catalog) return null;
    if (typeof catalog.get === "function") return catalog.get(ticker) || null;
    return catalog[ticker] || null;
  }

  // PRUNplanner base plot limit: 250 plus 250 for each permit. A missing count is one permit, 500.
  function baseAreaLimit(permits) {
    if (permits == null || String(permits).trim() === "") return 250 + 250;
    const count = Number(permits);
    if (!Number.isFinite(count) || count < 0) return 250 + 250;
    return 250 + count * 250;
  }

  function areaFigure(value) {
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 10000) / 10000;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
    return formatQty(rounded);
  }

  function usedBuildingArea(rows, catalog) {
    let total = 0;
    (rows || []).forEach(function (row) {
      const building = getBuilding(catalog, String(row.ticker || "").trim().toUpperCase());
      const count = Number(row.count);
      const area = building ? Number(building.AreaCost) : NaN;
      if (!(count > 0) || !(area > 0)) return;
      total += area * count;
    });
    return total;
  }

  function resolveRecipe(building, recipeId) {
    const recipes = building.Recipes || [];
    const raw = String(recipeId || "").trim();
    if (!raw) return { recipe: null, resourceTicker: null };
    const name = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1).trim() : raw;
    let recipe = recipes.find(function (item) { return item.RecipeName === name; });
    if (!recipe) {
      const sig = recipeSignature(name);
      const hits = recipes.filter(function (item) { return recipeSignature(item.RecipeName) === sig; });
      if (hits.length === 1) recipe = hits[0];
    }
    if (!recipe && /^[A-Z][A-Z0-9]{0,2}$/.test(name)) {
      const empty = recipes.filter(function (item) {
        return !(item.Outputs || []).length && !(item.Inputs || []).length;
      });
      if (empty.length === 1) return { recipe: empty[0], resourceTicker: name };
    }
    if (!recipe) return { error: 'FIO has no recipe "' + raw + '" on ' + building.Ticker + "." };
    if (!(recipe.Outputs || []).length && /^[A-Z][A-Z0-9]{0,2}$/.test(name)) {
      return { recipe: recipe, resourceTicker: name };
    }
    return { recipe: recipe, resourceTicker: null };
  }

  function linesFromPlan(planData) {
    const rows = [];
    const hints = [];
    const skipped = [];
    const data = planData || {};
    const buildings = Array.isArray(data.buildings) ? data.buildings : [];
    function skipHq(ticker) {
      if (ticker !== "COR") return false;
      skipped.push("COR is a corporation headquarters. A subsidy does not buy an HQ, so that building is left out.");
      return true;
    }
    for (const building of buildings) {
      const ticker = String(building.name || building.building || "").toUpperCase();
      const amount = Number(building.amount);
      if (!ticker || !(amount > 0)) continue;
      if (skipHq(ticker)) continue;
      const recipes = (Array.isArray(building.active_recipes) ? building.active_recipes : []).filter(function (recipe) {
        return Number(recipe.amount) > 0 && recipe.recipeid;
      });
      const orders = recipes.map(function (recipe) {
        const id = String(recipe.recipeid);
        const name = id.includes("#") ? id.slice(id.indexOf("#") + 1).trim() : id;
        return { recipeId: id, orders: Number(recipe.amount), label: name };
      });
      if (orders.length > 1) {
        const list = orders.map(function (recipe) { return recipe.orders + " " + recipe.label; }).join(", ");
        hints.push(ticker + ": " + amount + " buildings share one queue. Order counts from the plan are " + list + ". Those counts are not a split of the buildings. Edit an order count to change how the queue shares the week.");
      }
      rows.push({ ticker: ticker, count: amount, recipes: orders });
    }
    const infra = Array.isArray(data.infrastructure) ? data.infrastructure : [];
    for (const building of infra) {
      const ticker = String(building.building || building.name || "").toUpperCase();
      const amount = Number(building.amount);
      if (!ticker || !(amount > 0)) continue;
      if (skipHq(ticker)) continue;
      rows.push({ ticker: ticker, count: amount, recipes: [] });
    }
    return { rows: rows, hints: hints, skipped: skipped };
  }

  function rowsFromPlan(planData, catalog) {
    const parsed = linesFromPlan(planData);
    const rows = [];
    const errors = [];
    for (const line of parsed.rows) {
      const building = getBuilding(catalog, line.ticker);
      const recipes = [];
      const source = Array.isArray(line.recipes) ? line.recipes : [];
      if (!building) errors.push("FIO has no building " + line.ticker + ".");
      for (let i = 0; i < source.length; i += 1) {
        const recipeLine = source[i];
        if (!building) {
          recipes.push({
            recipeName: recipeLine.recipeId || "",
            orders: recipeLine.orders,
            resource: "",
          });
          continue;
        }
        const resolved = resolveRecipe(building, recipeLine.recipeId);
        if (resolved.error) {
          errors.push(resolved.error);
          recipes.push({
            recipeName: recipeLine.recipeId || "",
            orders: recipeLine.orders,
            resource: "",
          });
          continue;
        }
        recipes.push({
          recipeName: resolved.recipe.RecipeName,
          orders: recipeLine.orders,
          resource: resolved.resourceTicker || "",
        });
      }
      rows.push({ ticker: line.ticker, count: line.count, recipes: recipes });
    }
    return { rows: rows, hints: parsed.hints, skipped: parsed.skipped, errors: errors };
  }

  function ioList(rows) {
    return (rows || []).map(function (row) {
      return {
        ticker: String(row.CommodityTicker || row.MaterialTicker || row.ticker || "").toUpperCase(),
        amount: Number(row.Amount != null ? row.Amount : row.amount),
      };
    }).filter(function (row) { return row.ticker && row.amount > 0; });
  }

  function cleanQty(value) {
    return Math.round(value * 1e8) / 1e8;
  }

  function perWeek(amountPerCycle, durationMs, count) {
    return cleanQty(count * amountPerCycle * (MS_WEEK / durationMs));
  }

  function batchTimeMs(recipes) {
    let total = 0;
    for (let i = 0; i < recipes.length; i += 1) {
      const recipe = recipes[i];
      if (!(recipe.orders > 0) || !(recipe.durationMs > 0)) continue;
      total += recipe.durationMs * recipe.orders;
    }
    return total;
  }

  function weeklyAmount(buildingCount, recipes, recipe, amountPerCycle) {
    const total = batchTimeMs(recipes);
    if (!(total > 0) || !(recipe.orders > 0) || !(recipe.durationMs > 0) || !(amountPerCycle > 0)) return 0;
    const batchRuns = (MS_WEEK * buildingCount) / total;
    return cleanQty(amountPerCycle * recipe.orders * batchRuns);
  }

  function addAmount(map, ticker, amount) {
    if (!(amount > 0)) return;
    map[ticker] = (map[ticker] || 0) + amount;
  }

  const DAY_MS = 86400000;
  const EXTRACTION = {
    RIG: { type: "LIQUID", rate: 0.7, baseMs: 4 * 60 * 60 * 1000 + 48 * 60 * 1000 },
    EXT: { type: "MINERAL", rate: 0.7, baseMs: 12 * 60 * 60 * 1000 },
    COL: { type: "GASEOUS", rate: 0.6, baseMs: 6 * 60 * 60 * 1000 },
  };

  function extractionCycle(kind, daily) {
    const dailyShare = kind.baseMs / DAY_MS;
    const amount = Math.trunc(Math.ceil(daily * dailyShare));
    return { amount: amount, timeMs: amount * (DAY_MS / daily) };
  }

  function extractionFromPlanet(buildingTicker, material, resources) {
    const kind = EXTRACTION[buildingTicker];
    if (!kind) return { cycle: null };
    if (!resources || typeof resources.get !== "function") {
      return { error: buildingTicker + " makes " + material + " from the planet. Enter the planet id. The units come from that planet's " + material + ", the buildings, and the order counts on the plan." };
    }
    const resource = resources.get(material);
    if (!resource || resource.type !== kind.type || !(resource.daily > 0)) {
      return { error: "This planet has no " + material + " for " + buildingTicker + " to extract. The units come from the planet on the plan." };
    }
    const cycle = extractionCycle(kind, resource.daily);
    if (!(cycle.amount > 0) || !(cycle.timeMs > 0) || !Number.isFinite(cycle.timeMs)) {
      return { error: "This planet's " + material + " does not yield a " + buildingTicker + " cycle." };
    }
    return { cycle: cycle };
  }

  const materialTickerCache = new Map();

  async function materialTicker(materialId) {
    const id = String(materialId || "");
    if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) return "";
    if (materialTickerCache.has(id)) return materialTickerCache.get(id);
    const mat = await fetchJson(FIO + "/material/" + encodeURIComponent(id));
    const ticker = String(mat && mat.Ticker || "").toUpperCase();
    materialTickerCache.set(id, ticker);
    return ticker;
  }

  async function planetResourceMap(planet) {
    const map = new Map();
    if (!planet) return map;
    const rows = planet.Resources || [];
    const resolved = await Promise.all(rows.map(async function (row) {
      let ticker = String(row.MaterialTicker || row.Ticker || "").toUpperCase();
      if (!ticker) ticker = await materialTicker(row.MaterialId);
      const type = String(row.ResourceType || row.resource_type || "").toUpperCase();
      const factor = Number(row.Factor != null ? row.Factor : row.factor);
      const rate = type === "GASEOUS" ? 0.6 : 0.7;
      const daily = Number.isFinite(factor) ? factor * 100 * rate : NaN;
      return { ticker: ticker, type: type, daily: daily };
    }));
    for (let i = 0; i < resolved.length; i += 1) {
      const row = resolved[i];
      if (!row.ticker || !(row.daily > 0)) continue;
      map.set(row.ticker, { type: row.type, daily: row.daily });
    }
    return map;
  }

  function outputTickersFromRows(rows, catalog) {
    const seen = [];
    function add(ticker) {
      const name = String(ticker || "").toUpperCase();
      if (!name || seen.indexOf(name) >= 0) return;
      seen.push(name);
    }
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const building = getBuilding(catalog, row.ticker);
      const recipes = row.recipes || [];
      for (let r = 0; r < recipes.length; r += 1) {
        const recipe = recipes[r];
        if (recipe.resource) {
          add(recipe.resource);
          continue;
        }
        if (!building || !recipe.recipeName) continue;
        const resolved = resolveRecipe(building, recipe.recipeName);
        if (resolved.resourceTicker) add(resolved.resourceTicker);
        else if (resolved.recipe) {
          const outputs = ioList(resolved.recipe.Outputs);
          for (let o = 0; o < outputs.length; o += 1) add(outputs[o].ticker);
        }
      }
    }
    return seen;
  }

  function recipeOutputTickers(recipe) {
    return ioList(recipe.Outputs).map(function (row) { return row.ticker; });
  }

  function selectionOutputTickers(building, recipeName, resource) {
    const name = String(recipeName || "").trim();
    const resourceTicker = String(resource || "").trim().toUpperCase();
    function one(ticker) {
      const value = String(ticker || "").toUpperCase();
      return /^[A-Z][A-Z0-9]{0,2}$/.test(value) ? [value] : [];
    }
    if (!name) return one(resourceTicker);
    if (!building) return one(name);
    const resolved = resolveRecipe(building, name);
    if (resolved && !resolved.error) {
      if (resolved.resourceTicker) return one(resolved.resourceTicker);
      if (resolved.recipe) {
        const outputs = [];
        recipeOutputTickers(resolved.recipe).forEach(function (ticker) {
          const value = String(ticker || "").toUpperCase();
          if (/^[A-Z][A-Z0-9]{0,2}$/.test(value) && outputs.indexOf(value) < 0) outputs.push(value);
        });
        if (outputs.length) return outputs;
      }
    }
    const buildingTicker = String(building.Ticker || "").toUpperCase();
    if (EXTRACTION[buildingTicker]) return one(name);
    return [];
  }

  function pickRecipe(building, owedTickers) {
    const recipes = building.Recipes || [];
    if (!recipes.length) return { recipe: null, resourceTicker: null };
    const matches = recipes.filter(function (recipe) {
      return recipeOutputTickers(recipe).some(function (ticker) { return owedTickers.has(ticker); });
    });
    if (matches.length === 1) return { recipe: matches[0], resourceTicker: null };
    if (matches.length > 1) {
      const names = matches.map(function (recipe) { return recipe.RecipeName; });
      return { error: building.Ticker + " can run more than one recipe that makes an owed material (" + names.join("; ") + "). Load the shared plan so each recipe has its own count." };
    }
    if (recipes.length === 1) {
      const recipe = recipes[0];
      if (!(recipe.Outputs || []).length) {
        return { error: building.Ticker + " has a recipe with no output amount. Load the shared plan so the resource it makes comes with the building." };
      }
      return { recipe: recipe, resourceTicker: null };
    }
    return { error: building.Ticker + " has more than one recipe, and this row does not say which one. Load the shared plan." };
  }

  function planBill(input) {
    const rows = input.rows || [];
    const catalog = input.catalog;
    const groups = [];
    const order = [];
    const byTicker = new Map();
    if (!rows.length) return { error: "Add a building, or load a plan." };

    for (const row of rows) {
      const ticker = String(row.ticker || "").toUpperCase();
      if (!ticker) continue;
      if (!/^[A-Z][A-Z0-9]{0,2}$/.test(ticker)) {
        return { error: "Building ticker " + ticker + " is not a FIO ticker." };
      }
      if (row.count == null || String(row.count).trim() === "") {
        return { error: "Enter how many " + ticker + " this base has." };
      }
      const count = Number(row.count);
      if (!Number.isInteger(count) || count < 0) {
        return { error: "The building count for " + ticker + " is a whole number." };
      }
      if (count === 0) continue;
      const building = getBuilding(catalog, ticker);
      if (!building) return { error: "FIO has no building " + ticker + "." };
      const hasRecipes = (building.Recipes || []).length > 0;
      let recipeSpecs = Array.isArray(row.recipes) ? row.recipes.slice() : [];
      if (!recipeSpecs.length && (row.recipeName || row.resource)) {
        recipeSpecs = [{ recipeName: row.recipeName || "", orders: row.orders == null ? 1 : row.orders, resource: row.resource || "" }];
      }
      if (hasRecipes && !recipeSpecs.length) {
        const owedTickers = new Set((input.owed || []).map(function (item) { return item.ticker; }));
        const picked = pickRecipe(building, owedTickers);
        if (picked.error) return picked;
        recipeSpecs = [{ recipeName: picked.recipe ? picked.recipe.RecipeName : "", orders: 1, resource: picked.resourceTicker || "" }];
      }
      const resolvedRecipes = [];
      for (let i = 0; i < recipeSpecs.length; i += 1) {
        const spec = recipeSpecs[i];
        const label = spec.recipeName || spec.resource || ticker;
        if (spec.orders == null || String(spec.orders).trim() === "") {
          return { error: "Enter the order count for " + label + " on " + ticker + "." };
        }
        const orders = Number(spec.orders);
        if (!Number.isInteger(orders) || orders < 0) {
          return { error: "The order count for " + label + " on " + ticker + " is a whole number, 0 or higher." };
        }
        if (!hasRecipes) continue;
        let recipe = null;
        let resourceTicker = null;
        if (!spec.recipeName) {
          const owedTickers = new Set((input.owed || []).map(function (item) { return item.ticker; }));
          const picked = pickRecipe(building, owedTickers);
          if (picked.error) return picked;
          recipe = picked.recipe;
          resourceTicker = picked.resourceTicker || null;
        } else {
          const resolved = resolveRecipe(building, spec.recipeName);
          if (resolved.error) return resolved;
          recipe = resolved.recipe;
          resourceTicker = resolved.resourceTicker || spec.resource || null;
        }
        let outputs = recipe ? ioList(recipe.Outputs) : [];
        let durationMs = recipe ? Number(recipe.DurationMs) : 0;
        let recipeName = recipe ? recipe.RecipeName : label;
        if (recipe && !outputs.length) {
          const typed = String(spec.resource || resourceTicker || "").trim().toUpperCase();
          if (!/^[A-Z][A-Z0-9]{0,2}$/.test(typed)) {
            return { error: ticker + " lists a recipe with no inputs or outputs. The plan needs to name the material that recipe makes." };
          }
          const extracted = extractionFromPlanet(ticker, typed, input.planetResources);
          if (extracted.error) return extracted;
          if (extracted.cycle) {
            outputs = [{ ticker: typed, amount: extracted.cycle.amount }];
            durationMs = extracted.cycle.timeMs;
            resourceTicker = null;
            if (!/[A-Za-z]/.test(recipeName)) recipeName = typed;
          } else {
            resourceTicker = typed;
          }
        }
        if (outputs.length && !(durationMs > 0)) {
          return { error: "FIO lists no duration for " + ticker + " recipe " + (recipe && recipe.RecipeName ? recipe.RecipeName : recipeName) + "." };
        }
        resolvedRecipes.push({
          name: recipeName,
          orders: orders,
          durationMs: durationMs,
          inputs: recipe ? ioList(recipe.Inputs) : [],
          outputs: outputs,
          resourceTicker: resourceTicker,
        });
      }
      if (!byTicker.has(ticker)) {
        byTicker.set(ticker, {
          ticker: ticker,
          name: building.Name || ticker,
          count: 0,
          perBuilding: ioList(building.BuildingCosts),
          workersEach: {
            pioneer: Number(building.Pioneers) || 0,
            settler: Number(building.Settlers) || 0,
            technician: Number(building.Technicians) || 0,
            engineer: Number(building.Engineers) || 0,
            scientist: Number(building.Scientists) || 0,
          },
          recipes: [],
        });
        order.push(ticker);
      }
      const group = byTicker.get(ticker);
      group.count += count;
      for (let i = 0; i < resolvedRecipes.length; i += 1) {
        const recipe = resolvedRecipes[i];
        const existing = group.recipes.find(function (item) {
          return item.name === recipe.name && (item.resourceTicker || "") === (recipe.resourceTicker || "");
        });
        if (existing) existing.orders += recipe.orders;
        else group.recipes.push(recipe);
      }
    }

    for (const ticker of order) groups.push(byTicker.get(ticker));
    if (!groups.length) return { error: "Add a building, or load a plan." };

    const coreMap = Object.assign({}, input.coreMaterials || {});
    const notes = [];
    let pricedGroups = groups;
    if (Object.keys(coreMap).length && groups.some(function (group) { return group.ticker === "CM"; })) {
      pricedGroups = groups.filter(function (group) { return group.ticker !== "CM"; });
      notes.push("The core module on the building list is left out because the planet build requirements are the core for this planet.");
    }

    const workforce = workforceRecord(pricedGroups, input.habitations || {}, input.workforceLux || null);
    const cannotGrow = [];
    for (const group of pricedGroups) {
      const building = getBuilding(input.catalog, group.ticker);
      const parts = buildingBaseFactor(building, input.planet || null, input.cogc, workforce);
      const industry = industryExpertCount(building, input);
      let expertCount = null;
      let expertStart = null;
      let expertEnd = null;
      if (input.expertEndByType) {
        expertEnd = categoryAmount(building, input.expertEndByType);
        expertStart = input.expertStartByType
          ? categoryAmount(building, input.expertStartByType)
          : expertEnd;
        if (expertStart === expertEnd) expertCount = expertEnd;
      } else if (industry != null && input.usePlanExpertTypes) {
        expertCount = industry;
        expertStart = industry;
        expertEnd = industry;
      } else if (industry != null && input.rampPlanExperts) {
        expertStart = 0;
        expertEnd = industry;
      } else {
        expertCount = expertCountForBuilding(building, input);
        if (expertCount != null) {
          expertStart = expertCount;
          expertEnd = expertCount;
        }
      }
      group.efficiency = {
        expertise: String(building.Expertise || ""),
        baseFactor: parts.factor,
        expertCount: expertCount,
        expertStart: expertStart,
        expertEnd: expertEnd,
        cogc: parts.cogc,
        workforce: parts.workforce,
        fertility: parts.fertility,
      };
      for (let i = 0; i < group.recipes.length; i += 1) {
        group.recipes[i].baseFactor = parts.factor;
        group.recipes[i].expertCount = expertCount;
        group.recipes[i].expertStart = expertStart;
        group.recipes[i].expertEnd = expertEnd;
      }
      const selectedOutput = group.recipes.some(function (recipe) {
        return recipe.orders > 0 && recipe.outputs && recipe.outputs.length;
      });
      if (!(parts.factor > 0) && selectedOutput && !(parts.fertility > 0)) {
        group.cannotGrow = {};
        for (let i = 0; i < group.recipes.length; i += 1) {
          const recipe = group.recipes[i];
          if (!(recipe.orders > 0) || !recipe.outputs) continue;
          for (let o = 0; o < recipe.outputs.length; o += 1) {
            const outputTicker = recipe.outputs[o].ticker;
            if (!outputTicker || group.cannotGrow[outputTicker]) continue;
            group.cannotGrow[outputTicker] = true;
            cannotGrow.push(outputTicker);
          }
        }
      } else if (!(parts.factor > 0) && selectedOutput) {
        group.cannotRun = cannotRunNote(group.ticker, parts);
        for (let i = 0; i < group.recipes.length; i += 1) {
          if (group.recipes[i].orders > 0) group.recipes[i].baseFactor = 1;
        }
      }
      if (input.planet) {
        const specials = planetSpecials(input.planet, building.AreaCost);
        for (let i = 0; i < specials.length; i += 1) {
          group.perBuilding.push({ ticker: specials[i].ticker, amount: specials[i].amount });
        }
      }
    }

    const expertWeight = {};
    for (let g = 0; g < pricedGroups.length; g += 1) {
      const group = pricedGroups[g];
      const building = getBuilding(input.catalog, group.ticker);
      const key = EXPERTISE_TO_EXPERT[String(building && building.Expertise || "").toUpperCase()];
      if (!key) continue;
      let factor = 0;
      for (let i = 0; i < group.recipes.length; i += 1) {
        const recipe = group.recipes[i];
        if (!(recipe.orders > 0) || !(recipe.durationMs > 0)) continue;
        if (recipe.baseFactor > factor) factor = recipe.baseFactor;
      }
      if (!(factor > 0) || !(group.count > 0)) continue;
      expertWeight[key] = (expertWeight[key] || 0) + group.count * factor;
    }
    for (let g = 0; g < pricedGroups.length; g += 1) {
      const group = pricedGroups[g];
      const building = getBuilding(input.catalog, group.ticker);
      const key = EXPERTISE_TO_EXPERT[String(building && building.Expertise || "").toUpperCase()];
      const weight = key && expertWeight[key] > 0 ? expertWeight[key] : 0;
      if (group.efficiency) group.efficiency.expertWeight = weight;
      for (let i = 0; i < group.recipes.length; i += 1) group.recipes[i].expertWeight = weight;
    }

    const produced = {};
    const unknown = {};
    const consumed = {};
    const ratedProduced = {};
    const ratedConsumed = {};
    let flowBasis = "recipe";
    for (const group of pricedGroups) {
      for (const recipe of group.recipes) {
        if (recipe.resourceTicker && recipe.orders > 0) addAmount(unknown, recipe.resourceTicker, 1);
        recipe.weeklyInputs = recipe.inputs.map(function (row) {
          return { ticker: row.ticker, amount: weeklyAmount(group.count, group.recipes, recipe, row.amount) };
        });
        recipe.weeklyOutputs = recipe.outputs.map(function (output) {
          const recipeAmount = weeklyAmount(group.count, group.recipes, recipe, output.amount);
          const amount = group.cannotGrow && group.cannotGrow[output.ticker] ? 0 : recipeAmount;
          return { ticker: output.ticker, amount: amount };
        });
        const planScale = recipe.expertEnd == null
          ? 1
          : (recipe.baseFactor > 0 ? recipe.baseFactor : 0);
        if (recipe.expertEnd != null) flowBasis = "plan";
        for (const output of recipe.weeklyOutputs) {
          addAmount(produced, output.ticker, output.amount);
          addAmount(ratedProduced, output.ticker, output.amount * planScale);
        }
        for (const row of recipe.weeklyInputs) {
          addAmount(consumed, row.ticker, row.amount);
          addAmount(ratedConsumed, row.ticker, row.amount * planScale);
        }
      }
    }

    const buyAnyway = new Set(input.buyAnyway || []);
    const coverage = [];
    const weekly = [];
    const supplyTickers = Object.keys(flowBasis === "plan" ? ratedConsumed : consumed).sort();
    const supplyProduced = flowBasis === "plan" ? ratedProduced : produced;
    const supplyConsumed = flowBasis === "plan" ? ratedConsumed : consumed;
    for (const ticker of supplyTickers) {
      const use = supplyConsumed[ticker];
      const made = supplyProduced[ticker] || 0;
      const unknownRate = Object.prototype.hasOwnProperty.call(unknown, ticker);
      let bought = use;
      let note;
      const useText = formatQty(use);
      const madeText = formatQty(made);
      const day = function (amount) { return formatQty(amount / 7); };
      if (buyAnyway.has(ticker)) {
        bought = use;
        note = flowBasis === "plan"
          ? ticker + " is priced in full because it is listed as an input to buy anyway. The recipes use " + day(use) + " a day (" + useText + " a week)."
          : ticker + " is priced in full because it is listed as an input to buy anyway. The recipes use " + useText + " a week.";
      } else if (unknownRate) {
        bought = 0;
        note = "The plan names " + ticker + " but this count has no cycle amount for it, so " + ticker + " is left out of the supplies. The recipes use " + useText + " a week.";
      } else if (made >= use) {
        bought = 0;
        note = flowBasis === "plan"
          ? "The plan makes " + day(made) + " " + ticker + " a day (" + madeText + " a week) and the recipes use " + day(use) + " a day (" + useText + " a week), so " + ticker + " is not a supply."
          : "The plan makes " + madeText + " " + ticker + " a week and the recipes use " + useText + ", so " + ticker + " is not a supply.";
      } else if (made > 0) {
        bought = use - made;
        note = flowBasis === "plan"
          ? "The plan makes " + day(made) + " " + ticker + " a day (" + madeText + " a week) and the recipes use " + day(use) + " a day (" + useText + " a week). The supply is the shortfall, " + day(bought) + " a day (" + formatQty(bought) + " a week)."
          : "The plan makes " + madeText + " " + ticker + " a week and the recipes use " + useText + ". The supply is the shortfall, " + formatQty(bought) + " a week.";
      } else {
        bought = use;
        note = flowBasis === "plan"
          ? "The plan does not make " + ticker + ". The recipes use " + day(use) + " a day (" + useText + " a week), and that amount is a supply."
          : "The plan does not make " + ticker + ". The recipes use " + useText + " a week, and that amount is a supply.";
      }
      coverage.push({ ticker: ticker, consumed: use, produced: made, unknown: unknownRate, bought: bought, note: note });
      if (bought > 0) weekly.push({ kind: "input", ticker: ticker, amount: bought, note: note });
    }

    const workers = { pioneer: 0, settler: 0, technician: 0, engineer: 0, scientist: 0 };
    for (let i = 0; i < WORKER_FIELDS.length; i += 1) {
      const tier = WORKER_FIELDS[i][0];
      workers[tier] = workforce[tier].required;
      const consuming = workforce[tier].consuming;
      if (!(consuming > 0)) continue;
      const needs = WORKFORCE_NEEDS[tier];
      for (let n = 0; n < needs.length; n += 1) {
        const ticker = needs[n][0];
        const perWorker = needs[n][1];
        const flag = needs[n][2];
        if (flag === "lux1" && !workforce[tier].lux1) continue;
        if (flag === "lux2" && !workforce[tier].lux2) continue;
        const amount = cleanQty(consuming * perWorker * 7);
        const luxNote = flag === "lux1" ? " Luxury 1 is on." : flag === "lux2" ? " Luxury 2 is on." : "";
        weekly.push({
          kind: "workforce",
          ticker: ticker,
          amount: amount,
          note: tier.charAt(0).toUpperCase() + tier.slice(1) + " consumables for " + formatQty(consuming) + " housed " + tier + "s. Each needs " + perWorker + " " + ticker + " a day, priced for a week even when the base makes them." + luxNote,
        });
      }
    }

    const owedInput = input.owed || [];
    const owed = [];
    for (const item of owedInput) {
      if (unknown[item.ticker] && !(produced[item.ticker] > 0)) {
        return { error: item.ticker + " is on the plan, and this count has no cycle amount for it." };
      }
      const barren = cannotGrow.indexOf(item.ticker) >= 0;
      const weeklyOutput = produced[item.ticker] || 0;
      if (!(weeklyOutput > 0) && !barren) {
        return { error: "These buildings do not produce " + item.ticker + ". Set the buildings that make it, or pick another ticker." };
      }
      const netMade = (flowBasis === "plan" ? ratedProduced[item.ticker] : produced[item.ticker]) || 0;
      const netUsed = (flowBasis === "plan" ? ratedConsumed[item.ticker] : consumed[item.ticker]) || 0;
      if (!barren && !(netMade - netUsed > 1e-8)) {
        const madeText = formatQty(netMade);
        const useText = formatQty(netUsed);
        notes.push(flowBasis === "plan"
          ? item.ticker + " is not an owed good. The plan makes " + formatQty(netMade / 7) + " a day (" + madeText + " a week) and the recipes use " + formatQty(netUsed / 7) + " a day (" + useText + " a week), so the shortfall is a supply."
          : item.ticker + " is not an owed good. The plan makes " + madeText + " a week and the recipes use " + useText + ", so the shortfall is a supply.");
        continue;
      }
      let running = 0;
      for (const group of pricedGroups) {
        for (const recipe of group.recipes) {
          const hit = (recipe.weeklyOutputs || []).find(function (output) { return output.ticker === item.ticker; });
          if (hit && hit.amount > 0) running += hit.amount * (recipe.baseFactor > 0 ? recipe.baseFactor : 0);
        }
      }
      if (!(running > 0) && !barren) {
        notes.push(item.ticker + " cannot run here, and the selected recipe is still counted.");
      }
      const sources = [];
      for (const group of pricedGroups) {
        for (const recipe of group.recipes) {
          const hit = (recipe.weeklyOutputs || []).find(function (output) { return output.ticker === item.ticker; });
          if (!hit || !(hit.amount > 0)) continue;
          const orderLabel = recipe.orders === 1 ? "1 order" : formatQty(recipe.orders) + " orders";
          sources.push(formatQty(group.count) + " " + group.ticker + " with " + orderLabel + " of " + recipe.name + " make " + formatQty(hit.amount) + " " + item.ticker + " a week");
        }
      }
      const fraction = item.percent / 100;
      owed.push({
        ticker: item.ticker,
        percent: item.percent,
        fraction: fraction,
        weeklyOutput: weeklyOutput,
        weeklyOwed: weeklyOutput * fraction,
        sources: sources,
      });
    }
    if (!owed.length) return { error: "Enter the product ticker this base owes." };

    const hq = input.hq || { level: null, materials: null };
    const need = new Set();
    function requireTicker(ticker, amount) {
      if (amount > 0) need.add(ticker);
    }
    for (const group of pricedGroups) {
      for (const material of group.perBuilding) requireTicker(material.ticker, material.amount * group.count);
    }
    for (const ticker of Object.keys(coreMap)) requireTicker(ticker, coreMap[ticker]);
    const extras = input.extras || {};
    for (const ticker of Object.keys(extras)) requireTicker(ticker, extras[ticker]);
    if (hq.materials) {
      for (const ticker of Object.keys(hq.materials)) requireTicker(ticker, hq.materials[ticker]);
    }
    for (const line of weekly) requireTicker(line.ticker, line.amount);
    for (const item of owed) need.add(item.ticker);
    Object.keys(produced).forEach(function (ticker) { requireTicker(ticker, produced[ticker]); });
    Object.keys(consumed).forEach(function (ticker) {
      if (unknown[ticker]) return;
      requireTicker(ticker, consumed[ticker]);
    });

    return {
      bill: {
        groups: pricedGroups,
        coreMaterials: coreMap,
        extras: extras,
        otherCis: input.otherCis || 0,
        hq: hq,
        weekly: weekly,
        coverage: coverage,
        workers: workers,
        workforce: workforce,
        cogc: input.cogc || "",
        owed: owed,
        flows: { produced: produced, consumed: consumed, unknown: unknown },
        flowBasis: flowBasis,
        cannotGrow: cannotGrow,
        fromPlan: !!input.fromPlan,
        buyAnyway: Array.from(buyAnyway),
        tickers: Array.from(need).sort(),
        notes: notes,
      },
    };
  }

  function priceExchange(prices, ticker) {
    const row = prices && prices[ticker];
    if (row && row.exchange) return normalizeExchange(row.exchange);
    if (prices) {
      const keys = Object.keys(prices);
      for (let i = 0; i < keys.length; i += 1) {
        const item = prices[keys[i]];
        if (item && item.exchange) return normalizeExchange(item.exchange);
      }
    }
    return DEFAULT_CX;
  }

  function priceBookCurrency(prices) {
    const native = [];
    const fallback = [];
    Object.keys(prices || {}).forEach(function (key) {
      const row = prices[key];
      if (!row || row.leftOut || row.price == null || !Number.isFinite(Number(row.price))) return;
      const code = String(row.currency || "").trim().toUpperCase();
      if (!code) return;
      const list = row.crossFallback ? fallback : native;
      if (list.indexOf(code) >= 0) return;
      list.push(code);
    });
    const codes = native.length ? native : fallback;
    if (codes.length > 1) {
      return { error: "These prices mix " + codes.join(" and ") + ". Each total stays in one currency." };
    }
    return { currency: codes[0] || VWAP_CURRENCY };
  }

  function lookupPrice(prices, ticker) {
    const cx = priceExchange(prices, ticker);
    const row = prices && prices[ticker];
    if (row && row.error) return { error: row.error };
    if (row && row.leftOut) {
      return {
        leftOut: true,
        price: 0,
        timeMs: row.timeMs || null,
        materialName: row.materialName || row.name || row.MaterialName || "",
        currency: String(row.currency || "").trim().toUpperCase(),
      };
    }
    if (!row || row.price == null || !Number.isFinite(Number(row.price))) {
      return { error: "No " + cx + " price for " + ticker + ". This page does not fill in a price." };
    }
    const code = String(row.currency || "").trim().toUpperCase();
    const price = Number(row.price);
    if (!(price > 0)) {
      return { error: "The " + cx + " price for " + ticker + " is " + row.price + (code ? " " + code : "") + ". A count needs a positive price." };
    }
    return {
      price: price,
      timeMs: row.timeMs || row.PriceTimeEpochMs || null,
      materialName: row.materialName || row.name || row.MaterialName || "",
      currency: code,
    };
  }

  function priceLines(lines, prices) {
    const out = [];
    let cost = 0;
    for (const line of lines) {
      const found = lookupPrice(prices, line.ticker);
      if (found.error) return found;
      if (found.leftOut) {
        out.push({
          ticker: line.ticker,
          amount: line.amount,
          price: 0,
          cost: 0,
          leftOut: true,
          timeMs: found.timeMs,
          materialName: found.materialName,
          note: line.note || "",
          kind: line.kind || "",
        });
        continue;
      }
      const rowCost = line.amount * found.price;
      cost += rowCost;
      out.push({
        ticker: line.ticker,
        amount: line.amount,
        price: found.price,
        cost: rowCost,
        timeMs: found.timeMs,
        materialName: found.materialName,
        note: line.note || "",
        kind: line.kind || "",
      });
    }
    return { lines: out, cost: cost };
  }


  function factorAtWeek(ramp, week) {
    const start = ramp && Number.isFinite(Number(ramp.start)) ? Number(ramp.start) : 0;
    const end = ramp && Number.isFinite(Number(ramp.end)) ? Number(ramp.end) : start;
    return expertFactorOverWeek(start, end, 1, week).factor;
  }

  function expertSpan(part, ramp, week) {
    if (part && part.expertEnd != null) {
      const end = Math.max(0, Math.floor(Number(part.expertEnd) || 0));
      if (!(end > 0)) return { factor: expertFactor(0), expertBonus: false };
      const start = part.expertStart != null ? Math.max(0, Math.floor(Number(part.expertStart) || 0)) : 0;
      const pace = part.expertWeight == null || part.expertWeight === "" ? 1 : Number(part.expertWeight);
      return expertFactorOverWeek(Math.min(start, end), end, pace > 0 ? pace : 0, week);
    }
    if (part && part.expertCount != null) {
      const count = Math.max(0, Math.floor(Number(part.expertCount) || 0));
      return { factor: expertFactor(count), expertBonus: count > 0 };
    }
    const start = ramp && Number.isFinite(Number(ramp.start)) ? Number(ramp.start) : 0;
    const end = ramp && Number.isFinite(Number(ramp.end)) ? Number(ramp.end) : start;
    const pace = part && part.expertWeight != null && part.expertWeight !== "" ? Number(part.expertWeight) : 1;
    return expertFactorOverWeek(start, end, pace > 0 ? pace : 0, week);
  }

  function targetMet(goods, cost, multiplier) {
    return goods + 0.005 >= multiplier * cost;
  }

  function constantFactor(schedule, ramp) {
    const start = ramp && Number.isFinite(ramp.factorStart) ? ramp.factorStart : 1;
    const end = ramp && Number.isFinite(ramp.factorEnd) ? ramp.factorEnd : start;
    if (schedule && schedule.length) {
      const first = schedule[0].factor;
      for (let i = 1; i < schedule.length; i += 1) {
        if (Math.abs(schedule[i].factor - first) > 1e-9) return null;
      }
      return first;
    }
    if (Math.abs(start - end) <= 1e-9) return start;
    return null;
  }

  function partScale(part, ramp, week) {
    const base = part.baseFactor > 0 ? part.baseFactor : 0;
    return base * expertSpan(part, ramp, week).factor;
  }

  function expert0Weekly(parts) {
    const map = {};
    for (let i = 0; i < (parts || []).length; i += 1) {
      const part = parts[i];
      const base = part.baseFactor > 0 ? part.baseFactor : 0;
      const amount = (part.weeklyAtRate || 0) * base;
      if (!(amount > 0) || !part.ticker) continue;
      map[part.ticker] = (map[part.ticker] || 0) + amount;
    }
    return map;
  }

  function solveTerm(input) {
    const weeks = input.weeks > 0 ? Math.min(input.weeks, MAX_TERM_WEEKS) : 1;
    const multiplier = input.multiplier;
    const oweGoods = multiplier > 0;
    const oneTime = input.oneTime > 0 ? input.oneTime : 0;
    const weeklyDegradation = input.weeklyDegradation > 0 ? input.weeklyDegradation : 0;
    const ramp = input.ramp || { factorStart: 1, factorEnd: 1 };
    const outputs = input.outputs || [];
    const inputs = input.inputs || [];
    const workforce = input.workforce || [];
    const owed = input.owed || [];
    const buyAnyway = input.buyAnyway || new Set();
    const unknown = input.unknown || new Set();
    const priceOf = input.priceOf;

    let cumGoods = 0;
    let cumCost = 0;
    const schedule = [];
    let profitWeek = null;
    let targetWeek = null;
    let anyGoods = false;
    const seenOutput = {};
    const retiredExport = {};

    for (let week = 1; week <= weeks; week += 1) {
      const produced = {};
      const consumed = {};
      let scaleSum = 0;
      let scaleN = 0;
      let expertBonus = false;
      function takeScale(part) {
        const span = expertSpan(part, ramp, week);
        if (span.expertBonus) expertBonus = true;
        const scale = (part.baseFactor > 0 ? part.baseFactor : 0) * span.factor;
        scaleSum += scale;
        scaleN += 1;
        return part.weeklyAtRate * scale;
      }
      for (let i = 0; i < outputs.length; i += 1) {
        const amount = takeScale(outputs[i]);
        if (amount > 0) produced[outputs[i].ticker] = (produced[outputs[i].ticker] || 0) + amount;
      }
      for (let i = 0; i < inputs.length; i += 1) {
        const amount = takeScale(inputs[i]);
        if (amount > 0) consumed[inputs[i].ticker] = (consumed[inputs[i].ticker] || 0) + amount;
      }
      const producedTickers = Object.keys(produced);
      for (let p = 0; p < producedTickers.length; p += 1) seenOutput[producedTickers[p]] = true;
      const netByTicker = {};
      const exportTickers = Object.keys(seenOutput);
      for (let p = 0; p < exportTickers.length; p += 1) {
        const ticker = exportTickers[p];
        const net = (produced[ticker] || 0) - (consumed[ticker] || 0);
        netByTicker[ticker] = net;
        if (!retiredExport[ticker] && !(net > 0)) retiredExport[ticker] = true;
      }
      const netUnits = [];
      for (let p = 0; p < producedTickers.length; p += 1) {
        const ticker = producedTickers[p];
        if (retiredExport[ticker]) continue;
        const net = netByTicker[ticker];
        if (net > 0) netUnits.push({ ticker: ticker, amount: net });
      }
      const received = [];
      let goods = 0;
      if (oweGoods) {
        for (let i = 0; i < owed.length; i += 1) {
          const item = owed[i];
          const net = (produced[item.ticker] || 0) - (consumed[item.ticker] || 0);
          const stillExport = seenOutput[item.ticker] && !retiredExport[item.ticker] && net > 0;
          const amount = stillExport ? net * item.fraction : 0;
          const value = amount * item.price;
          goods += value;
          received.push({ ticker: item.ticker, amount: amount, value: value });
        }
      } else {
        for (let i = 0; i < owed.length; i += 1) {
          received.push({ ticker: owed[i].ticker, amount: 0, value: 0 });
        }
      }
      if (goods > 0) anyGoods = true;
      let materialSupply = 0;
      let shortfallCost = 0;
      const supplyLines = [];
      const consumedTickers = Object.keys(consumed);
      for (let i = 0; i < consumedTickers.length; i += 1) {
        const ticker = consumedTickers[i];
        const use = consumed[ticker];
        const made = produced[ticker] || 0;
        let bought = use;
        if (unknown.has(ticker) && !buyAnyway.has(ticker)) bought = 0;
        else if (!buyAnyway.has(ticker) && made >= use) bought = 0;
        else if (!buyAnyway.has(ticker) && made > 0) bought = use - made;
        if (!(bought > 0)) continue;
        const price = priceOf(ticker);
        if (price == null) continue;
        const cost = bought * price;
        materialSupply += cost;
        if (made > 0) shortfallCost += cost;
        supplyLines.push({ ticker: ticker, amount: bought, price: price, cost: cost, kind: "input" });
      }
      for (let i = 0; i < workforce.length; i += 1) {
        const line = workforce[i];
        const cost = line.amount * line.price;
        materialSupply += cost;
        supplyLines.push({ ticker: line.ticker, amount: line.amount, price: line.price, cost: cost, kind: "workforce" });
      }
      const supplyCost = materialSupply + weeklyDegradation;
      const buildCost = week === 1 ? oneTime : 0;
      cumGoods += goods;
      cumCost += supplyCost + buildCost;
      const profit = cumGoods - cumCost;
      if (profitWeek == null && profit >= -0.005) profitWeek = week;
      if (oweGoods && targetWeek == null && targetMet(cumGoods, cumCost, multiplier)) targetWeek = week;
      function linesFromMap(map) {
        return Object.keys(map).filter(function (ticker) {
          return map[ticker] > 0;
        }).map(function (ticker) {
          return { ticker: ticker, amount: map[ticker] };
        });
      }
      schedule.push({
        week: week,
        factor: scaleN ? scaleSum / scaleN : factorAtWeek(ramp, week),
        expertBonus: expertBonus,
        received: received,
        outputUnits: netUnits,
        inputUnits: linesFromMap(consumed),
        goods: goods,
        materialSupply: materialSupply,
        degradationCost: weeklyDegradation,
        supplyCost: supplyCost,
        shortfallCost: shortfallCost,
        supplyLines: supplyLines,
        buildCost: buildCost,
        cumulativeGoods: cumGoods,
        cumulativeCost: cumCost,
        cumulativeProfit: profit,
      });
    }

    let profitWeekLater = null;
    const last = schedule[schedule.length - 1];
    if (last && profitWeek == null) {
      const weeklyProfit = last.goods - last.supplyCost;
      if (weeklyProfit > 0 && last.cumulativeProfit < -0.005) {
        profitWeekLater = last.week + Math.ceil((-last.cumulativeProfit) / weeklyProfit);
      }
    }

    let pace = "ran";
    if (!oweGoods) pace = "free";
    else if (!anyGoods) pace = "zero";

    return {
      weeks: weeks,
      pace: pace,
      schedule: schedule,
      met: targetWeek != null,
      targetWeek: targetWeek,
      profitWeek: profitWeek,
      profitWeekLater: profitWeekLater,
      zeroGoods: pace === "zero",
    };
  }

  function scaleRecipeLine(line, factor) {
    if (!line || line.kind === "pioneer" || line.kind === "workforce" || !(factor > 0) || factor === 1) return line;
    const amount = line.amount * factor;
    const next = Object.assign({}, line, { amount: amount });
    if (line.price != null && Number.isFinite(Number(line.price))) next.cost = amount * Number(line.price);
    return next;
  }

  function quote(bill, prices, multiplier, ramp, weeks) {
    const bookCurrency = priceBookCurrency(prices);
    if (bookCurrency.error) return bookCurrency;
    const currency = bookCurrency.currency;
    const buildingLines = [];
    const groups = [];
    for (const group of bill.groups) {
      const materials = group.perBuilding.map(function (material) {
        return { ticker: material.ticker, amount: material.amount * group.count, unitAmount: material.amount };
      });
      const priced = priceLines(materials, prices);
      if (priced.error) return priced;
      groups.push({
        ticker: group.ticker,
        name: group.name,
        count: group.count,
        workersEach: group.workersEach,
        workers: {
          pioneer: group.workersEach.pioneer * group.count,
          settler: group.workersEach.settler * group.count,
          technician: group.workersEach.technician * group.count,
          engineer: group.workersEach.engineer * group.count,
          scientist: group.workersEach.scientist * group.count,
        },
        recipes: group.recipes,
        efficiency: group.efficiency || null,
        cannotRun: group.cannotRun || "",
        materials: priced.lines.map(function (line, index) {
          return Object.assign({}, line, { unitAmount: materials[index].unitAmount });
        }),
        cost: priced.cost,
      });
      buildingLines.push.apply(buildingLines, priced.lines);
    }
    const buildingOnly = buildingLines.reduce(function (acc, line) { return acc + line.cost; }, 0);

    let core = null;
    const coreTickers = Object.keys(bill.coreMaterials || {}).sort();
    if (coreTickers.length) {
      const corePlain = coreTickers.map(function (ticker) {
        return { ticker: ticker, amount: bill.coreMaterials[ticker], kind: "core" };
      });
      const pricedCore = priceLines(corePlain, prices);
      if (pricedCore.error) return pricedCore;
      core = { materials: pricedCore.lines, cost: pricedCore.cost };
    }

    let extras = null;
    const extraTickers = Object.keys(bill.extras || {}).sort();
    if (extraTickers.length) {
      const extraPlain = extraTickers.map(function (ticker) {
        return { ticker: ticker, amount: bill.extras[ticker], kind: "extra" };
      });
      const pricedExtras = priceLines(extraPlain, prices);
      if (pricedExtras.error) return pricedExtras;
      extras = { materials: pricedExtras.lines, cost: pricedExtras.cost };
    }

    let permit = null;
    if (bill.hq && bill.hq.level != null && bill.hq.materials) {
      const permitTickers = Object.keys(bill.hq.materials).sort();
      const permitPlain = permitTickers.map(function (ticker) {
        return { ticker: ticker, amount: bill.hq.materials[ticker], kind: "permit" };
      });
      const pricedPermit = priceLines(permitPlain, prices);
      if (pricedPermit.error) return pricedPermit;
      permit = {
        level: bill.hq.level,
        note: bill.hq.note || "",
        materials: pricedPermit.lines,
        cost: pricedPermit.cost,
      };
    }

    const experts = ramp && Number.isFinite(ramp.factorStart) ? ramp : expertRamp(0, 0);
    const weeklyPriced = priceLines(bill.weekly || [], prices);
    if (weeklyPriced.error) return weeklyPriced;
    let recipeSupplyAtRate = 0;
    let pioneerSupply = 0;
    weeklyPriced.lines.forEach(function (line) {
      if (line.kind === "pioneer" || line.kind === "workforce") pioneerSupply += line.cost;
      else recipeSupplyAtRate += line.cost;
    });
    const typedOther = bill.otherCis || 0;
    let otherCis = typedOther;
    let otherLeftOut = 0;
    if (typedOther > 0 && currency !== "CIS") {
      otherCis = 0;
      otherLeftOut = typedOther;
    }
    const buildingsCost = buildingOnly + (core ? core.cost : 0) + (extras ? extras.cost : 0);
    const permitCost = permit ? permit.cost : 0;
    const buildAndPermit = buildingsCost + permitCost;
    const oneTime = buildAndPermit + otherCis;

    let productionConstruction = 0;
    const outputs = [];
    const flowInputs = [];
    for (let g = 0; g < groups.length; g += 1) {
      const group = groups[g];
      const running = group.recipes.some(function (recipe) { return recipe.orders > 0; });
      if (running) productionConstruction += group.cost;
      for (let r = 0; r < group.recipes.length; r += 1) {
        const recipe = group.recipes[r];
        const baseFactor = recipe.baseFactor > 0 ? recipe.baseFactor : 0;
        const stamp = {
          baseFactor: baseFactor,
          expertCount: recipe.expertCount == null ? null : recipe.expertCount,
          expertStart: recipe.expertStart == null ? null : recipe.expertStart,
          expertEnd: recipe.expertEnd == null ? null : recipe.expertEnd,
          expertWeight: recipe.expertWeight == null ? null : recipe.expertWeight,
        };
        for (let i = 0; i < (recipe.weeklyOutputs || []).length; i += 1) {
          const output = recipe.weeklyOutputs[i];
          outputs.push(Object.assign({ ticker: output.ticker, weeklyAtRate: output.amount }, stamp));
        }
        for (let i = 0; i < (recipe.weeklyInputs || []).length; i += 1) {
          const row = recipe.weeklyInputs[i];
          flowInputs.push(Object.assign({ ticker: row.ticker, weeklyAtRate: row.amount }, stamp));
        }
      }
    }
    const weeklyDegradation = productionConstruction / 180 * 7;

    const owedPrices = [];
    for (const item of bill.owed) {
      const found = lookupPrice(prices, item.ticker);
      if (found.error) return found;
      if (found.leftOut) {
        owedPrices.push(Object.assign({}, item, found, {
          price: 0,
          recipeWeeklyOutput: item.weeklyOutput,
          recipeWeeklyOwed: item.weeklyOwed,
        }));
        continue;
      }
      const barren = (bill.cannotGrow || []).indexOf(item.ticker) >= 0;
      if ((!(item.weeklyOwed > 0) && !barren) || !(found.price > 0)) {
        return { error: "These buildings do not produce a weekly output of " + item.ticker + "." };
      }
      owedPrices.push(Object.assign({}, item, found, {
        recipeWeeklyOutput: item.weeklyOutput,
        recipeWeeklyOwed: item.weeklyOwed,
      }));
    }

    const madeAt0 = expert0Weekly(outputs);
    const usedAt0 = expert0Weekly(flowInputs);
    const day1 = owedPrices.map(function (item) {
      const net = (madeAt0[item.ticker] || 0) - (usedAt0[item.ticker] || 0);
      const share = item.fraction > 0 ? item.fraction : 0;
      return { ticker: item.ticker, amount: net > 0 ? net * share : 0 };
    });

    const workforceLines = weeklyPriced.lines.filter(function (line) {
      return (line.kind === "pioneer" || line.kind === "workforce") && !line.leftOut;
    }).map(function (line) {
      return { ticker: line.ticker, amount: line.amount, price: line.price };
    });

    const buyAnyway = new Set(bill.buyAnyway || []);
    const unknown = new Set(Object.keys((bill.flows && bill.flows.unknown) || {}));

    const solved = solveTerm({
      weeks: weeks > 0 ? weeks : 4,
      multiplier: multiplier,
      oneTime: oneTime,
      weeklyDegradation: weeklyDegradation,
      ramp: experts,
      outputs: outputs,
      inputs: flowInputs,
      workforce: workforceLines,
      owed: owedPrices.map(function (item) {
        return { ticker: item.ticker, fraction: item.fraction, price: item.price };
      }),
      buyAnyway: buyAnyway,
      unknown: unknown,
      priceOf: function (ticker) {
        const found = lookupPrice(prices, ticker);
        if (found.leftOut) return null;
        if (found.error) throw new Error(found.error);
        return found.price;
      },
    });

    const schedule = solved.schedule || [];
    const supplyScale = constantFactor(schedule, experts);
    const week1Supply = schedule.length ? schedule[0].supplyCost : 0;
    const endSupply = schedule.length ? schedule[schedule.length - 1].supplyCost : 0;
    const supplyTotal = schedule.reduce(function (acc, row) { return acc + row.supplyCost; }, 0);
    const steady = schedule.length > 0 && Math.abs(week1Supply - endSupply) <= 0.01
      && Math.abs(schedule[0].goods - schedule[schedule.length - 1].goods) <= 0.01;
    function dailyFrom(row) {
      if (!row) return null;
      const profit = (row.goods - row.supplyCost) / 7;
      return {
        revenue: row.goods / 7,
        supplies: row.materialSupply / 7,
        degradation: row.degradationCost / 7,
        cost: row.supplyCost / 7,
        profit: profit,
        paybackDays: profit > 0 ? oneTime / profit : null,
      };
    }

    function unitsFromSchedule() {
      return owedPrices.map(function (item) {
        let amount = 0;
        let value = 0;
        let week1 = 0;
        let end = 0;
        schedule.forEach(function (row, index) {
          const hit = row.received.find(function (part) { return part.ticker === item.ticker; });
          if (!hit) return;
          amount += hit.amount;
          value += hit.value;
          if (index === 0) week1 = hit.amount;
          if (index === schedule.length - 1) end = hit.amount;
        });
        return Object.assign({}, item, {
          units: amount,
          value: value,
          week1Owed: week1,
          endOwed: end,
        });
      });
    }

    const result = {
      currency: currency,
      multiplier: multiplier,
      groups: groups,
      core: core,
      extras: extras,
      permit: permit,
      buildingsCost: buildingsCost,
      buildingListCost: buildingOnly,
      permitCost: permitCost,
      buildAndPermit: buildAndPermit,
      otherCis: otherCis,
      otherCisLeftOut: otherLeftOut,
      oneTime: oneTime,
      weekly: weeklyPriced.lines,
      weeklySupply: schedule.length ? supplyTotal / schedule.length : week1Supply,
      week1Supply: week1Supply,
      endSupply: endSupply,
      pioneerSupply: pioneerSupply,
      recipeSupplyAtRate: recipeSupplyAtRate,
      experts: experts,
      supplyScale: supplyScale,
      coverage: bill.coverage,
      workers: bill.workers,
      workforce: bill.workforce || null,
      cogc: bill.cogc || "",
      flowBasis: bill.flowBasis || "recipe",
      notes: bill.notes.slice(),
      cannotGrow: (bill.cannotGrow || []).slice(),
      schedule: schedule,
      day1: day1,
      met: !!solved.met,
      targetWeek: solved.targetWeek,
      profitWeek: solved.profitWeek,
      profitWeekLater: solved.profitWeekLater,
      pace: solved.pace,
      productionConstruction: productionConstruction,
      weeklyDegradation: weeklyDegradation,
      steady: steady,
      daily: dailyFrom(schedule[0]),
      dailyEnd: dailyFrom(schedule[schedule.length - 1]),
    };

    const last = schedule[schedule.length - 1];
    result.units = unitsFromSchedule();
    result.weeks = solved.weeks;
    result.days = solved.weeks * 7;
    result.supplyCost = supplyTotal;
    result.planCost = last ? last.cumulativeCost : oneTime;
    result.owedValue = last ? last.cumulativeGoods : 0;
    result.profit = last ? last.cumulativeProfit : -oneTime;
    result.targetValue = multiplier * result.planCost;
    if (otherLeftOut > 0) {
      result.notes.push("Other CIS is " + formatCis(otherLeftOut) + ". That amount is CIS, so it is not added to this " + currency + " total.");
    }
    if (steady && schedule[0] && schedule[0].supplyLines) {
      result.weekly = schedule[0].supplyLines.map(function (line) {
        return {
          ticker: line.ticker,
          amount: line.amount,
          price: line.price,
          cost: line.cost,
          kind: line.kind,
          materialName: line.kind === "workforce" ? "Workforce" : "Recipe input",
        };
      });
      result.supplyScale = 1;
    }
    return result;
  }

  function publicGetUrl(url) {
    let parsed;
    try {
      parsed = new URL(String(url || ""));
    } catch (error) {
      throw new Error("This page only calls public FIO and PRUNplanner.");
    }
    const hostOk = parsed.protocol === "https:" && (parsed.host === "rest.fnar.net" || parsed.host === "api.prunplanner.org");
    if (!hostOk || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("This page only calls public FIO and PRUNplanner.");
    }
    return parsed.origin + parsed.pathname;
  }

  async function fetchJson(url) {
    const safeUrl = publicGetUrl(url);
    let response;
    try {
      const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined;
      const init = { method: "GET", credentials: "omit" };
      if (signal) init.signal = signal;
      response = await fetch(safeUrl, init);
    } catch (error) {
      const timed = error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new Error(timed ? "Timed out calling " + url + "." : "Could not reach " + url + ". " + (error && error.message ? error.message : error));
    }
    if (response.status === 204) {
      const empty = new Error("Empty response from " + url + ".");
      empty.status = 204;
      throw empty;
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (error) { data = null; }
    }
    if (!response.ok) {
      const detail = data && typeof data.detail === "string" ? data.detail : "";
      throw new Error(detail ? url + " returned " + response.status + ". " + detail : url + " returned " + response.status + ".");
    }
    if (data == null) throw new Error(url + " did not return JSON.");
    return data;
  }

  function finitePrice(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function positivePrice(value) {
    const n = finitePrice(value);
    return n != null && n > 0 ? n : null;
  }

  async function fetchExchangeQuote(ticker, exchange) {
    const cx = normalizeExchange(exchange);
    const symbol = String(ticker || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,2}$/.test(symbol)) {
      throw new Error("Ticker " + symbol + " is not sent to the exchange.");
    }
    const url = FIO + "/exchange/" + encodeURIComponent(symbol) + "." + cx;
    try {
      const data = await fetchJson(url);
      return { cx: cx, symbol: symbol, data: data };
    } catch (error) {
      if (error && error.status === 204) return { cx: cx, symbol: symbol, data: null };
      throw error;
    }
  }

  function tradeFromBook(symbol, cx, data) {
    const listed = finitePrice(data && data.Price);
    if (!data || listed == null) return null;
    return {
      ticker: symbol,
      price: listed,
      timeMs: data.PriceTimeEpochMs || null,
      materialName: data.MaterialName || "",
      currency: String(data.Currency || "").trim().toUpperCase(),
      exchange: cx,
    };
  }

  async function fetchLastTrade(ticker, exchange) {
    const quote = await fetchExchangeQuote(ticker, exchange);
    const trade = tradeFromBook(quote.symbol, quote.cx, quote.data);
    if (!trade) {
      const missing = new Error(quote.cx + " has no last trade for " + quote.symbol + ".");
      missing.missingLastTrade = true;
      missing.materialName = quote.data && quote.data.MaterialName || "";
      throw missing;
    }
    return trade;
  }

  function fallbackNote(ticker, found) {
    const kind = found.kind === "mid" ? "bid/ask midpoint" : "last trade";
    const code = found.currency ? " " + found.currency : "";
    return ticker + " uses the " + found.exchange + " " + kind + ", " + formatQty(found.price) + code + ".";
  }

  async function findCrossExchangePrice(ticker, selected, selectedBook) {
    const cache = {};
    cache[selected] = selectedBook || null;
    let hardError = null;
    async function bookFor(code) {
      if (Object.prototype.hasOwnProperty.call(cache, code)) return cache[code];
      try {
        const quote = await fetchExchangeQuote(ticker, code);
        cache[code] = quote.data;
      } catch (error) {
        hardError = hardError || error;
        cache[code] = null;
      }
      return cache[code];
    }
    for (let i = 0; i < FALLBACK_EXCHANGES.length; i += 1) {
      const code = FALLBACK_EXCHANGES[i];
      if (code === selected) continue;
      const book = await bookFor(code);
      const price = positivePrice(book && book.Price);
      if (price == null) continue;
      return {
        price: price,
        timeMs: book.PriceTimeEpochMs || null,
        kind: "last",
        materialName: book.MaterialName || "",
        currency: String(book.Currency || "").trim().toUpperCase(),
        exchange: code,
      };
    }
    for (let i = 0; i < FALLBACK_EXCHANGES.length; i += 1) {
      const code = FALLBACK_EXCHANGES[i];
      const book = await bookFor(code);
      const bid = positivePrice(book && book.Bid);
      const ask = positivePrice(book && book.Ask);
      if (bid == null || ask == null) continue;
      return {
        price: (bid + ask) / 2,
        timeMs: null,
        kind: "mid",
        materialName: (book && book.MaterialName) || "",
        currency: String((book && book.Currency) || "").trim().toUpperCase(),
        exchange: code,
      };
    }
    if (hardError) return { error: hardError };
    return { price: null };
  }

  async function fetchPrices(tickers, exchange) {
    const cx = normalizeExchange(exchange);
    const prices = {};
    const errors = [];
    let index = 0;
    async function worker() {
      while (index < tickers.length) {
        const current = index;
        index += 1;
        const ticker = tickers[current];
        try {
          prices[ticker] = await fetchLastTrade(ticker, cx);
        } catch (error) {
          errors.push(error.message || String(error));
        }
      }
    }
    const workers = [];
    const n = Math.min(6, tickers.length);
    for (let i = 0; i < n; i += 1) workers.push(worker());
    await Promise.all(workers);
    if (errors.length) {
      const unique = errors.filter(function (item, i) { return errors.indexOf(item) === i; });
      throw new Error(unique.join("\n"));
    }
    return prices;
  }

  let plannerExchangeCache = null;
  async function loadPlannerExchanges() {
    if (plannerExchangeCache) return plannerExchangeCache;
    const list = await fetchJson(PLANNER_EXCHANGES);
    if (!Array.isArray(list)) throw new Error("PRUNplanner exchange list was not a list.");
    const map = {};
    list.forEach(function (row) {
      if (!row || !row.exchange_code || !row.ticker) return;
      const code = String(row.exchange_code).toUpperCase();
      const ticker = String(row.ticker).toUpperCase();
      if (!map[code]) map[code] = {};
      map[code][ticker] = row;
    });
    if (!map.UNIVERSE || !Object.keys(map.UNIVERSE).length) {
      throw new Error("PRUNplanner exchange list has no UNIVERSE rows.");
    }
    plannerExchangeCache = map;
    return map;
  }

  async function loadUniverseVwap() {
    const map = await loadPlannerExchanges();
    return map.UNIVERSE;
  }

  function positiveVwap(row) {
    if (!row || row.vwap_30d == null || row.vwap_30d === "") return null;
    const raw = Number(row.vwap_30d);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  function alignStandInCurrency(last, rows) {
    const codes = [];
    Object.keys(last || {}).forEach(function (ticker) {
      const row = last[ticker];
      if (!row || row.standIn || row.crossFallback || row.leftOut || row.price == null || !Number.isFinite(Number(row.price))) return;
      const code = String(row.currency || "").trim().toUpperCase();
      if (code && codes.indexOf(code) < 0) codes.push(code);
    });
    if (codes.length !== 1) return;
    const code = codes[0];
    Object.keys(last).forEach(function (ticker) {
      if (last[ticker] && last[ticker].standIn && !last[ticker].crossFallback) last[ticker].currency = code;
    });
    (rows || []).forEach(function (row) {
      if (row && row.lastStandIn && !row.crossFallback) row.lastCurrency = code;
    });
  }

  async function fetchPriceBooks(tickers, exchange) {
    const cx = normalizeExchange(exchange);
    const bookCode = exchangeCurrency(cx);
    const marketCode = vwapMarket(cx);
    const marketLabel = vwapColumnLabel(cx);
    let books = {};
    let bookError = "";
    try {
      books = await loadPlannerExchanges();
    } catch (error) {
      bookError = error && error.message ? error.message : String(error);
      books = {};
    }
    function marketHit(ticker) {
      const price = positiveVwap(books[marketCode] && books[marketCode][ticker]);
      if (price == null) return null;
      return { price: price, currency: bookCode, exchange: marketCode };
    }
    function universeHit(ticker) {
      const price = positiveVwap(books.UNIVERSE && books.UNIVERSE[ticker]);
      if (price == null) return null;
      return { price: price, currency: VWAP_CURRENCY, exchange: "UNIVERSE" };
    }
    const last = {};
    const average = {};
    const rows = [];
    const errors = [];
    let index = 0;
    async function worker() {
      while (index < tickers.length) {
        const current = index;
        index += 1;
        const ticker = tickers[current];
        try {
          let trade = null;
          let selectedBook = null;
          let missingName = "";
          const quote = await fetchExchangeQuote(ticker, cx);
          selectedBook = quote.data;
          missingName = (selectedBook && selectedBook.MaterialName) || "";
          trade = tradeFromBook(quote.symbol, quote.cx, selectedBook);
          const market = marketHit(ticker);
          const universe = universeHit(ticker);
          if (!trade) {
            if (market) {
              const note = cx + " has no last trade for " + ticker + ". That line uses " + marketLabel + ".";
              last[ticker] = {
                ticker: ticker,
                price: market.price,
                timeMs: null,
                materialName: missingName,
                currency: bookCode,
                exchange: cx,
                standIn: true,
              };
              average[ticker] = {
                ticker: ticker,
                price: market.price,
                timeMs: null,
                materialName: missingName,
                currency: bookCode,
                exchange: marketCode,
                fallback: "",
              };
              rows.push({
                ticker: ticker,
                materialName: missingName,
                last: market.price,
                lastCurrency: bookCode,
                lastTime: null,
                vwap: market.price,
                vwapCurrency: bookCode,
                vwapExchange: marketCode,
                used: market.price,
                usedCurrency: bookCode,
                fallback: "",
                lastStandIn: note,
              });
              continue;
            }
            if (!universe) {
              const found = await findCrossExchangePrice(ticker, cx, selectedBook);
              if (found.error) throw found.error;
              if (!(found.price > 0)) throw new Error("No price for " + ticker + ".");
              const name = found.materialName || missingName;
              const sourceCurrency = found.currency || "";
              last[ticker] = {
                ticker: ticker,
                price: found.price,
                timeMs: found.timeMs,
                materialName: name,
                currency: sourceCurrency,
                exchange: found.exchange,
                crossFallback: true,
              };
              average[ticker] = {
                ticker: ticker,
                price: found.price,
                timeMs: null,
                materialName: name,
                currency: sourceCurrency,
                exchange: found.exchange,
                crossFallback: true,
                fallback: "",
              };
              rows.push({
                ticker: ticker,
                materialName: name,
                last: found.price,
                lastCurrency: sourceCurrency,
                lastTime: found.timeMs,
                lastExchange: found.exchange,
                vwap: null,
                vwapCurrency: sourceCurrency,
                vwapExchange: found.exchange,
                used: found.price,
                usedCurrency: sourceCurrency,
                fallback: "",
                crossFallback: true,
                lastStandIn: fallbackNote(ticker, found),
              });
              continue;
            }
            const note = cx + " has no last trade for " + ticker + ". That line uses " + BOOK_VWAP + ".";
            const foreign = bookCode !== VWAP_CURRENCY;
            last[ticker] = {
              ticker: ticker,
              price: universe.price,
              timeMs: null,
              materialName: missingName,
              currency: VWAP_CURRENCY,
              exchange: cx,
              standIn: true,
              crossFallback: foreign,
            };
            average[ticker] = {
              ticker: ticker,
              price: universe.price,
              timeMs: null,
              materialName: missingName,
              currency: VWAP_CURRENCY,
              exchange: "UNIVERSE",
              crossFallback: foreign,
              fallback: "",
            };
            rows.push({
              ticker: ticker,
              materialName: missingName,
              last: universe.price,
              lastCurrency: VWAP_CURRENCY,
              lastTime: null,
              vwap: universe.price,
              vwapCurrency: VWAP_CURRENCY,
              vwapExchange: "UNIVERSE",
              used: universe.price,
              usedCurrency: VWAP_CURRENCY,
              fallback: "",
              crossFallback: foreign,
              lastStandIn: note,
            });
            continue;
          }
          last[ticker] = trade;
          const tradeCurrency = String(trade.currency || "").toUpperCase();
          let fallback = "";
          let used = null;
          let usedCurrency = bookCode;
          let vwap = null;
          let vwapCurrency = bookCode;
          let vwapExchange = marketCode;
          let averageCurrency = bookCode;
          let averageExchange = marketCode;
          let averageCross = false;
          if (market) {
            vwap = market.price;
            used = market.price;
            usedCurrency = bookCode;
            vwapCurrency = bookCode;
            vwapExchange = marketCode;
            averageCurrency = bookCode;
            averageExchange = marketCode;
          } else if (universe) {
            const foreign = bookCode !== VWAP_CURRENCY;
            vwap = universe.price;
            used = universe.price;
            usedCurrency = VWAP_CURRENCY;
            vwapCurrency = VWAP_CURRENCY;
            vwapExchange = "UNIVERSE";
            averageCurrency = VWAP_CURRENCY;
            averageExchange = "UNIVERSE";
            averageCross = foreign;
            fallback = "No " + marketLabel + " for " + ticker + ". That line uses " + BOOK_VWAP + ".";
          } else if (tradeCurrency === bookCode) {
            used = trade.price;
            usedCurrency = tradeCurrency;
            averageCurrency = tradeCurrency;
            averageExchange = cx;
            fallback = bookError
              ? "No " + marketLabel + ". The exchange list did not load (" + bookError + "). This item uses the " + cx + " last trade, which is also " + bookCode + "."
              : "No " + marketLabel + " for " + ticker + ". This item uses the " + cx + " last trade, which is also " + bookCode + ".";
          } else {
            used = trade.price;
            usedCurrency = tradeCurrency;
            averageCurrency = tradeCurrency;
            averageExchange = cx;
            averageCross = true;
            const code = tradeCurrency || "another currency";
            const amount = formatQty(trade.price) + " " + code;
            fallback = bookError
              ? "No " + marketLabel + ". The exchange list did not load (" + bookError + "). This line uses the " + cx + " last trade, " + amount + ", in the rough total."
              : "No " + marketLabel + " for " + ticker + ". The " + cx + " last trade is " + amount + ", and that price is included in this rough total.";
          }
          if (used != null) {
            average[ticker] = {
              ticker: ticker,
              price: used,
              timeMs: null,
              materialName: trade.materialName || "",
              currency: averageCurrency,
              exchange: averageExchange,
              crossFallback: averageCross,
              fallback: fallback,
            };
          }
          rows.push({
            ticker: ticker,
            materialName: trade.materialName || "",
            last: trade.price,
            lastCurrency: tradeCurrency,
            lastTime: trade.timeMs,
            vwap: vwap,
            vwapCurrency: vwapCurrency,
            vwapExchange: vwapExchange,
            used: used,
            usedCurrency: usedCurrency,
            fallback: fallback,
          });
        } catch (error) {
          errors.push(error.message || String(error));
        }
      }
    }
    const workers = [];
    const n = Math.min(6, tickers.length);
    for (let i = 0; i < n; i += 1) workers.push(worker());
    await Promise.all(workers);
    if (errors.length) {
      const unique = errors.filter(function (item, i) { return errors.indexOf(item) === i; });
      throw new Error(unique.join("\n"));
    }
    alignStandInCurrency(last, rows);
    rows.sort(function (a, b) {
      if (a.ticker < b.ticker) return -1;
      if (a.ticker > b.ticker) return 1;
      return 0;
    });
    return { last: last, average: average, rows: rows, bookError: bookError };
  }

  let habitationCatalog = null;
  async function loadHabitations() {
    if (habitationCatalog) return habitationCatalog;
    const list = await fetchJson("https://api.prunplanner.org/data/buildings/");
    if (!Array.isArray(list)) throw new Error("PRUNplanner building list was not a list.");
    const map = {};
    for (let i = 0; i < list.length; i += 1) {
      const building = list[i];
      const ticker = String(building.building_ticker || "").toUpperCase();
      if (ticker && building.habitations) map[ticker] = building.habitations;
    }
    habitationCatalog = map;
    return map;
  }

  let buildingCatalog = null;
  let buildingCatalogPromise = null;
  let buildingMenu = null;
  let afterBuildingsLoaded = null;

  const BUILDING_GROUP_ORDER = [
    "Production buildings",
    "Habitation",
    "Storage",
  ];

  function buildingLongName(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    const spaced = raw
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2");
    return spaced.split(/\s+/).map(function (word) {
      if (!word) return "";
      if (word === word.toUpperCase() && /[A-Z]/.test(word) && word.length > 1) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(" ");
  }

  function buildingOptionLabel(building) {
    const ticker = String(building.Ticker || "").toUpperCase();
    const longName = buildingLongName(building.Name) || ticker;
    return longName + " (" + ticker + ")";
  }

  function buildingGroupLabel(building) {
    const name = String(building && building.Name || "");
    const lower = name.toLowerCase();
    if (lower.indexOf("habitation") === 0) return "Habitation";
    if (lower.indexOf("storage") === 0) return "Storage";
    const project = name.match(/^([a-z]+)Project/);
    if (project) {
      const word = project[1].charAt(0).toUpperCase() + project[1].slice(1);
      return word + " projects";
    }
    if (building && (building.Expertise || (building.Recipes || []).length > 0)) return "Production buildings";
    const prefix = name.match(/^[a-z]+/);
    if (prefix) return prefix[0].charAt(0).toUpperCase() + prefix[0].slice(1);
    return "Other";
  }

  function showsOrderRows(building) {
    if (!building) return false;
    const group = buildingGroupLabel(building);
    if (group === "Habitation" || group === "Storage") return false;
    return (building.Recipes || []).length > 0;
  }

  function menuFromBuildings(list) {
    const groups = new Map();
    for (let i = 0; i < list.length; i += 1) {
      const building = list[i];
      const ticker = String(building.Ticker || "").toUpperCase();
      if (!ticker) continue;
      const label = buildingGroupLabel(building);
      if (BUILDING_GROUP_ORDER.indexOf(label) < 0) continue;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ ticker: ticker, label: buildingOptionLabel(building) });
    }
    groups.forEach(function (options) {
      options.sort(function (a, b) {
        return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
      });
    });
    const preferred = BUILDING_GROUP_ORDER.filter(function (label) { return groups.has(label); });
    const rest = Array.from(groups.keys()).filter(function (label) { return preferred.indexOf(label) < 0; });
    rest.sort(function (a, b) { return a.localeCompare(b, "en", { sensitivity: "base" }); });
    return preferred.concat(rest).map(function (label) {
      return { label: label, options: groups.get(label) };
    });
  }

  function fillBuildingSelect(select, value) {
    const selected = String(value != null ? value : select.value || "").trim().toUpperCase();
    select.replaceChildren();
    select.append(el("option", { value: "" }, [buildingMenu ? "Select a building" : "Loading buildings…"]));
    const seen = { "": true };
    (buildingMenu || []).forEach(function (group) {
      const optgroup = el("optgroup", { label: group.label });
      group.options.forEach(function (option) {
        seen[option.ticker] = true;
        optgroup.append(el("option", { value: option.ticker }, [option.label]));
      });
      select.append(optgroup);
    });
    if (selected && !seen[selected]) {
      const building = getBuilding(buildingCatalog, selected);
      select.append(el("option", { value: selected }, [building ? buildingOptionLabel(building) : selected]));
    }
    select.value = selected;
  }

  async function loadBuildings() {
    if (buildingCatalog) return buildingCatalog;
    if (!buildingCatalogPromise) {
      buildingCatalogPromise = fetchJson(FIO + "/building/allbuildings").then(function (list) {
        if (!Array.isArray(list)) throw new Error("FIO building list was not a list.");
        const map = new Map();
        for (const building of list) map.set(String(building.Ticker || "").toUpperCase(), building);
        buildingMenu = menuFromBuildings(list);
        buildingCatalog = map;
        const notify = afterBuildingsLoaded;
        if (typeof notify === "function") {
          try { notify(); } catch (error) { /* the list is already stored */ }
          if (typeof setTimeout === "function") {
            setTimeout(function () {
              try { notify(); } catch (error) { /* the list is already stored */ }
            }, 0);
          }
        }
        return map;
      }).catch(function (error) {
        buildingCatalogPromise = null;
        throw error;
      });
    }
    return buildingCatalogPromise;
  }

  function coreFromPlanet(planet) {
    const materials = {};
    for (const row of planet.BuildRequirements || []) {
      const ticker = String(row.MaterialTicker || "").toUpperCase();
      const amount = Number(row.MaterialAmount);
      if (!ticker || !(amount > 0)) continue;
      materials[ticker] = (materials[ticker] || 0) + amount;
    }
    return materials;
  }

  function formatQty(value) {
    if (!Number.isFinite(value)) return "";
    const rounded = Math.round(value * 10000) / 10000;
    return rounded.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  function formatTableQty(value) {
    if (!Number.isFinite(value)) return "";
    const rounded = Math.round(value * 100) / 100;
    return rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function moneyCode(currency) {
    return String(currency || VWAP_CURRENCY).trim().toUpperCase() || VWAP_CURRENCY;
  }

  function formatMoney(value, currency) {
    if (!Number.isFinite(value)) return "";
    const rounded = Math.round(value * 100) / 100;
    const whole = Math.abs(rounded - Math.round(rounded)) < 0.001;
    const digits = rounded.toLocaleString("en-US", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    });
    return digits + " " + moneyCode(currency);
  }

  function formatTableMoney(value, currency) {
    if (!Number.isFinite(value)) return "";
    const rounded = Math.round(value * 100) / 100;
    const digits = rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return digits + " " + moneyCode(currency);
  }

  function formatCis(value) {
    return formatMoney(value, "CIS");
  }

  function cashOf(result, value) {
    return formatMoney(value, result && result.currency ? result.currency : "CIS");
  }

  function profitPercentText(profit, cost) {
    if (!(profit > 0) || !(cost > 0)) return "";
    const percent = (profit / cost) * 100;
    if (!Number.isFinite(percent)) return "";
    return (Math.round(percent * 10) / 10).toFixed(1) + "%";
  }

  function cumulativeProfitText(row, currency) {
    const amount = formatTableMoney(row.cumulativeProfit, currency);
    const percent = profitPercentText(row.cumulativeProfit, row.cumulativeCost);
    return percent ? amount + " (" + percent + ")" : amount;
  }

  function formatWhen(ms) {
    if (!ms) return "";
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().replace(".000Z", "Z");
  }

  function formatDuration(ms) {
    const hours = ms / 3600000;
    const rounded = Math.round(hours * 100) / 100;
    return formatQty(rounded) + " hours";
  }

  function varies(text) {
    return el("strong", { class: "varies" }, [text]);
  }

  function allowedLink(value) {
    let parsed;
    try {
      parsed = new URL(String(value || ""));
    } catch (error) {
      return "";
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    if (parsed.host !== "rest.fnar.net" && parsed.host !== "api.prunplanner.org") return "";
    return parsed.origin + parsed.pathname + parsed.search;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    const values = attrs || {};
    Object.keys(values).forEach(function (key) {
      if (!/^[A-Za-z][A-Za-z0-9:-]*$/.test(key) || /^on/i.test(key)) return;
      const lower = key.toLowerCase();
      if (lower === "formaction" || lower === "srcdoc" || lower === "srcset") return;
      const value = values[key];
      if (key === "class") {
        node.className = String(value || "");
        return;
      }
      if (value == null || value === false) return;
      let text = value === true ? "" : String(value);
      if (lower === "href" || lower === "src") {
        text = allowedLink(text);
        if (!text) return;
      }
      node.setAttribute(key, text);
    });
    (children || []).forEach(function (child) {
      if (child == null || child === false) return;
      if (typeof child === "object" && child.nodeType) node.append(child);
      else node.append(document.createTextNode(String(child)));
    });
    return node;
  }

  function priceAnchor(ticker, label, exchange) {
    const cx = normalizeExchange(exchange);
    return el("a", {
      href: FIO + "/exchange/" + encodeURIComponent(ticker) + "." + cx,
      target: "_blank",
      rel: "noopener",
    }, [label]);
  }

  function vwapCell(row) {
    if (!row) return "—";
    const code = row.vwapCurrency || VWAP_CURRENCY;
    if (row.fallback && !(row.vwap > 0)) {
      if (row.used > 0) return formatTableMoney(row.used, row.usedCurrency || code) + " · last trade";
      return "—";
    }
    if (!(row.vwap > 0)) return "—";
    return formatTableMoney(row.vwap, code);
  }

  function tradeRowCurrency(priceRow, bookCurrency) {
    const book = String(bookCurrency || "CIS").trim().toUpperCase() || "CIS";
    if (!priceRow || !priceRow.crossFallback) return book;
    const source = String(priceRow.lastCurrency || "").trim().toUpperCase();
    return source || book;
  }

  function materialTable(lines, withUnit, pricesByTicker, exchange, currency, useSourceCurrency) {
    const code = currency || exchangeCurrency(exchange);
    const lastLabel = lastTradeLabel(exchange);
    const vwapLabel = vwapColumnLabel(exchange);
    const head = withUnit
      ? ["Ticker", "Each", "Count", lastLabel, vwapLabel, "Cost, last trade"]
      : ["Ticker", "Amount", lastLabel, vwapLabel, "Cost, last trade"];
    const table = el("table");
    table.append(el("thead", {}, [el("tr", {}, head.map(function (item, index) {
      return el("th", { scope: "col", class: index > 0 ? "num" : "" }, [item]);
    }))]));
    const body = el("tbody");
    lines.forEach(function (line) {
      const priced = pricesByTicker ? pricesByTicker[line.ticker] : null;
      const rowCode = useSourceCurrency || (priced && priced.crossFallback) ? tradeRowCurrency(priced, code) : code;
      const trade = line.leftOut
        ? "—"
        : priceAnchor(line.ticker, formatTableMoney(line.price, rowCode), (priced && priced.lastExchange) || exchange);
      const costText = line.leftOut ? "—" : formatTableMoney(line.cost, rowCode);
      const average = vwapCell(pricesByTicker ? pricesByTicker[line.ticker] : null);
      const cells = withUnit
        ? [
          line.ticker + (line.materialName ? " · " + line.materialName : ""),
          formatTableQty(line.unitAmount),
          formatTableQty(line.amount),
          trade,
          average,
          costText,
        ]
        : [
          line.ticker + (line.materialName ? " · " + line.materialName : ""),
          formatTableQty(line.amount),
          trade,
          average,
          costText,
        ];
      body.append(el("tr", {}, cells.map(function (cell, index) {
        return el("td", { class: index > 0 ? "num" : "" }, [cell]);
      })));
    });
    table.append(body);
    return table;
  }

  function weeksLabel(weeks) {
    const safe = weeks > 0 ? weeks : 0;
    const days = safe * 7;
    return formatQty(Math.round(safe * 100) / 100) + " weeks (" + formatQty(Math.round(days * 10) / 10) + " days)";
  }

  function supplyWeekParts(result) {
    const amount = varies("Building degradation is " + cashOf(result, result.weeklyDegradation || 0) + " a week");
    const tail = ", and it is inside the supply cost.";
    if (Math.abs(result.week1Supply - result.endSupply) <= 0.01) {
      return ["That supply amount is paid every week the term runs. ", amount, tail];
    }
    return [
      "Recipe inputs follow that week's efficiency. Workforce food does not. ",
      amount,
      tail + " The week table has each week's supply cost.",
    ];
  }

  function appendBank(rootNode, result, includeTotal) {
    const pieces = el("div");
    pieces.append(pieceRow("One-time build and permit", cashOf(result, result.buildAndPermit)));
    if (result.otherCis > 0) pieces.append(pieceRow("Other CIS, once", formatCis(result.otherCis)));
    if (Math.abs(result.week1Supply - result.endSupply) <= 0.01) {
      pieces.append(pieceRow("Supplies per week", cashOf(result, result.week1Supply)));
    } else {
      pieces.append(pieceRow("Supplies in week 1", cashOf(result, result.week1Supply)));
      pieces.append(pieceRow("Supplies in the last week", cashOf(result, result.endSupply)));
    }
    if (includeTotal) {
      pieces.append(pieceRow("Supplies over the term", cashOf(result, result.supplyCost), "term-supply"));
      pieces.append(pieceRow("Bank total", cashOf(result, result.planCost)));
      pieces.append(pieceRow("Cumulative profit", cashOf(result, result.profit)));
    }
    rootNode.append(pieces);
    const weekNote = "The build and the permit are paid in week 1 only. Supplies are paid every week the term runs. Later weeks do not add the build again.";
    const totalNote = includeTotal
      ? " The bank total is that one-time amount plus the supplies over the term. The build is in that total once."
      : " The one-time amount is the build and the permit once.";
    const supplyParts = supplyWeekParts(result);
    supplyParts.push(" " + weekNote + totalNote);
    rootNode.append(el("p", {}, supplyParts));
  }

  function bookOutcome(result, name) {
    const goods = cashOf(result, result.owedValue);
    const profit = cashOf(result, result.profit);
    const cost = cashOf(result, result.planCost);
    const weeks = formatQty(result.weeks);
    let profitLine;
    if (result.profitWeek) {
      profitLine = "Cumulative profit first crosses zero in week " + result.profitWeek + ".";
    } else if (result.profitWeekLater) {
      profitLine = "Cumulative profit does not cross zero inside these " + weeks + " weeks. At the last week's rate it crosses in week " + result.profitWeekLater + ".";
    } else {
      profitLine = "Cumulative profit does not cross zero. A week of goods does not cover that week's supplies and degradation.";
    }
    let targetLine;
    if (!(result.multiplier > 0)) {
      targetLine = "Multiplier 0. No goods are owed. The player keeps the output.";
    } else if (result.targetWeek) {
      targetLine = "Multiplier " + formatQty(result.multiplier) + " is met in week " + result.targetWeek + ", inside this term.";
    } else {
      targetLine = "Multiplier " + formatQty(result.multiplier) + " is not met inside these " + weeks + " weeks.";
    }
    return name + ", after " + weeks + " weeks: owed goods " + goods + ". Cumulative profit " + profit + " on a cost of " + cost + ". " + profitLine + " " + targetLine;
  }

  function amountList(lines) {
    return (lines || []).filter(function (item) {
      return item && item.amount > 0 && item.ticker;
    }).map(function (item) {
      return formatQty(item.amount) + " " + item.ticker;
    }).join(", ");
  }

  function receivedText(received) {
    const text = amountList(received);
    return text || "0";
  }

  function tableAmountList(lines) {
    return (lines || []).filter(function (item) {
      return item && item.amount > 0 && item.ticker && Math.round(item.amount * 100) / 100 > 0;
    }).map(function (item) {
      return formatTableQty(item.amount) + " " + item.ticker;
    }).join(", ");
  }

  function producedLines(row) {
    const produced = {};
    const order = [];
    ((row && row.outputUnits) || []).forEach(function (item) {
      if (!item || !item.ticker || !(item.amount > 0)) return;
      if (!Object.prototype.hasOwnProperty.call(produced, item.ticker)) order.push(item.ticker);
      produced[item.ticker] = (produced[item.ticker] || 0) + item.amount;
    });
    return order.map(function (ticker) {
      return { ticker: ticker, amount: produced[ticker] };
    });
  }

  function unitsCellText(row) {
    return tableAmountList(producedLines(row)) || "0";
  }

  function renderSchedule(schedule, profitWeek, exchange, currency) {
    const code = currency || exchangeCurrency(exchange);
    const wrap = el("div", { class: "schedule-wrap", tabindex: "0", role: "region", "aria-label": "Week by week, " + lastTradeLabel(exchange) });
    const table = el("table", { id: "week-table", "data-currency": code });
    const headers = ["Week", "Units", "Supply cost", "Build cost", "Cumulative goods", "Cumulative cost", "Cumulative profit"];
    table.append(el("thead", {}, [el("tr", {}, headers.map(function (item, index) {
      return el("th", { scope: "col", class: index > 1 ? "num" : "" }, [item]);
    }))]));
    const body = el("tbody");
    (schedule || []).forEach(function (row) {
      const profitClasses = ["num"];
      if (row.cumulativeProfit < -0.005) profitClasses.push("neg");
      if (row.week === profitWeek) profitClasses.push("met");
      body.append(el("tr", { "data-week": String(row.week), "data-expert-bonus": row.expertBonus ? "yes" : "no" }, [
        el("td", {}, [String(row.week)]),
        el("td", { "data-field": "units" }, [unitsCellText(row)]),
        el("td", { class: "num", "data-field": "supply" }, [formatTableMoney(row.supplyCost, code)]),
        el("td", { class: "num", "data-field": "build" }, [formatTableMoney(row.buildCost, code)]),
        el("td", { class: "num", "data-field": "cumulative-goods" }, [formatTableMoney(row.cumulativeGoods, code)]),
        el("td", { class: "num", "data-field": "cumulative-cost" }, [formatTableMoney(row.cumulativeCost, code)]),
        el("td", { class: profitClasses.join(" "), "data-field": "cumulative" }, [cumulativeProfitText(row, code)]),
      ]));
    });
    table.append(body);
    wrap.append(table);
    return wrap;
  }

  function efficiencyLines(result) {
    const lines = [];
    const name = cogcName(result.cogc);
    if (name) {
      lines.push({
        fact: "COGC on the plan is " + name + ".",
        rest: " A building whose expertise matches that program runs at ×1.25. A workforce program is ×1.10 on buildings that employ that tier.",
      });
    } else {
      lines.push({ fact: "No COGC is set.", rest: " The COGC factor is 1." });
    }
    (result.groups || []).forEach(function (group) {
      const efficiency = group.efficiency;
      if (!efficiency || !group.recipes.length) return;
      lines.push({ fact: group.ticker + ": COGC ×" + formatQty(efficiency.cogc) + ", workforce ×" + formatQty(Math.round(efficiency.workforce * 10000) / 10000) + ", fertility ×" + formatQty(Math.round(efficiency.fertility * 10000) / 10000) + "." });
    });
    const pioneer = result.workforce && result.workforce.pioneer;
    if (pioneer && pioneer.required > 0) {
      lines.push({ fact: formatQty(pioneer.capacity) + " pioneer beds for " + formatQty(pioneer.required) + " pioneers. Workforce efficiency is " + formatQty(Math.round(pioneer.efficiency * 1000) / 10) + "%. Luxury 1 is " + (pioneer.lux1 ? "on" : "off") + " and luxury 2 is " + (pioneer.lux2 ? "on" : "off") + "." });
    }
    return lines;
  }

  function formatPayback(days) {
    if (days == null || !Number.isFinite(days) || !(days > 0)) return "Daily profit does not cover the build.";
    return formatQty(Math.round(days * 100) / 100) + " days";
  }

  function plannerNetDaily(result) {
    const daily = result.daily;
    const row = result.schedule && result.schedule[0];
    if (!daily || !row) return null;
    const owed = {};
    (row.received || []).forEach(function (item) { owed[item.ticker] = item.amount; });
    let overlap = 0;
    (row.supplyLines || []).forEach(function (line) {
      if (line.kind !== "workforce" && line.kind !== "pioneer") return;
      const made = owed[line.ticker] || 0;
      if (!(made > 0) || !(line.amount > 0) || !(line.price > 0)) return;
      overlap += Math.min(made, line.amount) * line.price;
    });
    const rations = overlap / 7;
    return {
      revenue: daily.revenue - rations,
      cost: daily.cost - rations,
      profit: daily.profit,
      rations: rations,
    };
  }

  function bookCard(result, ids, heading, kicker) {
    const section = el("section", { id: ids.root, class: "book", "data-currency": result.currency || "CIS" });
    section.append(el("h3", {}, [heading]));
    section.append(el("p", { class: "kicker" }, [kicker]));
    const daily = result.daily;
    const pieces = el("div");
    const day = result.steady ? "Daily" : "Week 1 daily";
    pieces.append(pieceRow("Total cost", cashOf(result, result.planCost), ids.totalCost));
    pieces.append(pieceRow("Total goods value", cashOf(result, result.owedValue), ids.goods));
    pieces.append(pieceRow("Total profit", cashOf(result, result.profit), ids.profit));
    if (daily) {
      pieces.append(pieceRow(day + " goods value", cashOf(result, daily.revenue), ids.dailyRevenue));
      pieces.append(pieceRow(day + " cost", cashOf(result, daily.cost), ids.dailyCost));
      pieces.append(pieceRow(day + " profit", cashOf(result, daily.profit), ids.dailyProfit));
      pieces.append(pieceRow("Payback", formatPayback(daily.paybackDays), ids.payback));
    }
    section.append(pieces);
    const net = daily ? plannerNetDaily(result) : null;
    if (net && net.rations > 0.005) {
      section.append(el("p", { id: ids.plannerNet, class: "hint" }, [
        "Planner net per day, with rations the base makes and eats left out of both sides: ",
        varies(cashOf(result, net.revenue) + " goods, " + cashOf(result, net.cost) + " cost, " + cashOf(result, net.profit) + " profit."),
      ]));
    }
    if (!result.steady && result.dailyEnd) {
      section.append(el("p", { class: "hint" }, [varies("The last week of this term earns " + cashOf(result, result.dailyEnd.profit) + " a day.")]));
    }
    return section;
  }

  function renderPriceTable(rows, exchange) {
    const table = el("table", { id: "price-compare" });
    const headers = ["Ticker", lastTradeLabel(exchange), vwapColumnLabel(exchange)];
    table.append(el("thead", {}, [el("tr", {}, headers.map(function (item, index) {
      return el("th", { scope: "col", class: index > 0 ? "num" : "" }, [item]);
    }))]));
    const body = el("tbody");
    rows.forEach(function (row) {
      const cells = [
        row.ticker + (row.materialName ? " · " + row.materialName : ""),
        priceAnchor(row.ticker, formatTableMoney(row.last, row.lastCurrency || exchangeCurrency(exchange)), row.lastExchange || exchange),
        vwapCell(row),
      ];
      body.append(el("tr", {}, cells.map(function (cell, index) {
        return el("td", { class: index > 0 ? "num" : "" }, [cell]);
      })));
    });
    table.append(body);
    return table;
  }

  function appendBooks(rootNode, last, average, priceRows, bookError, exchange, vwapBlock) {
    const cx = normalizeExchange(exchange);
    const lastLabel = lastTradeLabel(cx);
    const vwapLabel = vwapColumnLabel(cx);
    const vwapCode = (average && average.currency) || exchangeCurrency(cx);
    const lastCode = (last && last.currency) || exchangeCurrency(cx);
    const weeks = last.weeks === 1 ? "1 week" : formatQty(last.weeks) + " weeks";
    const perDay = last.schedule && last.schedule[0]
      ? last.schedule[0].received.map(function (item) {
        return formatQty(item.amount / 7) + " " + item.ticker;
      }).join(", ")
      : "";
    rootNode.append(el("h2", {}, ["Totals for " + weeks]));
    if (perDay) {
      const day1Text = (last.day1 || []).filter(function (item) {
        return item && item.ticker && item.amount > 0;
      }).map(function (item) {
        return formatQty(item.amount / 7) + " " + item.ticker;
      }).join(", ");
      if (day1Text) {
        rootNode.append(el("p", { id: "day1-units" }, [varies("Day 1 output: " + day1Text + ".")]));
      }
      rootNode.append(el("p", { id: "daily-units" }, [varies((last.steady ? "Output per day: " : "Week 1 output per day: ") + perDay + ".")]));
    }
    const barren = last.cannotGrow || [];
    if (barren.length) {
      rootNode.append(el("div", { class: "callout warn", id: "fertility-warning" }, barren.map(function (ticker) {
        return el("p", {}, [cannotGrowWarning(ticker)]);
      })));
    }
    rootNode.append(el("p", {}, ["Same units, COGC, experts, workforce, and degradation. Only the price of each material changes."]));
    const grid = el("div", { class: "books" });
    if (average) {
      grid.append(bookCard(average, {
        root: "book-vwap",
        totalCost: "vwap-total-cost",
        goods: "vwap-goods",
        profit: "vwap-profit",
        dailyRevenue: "vwap-daily-revenue",
        dailyCost: "vwap-daily-cost",
        dailyProfit: "vwap-daily-profit",
        plannerNet: "vwap-planner-net",
        payback: "vwap-payback",
      }, vwapLabel, "The field is vwap_30d on exchange " + vwapMarket(cx) + ", in " + vwapCode + "."));
    } else {
      grid.append(el("section", { id: "book-vwap", class: "book", "data-currency": exchangeCurrency(cx) }, [
        el("h3", {}, [vwapLabel]),
        el("p", {}, [vwapBlock || bookError || vwapLabel + " could not be totaled in " + exchangeCurrency(cx) + " without using another currency."]),
      ]));
    }
    grid.append(bookCard(last, {
      root: "book-last",
      totalCost: "last-total-cost",
      goods: "last-goods",
      profit: "last-profit",
      dailyRevenue: "last-daily-revenue",
      dailyCost: "last-daily-cost",
      dailyProfit: "last-daily-profit",
      plannerNet: "last-planner-net",
      payback: "last-payback",
    }, lastLabel, "The Price field on the public FIO " + cx + " book, in " + lastCode + "."));
    rootNode.append(grid);
    rootNode.append(el("p", { class: "hint" }, ["Total cost is the build and the permit once, plus supplies and degradation for every week. Total goods value is the owed output. Daily cost is supplies plus degradation. Payback is that one-time build and permit divided by daily profit, the same shape as PRUNplanner’s ROI. The planner’s own revenue and cost are the net export: rations the base both makes and eats are left out of both. Here those rations sit in the goods and again in the supplies, so profit and payback are the ROI comparison, and goods and cost are each higher by those rations."]));
    const standIns = (priceRows || []).filter(function (row) { return row.lastStandIn; });
    const fallen = (priceRows || []).filter(function (row) { return row.fallback; });
    if (bookError || vwapBlock || fallen.length || standIns.length) {
      const lines = [];
      if (bookError) lines.push("The " + vwapLabel + " list did not load. " + bookError);
      if (vwapBlock) lines.push(vwapBlock);
      standIns.forEach(function (row) { lines.push(row.lastStandIn); });
      fallen.forEach(function (row) { lines.push(row.ticker + ": " + row.fallback); });
      rootNode.append(el("div", { class: "callout warn", id: "price-fallbacks" }, lines.map(function (line) {
        return el("p", {}, [line]);
      })));
    }
    rootNode.append(el("h2", {}, ["Prices"]));
    rootNode.append(el("p", { class: "hint" }, ["Every material in the build, the supplies, and the goods. " + lastLabel + " is in " + lastCode + ". " + vwapLabel + " is in " + vwapCode + ". Those two prices are not added together."]));
    if (priceRows && priceRows.length) rootNode.append(renderPriceTable(priceRows, cx));
  }

  function renderResult(bundle, extraNotes) {
    const result = bundle && bundle.last ? bundle.last : bundle;
    const average = bundle && bundle.average ? bundle.average : null;
    const priceRows = bundle && bundle.rows ? bundle.rows : [];
    const exchange = normalizeExchange(bundle && bundle.exchange);
    const lastLabel = lastTradeLabel(exchange);
    const vwapLabel = vwapColumnLabel(exchange);
    const vwapCode = (average && average.currency) || exchangeCurrency(exchange);
    const lastCode = (result && result.currency) || exchangeCurrency(exchange);
    const byTicker = {};
    priceRows.forEach(function (row) { byTicker[row.ticker] = row; });
    const rootNode = el("div", { class: "card", id: "result-block" });
    const notes = (result.notes || []).concat(extraNotes || []);

    rootNode.append(el("h2", {}, ["Result"]));
    if (bundle.capNotes && bundle.capNotes.length) {
      rootNode.append(el("div", { class: "callout warn", id: "cap-note" }, bundle.capNotes.map(function (line) {
        return el("p", {}, [line]);
      })));
    }
    efficiencyLines(result).forEach(function (line) {
      rootNode.append(el("p", {}, [varies(line.fact), line.rest || ""]));
    });
    if (result.pace === "zero") {
      rootNode.append(el("div", { class: "callout warn" }, [
        el("p", {}, ["A week of the owed goods is worth 0 " + lastCode + ". The table still lists the weeks you asked for."]),
      ]));
    }
    rootNode.append(el("p", {}, [weeksLabel(result.weeks)]));
    result.units.forEach(function (item) {
      rootNode.append(el("p", { class: "units" }, [formatQty(item.units) + " " + item.ticker]));
    });
    appendBooks(rootNode, result, average, priceRows, bundle.bookError || "", exchange, bundle.vwapBlock || "");
    rootNode.append(el("p", {}, [varies(bookOutcome(result, lastLabel))]));
    if (average) rootNode.append(el("p", {}, [varies(bookOutcome(average, vwapLabel))]));
    rootNode.append(el("h2", {}, ["Week by week, " + lastLabel]));
    rootNode.append(el("p", {}, ["The week table is the " + lastLabel + " only, in " + lastCode + ". Each cell is one number: units, supply cost, build cost, cumulative goods, cumulative cost, and cumulative profit. Week 1 pays the build and the permit once. Later weeks pay supplies and degradation only. " + vwapLabel + " stays on the totals above, in " + vwapCode + ", and is not added into this table."]));
    rootNode.append(renderSchedule(result.schedule, result.profitWeek, exchange, result.currency));
    let tableHint = "The table lists the weeks you asked for, up to 52. Supply cost is recipe inputs, workforce consumables, and building degradation, paid every week. Build cost is the buildings and the permit, paid in week 1 only. Cumulative goods, cumulative cost, and cumulative profit are running totals at the " + lastLabel + ".";
    if (result.otherCis > 0) tableHint += " Week 1 build cost also includes other CIS.";
    if (result.profitWeek) {
      tableHint += " A highlighted cell is the first week cumulative profit is zero or above.";
    }
    rootNode.append(el("p", { class: "hint" }, [tableHint]));
    rootNode.append(el("p", {}, ["The lines below are the " + lastLabel + ". " + vwapLabel + " totals are in the card above."]));
    appendBank(rootNode, result, true);
    result.units.forEach(function (item) {
      const when = formatWhen(item.timeMs);
      const sourceText = item.sources && item.sources.length ? item.sources.join(". ") + ". " : "";
      const priceRow = byTicker[item.ticker];
      const lineCode = priceRow && priceRow.crossFallback
        ? (priceRow.lastCurrency || lastCode)
        : lastCode;
      const vwapSentence = priceRow && priceRow.vwap != null
        ? " " + vwapSeriesName(priceRow, exchange) + " is " + formatMoney(priceRow.vwap, priceRow.vwapCurrency || vwapCode) + "."
        : priceRow && priceRow.fallback ? " " + priceRow.fallback : "";
      rootNode.append(el("p", {}, [el("strong", { class: "varies" }, [
        sourceText + "The recipe rate, before COGC, experts, and workforce efficiency, is " + formatQty(item.recipeWeeklyOutput) + " " + item.ticker + " a week. The owed share is " + formatQty(item.percent) + "% of the running output. Week 1 is " + formatQty(item.week1Owed) + " " + item.ticker + ". The last week is " + formatQty(item.endOwed) + " " + item.ticker + ". " + lastLabel + " ",
        priceAnchor(item.ticker, formatMoney(item.price, lineCode), (priceRow && priceRow.lastExchange) || exchange),
        when ? " at " + when + "." : ".",
        vwapSentence,
        " " + formatQty(item.units) + " " + item.ticker + " over the term × " + formatMoney(item.price, lineCode) + " = " + formatMoney(item.value, lineCode) + " at the last trade.",
      ])]));
    });

    rootNode.append(el("h2", {}, ["Buildings"]));
    if (result.core) {
      rootNode.append(el("p", { class: "hint" }, ["The building total includes the planet core, added once."]));
    }
    result.groups.forEach(function (group) {
      const seats = [];
      if (group.workers.pioneer) seats.push(formatQty(group.workers.pioneer) + " pioneers");
      if (group.workers.settler) seats.push(formatQty(group.workers.settler) + " settlers");
      if (group.workers.technician) seats.push(formatQty(group.workers.technician) + " technicians");
      if (group.workers.engineer) seats.push(formatQty(group.workers.engineer) + " engineers");
      if (group.workers.scientist) seats.push(formatQty(group.workers.scientist) + " scientists");
      if (group.cannotRun) {
        rootNode.append(el("div", { class: "callout err", role: "alert" }, [
          el("p", {}, [group.cannotRun]),
        ]));
      }
      rootNode.append(el("h3", {}, [group.ticker + " · " + group.name + " × " + formatQty(group.count)]));
      if (seats.length) rootNode.append(el("p", { class: "hint" }, [varies(seats.join(", "))]));
      if (group.recipes.length > 1) {
        const total = batchTimeMs(group.recipes);
        rootNode.append(el("p", {}, [formatQty(group.count) + " buildings share one queue. An order takes that recipe's cycle. More orders, or a longer cycle, take more of the week."]));
        group.recipes.forEach(function (recipe) {
          if (!(recipe.durationMs > 0) || !(total > 0)) return;
          const share = recipe.orders > 0 ? (recipe.durationMs * recipe.orders) / total : 0;
          rootNode.append(el("p", { class: "hint" }, [varies(recipe.name + ": " + formatQty(recipe.orders) + (recipe.orders === 1 ? " order is " : " orders are ") + formatQty(Math.round(share * 1000) / 10) + "% of the queue.")]));
        });
      }
      group.recipes.forEach(function (recipe) {
        if (recipe.resourceTicker) {
          rootNode.append(el("p", {}, [
            varies(formatQty(recipe.orders) + (recipe.orders === 1 ? " order names " : " orders name ") + recipe.resourceTicker + "."),
            " This count has no cycle amount for it.",
          ]));
        } else if (recipe.outputs.length) {
          const outs = recipe.outputs.map(function (output) { return formatQty(output.amount) + " " + output.ticker; }).join(", ");
          const weeklyOuts = (recipe.weeklyOutputs || []).filter(function (output) { return output.amount > 0; }).map(function (output) {
            return formatQty(output.amount) + " " + output.ticker;
          }).join(", ");
          const orderLabel = formatQty(recipe.orders) + (recipe.orders === 1 ? " order runs " : " orders run ");
          rootNode.append(el("p", {}, [varies(orderLabel + recipe.name + " (" + formatDuration(recipe.durationMs) + "), " + outs + " per cycle. At the recipe rate that is " + (weeklyOuts || "0") + " a week.")]));
        }
      });
      if (group.materials.length) rootNode.append(materialTable(group.materials, true, byTicker, exchange, result.currency));
      rootNode.append(el("p", {}, [varies("Subtotal " + cashOf(result, group.cost) + ".")]));
    });
    if (result.core) {
      rootNode.append(el("h3", {}, ["Planet core, once"]));
      rootNode.append(materialTable(result.core.materials, false, byTicker, exchange, result.currency));
      rootNode.append(el("p", {}, [varies("Core subtotal " + cashOf(result, result.core.cost) + ".")]));
    }
    if (result.extras) {
      rootNode.append(el("h3", {}, ["Extra materials, as typed"]));
      rootNode.append(materialTable(result.extras.materials, false, byTicker, exchange, result.currency));
      rootNode.append(el("p", {}, [varies("Extras subtotal " + cashOf(result, result.extras.cost) + ".")]));
    }
    rootNode.append(el("p", {}, [
      varies("Buildings total " + cashOf(result, result.buildingsCost) + "."),
      " This is the building part of the one-time amount above, not a second bill.",
    ]));

    rootNode.append(el("h2", {}, ["Permit"]));
    if (!result.permit) {
      rootNode.append(el("p", {}, ["No HQ level is set. The permit cost is zero."]));
    } else if (!result.permit.materials.length) {
      rootNode.append(el("p", {}, [result.permit.note || "This HQ level has no material row. The permit cost is zero."]));
    } else {
      rootNode.append(el("p", {}, [result.permit.note]));
      rootNode.append(materialTable(result.permit.materials, false, byTicker, exchange, result.currency));
      rootNode.append(el("p", {}, [varies("Permit total " + cashOf(result, result.permit.cost) + ".")]));
    }

    rootNode.append(el("h2", {}, ["Supplies"]));
    if (result.workers.pioneer > 0) {
      rootNode.append(el("p", {}, [
        varies("Pioneer seats: " + formatQty(result.workers.pioneer) + "."),
        " Consumables follow the housed headcount. 100 pioneers need 4 DW, 4 RAT, and 0.5 OVE a day, plus 0.2 PWO when luxury 1 is on and 0.5 COF when luxury 2 is on. A week of that is priced even when the base makes those goods.",
      ]));
    } else {
      rootNode.append(el("p", {}, ["These buildings have no pioneer seats, so the pioneer consumable line is zero."]));
    }
    (result.coverage || []).forEach(function (line) {
      rootNode.append(el("p", {}, [varies(line.note)]));
    });
    if (result.flowBasis === "plan") {
      rootNode.append(el("p", {}, ["Those sentences are the plan's own production, with that plan's experts, COGC, workforce, and fertility. Pioneer lines stay at the handbook amount."]));
    } else if (result.experts && (Math.abs(result.experts.factorStart - 1) > 1e-9 || Math.abs(result.experts.factorEnd - 1) > 1e-9)) {
      rootNode.append(el("p", {}, ["Those sentences are the FIO recipe rate. Pioneer lines stay at the handbook amount."]));
    }
    if (result.schedule && result.schedule.length) {
      const summed = {};
      const order = [];
      result.schedule.forEach(function (weekRow) {
        (weekRow.supplyLines || []).forEach(function (line) {
          if (!(line.amount > 0)) return;
          const key = (line.kind || "input") + "\n" + line.ticker;
          if (!summed[key]) {
            summed[key] = {
              ticker: line.ticker,
              amount: 0,
              price: line.price,
              cost: 0,
              kind: line.kind || "input",
              materialName: line.kind === "workforce" || line.kind === "pioneer" ? "Workforce" : "Recipe input",
            };
            order.push(key);
          }
          summed[key].amount += line.amount;
          summed[key].cost += line.cost;
        });
      });
      const termLines = order.map(function (key) { return summed[key]; });
      if (termLines.length) rootNode.append(materialTable(termLines, false, byTicker, exchange, result.currency, true));
      let purchaseCost = 0;
      termLines.forEach(function (line) { purchaseCost += line.cost; });
      rootNode.append(el("p", { id: "term-purchases" }, [varies("Purchases over the term " + cashOf(result, purchaseCost) + ".")]));
    } else if (result.weekly.length) {
      const weeklyLines = result.weekly.map(function (line) {
        const kind = line.kind === "pioneer" || line.kind === "workforce" ? "Workforce" : "Recipe input";
        const scaled = result.supplyScale == null ? line : scaleRecipeLine(line, result.supplyScale);
        return Object.assign({}, scaled, { materialName: kind });
      });
      rootNode.append(materialTable(weeklyLines, false, byTicker, exchange, result.currency, true));
    }
    const supplyTableNote = "The amounts above add each week's purchase. A material the base also makes is bought only in the weeks the recipes use more than that week produces, and that gap is in the purchase total. The amount is not the gross output times the number of weeks.";
    const supplyParts = supplyWeekParts(result);
    supplyParts.push(" " + supplyTableNote + " The cost column is the " + lastLabel + " in " + lastCode + ". " + vwapLabel + " is the other price, in " + vwapCode + ". The buildings and the permit are not in this table.");
    rootNode.append(el("p", {}, supplyParts));

    if (notes.length) {
      rootNode.append(el("h2", {}, ["Extra Notes"]));
      notes.forEach(function (note) {
        if (Array.isArray(note)) rootNode.append(el("p", {}, note));
        else rootNode.append(el("p", {}, [note]));
      });
    }
    rootNode.append(el("p", { class: "hint" }, ["Farms and orchards use fertility, 1 + fertility × 10/33. A fertility of −1 does not run."]));
    return rootNode;
  }

  function pieceRow(label, value, id) {
    return el("div", { class: "piece" }, [el("span", {}, [label]), el("strong", id ? { id: id } : {}, [value])]);
  }

  function attach(doc) {
    const form = doc.getElementById("calc-form");
    const rowsHost = doc.getElementById("building-rows");
    const status = doc.getElementById("status");
    const results = doc.getElementById("results");
    let busy = false;
    let counted = false;
    let planContext = null;
    let scrollLock = null;
    let planetResourceCache = null;
    let areaPermits = null;

    function captureScrollLock() {
      scrollLock = null;
      if (!results.childElementCount) return;
      const view = doc.defaultView;
      if (!view) return;
      const schedule = results.querySelector(".schedule-wrap");
      const plan = doc.querySelector(".plan-pane");
      scrollLock = {
        x: view.scrollX,
        y: view.scrollY,
        paneTop: results.scrollTop,
        paneLeft: results.scrollLeft,
        planTop: plan ? plan.scrollTop : 0,
        planLeft: plan ? plan.scrollLeft : 0,
        scheduleTop: schedule ? schedule.scrollTop : 0,
        scheduleLeft: schedule ? schedule.scrollLeft : 0,
      };
    }

    function applyScrollLock() {
      if (!scrollLock) return;
      const view = doc.defaultView;
      if (!view) return;
      const snap = scrollLock;
      view.scrollTo({ left: snap.x, top: snap.y, behavior: "instant" });
      results.scrollTop = snap.paneTop;
      results.scrollLeft = snap.paneLeft;
      const plan = doc.querySelector(".plan-pane");
      if (plan) {
        plan.scrollTop = snap.planTop;
        plan.scrollLeft = snap.planLeft;
      }
      const schedule = results.querySelector(".schedule-wrap");
      if (schedule) {
        schedule.scrollTop = snap.scheduleTop;
        schedule.scrollLeft = snap.scheduleLeft;
      }
    }

    function setStatus(text) { status.textContent = text || ""; }

    function paintArea() {
      const node = doc.getElementById("area-line");
      if (!node) return;
      const used = usedBuildingArea(readRows(), buildingCatalog);
      const planetNode = doc.getElementById("planet-id");
      const planetId = String(planetNode && planetNode.value || "").trim();
      if (!planetId) {
        node.classList.remove("over");
        node.textContent = "Area " + areaFigure(used) + "/limit";
        return;
      }
      const limit = baseAreaLimit(areaPermits);
      node.textContent = "Area " + areaFigure(used) + "/" + areaFigure(limit);
      node.classList.toggle("over", used > limit);
    }

    function readExchange() {
      const node = doc.getElementById("exchange");
      const cx = normalizeExchange(node ? node.value : "");
      if (node && node.value !== cx) node.value = cx;
      return cx;
    }

    function paintCogcNote(cogc) {
      const note = doc.getElementById("cogc-note");
      if (!note) return;
      const name = cogcName(cogc);
      note.textContent = name ? "Planet COGC is " + name + "." : "This plan has no planet COGC.";
    }

    function readCogc() {
      const select = doc.getElementById("cogc");
      if (!select) return "";
      return cogcProgram(select.value);
    }

    function setCogcSelect(value) {
      const select = doc.getElementById("cogc");
      if (!select) return "";
      const program = cogcProgram(value);
      if (!program) {
        select.value = "";
        return "";
      }
      let found = false;
      for (let i = 0; i < select.options.length; i += 1) {
        if (select.options[i].value === program) {
          found = true;
          break;
        }
      }
      if (!found) select.append(el("option", { value: program }, [cogcName(program) || program]));
      select.value = program;
      return program;
    }

    function showError(message) {
      results.replaceChildren(el("div", { class: "card" }, [
        el("div", { class: "callout err", role: "alert" }, message.split("\n").map(function (line) {
          return el("p", {}, [line]);
        })),
      ]));
    }

    function buildingFromRow(row) {
      const ticker = row.querySelector(".ticker");
      const value = ticker ? String(ticker.value || "").trim().toUpperCase() : "";
      return getBuilding(buildingCatalog, value);
    }

    function extractionTickers(building) {
      const kind = EXTRACTION[String(building && building.Ticker || "").toUpperCase()];
      if (!kind || !planetResourceCache || typeof planetResourceCache.forEach !== "function") return [];
      const found = [];
      planetResourceCache.forEach(function (row, name) {
        if (row && String(row.type || "").toUpperCase() === kind.type && /^[A-Z][A-Z0-9]{0,2}$/.test(name)) found.push(name);
      });
      found.sort();
      return found;
    }

    function fillRecipeSelect(select, building, selectedName, resource) {
      const selected = String(selectedName || "");
      const resourceTicker = String(resource || "").trim().toUpperCase();
      select.replaceChildren();
      select.append(el("option", { value: "" }, ["Select a recipe"]));
      const seen = { "": true };
      const recipes = building && building.Recipes ? building.Recipes : [];
      let hasExtraction = false;
      for (let i = 0; i < recipes.length; i += 1) {
        const name = recipes[i].RecipeName || "";
        const label = orderLabel(name, "");
        if (!label) {
          hasExtraction = true;
          continue;
        }
        if (seen[name]) continue;
        seen[name] = true;
        select.append(el("option", { value: name }, [label]));
      }
      if (hasExtraction) {
        const tickers = extractionTickers(building);
        if (/^[A-Z][A-Z0-9]{0,2}$/.test(resourceTicker) && tickers.indexOf(resourceTicker) < 0) tickers.push(resourceTicker);
        const selectedTicker = selected.trim().toUpperCase();
        if (/^[A-Z][A-Z0-9]{0,2}$/.test(selectedTicker) && tickers.indexOf(selectedTicker) < 0) tickers.push(selectedTicker);
        tickers.sort();
        for (let i = 0; i < tickers.length; i += 1) {
          const ticker = tickers[i];
          const label = orderLabel("", ticker);
          if (!label || seen[ticker]) continue;
          seen[ticker] = true;
          select.append(el("option", { value: ticker }, [label]));
        }
      }
      let value = selected;
      if (!orderLabel(selected, "") && /^[A-Z][A-Z0-9]{0,2}$/.test(resourceTicker)) value = resourceTicker;
      if (value && !seen[value]) {
        const label = orderLabel(value, resourceTicker);
        if (label) {
          seen[value] = true;
          select.append(el("option", { value: value }, [label]));
        }
      }
      select.value = seen[value] ? value : "";
    }

    function syncRecipeLine(line, select, building) {
      const value = select.value || "";
      if (value) line._recipeName = value;
      const buildingTicker = String(building && building.Ticker || "").toUpperCase();
      if (!EXTRACTION[buildingTicker]) return;
      const ticker = value.trim().toUpperCase();
      line._resource = /^[A-Z][A-Z0-9]{0,2}$/.test(ticker) ? ticker : "";
    }

    function refreshRecipeSelects() {
      Array.from(rowsHost.querySelectorAll(".building-row")).forEach(function (row) {
        const building = buildingFromRow(row);
        Array.from(row.querySelectorAll(".recipe-line")).forEach(function (line) {
          const select = line.querySelector(".recipe");
          if (!select) return;
          fillRecipeSelect(select, building, select.value || line._recipeName || "", line._resource || "");
          syncRecipeLine(line, select, building);
          line._owedOutputs = selectionOutputTickers(building, select.value || "", line._resource || "");
        });
      });
    }

    function collectRowOutputs(row) {
      const found = [];
      Array.from(row.querySelectorAll(".recipe-line")).forEach(function (line) {
        (line._owedOutputs || []).forEach(function (ticker) {
          const name = String(ticker || "").toUpperCase();
          if (name && found.indexOf(name) < 0) found.push(name);
        });
      });
      return found;
    }

    function syncOwedMaterials(addTickers, removeTickers) {
      const box = doc.getElementById("products");
      if (!box) return;
      let next = appendOwedText(box.value, addTickers || []);
      if (buildingCatalog && removeTickers && removeTickers.length) {
        const still = {};
        outputTickersFromRows(readRows(), buildingCatalog).forEach(function (ticker) { still[ticker] = true; });
        const drop = removeTickers.filter(function (ticker) {
          return !still[String(ticker || "").toUpperCase()];
        });
        next = stripOwedText(next, drop);
      }
      if (next !== box.value) box.value = next;
    }

    function createAddOrderButton(row) {
      const button = el("button", { type: "button", class: "secondary add-order" }, ["Add order"]);
      button.addEventListener("click", function () {
        const building = buildingFromRow(row);
        if (!showsOrderRows(building)) return;
        row.append(createRecipeLine(building, { recipeName: "", orders: 1, resource: "" }));
      });
      return button;
    }

    function placeAddOrderButton(row, building) {
      const existing = row.querySelector(".add-order");
      if (!showsOrderRows(building)) {
        if (existing) existing.remove();
        return;
      }
      if (existing) return;
      const button = createAddOrderButton(row);
      const line = row.querySelector(".recipe-line");
      if (line) row.insertBefore(button, line);
      else row.append(button);
    }

    function createRecipeLine(building, recipe) {
      const line = el("div", { class: "recipe-line" });
      const recipeName = recipe.recipeName || "";
      line._recipeName = recipeName;
      line._resource = recipe.resource || "";
      const orders = el("input", {
        class: "orders",
        type: "number",
        min: "0",
        step: "1",
        inputmode: "numeric",
        "aria-label": "Order count",
        value: recipe.orders == null ? "1" : String(recipe.orders),
      });
      const select = el("select", { class: "recipe", "aria-label": "Recipe" });
      fillRecipeSelect(select, building, recipeName, line._resource || "");
      syncRecipeLine(line, select, building);
      line._owedOutputs = selectionOutputTickers(building, select.value || "", line._resource || "");
      select.addEventListener("change", function () {
        const row = line.closest(".building-row");
        const current = buildingFromRow(row) || building;
        const previous = (line._owedOutputs || []).slice();
        syncRecipeLine(line, select, current);
        const next = selectionOutputTickers(current, select.value || "", line._resource || "");
        line._owedOutputs = next.slice();
        const removed = previous.filter(function (ticker) { return next.indexOf(ticker) < 0; });
        syncOwedMaterials(next, removed);
      });
      line.append(orders, select);
      return line;
    }

    function createRow(state) {
      const row = el("div", { class: "building-row" });
      const grid = el("div", { class: "cols" });
      const ticker = el("select", { class: "ticker", "aria-label": "Building" });
      fillBuildingSelect(ticker, state.ticker || "");
      const count = el("input", { class: "count", type: "number", min: "0", step: "1", inputmode: "numeric", "aria-label": "How many buildings", value: state.count == null ? "" : String(state.count) });
      count.addEventListener("input", paintArea);
      count.addEventListener("change", paintArea);
      const remove = el("button", { type: "button", class: "secondary" }, ["Remove"]);
      grid.append(ticker, count, remove);
      row.append(grid);
      const building = getBuilding(buildingCatalog, String(state.ticker || "").trim().toUpperCase());
      const recipes = Array.isArray(state.recipes) ? state.recipes.slice() : [];
      if (!recipes.length && (state.recipeName || state.resource)) {
        recipes.push({ recipeName: state.recipeName || "", orders: state.orders == null ? 1 : state.orders, resource: state.resource || "" });
      }
      placeAddOrderButton(row, building);
      recipes.forEach(function (recipe) { row.append(createRecipeLine(building, recipe)); });
      remove.addEventListener("click", function () {
        const produced = collectRowOutputs(row);
        row.remove();
        if (!rowsHost.children.length) rowsHost.append(createRow({}));
        paintArea();
        syncOwedMaterials([], produced);
      });
      ticker.addEventListener("change", function () {
        try {
          const produced = collectRowOutputs(row);
          Array.from(row.querySelectorAll(".recipe-line")).forEach(function (line) { line.remove(); });
          placeAddOrderButton(row, buildingFromRow(row));
          syncOwedMaterials([], produced);
        } finally {
          paintArea();
        }
      });
      return row;
    }

    function refreshBuildingSelects() {
      Array.from(rowsHost.querySelectorAll("select.ticker")).forEach(function (select) {
        fillBuildingSelect(select);
      });
    }

    function paintRows(states) {
      rowsHost.replaceChildren();
      const list = states && states.length ? states : [{}];
      list.forEach(function (state) { rowsHost.append(createRow(state)); });
      paintArea();
    }

    function readRows() {
      return Array.from(rowsHost.querySelectorAll(".building-row")).map(function (row) {
        return {
          ticker: row.querySelector(".ticker").value.trim().toUpperCase(),
          count: row.querySelector(".count").value,
          recipes: Array.from(row.querySelectorAll(".recipe-line")).map(function (line) {
            const select = line.querySelector(".recipe");
            const recipeName = select ? select.value : (line._recipeName || "");
            const sameRecipe = recipeName === (line._recipeName || "");
            return {
              recipeName: recipeName,
              orders: line.querySelector(".orders").value,
              resource: sameRecipe ? (line._resource || "") : "",
            };
          }),
        };
      }).filter(function (row) { return row.ticker; });
    }

    function feeNote(planet) {
      if (!planet) return "";
      const fee = Number(planet.EstablishmentFee);
      const currency = planet.CurrencyCode || "CIS";
      const name = planet.PlanetName ? planet.PlanetName + " (" + planet.PlanetNaturalId + ")" : planet.PlanetNaturalId;
      if (!Number.isFinite(fee)) return "";
      if (currency !== "CIS") {
        return "FIO lists an establishment fee of " + formatQty(fee) + " " + currency + " on " + name + ". This page adds cash only from the Other CIS field.";
      }
      return "FIO lists an establishment fee of " + formatCis(fee) + " on " + name + ". The first base on a planet is exempt. That fee is in this count only when you type it under Other CIS.";
    }

    function clampRange(node, floor, ceiling, clearFlag) {
      if (!node) return;
      const raw = String(node.value).trim();
      if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      if (n > ceiling || n < floor) {
        node.dataset.cappedFrom = raw;
        node.value = String(n > ceiling ? ceiling : floor);
      } else if (clearFlag) {
        delete node.dataset.cappedFrom;
      }
    }

    function clampFloor(node, floor, clearFlag) {
      if (!node) return;
      const raw = String(node.value).trim();
      if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      if (n < floor) {
        node.dataset.cappedFrom = raw;
        node.value = String(floor);
      } else if (clearFlag) {
        delete node.dataset.cappedFrom;
      }
    }

    function clampCaps(clearFlag) {
      clampRange(doc.getElementById("multiplier"), 0, 2, clearFlag);
      clampRange(doc.getElementById("weeks"), 1, MAX_TERM_WEEKS, clearFlag);
      clampFloor(doc.getElementById("hq-level"), 0, clearFlag);
      clampFloor(doc.getElementById("other-cis"), 0, clearFlag);
      readExchange();
    }

    async function onLoad() {
      const parsed = parsePlanId(doc.getElementById("plan-link").value);
      if (parsed.error) throw new Error(parsed.error);
      setStatus("Loading the shared plan…");
      const data = await fetchJson("https://api.prunplanner.org/planning/shared/" + parsed.id + "/");
      const details = data.plan_details;
      if (!details || details.plan_data == null) throw new Error("The shared plan has no plan data.");
      let planData = details.plan_data;
      if (typeof planData === "string") planData = JSON.parse(planData);
      setStatus("Loading the FIO building list…");
      const catalog = await loadBuildings();
      const built = rowsFromPlan(planData, catalog);
      if (built.errors.length) throw new Error(built.errors.join("\n"));
      paintRows(built.rows);
      const planetChecked = planetIdOrError(details.planet_natural_id || "");
      if (planetChecked.error) throw new Error(planetChecked.error);
      const planetId = planetChecked.id;
      doc.getElementById("planet-id").value = planetId;
      setCogcSelect(details.plan_cogc || "");
      areaPermits = details.plan_permits_used;
      paintArea();
      const expertPlan = planExpertCount(planData);
      const loadedCategories = runningExpertTypes(built.rows, catalog);
      const cappedExperts = capLoadedExperts(expertPlan.byType, loadedCategories);
      let outputs = outputTickersFromRows(built.rows, catalog);
      if (planetId && outputs.length) {
        setStatus("Loading planet " + planetId + "…");
        const planet = await fetchJson(FIO + "/planet/" + encodeURIComponent(planetId));
        const planetResources = await planetResourceMap(planet);
        planetResourceCache = planetResources;
        refreshRecipeSelects();
        const habitations = await loadHabitations();
        const probed = planBill({
          rows: built.rows,
          catalog: catalog,
          coreMaterials: coreFromPlanet(planet),
          extras: {},
          otherCis: 0,
          hq: { level: null, materials: null },
          owed: outputs.map(function (ticker) { return { ticker: ticker, percent: 100 }; }),
          buyAnyway: [],
          fromPlan: true,
          planet: planet,
          planetResources: planetResources,
          cogc: readCogc(),
          habitations: habitations,
          workforceLux: planWorkforceLux(planData),
          expertEndByType: cappedExperts.byType,
        });
        if (probed.error) throw new Error(probed.error);
        outputs = probed.bill.owed.map(function (item) { return item.ticker; });
      }
      doc.getElementById("products").value = outputs.length
        ? outputs.map(function (ticker) { return ticker + " 100"; }).join("\n")
        : "";
      results.replaceChildren();
      counted = false;
      planContext = {
        name: details.plan_name || parsed.id,
        planetId: planetId,
        permits: details.plan_permits_used,
        cogc: readCogc(),
        experts: expertPlan.parts.map(function (expert) { return expert.amount + " " + expert.type; }),
        expertCount: cappedExperts.count,
        expertsByType: expertPlan.byType,
        categories: loadedCategories,
        expertCapNote: cappedExperts.note,
        workforceLux: planWorkforceLux(planData),
        hints: built.hints,
        skipped: built.skipped,
      };
      const bits = ["Loaded " + planContext.name + (planetId ? " on " + planetId : "") + "."];
      if (outputs.length) bits.push("Owed materials are 100% of " + outputs.join(" and ") + ", the materials this plan makes more of than it uses.");
      else bits.push("This plan has no material it makes more of than it uses, so the owed list is empty.");
      if (cappedExperts.count > 0) {
        bits.push("The plan records " + describeExperts(cappedExperts.byType) + ".");
      }
      if (details.plan_permits_used != null) {
        bits.push("The plan records " + details.plan_permits_used + " permit slot. That count is not a price. The permit cost is the HQ level.");
      }
      const loadedCogc = cogcName(readCogc());
      if (loadedCogc) {
        bits.push("Planet COGC is " + loadedCogc + ".");
      } else {
        bits.push("This plan has no planet COGC.");
      }
      paintCogcNote(readCogc());
      bits.push.apply(bits, built.hints);
      bits.push.apply(bits, built.skipped);
      setStatus(bits.join(" "));
    }

    async function onCalculate() {
      const multiplierNode = doc.getElementById("multiplier");
      const multiplier = parseMultiplier(multiplierNode.dataset.cappedFrom || multiplierNode.value);
      delete multiplierNode.dataset.cappedFrom;
      if (multiplier.error) throw new Error(multiplier.error);
      if (multiplier.capped) multiplierNode.value = String(multiplier.multiplier);
      const hqNode = doc.getElementById("hq-level");
      const hq = parseHq(hqNode.value);
      if (hq.error) throw new Error(hq.error);
      hqNode.value = hq.level == null ? "0" : String(hq.level);
      const otherNode = doc.getElementById("other-cis");
      const other = parseOtherCis(otherNode.value);
      if (other.error) throw new Error(other.error);
      if (other.capped) otherNode.value = "0";
      const extras = parseExtras(doc.getElementById("extras").value);
      if (extras.error) throw new Error(extras.error);
      const buy = parseBuyAnyway(doc.getElementById("buy-anyway").value);
      if (buy.error) throw new Error(buy.error);
      const owed = parseOwed(doc.getElementById("products").value);
      if (owed.error) throw new Error(owed.error);
      const weeksNode = doc.getElementById("weeks");
      const weeks = parseWeeks(weeksNode.dataset.cappedFrom || weeksNode.value);
      delete weeksNode.dataset.cappedFrom;
      if (weeks.error) throw new Error(weeks.error);
      if (weeks.capped || String(weeksNode.value).trim() === "") weeksNode.value = String(weeks.weeks);

      setStatus("Loading the FIO building list…");
      const catalog = await loadBuildings();
      const rows = readRows();
      const categories = runningExpertTypes(rows, catalog);
      const planTypes = planContext && planContext.expertsByType ? planContext.expertsByType : null;
      const appliedExperts = planTypes && categories.length
        ? capLoadedExperts(planTypes, categories)
        : { count: 0, byType: {} };
      const startByType = {};
      categories.forEach(function (key) { startByType[key] = 0; });
      const ramp = expertRamp(0, appliedExperts.count);
      const planetChecked = planetIdOrError(doc.getElementById("planet-id").value);
      if (planetChecked.error) throw new Error(planetChecked.error);
      const planetId = planetChecked.id;
      doc.getElementById("planet-id").value = planetId;
      let coreMaterials = {};
      let planet = null;
      let planetResources = null;
      if (planetId) {
        setStatus("Loading planet " + planetId + "…");
        planet = await fetchJson(FIO + "/planet/" + encodeURIComponent(planetId));
        coreMaterials = coreFromPlanet(planet);
        planetResources = await planetResourceMap(planet);
        planetResourceCache = planetResources;
        refreshRecipeSelects();
      }

      setStatus("Loading habitation…");
      const habitations = await loadHabitations();
      const billInput = {
        rows: rows,
        catalog: catalog,
        coreMaterials: coreMaterials,
        extras: extras.extras,
        otherCis: other.otherCis,
        hq: hq,
        owed: owed.owed,
        buyAnyway: buy.buyAnyway,
        fromPlan: !!planContext,
        planet: planet,
        planetResources: planetResources,
        cogc: readCogc(),
        habitations: habitations,
        workforceLux: planContext ? planContext.workforceLux : null,
      };
      if (planTypes && categories.length) {
        billInput.expertEndByType = appliedExperts.byType;
        billInput.expertStartByType = startByType;
      }
      const prepared = planBill(billInput);
      if (prepared.error) throw new Error(prepared.error);

      const cx = readExchange();
      setStatus("Loading " + cx + " last trades and " + vwapColumnLabel(cx) + "…");
      const books = await fetchPriceBooks(prepared.bill.tickers, cx);
      const result = quote(prepared.bill, books.last, multiplier.multiplier, ramp, weeks.weeks);
      if (result.error) throw new Error(result.error);
      const averageQuote = quote(prepared.bill, books.average, multiplier.multiplier, ramp, weeks.weeks);
      const average = averageQuote.error ? null : averageQuote;
      const vwapBlock = averageQuote.error || "";

      const capNotes = [];
      if (multiplier.capped) capNotes.push(multiplierCapNote(multiplier.requested));

      const extraNotes = [];
      if (weeks.capped) {
        if (Number(weeks.requested) > MAX_TERM_WEEKS) {
          extraNotes.push("Weeks to run was " + weeks.requested + ". The table stops at 52 weeks.");
        } else {
          extraNotes.push("Weeks to run was " + weeks.requested + ". The table uses " + weeks.weeks + ".");
        }
      }
      if (!planetId) extraNotes.push("Planet id is blank, so the building bill has no planet core and no per-building planet materials.");
      if (planet) {
        const fee = feeNote(planet);
        if (fee) {
          const splitAt = fee.indexOf(". ");
          extraNotes.push(splitAt > 0
            ? [varies(fee.slice(0, splitAt + 1)), fee.slice(splitAt + 1)]
            : [varies(fee)]);
        }
        if (planet.Fertility != null && planet.Fertility !== "") {
          extraNotes.push([
            varies("Fertility on " + (planet.PlanetName || planetId) + " is " + formatQty(Number(planet.Fertility)) + "."),
            " Farms and orchards use 1 + fertility × 10/33. Other buildings ignore it.",
          ]);
        }
        extraNotes.push("Planet conditions add materials onto every building: rocky ground adds mineral construction granulate, and a cold planet adds insulation. Those are in the build. Production buildings also wear them in the daily degradation.");
      }
      if (planContext && planContext.experts.length && categories.length && appliedExperts.count > 0) {
        const split = describeExperts(appliedExperts.byType);
        extraNotes.push([
          varies("The loaded plan lists experts: " + planContext.experts.join(", ") + "."),
          " The count used on those buildings is " + split + ".",
        ]);
      }
      extraNotes.push("Each percent is the share of that output owed each week. Workforce food is its own supply line, including goods the base also makes.");
      results.replaceChildren(renderResult({
        last: result,
        average: average,
        rows: books.rows,
        bookError: books.bookError,
        vwapBlock: vwapBlock,
        exchange: cx,
        capNotes: capNotes,
      }, extraNotes));
      let done = "Counted from the " + cx + " last trade";
      if (result.currency) done += " in " + result.currency;
      done += " and from " + vwapColumnLabel(cx) + " in " + ((average && average.currency) || exchangeCurrency(cx)) + ".";
      if (appliedExperts.count > 0) done += " Experts in use are " + appliedExperts.count + ": " + describeExperts(appliedExperts.byType) + ".";
      if (multiplier.capped) done += " Profit multiplier is " + formatQty(multiplier.multiplier) + ".";
      setStatus(done);
      counted = true;
      if (scrollLock) applyScrollLock();
      else results.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function withBusy(fn) {
      if (busy) return;
      busy = true;
      captureScrollLock();
      const buttons = Array.from(doc.querySelectorAll("button"));
      const cogcSelect = doc.getElementById("cogc");
      buttons.forEach(function (button) { button.disabled = true; });
      if (cogcSelect) cogcSelect.disabled = true;
      applyScrollLock();
      try {
        await fn();
      } catch (error) {
        setStatus("");
        showError(error && error.message ? error.message : String(error));
      } finally {
        busy = false;
        buttons.forEach(function (button) { button.disabled = false; });
        if (cogcSelect) cogcSelect.disabled = false;
        applyScrollLock();
        const view = doc.defaultView;
        if (view && scrollLock) {
          view.requestAnimationFrame(function () {
            applyScrollLock();
            view.requestAnimationFrame(applyScrollLock);
          });
        }
      }
    }

    function applyFreshDefaults() {
      const values = {
        "hq-level": "0",
        multiplier: "1",
        weeks: "4",
      };
      Object.keys(values).forEach(function (id) {
        const node = doc.getElementById(id);
        if (node) node.value = values[id];
      });
      const exchange = doc.getElementById("exchange");
      if (exchange) exchange.value = DEFAULT_CX;
    }

    function applyPageQuery() {
      const view = doc.defaultView;
      if (!view || !view.location) return;
      const allowed = {};
      let params;
      try {
        params = new URLSearchParams(view.location.search);
      } catch (error) {
        return;
      }
      params.forEach(function (value, key) {
        if (!Object.prototype.hasOwnProperty.call(allowed, key)) return;
        const node = doc.getElementById(allowed[key]);
        if (!node || !("value" in node)) return;
        node.value = String(value);
      });
    }

    applyFreshDefaults();
    applyPageQuery();
    paintRows([{}]);
    rowsHost.addEventListener("input", paintArea);
    rowsHost.addEventListener("change", paintArea);
    rowsHost.addEventListener("click", function (event) {
      const target = event.target;
      if (target && target.closest && target.closest("button")) paintArea();
    });
    doc.getElementById("planet-id").addEventListener("input", paintArea);
    afterBuildingsLoaded = function () {
      refreshBuildingSelects();
      paintArea();
    };
    loadBuildings().then(function () {
      refreshBuildingSelects();
      paintArea();
    }).catch(function () {
      setStatus("The FIO building list did not load.");
    });
    ["multiplier", "weeks", "hq-level", "other-cis"].forEach(function (id) {
      const node = doc.getElementById(id);
      if (node) node.addEventListener("input", function () { clampCaps(true); });
    });
    doc.getElementById("exchange").addEventListener("change", readExchange);
    doc.getElementById("cogc").addEventListener("change", function () {
      const cogc = readCogc();
      if (planContext) planContext.cogc = cogc;
      paintCogcNote(cogc);
      if (counted) withBusy(onCalculate);
    });
    doc.getElementById("calculate").addEventListener("click", function () { clampCaps(false); }, true);
    form.addEventListener("keydown", function (event) {
      if (event.key === "Enter") clampCaps(false);
    }, true);
    doc.getElementById("load-plan").addEventListener("click", function () { withBusy(onLoad); });
    doc.getElementById("add-building").addEventListener("click", function () {
      rowsHost.append(createRow({}));
      if (!buildingMenu) {
        loadBuildings().then(function () {
          refreshBuildingSelects();
          paintArea();
        }).catch(function () {
          setStatus("The FIO building list did not load.");
        });
      } else {
        paintArea();
      }
    });
    doc.getElementById("plan-link").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        withBusy(onLoad);
      }
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      withBusy(onCalculate);
    });
  }

  return {
    HQ_LEVELS: HQ_LEVELS,
    parsePlanId: parsePlanId,
    parseOwed: parseOwed,
    parseExtras: parseExtras,
    parseHq: parseHq,
    parseMultiplier: parseMultiplier,
    resolveEndExperts: resolveEndExperts,
    capLoadedExperts: capLoadedExperts,
    runningExpertTypes: runningExpertTypes,
    describeExperts: describeExperts,
    formatMoney: formatMoney,
    priceBookCurrency: priceBookCurrency,
    parseExpertCount: parseExpertCount,
    parseWeeks: parseWeeks,
    planExpertCount: planExpertCount,
    planWorkforceLux: planWorkforceLux,
    planetSpecials: planetSpecials,
    workforceEfficiencyValue: workforceEfficiencyValue,
    partScale: partScale,
    expertFactor: expertFactor,
    expertUnlockDay: expertUnlockDay,
    expertCountAtWeek: expertCountAtWeek,
    expertRamp: expertRamp,
    factorAtWeek: factorAtWeek,
    MAX_TERM_WEEKS: MAX_TERM_WEEKS,
    solveTerm: solveTerm,
    permitMaterials: permitMaterials,
    linesFromPlan: linesFromPlan,
    rowsFromPlan: rowsFromPlan,
    outputTickersFromRows: outputTickersFromRows,
    planetResourceMap: planetResourceMap,
    resolveRecipe: resolveRecipe,
    orderLabel: orderLabel,
    planBill: planBill,
    quote: quote,
    ceilUnits: ceilUnits,
    fetchJson: fetchJson,
    fetchLastTrade: fetchLastTrade,
    fetchPrices: fetchPrices,
    fetchPriceBooks: fetchPriceBooks,
    loadUniverseVwap: loadUniverseVwap,
    loadBuildings: loadBuildings,
    coreFromPlanet: coreFromPlanet,
    attach: attach,
  };
});
