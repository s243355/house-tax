import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Camera, Image as ImageIcon, Plus, Trash2, Loader2, Utensils,
  Activity, TrendingDown, Target, Scale, ChevronLeft, AlertTriangle,
  Flame, Check, Pencil, Home, BarChart3, User,
  Dumbbell, RefreshCw, Sparkles,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  ReferenceLine, Tooltip, CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  設計 tokens                                                        */
/* ------------------------------------------------------------------ */
const C = {
  ink: "#171717",
  sub: "#6B6B6B",
  faint: "#9A9A94",
  line: "#ECEBE7",
  card: "#F7F6F3",
  bg: "#FFFFFF",
  cal: "#E8590C",     // 熱量 / 能量
  protein: "#3B7A57", // 蛋白質
  carbs: "#C98A1B",   // 澱粉
  fat: "#B0555A",     // 脂肪
  good: "#3B7A57",
  warn: "#C0392B",
};
const FONT =
  '"PingFang TC","Noto Sans TC","Helvetica Neue",system-ui,sans-serif';
const KCAL_PER_KG = 7700;
const PLAN_DAYS = 90;

/* ------------------------------------------------------------------ */
/*  工具函式                                                           */
/* ------------------------------------------------------------------ */
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const r0 = (n) => Math.round(n || 0);

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Mifflin-St Jeor
function bmrOf({ sex, weight, height, age }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}
const ACTIVITY = [
  { key: 1.2, label: "久坐(幾乎不運動)" },
  { key: 1.375, label: "輕度(每週運動1-3天)" },
  { key: 1.55, label: "中度(每週3-5天)" },
  { key: 1.725, label: "高度(每週6-7天)" },
];
const bmiOf = (w, h) => w / Math.pow(h / 100, 2);

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("讀取失敗"));
    r.readAsDataURL(file);
  });
}
function looseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(s, e + 1));
}

/* ---- Claude API 呼叫 ---- */
const API_URL = "https://api.anthropic.com/v1/messages";
const WEB_SEARCH = [{ type: "web_search_20250305", name: "web_search" }];

async function claudeBlocks(content, tools) {
  const body = { model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content }] };
  if (tools) body.tools = tools;
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return data.content.filter((i) => i.type === "text").map((i) => i.text);
}
function parseObj(blocks) {
  for (let i = blocks.length - 1; i >= 0; i--) { try { return looseJSON(blocks[i]); } catch {} }
  return looseJSON(blocks.join("\n"));
}
function parseArr(blocks) {
  for (let i = blocks.length - 1; i >= 0; i--) { try { return looseArr(blocks[i]); } catch {} }
  return looseArr(blocks.join("\n"));
}
const srcLabel = (s) => ({ label: "讀取營養標示", web: "網路查詢", estimate: "AI 估算" }[s] || "");

async function analyzeFood(base64, mediaType) {
  const blocks = await claudeBlocks([
    { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
    {
      type: "text",
      text:
        "你是營養分析助手,可用網路搜尋。判斷圖片並依序處理:" +
        "(1)若有營養標示表格,直接讀取熱量與蛋白質/碳水/脂肪,注意標示是每份或每100g,估算實際食用份量;" +
        "(2)若是包裝商品但無營養標示,辨識品名與品牌後上網搜尋該產品的營養資訊;" +
        "(3)若是無包裝食物,依外觀估算,多樣食物請加總。" +
        '最後只回傳 JSON:{"food_name":"品名","calories":數字,"protein":數字,"carbs":數字,"fat":數字,"portion":"份量說明","source":"label|web|estimate","note":"補充"}。單位為公克與大卡,用繁體中文。',
    },
  ], WEB_SEARCH);
  return parseObj(blocks);
}
async function analyzeExercise(base64, mediaType, weight) {
  const blocks = await claudeBlocks([
    { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
    {
      type: "text",
      text:
        `分析運動照片或運動App截圖。使用者體重約 ${weight} 公斤,據此估算消耗。` +
        '只回傳 JSON:{"activity":"運動類型(繁體中文)","duration_min":數字,"calories_burned":數字,"confidence":"high|medium|low"}。',
    },
  ]);
  return parseObj(blocks);
}
async function analyzeBodyComp(base64, mediaType) {
  const blocks = await claudeBlocks([
    { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
    {
      type: "text",
      text:
        "這是體脂計 App 的截圖。擷取畫面上的數據,沒有的欄位填 null。" +
        '只回傳 JSON:{"weight":數字,"body_fat":數字(體脂率%),"muscle_mass":數字(肌肉量kg),"bmi":數字,"visceral_fat":數字(內臟脂肪),"body_water":數字(體水分%),"bmr":數字(基礎代謝kcal)}。',
    },
  ]);
  return parseObj(blocks);
}
async function suggestMeal({ needProtein, calBudget, carbLeft, fatLeft }) {
  const blocks = await claudeBlocks([
    {
      type: "text",
      text:
        `使用者正在減重。今天還需補足蛋白質約 ${needProtein} 公克,熱量還剩約 ${calBudget} 大卡額度(澱粉還剩 ${carbLeft}g、脂肪還剩 ${fatLeft}g)。` +
        "請建議 3 個好補足的食物或簡單組合,以高蛋白、適中熱量、台灣方便取得為原則,盡量填滿蛋白質又不超過熱量額度。" +
        '只回傳 JSON 陣列:[{"name":"食物或組合","calories":數字,"protein":數字,"carbs":數字,"fat":數字,"note":"一句說明"}]。繁體中文。',
    },
  ]);
  return parseArr(blocks);
}
async function bodyCompAdvice({ current, previous, profile, plan }) {
  const blocks = await claudeBlocks([
    {
      type: "text",
      text:
        `使用者 90 天目標減 ${profile.targetLossKg} 公斤,每日建議攝取約 ${r0(plan.intakeTarget)} 大卡、蛋白質目標約 ${r0(plan.proteinTarget)} 公克。` +
        `最新身體數據:${JSON.stringify(current)}。` +
        (previous ? `上次數據:${JSON.stringify(previous)}。請比較體脂率與肌肉量的變化。` : "這是第一次紀錄。") +
        "給 2–3 條具體、可執行的建議,語氣正向務實,提醒別為求快犧牲肌肉。" +
        '只回傳 JSON 字串陣列,每項一句話:["建議1","建議2"]。繁體中文。',
    },
  ]);
  return parseArr(blocks);
}

/* ---- 連續達標天數 / 每週回顧 ---- */
function dailyMap(entries) {
  const m = {};
  entries.forEach((e) => {
    m[e.date] = m[e.date] || { eat: 0, burn: 0, foods: 0, protein: 0 };
    if (e.type === "food") { m[e.date].eat += e.calories; m[e.date].foods++; m[e.date].protein += e.protein; }
    else m[e.date].burn += e.burned;
  });
  return m;
}
function computeStreak(entries, profile, plan) {
  const m = dailyMap(entries);
  const hit = (d) => { const x = m[d]; return !!x && x.foods > 0 && plan.tdee - x.eat + x.burn >= plan.dailyDeficitNeeded; };
  let cur = 0, d = todayStr();
  if (!hit(d)) d = addDays(d, -1); // 今天還沒達標就先看昨天為止的連續紀錄
  while (hit(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0;
  for (let day = profile.startDate; new Date(day) <= new Date(todayStr()); day = addDays(day, 1)) {
    if (hit(day)) { run++; if (run > best) best = run; } else run = 0;
  }
  return { cur, best };
}
function weekStats(entries, weights, profile, plan) {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(todayStr(), -i));
  const m = dailyMap(entries);
  let eatSum = 0, defSum = 0, protSum = 0, burnSum = 0, loggedDays = 0, hitDays = 0;
  days.forEach((d) => {
    const x = m[d];
    if (x) burnSum += x.burn;
    if (x && x.foods > 0) {
      loggedDays++; eatSum += x.eat; protSum += x.protein;
      const def = plan.tdee - x.eat + x.burn; defSum += def;
      if (def >= plan.dailyDeficitNeeded) hitDays++;
    }
  });
  const sessCount = entries.filter((e) => e.type === "exercise" && days.includes(e.date)).length;
  const win = [...weights].filter((w) => days.includes(w.date)).sort((a, b) => new Date(a.date) - new Date(b.date));
  const wChange = win.length >= 2 ? win[win.length - 1].kg - win[0].kg : null;
  return {
    loggedDays, hitDays, sessCount, burnSum,
    avgEat: loggedDays ? eatSum / loggedDays : 0,
    avgDef: loggedDays ? defSum / loggedDays : 0,
    avgProt: loggedDays ? protSum / loggedDays : 0,
    wChange,
  };
}
async function weeklySummaryAI(stats, profile, plan) {
  const blocks = await claudeBlocks([{
    type: "text",
    text:
      `使用者 90 天目標減 ${profile.targetLossKg} 公斤。本週:有記錄 ${stats.loggedDays} 天、其中達標 ${stats.hitDays} 天;` +
      `平均每日攝取 ${r0(stats.avgEat)} 大卡、平均淨缺口 ${r0(stats.avgDef)} 大卡(每日目標 ${r0(plan.dailyDeficitNeeded)})、平均蛋白質 ${r0(stats.avgProt)} 公克;` +
      `運動 ${stats.sessCount} 次共消耗 ${r0(stats.burnSum)} 大卡;` +
      (stats.wChange != null ? `體重變化 ${stats.wChange.toFixed(1)} 公斤。` : "本週體重資料不足。") +
      "請用繁體中文寫 2–3 句本週總結,並給下週一個具體行動建議,語氣正向務實。只回傳純文字,不要 JSON 或標題。",
  }]);
  return blocks.join("\n").trim();
}

function WeeklyReview({ stats, profile, plan }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  async function gen() {
    setLoading(true);
    try { setText(await weeklySummaryAI(stats, profile, plan)); }
    catch { setText("本週 AI 回顧產生失敗,下面的數字仍可參考。"); }
    setLoading(false);
  }
  const cell = (label, val, color) => (
    <div style={{ flex: "1 1 30%", background: C.card, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || C.ink, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 5 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 24 }}>
      <SectionLabel>每週回顧(近 7 天)</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {cell("達標天數", `${stats.hitDays}/${stats.loggedDays || 0}`, C.good)}
        {cell("平均攝取", `${r0(stats.avgEat)}`, C.cal)}
        {cell("平均缺口", `${r0(stats.avgDef)}`, C.protein)}
        {cell("平均蛋白", `${r0(stats.avgProt)}g`, C.protein)}
        {cell("運動次數", `${stats.sessCount}`, C.ink)}
        {cell("體重變化", stats.wChange != null ? `${stats.wChange > 0 ? "+" : ""}${stats.wChange.toFixed(1)}kg` : "—", stats.wChange != null && stats.wChange < 0 ? C.good : C.ink)}
      </div>
      {text && <div style={{ background: C.card, borderRadius: 12, padding: 14, fontSize: 13.5, color: C.ink, lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{text}</div>}
      <Btn kind="primary" onClick={gen}>{loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={16} />} 產生本週 AI 回顧</Btn>
    </div>
  );
}

/* ---- 運動建議:器材、菜單庫、AI 產生 ---- */
const EQUIP = [
  { key: "stair", label: "踏步機" },
  { key: "treadmill", label: "跑步機" },
  { key: "spin", label: "飛輪" },
  { key: "trainer", label: "訓練台" },
  { key: "home", label: "徒手肌力" },
];
// met = 代謝當量;kcal/分 = met × 3.5 × 體重 / 200,會隨體重自動放大
const WORKOUTS = [
  { equip: "stair", name: "踏步機 間歇", type: "間歇", met: 11, howto: "熱身5分 →(快踏1分 / 慢步1分)交替 → 緩和", min: 20, max: 35 },
  { equip: "stair", name: "踏步機 穩定爬升", type: "穩定", met: 8, howto: "中等節奏維持,能講短句的強度,低衝擊護膝", min: 30, max: 55 },
  { equip: "treadmill", name: "坡度快走間歇", type: "間歇", met: 8.5, howto: "坡度8–10%快走2分 / 平地緩走1分,交替", min: 20, max: 35 },
  { equip: "treadmill", name: "慢跑 Zone2", type: "穩定", met: 8, howto: "能對話的配速穩定跑", min: 25, max: 50 },
  { equip: "spin", name: "飛輪 衝刺間歇", type: "間歇", met: 11, howto: "站姿全力30秒 / 坐姿輕踩90秒,交替8–10組", min: 20, max: 30 },
  { equip: "spin", name: "飛輪 耐力", type: "穩定", met: 7, howto: "輕鬆維持踩踏,全程能聊天", min: 35, max: 60 },
  { equip: "trainer", name: "訓練台 Zone2 長騎", type: "長時間", met: 7, howto: "邊看影片邊穩定踩,燃脂又不累(你的主場)", min: 50, max: 90 },
  { equip: "trainer", name: "訓練台 閾值間歇", type: "間歇", met: 10, howto: "接近吃力5–8分 / 緩踩3分,重複3–4組", min: 30, max: 45 },
  { equip: "home", name: "徒手肌力循環", type: "肌力", met: 5, howto: "深蹲 / 弓步 / 伏地挺身 / 核心,循環;減脂護肌肉", min: 15, max: 25 },
];

function looseArr(text) {
  const c = text.replace(/```json|```/g, "").trim();
  return JSON.parse(c.slice(c.indexOf("["), c.lastIndexOf("]") + 1));
}
async function suggestWorkoutsAI({ equipment, needKcal, weight, targetLossKg }) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content:
          `使用者正在減重,90天目標減 ${targetLossKg} 公斤。可用器材:${equipment.join("、")}。體重約 ${weight} 公斤。` +
          `今天還需透過運動消耗約 ${needKcal} 大卡,請據此給 3 種運動建議,消耗量加總接近目標。` +
          '只回傳 JSON 陣列不要其他文字:[{"name":"名稱","type":"間歇|穩定|長時間|肌力","duration_min":數字,"calories":數字,"howto":"一句話做法"}]。用繁體中文。',
      }],
    }),
  });
  const data = await resp.json();
  const text = data.content.filter((i) => i.type === "text").map((i) => i.text).join("\n");
  return looseArr(text);
}

/* ---- 持久化(window.storage,失敗則僅存記憶體) ---- */
const store = {
  async get(k) {
    try {
      const r = await window.storage?.get(k);
      return r ? JSON.parse(r.value) : null;
    } catch {
      return null;
    }
  },
  async set(k, v) {
    try {
      await window.storage?.set(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

/* ------------------------------------------------------------------ */
/*  小元件                                                             */
/* ------------------------------------------------------------------ */
function Ring({ value, max, size = 168, stroke = 14 }) {
  const rad = (size - stroke) / 2;
  const circ = 2 * Math.PI * rad;
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const over = value > max;
  const remain = r0(max - value);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={rad} fill="none"
          stroke={C.line} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={rad} fill="none"
          stroke={over ? C.warn : C.cal} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .5s ease" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 34, fontWeight: 700, color: over ? C.warn : C.ink, lineHeight: 1 }}>
          {Math.abs(remain)}
        </span>
        <span style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
          {over ? "超出 kcal" : "剩餘 kcal"}
        </span>
      </div>
    </div>
  );
}

function MacroBar({ label, val, target, color }) {
  const pct = target ? Math.min(100, (val / target) * 100) : 0;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: C.sub }}>{label}</span>
        <span style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>
          {r0(val)}<span style={{ color: C.faint, fontWeight: 400 }}>/{r0(target)}g</span>
        </span>
      </div>
      <div style={{ height: 6, background: C.line, borderRadius: 99 }}>
        <div style={{ height: 6, width: `${pct}%`, background: color, borderRadius: 99, transition: "width .4s" }} />
      </div>
    </div>
  );
}

/* 今天還剩 / 還要補 —— 一眼看清四個關鍵數字 */
function RemainingCard({ cal, protein, carbs, fat }) {
  const cells = [
    { label: "熱量", val: cal, unit: "kcal", color: C.cal, over: cal < 0, tag: cal < 0 ? "已超出" : "還可吃" },
    { label: "蛋白質", val: protein, unit: "g", color: C.protein, done: protein <= 0, tag: protein <= 0 ? "已達標" : "還要補" },
    { label: "澱粉", val: carbs, unit: "g", color: C.carbs, done: carbs <= 0, tag: carbs <= 0 ? "額度用完" : "還剩" },
    { label: "脂肪", val: fat, unit: "g", color: C.fat, done: fat <= 0, tag: fat <= 0 ? "額度用完" : "還剩" },
  ];
  return (
    <div style={{ background: C.card, borderRadius: 16, padding: "16px 4px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, padding: "0 14px 12px" }}>今天還剩 / 還要補</div>
      <div style={{ display: "flex" }}>
        {cells.map((c, i) => (
          <div key={c.label} style={{ flex: 1, textAlign: "center", borderLeft: i ? `1px solid ${C.line}` : "none" }}>
            <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 6 }}>{c.tag}</div>
            <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1, color: c.done ? C.good : c.over ? C.warn : c.color }}>
              {c.done ? "✓" : Math.abs(c.val)}
              {!c.done && <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 400 }}> {c.unit}</span>}
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.faint, textAlign: "center", marginTop: 12, padding: "0 14px" }}>
        蛋白質要「補到」目標;澱粉、脂肪是別超過的額度
      </div>
    </div>
  );
}

function Btn({ children, onClick, kind = "primary", style }) {
  const base = {
    border: "none", borderRadius: 12, padding: "13px 16px", fontSize: 15,
    fontWeight: 600, cursor: "pointer", fontFamily: FONT, width: "100%",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
  const kinds = {
    primary: { background: C.ink, color: "#fff" },
    accent: { background: C.cal, color: "#fff" },
    ghost: { background: C.card, color: C.ink, border: `1px solid ${C.line}` },
  };
  return <button onClick={onClick} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ fontSize: 13, color: C.sub, display: "block", marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle = {
  width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.line}`,
  fontSize: 15, fontFamily: FONT, background: C.bg, color: C.ink, boxSizing: "border-box",
};

/* ------------------------------------------------------------------ */
/*  個人資料 / 目標設定                                                */
/* ------------------------------------------------------------------ */
function ProfileForm({ initial, onSave }) {
  const [f, setF] = useState(
    initial || {
      sex: "male", age: 30, height: 170, startWeight: 75,
      activity: 1.375, startDate: todayStr(), targetLossKg: 10, dietDeficit: 500,
    }
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (k) => (e) => setF({ ...f, [k]: parseFloat(e.target.value) || 0 });

  const bmi = bmiOf(f.startWeight, f.height);
  const targetW = f.startWeight - f.targetLossKg;
  const targetBmi = bmiOf(targetW, f.height);
  const lowNow = bmi < 18.5;
  const lowTarget = targetBmi < 18.5;

  return (
    <div style={{ padding: "20px 18px 40px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: "6px 0 4px" }}>設定你的目標</h1>
      <p style={{ fontSize: 13, color: C.sub, margin: "0 0 20px" }}>用來計算每日熱量預算與運動目標。</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {["male", "female"].map((s) => (
          <button key={s} onClick={() => setF({ ...f, sex: s })}
            style={{
              flex: 1, padding: "11px", borderRadius: 10, fontSize: 15, fontFamily: FONT, cursor: "pointer",
              border: `1px solid ${f.sex === s ? C.ink : C.line}`,
              background: f.sex === s ? C.ink : C.bg, color: f.sex === s ? "#fff" : C.sub,
            }}>{s === "male" ? "男" : "女"}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="年齡"><input type="number" style={inputStyle} value={f.age} onChange={num("age")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="身高 cm"><input type="number" style={inputStyle} value={f.height} onChange={num("height")} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="目前體重 kg"><input type="number" style={inputStyle} value={f.startWeight} onChange={num("startWeight")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="想減重 kg"><input type="number" style={inputStyle} value={f.targetLossKg} onChange={num("targetLossKg")} /></Field></div>
      </div>

      <Field label="活動量">
        <select style={inputStyle} value={f.activity} onChange={num("activity")}>
          {ACTIVITY.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
      </Field>
      <Field label="開始日期">
        <input type="date" style={inputStyle} value={f.startDate} onChange={set("startDate")} />
      </Field>
      <Field label={`飲食缺口:每天少吃 ${f.dietDeficit} kcal(其餘靠運動補足)`}>
        <input type="range" min="300" max="750" step="50" value={f.dietDeficit}
          onChange={num("dietDeficit")} style={{ width: "100%", accentColor: C.cal }} />
      </Field>

      {(lowNow || lowTarget) && (
        <div style={{
          display: "flex", gap: 10, padding: 12, background: "#FBEEEE", borderRadius: 12,
          margin: "6px 0 16px", border: `1px solid #F0D5D5`,
        }}>
          <AlertTriangle size={18} color={C.warn} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: "#7A2E2E", lineHeight: 1.5 }}>
            {lowNow
              ? "你目前的 BMI 已偏低。建議先諮詢醫師或營養師,再決定是否減重。"
              : `減掉 ${f.targetLossKg} 公斤後 BMI 約 ${targetBmi.toFixed(1)},會低於健康標準(18.5)。建議把目標調整得溫和一些,或拉長時間。`}
          </span>
        </div>
      )}

      <Btn onClick={() => onSave(f)} kind="accent" style={{ marginTop: 4 }}>
        <Check size={18} /> 開始 {PLAN_DAYS} 天計畫
      </Btn>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  共用底部視窗                                                       */
/* ------------------------------------------------------------------ */
function Sheet({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: C.bg, width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: "18px 18px 28px", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <ChevronLeft size={22} color={C.sub} />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginLeft: 4 }}>{title}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
function Loading({ text }) {
  return (
    <div style={{ textAlign: "center", padding: "26px 0" }}>
      <Loader2 size={30} color={C.cal} style={{ animation: "spin 1s linear infinite" }} />
      <p style={{ fontSize: 14, color: C.sub, marginTop: 12 }}>{text}</p>
    </div>
  );
}
function MiniStat({ label, val }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{val}</div>
      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3 }}>{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  照剩餘幫我配餐                                                     */
/* ------------------------------------------------------------------ */
function MealSheet({ remaining, onAdd, onClose }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true); setErr("");
    try {
      const arr = await suggestMeal(remaining);
      setItems(arr.slice(0, 3));
    } catch {
      setErr("配餐建議暫時失敗,請稍後再試。");
      setItems([]);
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <Sheet title="照剩餘幫我配餐" onClose={onClose}>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 16 }}>
        還要補 <b style={{ color: C.protein }}>{remaining.needProtein}g</b> 蛋白質 · 還剩 <b style={{ color: C.cal }}>{remaining.calBudget}</b> kcal 額度
      </div>
      {loading ? <Loading text="AI 配餐中…" /> : err ? (
        <p style={{ fontSize: 13, color: C.warn }}>{err}</p>
      ) : (
        <>
          {items.map((m, i) => (
            <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{m.name}</div>
              <div style={{ display: "flex", gap: 12, margin: "8px 0", fontSize: 13, color: C.sub, flexWrap: "wrap" }}>
                <span>{r0(m.calories)} kcal</span>
                <span style={{ color: C.protein }}>蛋白 {r0(m.protein)}g</span>
                <span>碳 {r0(m.carbs)}g</span>
                <span>脂 {r0(m.fat)}g</span>
              </div>
              {m.note && <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 12, lineHeight: 1.5 }}>{m.note}</div>}
              <Btn kind="ghost" onClick={() => { onAdd({ id: uid(), date: todayStr(), type: "food", name: m.name, calories: r0(m.calories), protein: r0(m.protein), carbs: r0(m.carbs), fat: r0(m.fat) }); onClose(); }}>
                <Check size={16} /> 記錄這餐
              </Btn>
            </div>
          ))}
          <Btn kind="ghost" onClick={load} style={{ marginTop: 4 }}><RefreshCw size={16} /> 換一批</Btn>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  體脂 App 數據:拍照擷取 → 修正 → 即時建議                          */
/* ------------------------------------------------------------------ */
function fallbackTips(cur, prev) {
  const tips = [];
  if (prev && cur.body_fat != null && prev.body_fat != null) {
    const d = cur.body_fat - prev.body_fat;
    tips.push(d < 0 ? `體脂率下降 ${Math.abs(d).toFixed(1)}%,方向正確,維持這個節奏。` : `體脂率微升 ${d.toFixed(1)}%,檢視這幾天的熱量與睡眠。`);
  }
  if (prev && cur.muscle_mass != null && prev.muscle_mass != null) {
    const d = cur.muscle_mass - prev.muscle_mass;
    tips.push(d < 0 ? `肌肉量略降 ${Math.abs(d).toFixed(1)}kg,把蛋白質吃滿、每週安排一次肌力訓練。` : "肌肉量守住了,減脂同時保住肌肉做得很好。");
  }
  tips.push("每週固定同一時間、同條件量測,看長期趨勢比單日數字準。");
  return tips;
}
function BodyCompSheet({ profile, plan, previous, onSave, onClose }) {
  const [phase, setPhase] = useState("idle"); // idle | loading | edit | saving | advice
  const [preview, setPreview] = useState(null);
  const [d, setD] = useState({ weight: "", body_fat: "", muscle_mass: "", bmi: "", visceral_fat: "", body_water: "", bmr: "" });
  const [advice, setAdvice] = useState([]);
  const camRef = useRef(null);
  const libRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPhase("loading");
    try {
      const res = await analyzeBodyComp(await fileToBase64(file), file.type || "image/jpeg");
      setD({
        weight: res.weight ?? "", body_fat: res.body_fat ?? "", muscle_mass: res.muscle_mass ?? "",
        bmi: res.bmi ?? "", visceral_fat: res.visceral_fat ?? "", body_water: res.body_water ?? "", bmr: res.bmr ?? "",
      });
    } catch { /* 進入手動修正 */ }
    setPhase("edit");
  }
  async function save() {
    const rec = {
      date: todayStr(),
      weight: +d.weight || null, body_fat: +d.body_fat || null, muscle_mass: +d.muscle_mass || null,
      bmi: +d.bmi || null, visceral_fat: +d.visceral_fat || null, body_water: +d.body_water || null, bmr: +d.bmr || null,
    };
    setPhase("saving");
    let tips = [];
    try { tips = await bodyCompAdvice({ current: rec, previous, profile, plan }); } catch { tips = fallbackTips(rec, previous); }
    if (!tips || !tips.length) tips = fallbackTips(rec, previous);
    onSave(rec);
    setAdvice(tips.slice(0, 3));
    setPhase("advice");
  }
  const numField = (k, label, unit) => (
    <div style={{ flex: 1 }}>
      <Field label={unit ? `${label} ${unit}` : label}>
        <input type="number" style={inputStyle} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
      </Field>
    </div>
  );

  return (
    <Sheet title="體脂 App 數據" onClose={onClose}>
      {preview && <img src={preview} alt="" style={{ width: "100%", height: 170, objectFit: "cover", borderRadius: 14, marginBottom: 14 }} />}
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
      <input ref={libRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />

      {phase === "idle" && (
        <>
          <p style={{ fontSize: 13, color: C.sub, textAlign: "center", margin: "6px 0 18px" }}>拍體脂計 App 截圖,自動擷取數據,你再確認修正</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Btn kind="accent" onClick={() => camRef.current.click()}><Camera size={18} /> 拍照</Btn>
            <Btn kind="ghost" onClick={() => libRef.current.click()}><ImageIcon size={18} /> 從相簿選</Btn>
            <button onClick={() => setPhase("edit")} style={{ background: "none", border: "none", color: C.sub, fontSize: 13, cursor: "pointer", marginTop: 4, fontFamily: FONT }}>手動輸入</button>
          </div>
        </>
      )}
      {phase === "loading" && <Loading text="擷取數據中…" />}
      {phase === "edit" && (
        <>
          <p style={{ fontSize: 12.5, color: C.faint, margin: "0 0 12px" }}>確認或修正下列數字後儲存,只有的欄位會被記錄。</p>
          <div style={{ display: "flex", gap: 10 }}>{numField("weight", "體重", "kg")}{numField("body_fat", "體脂率", "%")}</div>
          <div style={{ display: "flex", gap: 10 }}>{numField("muscle_mass", "肌肉量", "kg")}{numField("bmi", "BMI", "")}</div>
          <div style={{ display: "flex", gap: 10 }}>{numField("visceral_fat", "內臟脂肪", "")}{numField("body_water", "體水分", "%")}</div>
          {numField("bmr", "基礎代謝 BMR", "kcal")}
          <Btn kind="accent" onClick={save} style={{ marginTop: 6 }}><Check size={18} /> 儲存並取得建議</Btn>
        </>
      )}
      {phase === "saving" && <Loading text="分析變化、產生建議…" />}
      {phase === "advice" && (
        <>
          <div style={{ background: C.card, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 12 }}>即時建議</div>
            {advice.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 9, marginBottom: i < advice.length - 1 ? 11 : 0 }}>
                <span style={{ color: C.good, flexShrink: 0, fontSize: 12, marginTop: 2 }}>●</span>
                <span style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>{t}</span>
              </div>
            ))}
          </div>
          <Btn kind="primary" onClick={onClose}><Check size={18} /> 完成</Btn>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  拍照分析(食物 / 運動共用)                                        */
/* ------------------------------------------------------------------ */
function CaptureSheet({ mode, profile, onAdd, onClose }) {
  const isFood = mode === "food";
  const [status, setStatus] = useState("idle"); // idle | loading | result | error | manual
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const camRef = useRef(null);
  const libRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStatus("loading");
    setErr("");
    try {
      const b64 = await fileToBase64(file);
      const mt = file.type || "image/jpeg";
      const res = isFood
        ? await analyzeFood(b64, mt)
        : await analyzeExercise(b64, mt, profile.startWeight);
      setResult(res);
      setStatus("result");
    } catch (e2) {
      setErr("照片分析失敗,可以改用手動輸入。");
      setStatus("manual");
    }
  }

  function confirm() {
    if (isFood) {
      onAdd({
        id: uid(), date: todayStr(), type: "food",
        name: result.food_name || "食物",
        calories: r0(result.calories), protein: r0(result.protein),
        carbs: r0(result.carbs), fat: r0(result.fat),
      });
    } else {
      onAdd({
        id: uid(), date: todayStr(), type: "exercise",
        name: result.activity || "運動",
        burned: r0(result.calories_burned), duration: r0(result.duration_min),
      });
    }
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: C.bg, width: "100%", borderRadius: "20px 20px 0 0", padding: "18px 18px 28px", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <ChevronLeft size={22} color={C.sub} />
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginLeft: 4 }}>
            {isFood ? "拍照記錄飲食" : "拍照記錄運動"}
          </span>
        </div>

        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
        <input ref={libRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />

        {preview && (
          <img src={preview} alt="" style={{ width: "100%", height: 190, objectFit: "cover", borderRadius: 14, marginBottom: 16 }} />
        )}

        {status === "idle" && (
          <>
            <p style={{ fontSize: 13, color: C.sub, textAlign: "center", margin: "6px 0 18px" }}>
              {isFood ? "拍下餐點,AI 幫你估算熱量與三大營養素" : "拍運動App截圖或現場照,估算消耗熱量"}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Btn onClick={() => camRef.current.click()} kind="accent"><Camera size={18} /> 拍照</Btn>
              <Btn onClick={() => libRef.current.click()} kind="ghost"><ImageIcon size={18} /> 從相簿選</Btn>
              <button onClick={() => setStatus("manual")} style={{ background: "none", border: "none", color: C.sub, fontSize: 13, cursor: "pointer", marginTop: 4, fontFamily: FONT }}>
                手動輸入
              </button>
            </div>
          </>
        )}

        {status === "loading" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Loader2 size={30} color={C.cal} className="spin" style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ fontSize: 14, color: C.sub, marginTop: 12 }}>{isFood ? "讀取標示 / 查詢 / 估算中…" : "AI 分析中…"}</p>
          </div>
        )}

        {status === "result" && result && isFood && (
          <ResultCard title={result.food_name} sub={[result.portion, srcLabel(result.source)].filter(Boolean).join(" · ")} confidence={result.confidence}
            rows={[["熱量", `${r0(result.calories)} kcal`], ["蛋白質", `${r0(result.protein)} g`], ["澱粉", `${r0(result.carbs)} g`], ["脂肪", `${r0(result.fat)} g`]]}
            onConfirm={confirm} onRetry={() => setStatus("idle")} onEdit={() => setStatus("manual")} />
        )}
        {status === "result" && result && !isFood && (
          <ResultCard title={result.activity} sub={`約 ${r0(result.duration_min)} 分鐘`} confidence={result.confidence}
            rows={[["消耗熱量", `${r0(result.calories_burned)} kcal`]]}
            onConfirm={confirm} onRetry={() => setStatus("idle")} onEdit={() => setStatus("manual")} />
        )}

        {status === "manual" && (
          <ManualForm isFood={isFood} err={err} init={result}
            onSubmit={(entry) => { onAdd(entry); onClose(); }} />
        )}
      </div>
    </div>
  );
}

function ResultCard({ title, sub, rows, confidence, onConfirm, onRetry, onEdit }) {
  const conf = { high: ["估算可信度高", C.good], medium: ["估算為概略值", C.carbs], low: ["照片較模糊,建議手動校正", C.warn] }[confidence] || ["", C.sub];
  return (
    <div>
      <div style={{ background: C.card, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>{sub}</div>}
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
              <span style={{ color: C.sub }}>{k}</span>
              <span style={{ color: C.ink, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
        {conf[0] && <div style={{ fontSize: 12, color: conf[1], marginTop: 12 }}>● {conf[0]}</div>}
      </div>
      <Btn onClick={onConfirm} kind="accent" style={{ marginBottom: 8 }}><Check size={18} /> 加入紀錄</Btn>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={onRetry} kind="ghost"><Camera size={16} /> 重拍</Btn>
        <Btn onClick={onEdit} kind="ghost"><Pencil size={16} /> 微調數字</Btn>
      </div>
    </div>
  );
}

function ManualForm({ isFood, onSubmit, err, init }) {
  const [v, setV] = useState(
    isFood
      ? { name: init?.food_name || "", calories: r0(init?.calories) || "", protein: r0(init?.protein) || "", carbs: r0(init?.carbs) || "", fat: r0(init?.fat) || "" }
      : { name: init?.activity || "", burned: r0(init?.calories_burned) || "", duration: r0(init?.duration_min) || "" }
  );
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  function submit() {
    if (isFood) onSubmit({ id: uid(), date: todayStr(), type: "food", name: v.name || "食物", calories: +v.calories || 0, protein: +v.protein || 0, carbs: +v.carbs || 0, fat: +v.fat || 0 });
    else onSubmit({ id: uid(), date: todayStr(), type: "exercise", name: v.name || "運動", burned: +v.burned || 0, duration: +v.duration || 0 });
  }
  return (
    <div>
      {err && <p style={{ fontSize: 13, color: C.warn, margin: "0 0 12px" }}>{err}</p>}
      <Field label={isFood ? "食物名稱" : "運動類型"}><input style={inputStyle} value={v.name} onChange={set("name")} /></Field>
      {isFood ? (
        <>
          <Field label="熱量 kcal"><input type="number" style={inputStyle} value={v.calories} onChange={set("calories")} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="蛋白質 g"><input type="number" style={inputStyle} value={v.protein} onChange={set("protein")} /></Field></div>
            <div style={{ flex: 1 }}><Field label="澱粉 g"><input type="number" style={inputStyle} value={v.carbs} onChange={set("carbs")} /></Field></div>
            <div style={{ flex: 1 }}><Field label="脂肪 g"><input type="number" style={inputStyle} value={v.fat} onChange={set("fat")} /></Field></div>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="消耗 kcal"><input type="number" style={inputStyle} value={v.burned} onChange={set("burned")} /></Field></div>
          <div style={{ flex: 1 }}><Field label="分鐘"><input type="number" style={inputStyle} value={v.duration} onChange={set("duration")} /></Field></div>
        </div>
      )}
      <Btn onClick={submit} kind="accent" style={{ marginTop: 4 }}><Check size={18} /> 加入紀錄</Btn>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  今天                                                               */
/* ------------------------------------------------------------------ */
function Today({ profile, entries, plan, onRemove, openSheet, openMeal, streak }) {
  const today = todayStr();
  const todays = entries.filter((e) => e.date === today);
  const foods = todays.filter((e) => e.type === "food");
  const exs = todays.filter((e) => e.type === "exercise");

  const consumed = foods.reduce((s, e) => s + e.calories, 0);
  const burned = exs.reduce((s, e) => s + e.burned, 0);
  const protein = foods.reduce((s, e) => s + e.protein, 0);
  const carbs = foods.reduce((s, e) => s + e.carbs, 0);
  const fat = foods.reduce((s, e) => s + e.fat, 0);

  const budget = plan.intakeTarget + burned; // 運動可換回一些額度
  const netDeficit = r0(plan.tdee - consumed + burned);

  const dayNo = Math.max(1, daysBetween(profile.startDate, today) + 1);

  return (
    <div style={{ padding: "8px 18px 96px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 0 16px" }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 700, color: C.ink }}>第 {dayNo} 天</div>
          <div style={{ fontSize: 13, color: C.sub }}>{fmtDate(today)} · 目標剩 {Math.max(0, PLAN_DAYS - dayNo)} 天</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 21, fontWeight: 700, color: netDeficit >= plan.dailyDeficitNeeded ? C.good : C.cal }}>{netDeficit}</div>
          <div style={{ fontSize: 12, color: C.sub }}>今日缺口/目標 {r0(plan.dailyDeficitNeeded)}</div>
        </div>
      </div>

      {(streak.cur > 0 || streak.best > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
          <Flame size={18} color={C.cal} />
          <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>連續達標 {streak.cur} 天</span>
          {streak.best > 0 && <span style={{ fontSize: 12.5, color: C.faint, marginLeft: "auto" }}>最佳 {streak.best} 天</span>}
        </div>
      )}

      {/* Ring + macros */}
      <div style={{ background: C.card, borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 14 }}>
        <Ring value={consumed} max={budget} />
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12.5, color: C.sub }}>
          <span><Flame size={12} color={C.cal} style={{ verticalAlign: -1 }} /> 吃 {consumed}</span>
          <span><Activity size={12} color={C.protein} style={{ verticalAlign: -1 }} /> 動 {burned}</span>
          <span>額度 {r0(budget)}</span>
        </div>
        <div style={{ display: "flex", gap: 14, width: "100%", marginTop: 18 }}>
          <MacroBar label="蛋白質" val={protein} target={plan.proteinTarget} color={C.protein} />
          <MacroBar label="澱粉" val={carbs} target={plan.carbTarget} color={C.carbs} />
          <MacroBar label="脂肪" val={fat} target={plan.fatTarget} color={C.fat} />
        </div>
      </div>

      {/* 今天還剩 / 還要補 */}
      <RemainingCard
        cal={r0(budget - consumed)}
        protein={Math.max(0, r0(plan.proteinTarget - protein))}
        carbs={Math.max(0, r0(plan.carbTarget - carbs))}
        fat={Math.max(0, r0(plan.fatTarget - fat))}
      />

      <Btn kind="ghost" onClick={() => openMeal({
        needProtein: Math.max(0, r0(plan.proteinTarget - protein)),
        calBudget: Math.max(0, r0(budget - consumed)),
        carbLeft: Math.max(0, r0(plan.carbTarget - carbs)),
        fatLeft: Math.max(0, r0(plan.fatTarget - fat)),
      })} style={{ marginBottom: 20 }}>
        <Sparkles size={16} /> 照剩餘幫我配餐
      </Btn>

      {/* 動作 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <Btn onClick={() => openSheet("food")} kind="accent"><Utensils size={17} /> 記錄飲食</Btn>
        <Btn onClick={() => openSheet("exercise")} kind="primary"><Activity size={17} /> 記錄運動</Btn>
      </div>

      {/* 清單 */}
      {todays.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: C.faint, fontSize: 14 }}>
          今天還沒有紀錄,拍一張開始吧。
        </div>
      ) : (
        <>
          {foods.length > 0 && <SectionLabel>飲食</SectionLabel>}
          {foods.map((e) => (
            <LogRow key={e.id} left={e.name} sub={`P${e.protein} · C${e.carbs} · F${e.fat}`}
              right={`${e.calories} kcal`} rightColor={C.cal} onRemove={() => onRemove(e.id)} />
          ))}
          {exs.length > 0 && <SectionLabel>運動</SectionLabel>}
          {exs.map((e) => (
            <LogRow key={e.id} left={e.name} sub={e.duration ? `${e.duration} 分鐘` : ""}
              right={`-${e.burned} kcal`} rightColor={C.good} onRemove={() => onRemove(e.id)} />
          ))}
        </>
      )}
    </div>
  );
}
const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, margin: "16px 0 8px" }}>{children}</div>
);
function LogRow({ left, sub, right, rightColor, onRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, color: C.ink, fontWeight: 500 }}>{left}</div>
        {sub && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: rightColor, marginRight: 12 }}>{right}</div>
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
        <Trash2 size={16} color={C.faint} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  進度                                                               */
/* ------------------------------------------------------------------ */
function Progress({ profile, entries, weights, plan, onAddWeight, bodyComp, openBodyComp }) {
  const [w, setW] = useState("");
  const today = todayStr();

  // 每日淨缺口
  const byDay = {};
  entries.forEach((e) => {
    byDay[e.date] = byDay[e.date] || { eat: 0, burn: 0 };
    if (e.type === "food") byDay[e.date].eat += e.calories;
    else byDay[e.date].burn += e.burned;
  });
  const dayKeys = Object.keys(byDay).sort();
  const deficitData = dayKeys.slice(-14).map((d) => ({
    date: fmtDate(d),
    缺口: r0(plan.tdee - byDay[d].eat + byDay[d].burn),
  }));

  const loggedDays = dayKeys.length;
  const avgDeficit = loggedDays
    ? dayKeys.reduce((s, d) => s + (plan.tdee - byDay[d].eat + byDay[d].burn), 0) / loggedDays
    : 0;
  const projectedLoss = (avgDeficit * PLAN_DAYS) / KCAL_PER_KG;

  // 體重曲線
  const allW = [{ date: profile.startDate, kg: profile.startWeight }, ...weights]
    .filter((x) => x.kg)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const wData = allW.map((x) => ({ date: fmtDate(x.date), kg: x.kg }));
  const latest = allW[allW.length - 1]?.kg ?? profile.startWeight;
  const lost = profile.startWeight - latest;
  const targetW = profile.startWeight - profile.targetLossKg;

  return (
    <div style={{ padding: "8px 18px 96px" }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: C.ink, margin: "12px 0 16px" }}>進度</h1>

      {/* 三個關鍵數字 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <Stat icon={<Scale size={16} color={C.ink} />} label="已減" val={`${lost.toFixed(1)}`} unit="kg" />
        <Stat icon={<Target size={16} color={C.cal} />} label="目標" val={`${profile.targetLossKg}`} unit="kg" />
        <Stat icon={<TrendingDown size={16} color={C.good} />} label="預估達成" val={projectedLoss > 0 ? projectedLoss.toFixed(1) : "0"} unit="kg" />
      </div>

      {/* 身體組成 */}
      <SectionLabel>身體組成</SectionLabel>
      {(() => {
        const bc = [...(bodyComp || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
        const latest = bc[bc.length - 1];
        const fatData = bc.filter((x) => x.body_fat != null).map((x) => ({ date: fmtDate(x.date), 體脂: x.body_fat }));
        return (
          <div style={{ background: C.card, borderRadius: 16, padding: 16, marginBottom: 22 }}>
            {latest ? (
              <div style={{ display: "flex", gap: 10, marginBottom: fatData.length > 1 ? 14 : 4 }}>
                <MiniStat label="體脂率" val={latest.body_fat != null ? `${latest.body_fat}%` : "—"} />
                <MiniStat label="肌肉量" val={latest.muscle_mass != null ? `${latest.muscle_mass}kg` : "—"} />
                <MiniStat label="內臟脂肪" val={latest.visceral_fat != null ? latest.visceral_fat : "—"} />
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.faint, textAlign: "center", padding: "6px 0 14px" }}>還沒有體脂數據,拍一張截圖開始追蹤</div>
            )}
            {fatData.length > 1 && (
              <div style={{ height: 130, marginBottom: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fatData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.faint }} axisLine={false} tickLine={false} />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10, fill: C.faint }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12 }} />
                    <Line type="monotone" dataKey="體脂" stroke={C.fat} strokeWidth={2.5} dot={{ r: 3, fill: C.fat }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <Btn kind="ghost" onClick={openBodyComp}><Camera size={16} /> 拍體脂 App 截圖 / 更新</Btn>
          </div>
        );
      })()}

      {/* 預測句 */}
      <div style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 20, fontSize: 13.5, color: C.sub, lineHeight: 1.6 }}>
        {loggedDays < 2 ? (
          "累積 2 天以上紀錄後,這裡會依你的實際平均缺口,推算能不能如期達標。"
        ) : projectedLoss >= profile.targetLossKg ? (
          <>照目前平均每天 <b style={{ color: C.good }}>{r0(avgDeficit)}</b> kcal 缺口,90 天約可減 <b style={{ color: C.good }}>{projectedLoss.toFixed(1)}</b> kg — <b style={{ color: C.good }}>可望達標</b>,穩住節奏。</>
        ) : (
          <>照目前平均每天 <b style={{ color: C.cal }}>{r0(avgDeficit)}</b> kcal 缺口,90 天約減 <b style={{ color: C.cal }}>{projectedLoss.toFixed(1)}</b> kg,離目標還差 {(profile.targetLossKg - projectedLoss).toFixed(1)} kg。每天再多動或少吃約 {r0((plan.dailyDeficitNeeded - avgDeficit))} kcal 就能補上。</>
        )}
      </div>

      {/* 每週回顧 */}
      <WeeklyReview stats={weekStats(entries, weights, profile, plan)} profile={profile} plan={plan} />

      {/* 體重圖 */}
      <SectionLabel>體重趨勢</SectionLabel>
      <div style={{ height: 180, marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={wData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={C.line} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
            <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12 }} />
            <ReferenceLine y={targetW} stroke={C.good} strokeDasharray="4 4" label={{ value: `目標 ${targetW}`, fontSize: 10, fill: C.good, position: "insideBottomRight" }} />
            <Line type="monotone" dataKey="kg" stroke={C.ink} strokeWidth={2.5} dot={{ r: 3, fill: C.ink }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input type="number" placeholder="今天體重 kg" value={w} onChange={(e) => setW(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <button onClick={() => { if (+w) { onAddWeight({ date: today, kg: +w }); setW(""); } }}
          style={{ background: C.ink, color: "#fff", border: "none", borderRadius: 10, padding: "0 20px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
          記錄
        </button>
      </div>

      {/* 缺口圖 */}
      <SectionLabel>近 14 天每日淨缺口</SectionLabel>
      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={deficitData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={C.line} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.faint }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12 }} cursor={{ fill: C.card }} />
            <ReferenceLine y={plan.dailyDeficitNeeded} stroke={C.cal} strokeDasharray="4 4" />
            <Bar dataKey="缺口" fill={C.protein} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>橘色虛線為每日目標缺口 {r0(plan.dailyDeficitNeeded)} kcal。</p>
    </div>
  );
}
function Stat({ icon, label, val, unit }) {
  return (
    <div style={{ flex: 1, background: C.card, borderRadius: 14, padding: "14px 12px" }}>
      <div style={{ marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{val}<span style={{ fontSize: 12, color: C.sub, fontWeight: 400 }}> {unit}</span></div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  我的                                                               */
/* ------------------------------------------------------------------ */
function Me({ profile, plan, onEdit }) {
  return (
    <div style={{ padding: "8px 18px 96px" }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: C.ink, margin: "12px 0 16px" }}>我的計畫</h1>
      <div style={{ background: C.card, borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <PlanRow k="基礎代謝 BMR" v={`${r0(plan.bmr)} kcal`} />
        <PlanRow k="每日總消耗 TDEE" v={`${r0(plan.tdee)} kcal`} />
        <PlanRow k="每日建議攝取" v={`${r0(plan.intakeTarget)} kcal`} hi />
        <PlanRow k="每日運動目標" v={`${r0(plan.exerciseTarget)} kcal`} />
        <PlanRow k="每日目標總缺口" v={`${r0(plan.dailyDeficitNeeded)} kcal`} />
        <div style={{ height: 1, background: C.line, margin: "10px 0" }} />
        <PlanRow k="建議蛋白質" v={`${r0(plan.proteinTarget)} g`} />
        <PlanRow k="建議澱粉" v={`${r0(plan.carbTarget)} g`} />
        <PlanRow k="建議脂肪" v={`${r0(plan.fatTarget)} g`} />
      </div>

      {plan.tooAggressive && (
        <div style={{ display: "flex", gap: 10, padding: 12, background: "#FBEEEE", borderRadius: 12, marginBottom: 16, border: `1px solid #F0D5D5` }}>
          <AlertTriangle size={18} color={C.warn} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: "#7A2E2E", lineHeight: 1.5 }}>
            建議攝取已被拉到基礎代謝的下限。這個目標偏積極,若感到疲勞、頭暈或情緒低落,請放慢速度或諮詢專業。
          </span>
        </div>
      )}

      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.7, marginBottom: 18 }}>
        拍照估算為概略值(通常誤差 ±20-30%),請把它當作趨勢參考而非精確數字。體重會隨水分波動,建議每週固定時間量一次、看長期曲線。若有慢性病或特殊狀況,開始前請先諮詢醫師或營養師。
      </div>

      <Btn onClick={onEdit} kind="ghost"><Pencil size={16} /> 修改個人資料與目標</Btn>
    </div>
  );
}
function PlanRow({ k, v, hi }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0" }}>
      <span style={{ fontSize: 14, color: C.sub }}>{k}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: hi ? C.cal : C.ink }}>{v}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  運動建議                                                           */
/* ------------------------------------------------------------------ */
function Suggest({ profile, entries, plan, weight, onAdd, onUpdateProfile, openSheet }) {
  const equipment =
    profile.equipment && profile.equipment.length
      ? profile.equipment
      : ["stair", "treadmill", "spin", "trainer"];
  const today = todayStr();
  const burnedToday = entries
    .filter((e) => e.date === today && e.type === "exercise")
    .reduce((s, e) => s + e.burned, 0);
  const need = Math.max(0, r0(plan.exerciseTarget - burnedToday));

  const [items, setItems] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");

  const poolKey = equipment.join(",");
  const pool = useMemo(() => WORKOUTS.filter((w) => equipment.includes(w.equip)), [poolKey]);

  const buildLocal = () => {
    const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
    return picks.map((w) => {
      const perMin = (w.met * 3.5 * weight) / 200;
      let mins = need > 0 ? need / perMin : (w.min + w.max) / 2;
      mins = Math.min(w.max, Math.max(w.min, mins));
      mins = Math.round(mins / 5) * 5;
      return { name: w.name, type: w.type, duration_min: mins, calories: Math.round(perMin * mins), howto: w.howto };
    });
  };

  useEffect(() => { setItems(buildLocal()); /* eslint-disable-next-line */ }, [poolKey, need]);

  async function aiSuggest() {
    setAiLoading(true); setAiErr("");
    try {
      const labels = equipment.map((k) => (EQUIP.find((e) => e.key === k) || {}).label).filter(Boolean);
      const arr = await suggestWorkoutsAI({ equipment: labels, needKcal: need || 300, weight, targetLossKg: profile.targetLossKg });
      const norm = arr.slice(0, 3).map((x) => ({
        name: x.name, type: x.type || "", duration_min: r0(x.duration_min), calories: r0(x.calories), howto: x.howto || "",
      }));
      if (norm.length) setItems(norm);
    } catch {
      setAiErr("AI 一時想不出來,先給你一組現成的。");
      setItems(buildLocal());
    }
    setAiLoading(false);
  }

  const toggleEquip = (k) => {
    const next = equipment.includes(k) ? equipment.filter((x) => x !== k) : [...equipment, k];
    if (next.length) onUpdateProfile({ equipment: next });
  };

  const typeColor = { 間歇: C.cal, 穩定: C.protein, 長時間: C.carbs, 肌力: C.fat };

  return (
    <div style={{ padding: "8px 18px 96px" }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: C.ink, margin: "12px 0 4px" }}>運動建議</h1>
      <p style={{ fontSize: 13, color: C.sub, margin: "0 0 16px" }}>依你的器材和今天還缺的消耗,給你可以直接照做的菜單。</p>

      <div style={{ background: C.card, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
        {need > 0 ? (
          <div style={{ fontSize: 14, color: C.sub }}>今天還需運動消耗約 <b style={{ fontSize: 20, color: C.cal }}>{need}</b> kcal</div>
        ) : (
          <div style={{ fontSize: 14, color: C.good, fontWeight: 600 }}>✓ 今日運動目標已達成,下面是想加碼時的選擇</div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {EQUIP.map((e) => {
          const on = equipment.includes(e.key);
          return (
            <button key={e.key} onClick={() => toggleEquip(e.key)} style={{
              padding: "7px 14px", borderRadius: 99, fontSize: 13, fontFamily: FONT, cursor: "pointer",
              border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : C.bg, color: on ? "#fff" : C.sub,
            }}>{e.label}</button>
          );
        })}
      </div>

      {items.map((w, i) => (
        <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{w.name}</span>
            {w.type && (
              <span style={{ fontSize: 11, color: typeColor[w.type] || C.sub, border: `1px solid ${typeColor[w.type] || C.line}`, borderRadius: 99, padding: "1px 8px" }}>{w.type}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
            <span style={{ fontSize: 14, color: C.sub }}>建議 <b style={{ color: C.ink }}>{w.duration_min}</b> 分</span>
            <span style={{ fontSize: 14, color: C.sub }}>約消耗 <b style={{ color: C.cal }}>{w.calories}</b> kcal</span>
          </div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5, marginBottom: 14 }}>{w.howto}</div>
          <Btn kind="ghost" onClick={() => onAdd({ id: uid(), date: today, type: "exercise", name: w.name, burned: w.calories, duration: w.duration_min })}>
            <Check size={16} /> 記錄這筆
          </Btn>
        </div>
      ))}

      {aiErr && <p style={{ fontSize: 12.5, color: C.warn, margin: "2px 0 10px" }}>{aiErr}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 6, marginBottom: 22 }}>
        <Btn kind="ghost" onClick={() => setItems(buildLocal())}><RefreshCw size={16} /> 換一批</Btn>
        <Btn kind="primary" onClick={aiSuggest}>
          {aiLoading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={16} />} AI 幫我想
        </Btn>
      </div>

      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>已經運動完?直接拍運動 App 紀錄,自動抓消耗</div>
        <Btn kind="accent" onClick={() => openSheet("exercise")}><Camera size={17} /> 拍運動 App 紀錄</Btn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主程式                                                             */
/* ------------------------------------------------------------------ */
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [weights, setWeights] = useState([]);
  const [tab, setTab] = useState("today");
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(null); // 'food' | 'exercise' | null
  const [bodyComp, setBodyComp] = useState([]);
  const [mealData, setMealData] = useState(null);
  const [bcOpen, setBcOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await store.get("profile");
      const e = await store.get("entries");
      const w = await store.get("weights");
      const bc = await store.get("bodycomp");
      if (p) setProfile(p);
      if (e) setEntries(e);
      if (w) setWeights(w);
      if (bc) setBodyComp(bc);
      setLoaded(true);
    })();
  }, []);

  const saveProfile = (p) => { setProfile(p); store.set("profile", p); setEditing(false); };
  const updateProfile = (patch) => { const p = { ...profile, ...patch }; setProfile(p); store.set("profile", p); };
  const addEntry = (en) => { const next = [...entries, en]; setEntries(next); store.set("entries", next); };
  const removeEntry = (id) => { const next = entries.filter((e) => e.id !== id); setEntries(next); store.set("entries", next); };
  const addWeight = (rec) => {
    const next = [...weights.filter((x) => x.date !== rec.date), rec];
    setWeights(next); store.set("weights", next);
  };
  const addBodyComp = (rec) => {
    const next = [...bodyComp.filter((x) => x.date !== rec.date), rec].sort((a, b) => new Date(a.date) - new Date(b.date));
    setBodyComp(next); store.set("bodycomp", next);
    if (rec.weight) addWeight({ date: rec.date, kg: rec.weight });
  };

  const plan = useMemo(() => {
    if (!profile) return null;
    const bmr = bmrOf({ sex: profile.sex, weight: profile.startWeight, height: profile.height, age: profile.age });
    const tdee = bmr * profile.activity;
    const dailyDeficitNeeded = (profile.targetLossKg * KCAL_PER_KG) / PLAN_DAYS;
    // 攝取目標:TDEE 減飲食缺口,但不低於 BMR(健康下限)
    let intakeTarget = tdee - profile.dietDeficit;
    let tooAggressive = false;
    if (intakeTarget < bmr) { intakeTarget = bmr; tooAggressive = true; }
    const dietDeficitActual = tdee - intakeTarget;
    const exerciseTarget = Math.max(0, dailyDeficitNeeded - dietDeficitActual);
    // 巨量營養素:蛋白質 1.8g/kg、脂肪 25%、其餘澱粉
    const proteinTarget = profile.startWeight * 1.8;
    const fatTarget = (intakeTarget * 0.25) / 9;
    const carbTarget = Math.max(0, (intakeTarget - proteinTarget * 4 - fatTarget * 9) / 4);
    return { bmr, tdee, dailyDeficitNeeded, intakeTarget, exerciseTarget, tooAggressive, proteinTarget, fatTarget, carbTarget };
  }, [profile]);

  if (!loaded) return <Shell><div style={{ padding: 40, textAlign: "center", color: C.faint }}>載入中…</div></Shell>;
  if (!profile || editing) return <Shell><ProfileForm initial={profile} onSave={saveProfile} /></Shell>;

  const currentWeight = weights.length
    ? [...weights].sort((a, b) => new Date(b.date) - new Date(a.date))[0].kg
    : profile.startWeight;
  const latestBodyComp = bodyComp.length ? bodyComp[bodyComp.length - 1] : null;
  const streak = plan ? computeStreak(entries, profile, plan) : { cur: 0, best: 0 };

  return (
    <Shell>
      <div style={{ position: "sticky", top: 0, background: C.bg, borderBottom: `1px solid ${C.line}`, padding: "14px 18px", zIndex: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Snap 熱量</span>
        <span style={{ fontSize: 13, color: C.faint, marginLeft: 8 }}>90 天減 {profile.targetLossKg} kg</span>
      </div>

      {tab === "today" && <Today profile={profile} entries={entries} plan={plan} onRemove={removeEntry} openSheet={setSheet} openMeal={setMealData} streak={streak} />}
      {tab === "suggest" && <Suggest profile={profile} entries={entries} plan={plan} weight={currentWeight} onAdd={addEntry} onUpdateProfile={updateProfile} openSheet={setSheet} />}
      {tab === "progress" && <Progress profile={profile} entries={entries} weights={weights} plan={plan} onAddWeight={addWeight} bodyComp={bodyComp} openBodyComp={() => setBcOpen(true)} />}
      {tab === "me" && <Me profile={profile} plan={plan} onEdit={() => setEditing(true)} />}

      {/* 底部導覽 */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto",
        background: C.bg, borderTop: `1px solid ${C.line}`, display: "flex",
        padding: "8px 0 max(8px, env(safe-area-inset-bottom))",
      }}>
        {[["today", Home, "今天"], ["suggest", Dumbbell, "運動"], ["progress", BarChart3, "進度"], ["me", User, "我的"]].map(([k, Icon, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0", fontFamily: FONT }}>
            <Icon size={22} color={tab === k ? C.ink : C.faint} />
            <span style={{ fontSize: 11, color: tab === k ? C.ink : C.faint, fontWeight: tab === k ? 600 : 400 }}>{label}</span>
          </button>
        ))}
      </div>

      {sheet && <CaptureSheet mode={sheet} profile={profile} onAdd={addEntry} onClose={() => setSheet(null)} />}
      {mealData && <MealSheet remaining={mealData} onAdd={addEntry} onClose={() => setMealData(null)} />}
      {bcOpen && <BodyCompSheet profile={profile} plan={plan} previous={latestBodyComp} onSave={addBodyComp} onClose={() => setBcOpen(false)} />}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{-webkit-tap-highlight-color:transparent}`}</style>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative", color: C.ink }}>
      {children}
    </div>
  );
}
