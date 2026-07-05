import { useState, useEffect, useMemo, useCallback } from "react";

/* ================= 定数 ================= */
const MAIN_PRODUCTS = ["光","home5g","MNP","PLATINUM","GOLD","GOLD U","レギュラー","でんき","ガス","インセ機種","リユース機種","ポイ活","HS新規","機変"];
const SUB_PRODUCTS = ["アマプラ","dバリュー","Sパ","あんセキ","ハルト両面","フォトキューブ"];
const ALL_PRODUCTS = [...MAIN_PRODUCTS, ...SUB_PRODUCTS];
const STORES = ["DS光が丘","DS国立","DS赤羽"];
const SITES = [...STORES, "その他"];
const MIN_RANK_DAYS = 6;

const emptyMonth = () => ({ entries: [], effort: [], goals: { team: {}, member: {}, store: {} } });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (m) => {
  const [y, mo] = m.split("-");
  return `${y}年${parseInt(mo, 10)}月`;
};
const shiftMonth = (m, delta) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const fmt = (n) => (Number(n) || 0).toLocaleString("ja-JP");

/* ================= 共有ストレージ ================= */
async function loadJSON(key, fallback) {
  try {
    const r = await window.storage.get(key, true);
    return r && r.value ? JSON.parse(r.value) : fallback;
  } catch (e) { return fallback; }
}
async function saveJSON(key, value) {
  try { await window.storage.set(key, JSON.stringify(value), true); return true; }
  catch (e) { console.error("save error", e); return false; }
}

/* ================= 汎用UI（モジュール直下に定義） ================= */
function Bar({ pct }) {
  const p = Math.max(0, Math.min(pct ?? 0, 100));
  const done = (pct ?? 0) >= 100;
  return (
    <div style={{ height: 8, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", borderRadius: 99, background: done ? "var(--ok)" : "var(--accent)", transition: "width .4s ease" }} />
    </div>
  );
}

function Counter({ value, onChange }) {
  const v = value || 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button className="cbtn" onClick={() => onChange(Math.max(0, v - 1))} aria-label="減らす">−</button>
      <span style={{ minWidth: 28, textAlign: "center", fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums", color: v > 0 ? "var(--accent)" : "var(--sub)" }}>{v}</span>
      <button className="cbtn" onClick={() => onChange(v + 1)} aria-label="増やす">＋</button>
    </div>
  );
}

function GoalEditor({ label, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button className="link" onClick={() => { setVal(value ? String(value) : ""); setEditing(true); }}>
        {label}
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input className="input" type="number" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)}
        style={{ width: 90, padding: "4px 8px" }} placeholder="目標pt" autoFocus />
      <button className="mini" onClick={() => { onSave(Number(val) || 0); setEditing(false); }}>保存</button>
      <button className="mini ghost" onClick={() => setEditing(false)}>取消</button>
    </span>
  );
}

function MonthNav({ month, setMonth }) {
  return (
    <div className="monthnav">
      <button className="mini ghost" onClick={() => setMonth(shiftMonth(month, -1))}>◀ 前月</button>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".05em", fontVariantNumeric: "tabular-nums" }}>{monthLabel(month)}</span>
      <button className="mini ghost" onClick={() => setMonth(shiftMonth(month, 1))}>翌月 ▶</button>
    </div>
  );
}

function StaffPicker({ master, teamId, memberId, onTeam, onMember }) {
  const teamMembers = master.members.filter((m) => m.teamId === teamId);
  return (
    <>
      <div className="fieldlabel">スタッフ名（チーム → メンバーの順にタップ）</div>
      <div className="chips">
        {master.teams.map((t) => (
          <button key={t.id} className={`chip ${teamId === t.id ? "on" : ""}`} onClick={() => onTeam(t.id)}>{t.name}</button>
        ))}
        {master.teams.length === 0 && <span className="note" style={{ margin: 0 }}>チームが未登録です。</span>}
      </div>
      {teamId && (
        <div className="chips" style={{ marginTop: 8 }}>
          {teamMembers.map((m) => (
            <button key={m.id} className={`chip ${memberId === m.id ? "on" : ""}`} onClick={() => onMember(m.id)}>{m.name}</button>
          ))}
          {teamMembers.length === 0 && <span className="note" style={{ margin: 0 }}>このチームにメンバーがいません。</span>}
        </div>
      )}
    </>
  );
}

/* ================= 成績入力（販売） ================= */
function SalesInputPage({ master, data, saveMonth, showToast, back, entryId }) {
  const editing = entryId ? data.entries.find((e) => e.id === entryId) : null;
  const [teamId, setTeamId] = useState(editing ? (master.members.find((m) => m.id === editing.memberId)?.teamId || "") : "");
  const [memberId, setMemberId] = useState(editing ? editing.memberId : "");
  const [date, setDate] = useState(editing ? editing.date : todayStr());
  const [site, setSite] = useState(editing ? editing.site : "");
  const [pt, setPt] = useState(editing ? String(editing.pt) : "");
  const [products, setProducts] = useState(editing ? { ...editing.products } : {});
  const [mainOpen, setMainOpen] = useState(true);
  const [subOpen, setSubOpen] = useState(false);

  const setCount = (p, v) => setProducts((prev) => ({ ...prev, [p]: v }));

  const confirm = async () => {
    if (!memberId) { showToast("スタッフを選択してください"); return; }
    if (!site) { showToast("現場名を選択してください"); return; }
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) { showToast("稼働日は YYYY/MM/DD 形式（半角）で入力してください"); return; }
    const entry = {
      id: editing ? editing.id : uid(),
      memberId, date, site,
      pt: Number(pt) || 0,
      products: Object.fromEntries(Object.entries(products).filter(([, v]) => v > 0)),
      updatedAt: Date.now(),
    };
    const entries = editing ? data.entries.map((e) => (e.id === entry.id ? entry : e)) : [...data.entries, entry];
    await saveMonth({ ...data, entries });
    showToast(editing ? "修正を保存しました" : "確定しました（各成績に反映済み）");
    if (editing) back();
    else { setMemberId(""); setSite(""); setPt(""); setProducts({}); setDate(todayStr()); }
  };

  const section = (title, list, open, toggle) => (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <button className="secheader" onClick={toggle}>
        <span>{title}</span><span style={{ fontSize: 12, color: "var(--sub)" }}>{open ? "▲ 収納" : "▼ 展開"}</span>
      </button>
      {open && list.map((p) => (
        <div key={p} className="listrow" style={{ borderTop: "1px solid var(--line)" }}>
          <span>{p}</span>
          <Counter value={products[p]} onChange={(v) => setCount(p, v)} />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="card">
        <StaffPicker master={master} teamId={teamId} memberId={memberId}
          onTeam={(t) => { setTeamId(t); setMemberId(""); }} onMember={setMemberId} />
        <div className="fieldlabel" style={{ marginTop: 14 }}>稼働日（YYYY/MM/DD・半角）</div>
        <input className="input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="2026/07/05" />
        <div className="fieldlabel" style={{ marginTop: 14 }}>現場名</div>
        <div className="chips">
          {SITES.map((s) => (
            <button key={s} className={`chip ${site === s ? "on" : ""}`} onClick={() => setSite(s)}>{s}</button>
          ))}
        </div>
        <div className="fieldlabel" style={{ marginTop: 14 }}>獲得PT（半角数字）</div>
        <input className="input" type="number" inputMode="numeric" value={pt} onChange={(e) => setPt(e.target.value)} placeholder="例：12" />
      </div>
      <div className="sectionlabel">内訳（その日獲得した商材）</div>
      {section("メイン商材", MAIN_PRODUCTS, mainOpen, () => setMainOpen(!mainOpen))}
      <div style={{ height: 10 }} />
      {section("副商材", SUB_PRODUCTS, subOpen, () => setSubOpen(!subOpen))}
      <button className="wide" style={{ marginTop: 16 }} onClick={confirm}>{editing ? "修正を保存する" : "確定する"}</button>
      <p style={{ fontSize: 12, color: "var(--sub)", textAlign: "center", marginTop: 8 }}>
        確定すると個人・チーム成績、アベレージ、店舗成績に自動反映されます。
      </p>
    </div>
  );
}

/* ================= 成績入力（努力ポイント） ================= */
function EffortInputPage({ master, data, saveMonth, showToast, back, effortId }) {
  const editing = effortId ? data.effort.find((e) => e.id === effortId) : null;
  const [teamId, setTeamId] = useState(editing ? (master.members.find((m) => m.id === editing.memberId)?.teamId || "") : "");
  const [memberId, setMemberId] = useState(editing ? editing.memberId : "");
  const [pt, setPt] = useState(editing ? String(editing.pt) : "");

  const confirm = async () => {
    if (!memberId) { showToast("スタッフを選択してください"); return; }
    const rec = { id: editing ? editing.id : uid(), memberId, pt: Number(pt) || 0, updatedAt: Date.now() };
    const effort = editing ? data.effort.map((e) => (e.id === rec.id ? rec : e)) : [...data.effort, rec];
    await saveMonth({ ...data, effort });
    showToast(editing ? "修正を保存しました" : "確定しました（努力ポイントに加算）");
    if (editing) back(); else { setMemberId(""); setPt(""); }
  };

  return (
    <div>
      <div className="card">
        <StaffPicker master={master} teamId={teamId} memberId={memberId}
          onTeam={(t) => { setTeamId(t); setMemberId(""); }} onMember={setMemberId} />
        <div className="fieldlabel" style={{ marginTop: 14 }}>獲得PT（半角数字）</div>
        <input className="input" type="number" inputMode="numeric" value={pt} onChange={(e) => setPt(e.target.value)} placeholder="例：5" />
      </div>
      <button className="wide" style={{ marginTop: 16 }} onClick={confirm}>{editing ? "修正を保存する" : "確定する"}</button>
      <p style={{ fontSize: 12, color: "var(--sub)", textAlign: "center", marginTop: 8 }}>
        確定すると個人・チームの努力ポイントに加算されます。
      </p>
    </div>
  );
}

/* ================= 店舗成績 詳細 ================= */
function StoreDetailPage({ store, data, counts, saveMonth, monthNav }) {
  const [editGoals, setEditGoals] = useState(false);
  const goals = data.goals.store[store] || {};
  const rows = ALL_PRODUCTS.filter((p) => counts[p] || goals[p] || editGoals);
  const setGoal = (p, v) =>
    saveMonth({ ...data, goals: { ...data.goals, store: { ...data.goals.store, [store]: { ...goals, [p]: Number(v) || 0 } } } });
  return (
    <div>
      {monthNav}
      <div className="card" style={{ padding: 0 }}>
        <div className="secheader" style={{ cursor: "default" }}>
          <span style={{ fontWeight: 800, fontSize: 17 }}>{store}</span>
          <button className="mini ghost" onClick={() => setEditGoals(!editGoals)}>{editGoals ? "編集を終了" : "目標を編集"}</button>
        </div>
        <div className="listrow" style={{ borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--sub)" }}>
          <span>商材</span><span>店舗目標／総獲得数</span>
        </div>
        {rows.length === 0 && <div className="note" style={{ margin: 12 }}>まだ実績・目標がありません。「目標を編集」から設定できます。</div>}
        {rows.map((p) => {
          const g = goals[p] || 0; const c = counts[p] || 0;
          const done = g > 0 && c >= g;
          return (
            <div key={p} className="listrow" style={{ borderTop: "1px solid var(--line)" }}>
              <span>{p}{SUB_PRODUCTS.includes(p) && <small style={{ color: "var(--sub)" }}>（副）</small>}</span>
              {editGoals
                ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input className="input" type="number" inputMode="numeric" defaultValue={g || ""}
                      style={{ width: 70, padding: "4px 8px" }}
                      onBlur={(e) => setGoal(p, e.target.value)} placeholder="目標" />
                    <span style={{ color: "var(--sub)", fontSize: 13 }}>／ {c} 件</span>
                  </span>
                : <b style={{ fontVariantNumeric: "tabular-nums", color: done ? "var(--ok)" : "var(--ink)" }}>
                    {g ? fmt(g) : "—"} ／ {fmt(c)} 件
                  </b>}
            </div>
          );
        })}
      </div>
      <p className="note">総獲得数は、成績入力でこの店舗を選んで確定された各メンバーの件数の自動合算です。</p>
    </div>
  );
}

/* ================= ランキング ================= */
function RankingPage({ master, memberStat, avgOf, teamName, monthNav }) {
  const [tab, setTab] = useState("pt");
  const eligible = master.members.filter((m) => memberStat(m.id).days.size >= MIN_RANK_DAYS);
  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`);

  const mainList = (list, value) => (
    <div className="card" style={{ padding: 0 }}>
      {list.length === 0 && <div className="note" style={{ margin: 12 }}>対象者がいません（月間{MIN_RANK_DAYS}勤務以上のメンバーが対象です）。</div>}
      {list.map((m, i) => (
        <div key={m.id} className="listrow" style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
          <span><span style={{ display: "inline-block", width: 34 }}>{medal(i)}</span><b>{m.name}</b>
            <small style={{ color: "var(--sub)" }}>　{teamName(m.teamId)}</small></span>
          <b style={{ fontVariantNumeric: "tabular-nums", color: i < 3 ? "var(--accent)" : "var(--ink)" }}>{value(m)}</b>
        </div>
      ))}
    </div>
  );

  const productRanks = ALL_PRODUCTS.map((p) => {
    const list = master.members
      .map((m) => ({ m, c: memberStat(m.id).products[p] || 0 }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c)
      .slice(0, 5);
    return { p, list };
  }).filter((x) => x.list.length > 0);

  return (
    <div>
      {monthNav}
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${tab === "pt" ? "on" : ""}`} onClick={() => setTab("pt")}>総販</button>
        <button className={`chip ${tab === "avg" ? "on" : ""}`} onClick={() => setTab("avg")}>月間アベレージ</button>
        <button className={`chip ${tab === "prod" ? "on" : ""}`} onClick={() => setTab("prod")}>商材別（上位5名）</button>
      </div>
      {tab === "pt" && <>
        <p className="rankcond">※月間{MIN_RANK_DAYS}勤務以上のメンバーのみ対象</p>
        {mainList([...eligible].sort((a, b) => memberStat(b.id).pt - memberStat(a.id).pt), (m) => `${fmt(memberStat(m.id).pt)} pt`)}
      </>}
      {tab === "avg" && <>
        <p className="rankcond">※月間{MIN_RANK_DAYS}勤務以上のメンバーのみ対象</p>
        {mainList([...eligible].sort((a, b) => avgOf(b.id) - avgOf(a.id)), (m) => avgOf(m.id).toFixed(2))}
      </>}
      {tab === "prod" && (
        productRanks.length === 0
          ? <div className="note">この月の商材実績はまだありません。</div>
          : productRanks.map(({ p, list }) => (
              <div key={p}>
                <div className="sectionlabel">{p}</div>
                <div className="card" style={{ padding: 0 }}>
                  {list.map((x, i) => (
                    <div key={x.m.id} className="listrow" style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
                      <span><span style={{ display: "inline-block", width: 34 }}>{medal(i)}</span>{x.m.name}</span>
                      <b style={{ fontVariantNumeric: "tabular-nums" }}>{x.c} 件</b>
                    </div>
                  ))}
                </div>
              </div>
            ))
      )}
    </div>
  );
}

/* ================= 全データ確認・エクスポート ================= */
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toTable = (rows, sep) => rows.map((r) => r.map(csvCell).join(sep)).join("\n");

function ExportPage({ master, showToast }) {
  const [allMonths, setAllMonths] = useState(null); // { "2026-07": monthData, ... }

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.list("month:", true);
        const keys = (res && res.keys ? res.keys : []).map((k) => (typeof k === "string" ? k : k.key)).filter(Boolean);
        const out = {};
        for (const k of keys) {
          try {
            const r = await window.storage.get(k, true);
            if (r && r.value) out[k.slice(6)] = JSON.parse(r.value);
          } catch (e) { /* skip broken key */ }
        }
        setAllMonths(out);
      } catch (e) { setAllMonths({}); }
    })();
  }, []);

  const memberName2 = (id) => master.members.find((m) => m.id === id)?.name || "（削除済）";
  const teamOf = (id) => {
    const mem = master.members.find((m) => m.id === id);
    return mem ? (master.teams.find((t) => t.id === mem.teamId)?.name || "未所属") : "—";
  };
  const teamName2 = (id) => master.teams.find((t) => t.id === id)?.name || "（削除済チーム）";

  const build = () => {
    const months = Object.keys(allMonths || {}).sort();
    const summary = [["月", "チーム", "スタッフ", "総販pt", "稼働日数", "月間アベレージ", "努力pt", "個人目標", "達成率%"]];
    const sales = [["月", "稼働日", "チーム", "スタッフ", "現場", "獲得PT", ...ALL_PRODUCTS]];
    const efforts = [["月", "チーム", "スタッフ", "獲得PT"]];
    const goals = [["月", "種別", "対象", "商材", "目標"]];
    const teamSummary = [["月", "チーム", "総販pt", "努力pt", "チーム目標", "達成率%"]];

    for (const mo of months) {
      const d = { ...emptyMonth(), ...allMonths[mo], goals: { team: {}, member: {}, store: {}, ...((allMonths[mo] || {}).goals || {}) } };
      const stat = {};
      const get = (id) => (stat[id] = stat[id] || { pt: 0, effort: 0, days: new Set(), products: {} });
      for (const e of d.entries) {
        const s = get(e.memberId);
        s.pt += Number(e.pt) || 0;
        if (e.date) s.days.add(e.date);
        sales.push([mo, e.date, teamOf(e.memberId), memberName2(e.memberId), e.site, e.pt,
          ...ALL_PRODUCTS.map((p) => (e.products && e.products[p]) || "")]);
      }
      for (const f of d.effort) {
        get(f.memberId).effort += Number(f.pt) || 0;
        efforts.push([mo, teamOf(f.memberId), memberName2(f.memberId), f.pt]);
      }
      for (const [id, s] of Object.entries(stat)) {
        const goal = d.goals.member[id] || 0;
        summary.push([mo, teamOf(id), memberName2(id), s.pt, s.days.size,
          s.days.size ? (s.pt / s.days.size).toFixed(2) : "0",
          s.effort, goal || "", goal ? ((s.pt / goal) * 100).toFixed(1) : ""]);
      }
      const byTeam = {};
      for (const mem of master.members) {
        const t = (byTeam[mem.teamId] = byTeam[mem.teamId] || { pt: 0, effort: 0 });
        const s = stat[mem.id];
        if (s) { t.pt += s.pt; t.effort += s.effort; }
      }
      for (const [tid, t] of Object.entries(byTeam)) {
        const goal = d.goals.team[tid] || 0;
        if (t.pt || t.effort || goal) teamSummary.push([mo, teamName2(tid), t.pt, t.effort, goal || "", goal ? ((t.pt / goal) * 100).toFixed(1) : ""]);
      }
      for (const [tid, g] of Object.entries(d.goals.team)) if (g) goals.push([mo, "チーム", teamName2(tid), "", g]);
      for (const [id, g] of Object.entries(d.goals.member)) if (g) goals.push([mo, "個人", memberName2(id), "", g]);
      for (const [st, obj] of Object.entries(d.goals.store)) for (const [p, g] of Object.entries(obj || {})) if (g) goals.push([mo, "店舗", st, p, g]);
    }
    const membersTable = [["名前", "所属チーム"], ...master.members.map((m) => [m.name, teamName2(m.teamId)])];
    return { summary, teamSummary, sales, efforts, goals, membersTable };
  };

  const assemble = (sep) => {
    const t = build();
    return [
      "【月次集計（個人）】", toTable(t.summary, sep), "",
      "【月次集計（チーム）】", toTable(t.teamSummary, sep), "",
      "【販売入力 明細】", toTable(t.sales, sep), "",
      "【努力ポイント 明細】", toTable(t.efforts, sep), "",
      "【目標一覧】", toTable(t.goals, sep), "",
      "【メンバー一覧】", toTable(t.membersTable, sep),
    ].join("\n");
  };

  const download = () => {
    try {
      const blob = new Blob(["\uFEFF" + assemble(",")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `営業成績_全データ_${todayStr().replace(/\//g, "")}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast("CSVをダウンロードしました（Excel・スプレッドシートで開けます）");
    } catch (e) { showToast("ダウンロードに失敗しました"); }
  };

  const copyTsv = async () => {
    const text = assemble("\t");
    try {
      await navigator.clipboard.writeText(text);
      showToast("コピーしました。スプレッドシートに貼り付けてください");
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
        showToast("コピーしました。スプレッドシートに貼り付けてください");
      } catch (e2) { showToast("コピーに失敗しました"); }
    }
  };

  if (allMonths === null) return <div className="note" style={{ textAlign: "center", marginTop: 40 }}>全データを読み込み中…</div>;

  const t = build();
  const monthCount = Object.keys(allMonths).length;
  const salesCount = t.sales.length - 1;

  const Preview = ({ title, rows }) => (
    <>
      <div className="sectionlabel">{title}</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="dtable">
          <thead><tr>{rows[0].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.slice(1).map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c === "" ? "—" : String(c)}</td>)}</tr>
            ))}
            {rows.length === 1 && <tr><td colSpan={rows[0].length} style={{ color: "var(--sub)" }}>データなし</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div>
      <div className="card">
        <b>保存されている全データ</b>
        <div style={{ fontSize: 13, color: "var(--sub)", margin: "4px 0 12px" }}>
          {monthCount}ヶ月分・販売入力 {salesCount}件・メンバー {master.members.length}名
        </div>
        <button className="wide" onClick={download}>📥 CSVをダウンロード（Excel／スプレッドシート用）</button>
        <button className="wide ghostwide" style={{ marginTop: 8 }} onClick={copyTsv}>📋 表をコピー（スプレッドシートに直接貼り付け）</button>
      </div>
      <Preview title="月次集計（個人）" rows={t.summary} />
      <Preview title="月次集計（チーム）" rows={t.teamSummary} />
      <Preview title="販売入力 明細" rows={t.sales} />
      <Preview title="努力ポイント 明細" rows={t.efforts} />
      <Preview title="目標一覧" rows={t.goals} />
      <Preview title="メンバー一覧" rows={t.membersTable} />
    </div>
  );
}

/* ================= メンバー・チーム管理 ================= */
function SettingsPage({ master, saveMaster, showToast }) {
  const [teamNameInput, setTeamNameInput] = useState("");
  const [memberNameInput, setMemberNameInput] = useState("");
  const [memberTeam, setMemberTeam] = useState("");

  const addTeam = () => {
    const name = teamNameInput.trim();
    if (!name) { showToast("チーム名を入力してください"); return; }
    saveMaster({ ...master, teams: [...master.teams, { id: uid(), name }] });
    setTeamNameInput(""); showToast("チームを追加しました");
  };
  const addMember = () => {
    const name = memberNameInput.trim();
    if (!name) { showToast("名前を入力してください"); return; }
    if (!memberTeam) { showToast("所属チームを選択してください"); return; }
    saveMaster({ ...master, members: [...master.members, { id: uid(), name, teamId: memberTeam }] });
    setMemberNameInput(""); showToast("メンバーを追加しました");
  };
  const moveMember = (id, teamId) =>
    saveMaster({ ...master, members: master.members.map((m) => (m.id === id ? { ...m, teamId } : m)) });
  const delMember = (id) => {
    if (!window.confirm("このメンバーを削除しますか？（過去の入力記録は残ります）")) return;
    saveMaster({ ...master, members: master.members.filter((m) => m.id !== id) });
  };
  const delTeam = (id) => {
    if (master.members.some((m) => m.teamId === id)) { showToast("メンバーが所属しているチームは削除できません"); return; }
    if (!window.confirm("このチームを削除しますか？")) return;
    saveMaster({ ...master, teams: master.teams.filter((t) => t.id !== id) });
  };

  return (
    <div>
      <div className="sectionlabel">チーム追加</div>
      <div className="card" style={{ display: "flex", gap: 8 }}>
        <input className="input" style={{ flex: 1 }} value={teamNameInput} onChange={(e) => setTeamNameInput(e.target.value)} placeholder="チーム名" />
        <button className="mini" onClick={addTeam}>追加</button>
      </div>
      <div className="sectionlabel">メンバー追加</div>
      <div className="card">
        <input className="input" value={memberNameInput} onChange={(e) => setMemberNameInput(e.target.value)} placeholder="名前" />
        <div className="fieldlabel" style={{ marginTop: 10 }}>所属チーム（タップで選択）</div>
        <div className="chips">
          {master.teams.map((t) => (
            <button key={t.id} className={`chip ${memberTeam === t.id ? "on" : ""}`} onClick={() => setMemberTeam(t.id)}>{t.name}</button>
          ))}
          {master.teams.length === 0 && <span className="note" style={{ margin: 0 }}>先にチームを追加してください。</span>}
        </div>
        <button className="wide" style={{ marginTop: 12 }} onClick={addMember}>メンバー追加</button>
      </div>
      <div className="sectionlabel">登録済みメンバー（所属チームはタップで変更）</div>
      {master.members.length === 0 && <div className="note">メンバーはまだいません。</div>}
      {master.members.map((m) => (
        <div key={m.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>{m.name}</b>
            <button className="mini danger" onClick={() => delMember(m.id)}>削除</button>
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {master.teams.map((t) => (
              <button key={t.id} className={`chip ${m.teamId === t.id ? "on" : ""}`} onClick={() => moveMember(m.id, t.id)}>{t.name}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="sectionlabel">登録済みチーム</div>
      {master.teams.length === 0 && <div className="note">チームはまだありません。</div>}
      {master.teams.map((t) => (
        <div key={t.id} className="card row">
          <b>{t.name}</b>
          <button className="mini danger" onClick={() => delTeam(t.id)}>削除</button>
        </div>
      ))}
    </div>
  );
}

/* ================= 本体 ================= */
export default function SalesApp() {
  const [master, setMaster] = useState({ teams: [], members: [] });
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(emptyMonth());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [stack, setStack] = useState([{ page: "home" }]); // 戻るボタン用のページ履歴
  const view = stack[stack.length - 1];
  const push = (p) => setStack((s) => [...s, p]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const reload = useCallback(async (m) => {
    setLoading(true);
    const [ma, mo] = await Promise.all([
      loadJSON("master", { teams: [], members: [] }),
      loadJSON(`month:${m}`, emptyMonth()),
    ]);
    setMaster({ teams: [], members: [], ...ma });
    setData({ ...emptyMonth(), ...mo, goals: { team: {}, member: {}, store: {}, ...(mo && mo.goals ? mo.goals : {}) } });
    setLoading(false);
  }, []);

  useEffect(() => { reload(month); }, [month, reload]);

  const saveMaster = async (next) => {
    setMaster(next); setSaving(true);
    await saveJSON("master", next); setSaving(false);
  };
  const saveMonth = async (next) => {
    setData(next); setSaving(true);
    await saveJSON(`month:${month}`, next); setSaving(false);
  };

  /* ---------- 集計 ---------- */
  const stats = useMemo(() => {
    const byMember = {};
    const get = (id) => (byMember[id] = byMember[id] || { pt: 0, effort: 0, days: new Set(), products: {} });
    for (const e of data.entries) {
      const s = get(e.memberId);
      s.pt += Number(e.pt) || 0;
      if (e.date) s.days.add(e.date);
      for (const [p, c] of Object.entries(e.products || {})) if (c) s.products[p] = (s.products[p] || 0) + c;
    }
    for (const f of data.effort) get(f.memberId).effort += Number(f.pt) || 0;

    const byTeam = {};
    for (const mem of master.members) {
      const t = (byTeam[mem.teamId] = byTeam[mem.teamId] || { pt: 0, effort: 0 });
      const s = byMember[mem.id];
      if (s) { t.pt += s.pt; t.effort += s.effort; }
    }
    const byStore = {};
    for (const e of data.entries) {
      if (!STORES.includes(e.site)) continue;
      const st = (byStore[e.site] = byStore[e.site] || {});
      for (const [p, c] of Object.entries(e.products || {})) if (c) st[p] = (st[p] || 0) + c;
    }
    return { byMember, byTeam, byStore };
  }, [data, master]);

  const memberStat = (id) => stats.byMember[id] || { pt: 0, effort: 0, days: new Set(), products: {} };
  const avgOf = (id) => { const s = memberStat(id); return s.days.size ? s.pt / s.days.size : 0; };
  const memberName = (id) => master.members.find((m) => m.id === id)?.name || "（削除済）";
  const teamName = (id) => master.teams.find((t) => t.id === id)?.name || "未所属";

  const monthNav = <MonthNav month={month} setMonth={setMonth} />;

  /* ---------- 各ページ（状態を持たないものはインライン定義） ---------- */
  const Home = () => (
    <div>
      {monthNav}
      {month !== currentMonth() && (
        <div className="note">過去ログ／別月を表示中です。<button className="link" onClick={() => setMonth(currentMonth())}>今月に戻る</button></div>
      )}
      <div className="menu-grid">
        <button className="menucard" onClick={() => push({ page: "teams" })}>
          <span className="menuicon">📊</span>チーム・個人成績
          <span className="menudesc">目標・達成率・アベレージ</span>
        </button>
        <button className="menucard" onClick={() => push({ page: "inputMenu" })}>
          <span className="menuicon">✏️</span>成績入力
          <span className="menudesc">販売・努力ポイント</span>
        </button>
        <button className="menucard" onClick={() => push({ page: "stores" })}>
          <span className="menuicon">🏪</span>店舗成績
          <span className="menudesc">店舗目標／総獲得数</span>
        </button>
        <button className="menucard" onClick={() => push({ page: "ranking" })}>
          <span className="menuicon">🏆</span>ランキング
          <span className="menudesc">総販・アベレージ・商材別</span>
        </button>
      </div>
      {master.members.length === 0 && (
        <div className="note" style={{ marginTop: 14 }}>まずは下の「メンバー・チーム管理」からチームとメンバーを登録してください。</div>
      )}
      <button className="wide ghostwide" style={{ marginTop: 14 }} onClick={() => push({ page: "settings" })}>⚙ メンバー・チーム管理</button>
      <p style={{ color: "var(--sub)", fontSize: 12, textAlign: "center", marginTop: 18, lineHeight: 1.7 }}>
        このページはURLを知っている全員が閲覧・編集できます。<br />入力内容は共有され、別のデバイスからも同じ成績が見られます。
      </p>
    </div>
  );

  const Teams = () => (
    <div>
      {monthNav}
      {master.teams.length === 0 && <div className="note">チームが未登録です。ホームの「メンバー・チーム管理」から登録してください。</div>}
      {master.teams.map((t) => {
        const s = stats.byTeam[t.id] || { pt: 0, effort: 0 };
        const goal = data.goals.team[t.id] || 0;
        const pct = goal > 0 ? (s.pt / goal) * 100 : null;
        return (
          <button key={t.id} className="card tap" onClick={() => push({ page: "team", teamId: t.id })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>{t.name}</span>
              <span className="chev">▸</span>
            </div>
            <div className="bignum">{fmt(s.pt)}<small> pt</small><span className="slash">／</span><span className="effort">努力 {fmt(s.effort)} pt</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--sub)", margin: "6px 0 6px" }}>
              <span>目標 {goal ? `${fmt(goal)} pt` : "未設定"}</span>
              <span style={{ fontWeight: 700, color: pct != null && pct >= 100 ? "var(--ok)" : "var(--ink)" }}>{pct != null ? `達成率 ${pct.toFixed(1)}%` : ""}</span>
            </div>
            <Bar pct={pct ?? 0} />
          </button>
        );
      })}
    </div>
  );

  const TeamPage = () => {
    const t = master.teams.find((x) => x.id === view.teamId);
    if (!t) return <div className="note">チームが見つかりません。</div>;
    const s = stats.byTeam[t.id] || { pt: 0, effort: 0 };
    const goal = data.goals.team[t.id] || 0;
    const pct = goal > 0 ? (s.pt / goal) * 100 : null;
    const members = master.members.filter((m) => m.teamId === t.id);
    return (
      <div>
        {monthNav}
        <div className="card">
          <div style={{ fontWeight: 800, fontSize: 19 }}>{t.name}</div>
          <div className="bignum" style={{ fontSize: 30 }}>{fmt(s.pt)}<small> pt</small><span className="slash">／</span><span className="effort">努力 {fmt(s.effort)} pt</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--sub)", margin: "8px 0 6px" }}>
            <span>目標 {goal ? `${fmt(goal)} pt` : "未設定"}　
              <GoalEditor label={goal ? "変更" : "目標を設定"} value={goal}
                onSave={(v) => saveMonth({ ...data, goals: { ...data.goals, team: { ...data.goals.team, [t.id]: v } } })} />
            </span>
            <span style={{ fontWeight: 700, color: pct != null && pct >= 100 ? "var(--ok)" : "var(--ink)" }}>{pct != null ? `達成率 ${pct.toFixed(1)}%` : ""}</span>
          </div>
          <Bar pct={pct ?? 0} />
        </div>
        <div className="sectionlabel">メンバー</div>
        {members.length === 0 && <div className="note">メンバーがいません。</div>}
        {members.map((m) => {
          const ms = memberStat(m.id);
          return (
            <button key={m.id} className="card tap row" onClick={() => push({ page: "member", memberId: m.id })}>
              <span style={{ fontWeight: 700 }}>{m.name}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontWeight: 800, fontSize: 17 }}>{fmt(ms.pt)}<small style={{ fontSize: 11, color: "var(--sub)" }}> pt</small></span>
                <span style={{ display: "block", fontSize: 12, color: "var(--sub)" }}>Av {avgOf(m.id).toFixed(2)}（{ms.days.size}稼働）</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const MemberPage = () => {
    const m = master.members.find((x) => x.id === view.memberId);
    if (!m) return <div className="note">メンバーが見つかりません。</div>;
    const s = memberStat(m.id);
    const goal = data.goals.member[m.id] || 0;
    const pct = goal > 0 ? (s.pt / goal) * 100 : null;
    const prods = ALL_PRODUCTS.filter((p) => s.products[p]);
    return (
      <div>
        {monthNav}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontWeight: 800, fontSize: 19 }}>{m.name}</span>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{teamName(m.teamId)}</span>
          </div>
          <div className="bignum" style={{ fontSize: 30 }}>{fmt(s.pt)}<small> pt</small></div>
          <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--sub)", marginTop: 2, flexWrap: "wrap" }}>
            <span>月間アベレージ <b style={{ color: "var(--ink)", fontSize: 15 }}>{avgOf(m.id).toFixed(2)}</b></span>
            <span>稼働 <b style={{ color: "var(--ink)" }}>{s.days.size}</b> 日</span>
            <span>努力 <b style={{ color: "var(--ink)" }}>{fmt(s.effort)}</b> pt</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--sub)", margin: "10px 0 6px" }}>
            <span>目標 {goal ? `${fmt(goal)} pt` : "未設定"}　
              <GoalEditor label={goal ? "変更" : "目標を設定"} value={goal}
                onSave={(v) => saveMonth({ ...data, goals: { ...data.goals, member: { ...data.goals.member, [m.id]: v } } })} />
            </span>
            <span style={{ fontWeight: 700, color: pct != null && pct >= 100 ? "var(--ok)" : "var(--ink)" }}>{pct != null ? `達成率 ${pct.toFixed(1)}%` : ""}</span>
          </div>
          <Bar pct={pct ?? 0} />
        </div>
        <div className="sectionlabel">{monthLabel(month)}の獲得商材</div>
        {prods.length === 0
          ? <div className="note">この月の獲得商材はまだありません。</div>
          : <div className="card" style={{ padding: 0 }}>
              {prods.map((p, i) => (
                <div key={p} className="listrow" style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
                  <span>{p}{SUB_PRODUCTS.includes(p) && <small style={{ color: "var(--sub)" }}>（副）</small>}</span>
                  <b style={{ fontVariantNumeric: "tabular-nums" }}>{s.products[p]} 件</b>
                </div>
              ))}
            </div>}
      </div>
    );
  };

  const InputMenu = () => (
    <div>
      {monthNav}
      {month !== currentMonth() && <div className="note">現在「{monthLabel(month)}」に入力します。別の月に入力する場合は上で月を切り替えてください。</div>}
      <button className="menucard" style={{ width: "100%", marginBottom: 12 }} onClick={() => push({ page: "salesInput" })}>
        <span className="menuicon">🛒</span>販売の獲得件数を入力<span className="menudesc">獲得PT・商材内訳</span>
      </button>
      <button className="menucard" style={{ width: "100%", marginBottom: 12 }} onClick={() => push({ page: "effortInput" })}>
        <span className="menuicon">💪</span>努力ポイントを入力<span className="menudesc">個人・チームに加算</span>
      </button>
      <button className="menucard" style={{ width: "100%" }} onClick={() => push({ page: "history" })}>
        <span className="menuicon">🗂</span>入力履歴（修正・削除）<span className="menudesc">確定後の変更はこちら</span>
      </button>
    </div>
  );

  const History = () => {
    const sales = [...data.entries].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.updatedAt || 0) - (a.updatedAt || 0));
    const efforts = [...data.effort].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const delSale = async (id) => {
      if (!window.confirm("この販売入力を削除しますか？成績から差し引かれます。")) return;
      await saveMonth({ ...data, entries: data.entries.filter((e) => e.id !== id) });
      showToast("削除しました");
    };
    const delEffort = async (id) => {
      if (!window.confirm("この努力ポイント入力を削除しますか？")) return;
      await saveMonth({ ...data, effort: data.effort.filter((e) => e.id !== id) });
      showToast("削除しました");
    };
    return (
      <div>
        {monthNav}
        <div className="sectionlabel">販売入力（{sales.length}件）</div>
        {sales.length === 0 && <div className="note">この月の販売入力はありません。</div>}
        {sales.map((e) => (
          <div key={e.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>{memberName(e.memberId)}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(e.pt)} pt</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0" }}>{e.date}　{e.site}</div>
            {Object.keys(e.products || {}).length > 0 && (
              <div style={{ fontSize: 12, color: "var(--sub)" }}>
                {Object.entries(e.products).map(([p, c]) => `${p}×${c}`).join("　")}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="mini" onClick={() => push({ page: "salesInput", entryId: e.id })}>修正</button>
              <button className="mini danger" onClick={() => delSale(e.id)}>削除</button>
            </div>
          </div>
        ))}
        <div className="sectionlabel">努力ポイント入力（{efforts.length}件）</div>
        {efforts.length === 0 && <div className="note">この月の努力ポイント入力はありません。</div>}
        {efforts.map((e) => (
          <div key={e.id} className="card row">
            <span style={{ fontWeight: 700 }}>{memberName(e.memberId)}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(e.pt)} pt</b>
              <button className="mini" onClick={() => push({ page: "effortInput", effortId: e.id })}>修正</button>
              <button className="mini danger" onClick={() => delEffort(e.id)}>削除</button>
            </span>
          </div>
        ))}
      </div>
    );
  };

  const Stores = () => (
    <div>
      {monthNav}
      {STORES.map((st) => {
        const counts = stats.byStore[st] || {};
        const goals = data.goals.store[st] || {};
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const goalTotal = Object.values(goals).reduce((a, b) => a + (Number(b) || 0), 0);
        return (
          <button key={st} className="card tap" onClick={() => push({ page: "store", store: st })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>{st}</span><span className="chev">▸</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--sub)", marginTop: 4 }}>
              総獲得 <b style={{ color: "var(--ink)", fontSize: 16 }}>{fmt(total)}</b> 件
              {goalTotal > 0 && <>　／　目標合計 {fmt(goalTotal)} 件</>}
            </div>
          </button>
        );
      })}
      <p className="note">現場名で「その他」を選んだ入力は店舗成績には反映されません。</p>
    </div>
  );

  /* ---------- ルーティング ---------- */
  const titles = {
    home: monthLabel(month), teams: "チーム・個人成績", team: "チーム成績", member: "個人成績",
    inputMenu: "成績入力", salesInput: view.entryId ? "販売入力の修正" : "成績入力（販売）",
    effortInput: view.effortId ? "努力ポイントの修正" : "成績入力（努力ポイント）",
    history: "入力履歴", stores: "店舗成績", store: view.store || "店舗成績",
    ranking: "ランキング", settings: "メンバー・チーム管理", export: "全データ確認・エクスポート",
  };

  const body = () => {
    if (loading) return <div className="note" style={{ textAlign: "center", marginTop: 40 }}>読み込み中…</div>;
    switch (view.page) {
      case "home": return <Home />;
      case "teams": return <Teams />;
      case "team": return <TeamPage />;
      case "member": return <MemberPage />;
      case "inputMenu": return <InputMenu />;
      case "salesInput": return <SalesInputPage key={view.entryId || "new"} master={master} data={data} saveMonth={saveMonth} showToast={showToast} back={back} entryId={view.entryId} />;
      case "effortInput": return <EffortInputPage key={view.effortId || "new"} master={master} data={data} saveMonth={saveMonth} showToast={showToast} back={back} effortId={view.effortId} />;
      case "history": return <History />;
      case "stores": return <Stores />;
      case "store": return <StoreDetailPage key={view.store} store={view.store} data={data} counts={stats.byStore[view.store] || {}} saveMonth={saveMonth} monthNav={monthNav} />;
      case "ranking": return <RankingPage master={master} memberStat={memberStat} avgOf={avgOf} teamName={teamName} monthNav={monthNav} />;
      case "settings": return <SettingsPage master={master} saveMaster={saveMaster} showToast={showToast} />;
      case "export": return <ExportPage master={master} showToast={showToast} />;
      default: return <Home />;
    }
  };

  return (
    <div className="app">
      <style>{`
        :root{
          --bg:#F3F4F6; --surface:#FFFFFF; --ink:#1A2238; --sub:#69708A;
          --accent:#CC0F3D; --accent-soft:#FBE9EE; --ok:#0E8A6D; --line:#E6E8EE;
        }
        *{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}
        .app{min-height:100vh; background:var(--bg); color:var(--ink);
          font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",system-ui,sans-serif;
          font-size:15px; line-height:1.6;}
        .header{position:sticky; top:0; z-index:10; display:flex; align-items:center; gap:8px;
          padding:12px 14px; background:var(--ink); color:#fff;}
        .backbtn{background:rgba(255,255,255,.12); color:#fff; border:none; border-radius:8px;
          padding:6px 10px; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap;}
        .backbtn:active{background:rgba(255,255,255,.28);}
        .container{max-width:560px; margin:0 auto; padding:16px 14px 64px;}
        .monthnav{display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;}
        .menu-grid{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
        .menucard{display:flex; flex-direction:column; align-items:flex-start; gap:2px;
          background:var(--surface); border:1px solid var(--line); border-radius:14px;
          padding:16px 14px; font-size:15.5px; font-weight:800; color:var(--ink);
          cursor:pointer; text-align:left; box-shadow:0 1px 2px rgba(26,34,56,.05);}
        .menucard:active{transform:scale(.98);}
        .menuicon{font-size:24px; margin-bottom:4px;}
        .menudesc{font-size:11.5px; font-weight:500; color:var(--sub);}
        .card{display:block; width:100%; background:var(--surface); border:1px solid var(--line);
          border-radius:14px; padding:14px; margin-bottom:12px; text-align:left; color:var(--ink);
          box-shadow:0 1px 2px rgba(26,34,56,.05); font-size:15px;}
        button.card{cursor:pointer;} .tap:active{transform:scale(.99);}
        .row{display:flex; justify-content:space-between; align-items:center;}
        .bignum{font-size:24px; font-weight:800; font-variant-numeric:tabular-nums; margin-top:4px;}
        .bignum small{font-size:12px; color:var(--sub); font-weight:600;}
        .slash{color:var(--line); font-weight:400; margin:0 6px;}
        .effort{font-size:14px; font-weight:700; color:var(--sub);}
        .chev{color:var(--sub);}
        .sectionlabel{font-size:12px; font-weight:800; letter-spacing:.08em; color:var(--sub);
          margin:18px 2px 8px;}
        .listrow{display:flex; justify-content:space-between; align-items:center; padding:10px 14px;}
        .secheader{display:flex; justify-content:space-between; align-items:center; width:100%;
          padding:12px 14px; background:none; border:none; font-weight:800; font-size:14px;
          color:var(--ink); cursor:pointer;}
        .chips{display:flex; flex-wrap:wrap; gap:8px;}
        .chip{border:1px solid var(--line); background:var(--surface); color:var(--ink);
          border-radius:99px; padding:7px 14px; font-size:13.5px; font-weight:700; cursor:pointer;}
        .chip.on{background:var(--accent); border-color:var(--accent); color:#fff;}
        .fieldlabel{font-size:12.5px; font-weight:700; color:var(--sub); margin-bottom:6px;}
        .input{width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px;
          font-size:16px; background:#fff; color:var(--ink); font-variant-numeric:tabular-nums;}
        .input:focus{outline:2px solid var(--accent); border-color:var(--accent);}
        .wide{display:block; width:100%; background:var(--accent); color:#fff; border:none;
          border-radius:12px; padding:14px; font-size:16px; font-weight:800; cursor:pointer;}
        .wide:active{opacity:.85;}
        .ghostwide{background:var(--surface); color:var(--ink); border:1px solid var(--line);}
        .mini{border:none; background:var(--ink); color:#fff; border-radius:8px; padding:6px 12px;
          font-size:12.5px; font-weight:700; cursor:pointer;}
        .mini.ghost{background:var(--surface); color:var(--ink); border:1px solid var(--line);}
        .mini.danger{background:var(--accent-soft); color:var(--accent);}
        .link{background:none; border:none; color:var(--accent); font-weight:700; font-size:12.5px;
          cursor:pointer; text-decoration:underline; padding:0;}
        .cbtn{width:34px; height:34px; border-radius:10px; border:1px solid var(--line);
          background:var(--surface); font-size:18px; font-weight:800; color:var(--ink); cursor:pointer;}
        .cbtn:active{background:var(--accent-soft); border-color:var(--accent); color:var(--accent);}
        .note{background:var(--surface); border:1px dashed var(--line); border-radius:12px;
          padding:10px 12px; font-size:13px; color:var(--sub); margin-bottom:12px;}
        .rankcond{font-size:12px; color:var(--sub); margin:0 2px 8px;}
        .dtable{border-collapse:collapse; font-size:12px; min-width:100%; white-space:nowrap;
          font-variant-numeric:tabular-nums;}
        .dtable th{position:sticky; top:0; background:var(--ink); color:#fff; font-weight:700;
          padding:7px 10px; text-align:left;}
        .dtable td{padding:6px 10px; border-top:1px solid var(--line);}
        .dtable tr:nth-child(even) td{background:#FAFBFC;}
        .toast{position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
          background:var(--ink); color:#fff; padding:10px 18px; border-radius:99px;
          font-size:13.5px; font-weight:700; box-shadow:0 6px 20px rgba(26,34,56,.3); z-index:50;
          max-width:90vw; text-align:center;}
        @media (prefers-reduced-motion: reduce){ *{transition:none !important;} }
      `}</style>
      <div className="header">
        {view.page !== "home"
          ? <button className="backbtn" onClick={back}>← 戻る</button>
          : <span style={{ fontWeight: 800, letterSpacing: ".04em", whiteSpace: "nowrap" }}>営業成績管理</span>}
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titles[view.page] || ""}</span>
        <button className="backbtn" onClick={() => reload(month)} title="最新の共有データを読み込む">{saving ? "保存中…" : "⟳ 更新"}</button>
        {view.page !== "export" && (
          <button className="backbtn" onClick={() => push({ page: "export" })} title="全データを表・CSVで確認">📊</button>
        )}
      </div>
      <div className="container">{body()}</div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
