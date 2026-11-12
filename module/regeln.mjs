// Abgeleitete Werte nach dem Kodex. Die Tabellen kommen aus daten/kodex.js (window.KODEX),
// dieselbe Quelle wie in der Browser-Fassung.
const K = () => window.KODEX;
const fl = Math.floor;

export const EIGENSCHAFTEN = ["St", "Gs", "Gw", "Ko", "In", "Zt", "Au", "pA", "Wk"];
export const EIGENSCHAFT_NAMEN = { St: "Stärke", Gs: "Geschicklichkeit", Gw: "Gewandtheit", Ko: "Konstitution", In: "Intelligenz", Zt: "Zaubertalent", Au: "Aussehen", pA: "persönliche Ausstrahlung", Wk: "Willenskraft" };
export const ZAUBERGRUPPEN = ["Beherrschen", "Bewegen", "Erkennen", "Erschaffen", "Formen", "Verändern", "Zerstören", "Wundertaten", "Dweomer", "Zauberlieder"];
export const SINNE = ["Sehen", "Nachtsicht", "Hören", "Riechen", "Sechster Sinn"];
/** Metallrüstungen (Kodex S. 73): Mindeststärke, Verlust an Gw und B, Verlust des Angriffsbonus. */
export const METALLRUESTUNG = { KR: { st: 31, gw: 0, b: 4, anb: 0 }, PR: { st: 61, gw: 25, b: 8, anb: 0 }, VR: { st: 61, gw: 40, b: 12, anb: 1 } };
/** Lasten nach Stärke (Kodex S. 58, Tabelle 1): [bis St, Normallast, schwere Last, Höchstlast] in kg. */
export const LASTEN = [[10, 5, 20, 40], [30, 10, 25, 50], [60, 15, 30, 60], [80, 20, 35, 70], [95, 25, 40, 75], [99, 30, 45, 80], [100, 35, 50, 90]];
/**
 * Schaltbare Zustände (Kodex S. 71, 77). angriff/abwehr: eigene Abzüge, gegner: Zuschlag für Angreifer.
 * Die Abwehr Geblendeter folgt der Zeile „Abwehr in völliger Dunkelheit“ (–4).
 */
export const ZUSTAENDE = [
  { id: "liegend", name: "liegend", icon: "fa-person-falling", angriff: -4, nurNah: true, gegnerNah: 4,
    text: "EW:Angriff –4 im Nahkampf; stehende Nahkampfgegner +4. Keine Zweihand-, Wurf- und Schusswaffen außer Armbrüsten (Kodex S. 71, 77)." },
  { id: "geblendet", name: "geblendet", icon: "fa-eye-slash", angriff: -6, abwehr: -4,
    text: "EW:Angriff –6, WW:Abwehr –4 wie in völliger Dunkelheit (Kodex S. 77)." },
  { id: "ueberrascht", name: "überrascht", icon: "fa-bolt", abwehr: -4,
    text: "WW:Abwehr –4 (Kodex S. 77)." },
  { id: "wehrlos", name: "wehrlos", icon: "fa-hand", gegner: 4, keineAbwehr: true,
    text: "Kein WW:Abwehr, jeder Treffer ist schwer; Angreifer +4 (Kodex S. 71, 77)." },
];
/** Positive Boni sinken um n, negative bleiben (Kodex S. 73: „verringert sich um“). */
const mindern = (wert, n) => (n === "alle" ? Math.min(wert, 0) : Math.max(Math.min(wert, 0), wert - n));

/** Bonus einer Eigenschaft (Kodex S. 30). */
export const bonus = (w) => (w === null || w === undefined ? null : w <= 5 ? -2 : w <= 20 ? -1 : w <= 80 ? 0 : w <= 95 ? 1 : 2);
/** Wert aus einer Gradtabelle [[ab Grad, Wert], …]. */
export function abTabelle(tab, g) { let w = null; for (const [gr, v] of tab) if (g >= gr) w = v; return w; }
/** Grad zum Erfahrungsschatz. */
export function gradAus(es) {
  if (es >= 40000) return 30 + fl((es - 40000) / 5000);
  let g = 1;
  K().gradES.forEach((x, i) => { if (es >= x) g = i + 1; });
  return g;
}
export const vz = (w) => (w === null || w === undefined || Number.isNaN(w) ? "–" : w >= 0 ? `+${w}` : `${w}`);

/**
 * Alle abgeleiteten Werte eines Abenteurers.
 * @param {object} s       system-Daten des Akteurs
 * @param {Item[]} items   eingebettete Gegenstände
 */
export function ableiten(s, items, { automatik = true } = {}) {
  items = items ?? [];
  const e = s.eigenschaften;
  const art = s.typArt;                                   // K, ZK, Z oder leer
  const kannZaubern = art === "Z" || art === "ZK";
  const r = {};
  r.boni = { AnB: bonus(e.Gs), AbB: bonus(e.Gw), ZauB: bonus(e.Zt) };
  const zus = art === "Z" ? [2, 2] : art ? [0, 1] : [0, 0];
  if (s.rasse === "Mensch" || !s.rasse) {
    r.boni.ResG = e.In === null ? null : bonus(e.In) + zus[0];
    r.boni.ResK = e.Ko === null ? null : bonus(e.Ko) + zus[1];
  } else {
    const fest = { Elf: 2, Gnom: 4, Halbling: 4, Zwerg: 3 }[s.rasse] ?? 0;
    r.boni.ResG = fest + zus[0];
    r.boni.ResK = fest + zus[1];
  }
  r.boni.AusB = e.Ko === null || e.St === null ? null : fl(e.Ko / 10) + fl(e.St / 20);
  r.boni.SchB = e.St === null || e.Gs === null ? null : fl(e.St / 20) + fl(e.Gs / 30) - 3;

  const grad = Math.max(1, s.grad || 1);
  r.gradAbwehr = abTabelle(K().abwehrResistenz, grad);
  r.gradZaubern = abTabelle(K().zaubernGrad, grad);

  // Rüstung: die getragene mit dem höchsten Rüstungsschutz zählt
  const ruestung = items.filter((i) => i.type === "ruestung" && i.system.getragen).sort((a, b) => b.system.rs - a.system.rs)[0] ?? null;
  const verlust = ruestung ? ruestung.system.abwehrbonusVerlust : "0";
  const metall = ruestung ? METALLRUESTUNG[ruestung.system.kuerzel] : null;
  const abB = mindern(r.boni.AbB ?? 0, verlust === "alle" ? "alle" : Number(verlust) || 0);
  r.ruestung = ruestung
    ? { id: ruestung.id, name: ruestung.name, kuerzel: ruestung.system.kuerzel, rs: ruestung.system.rs, verlust, metall }
    : { id: null, name: "keine", kuerzel: "OR", rs: 0, verlust: "0", metall: null };
  r.abwehrBonusMitRuestung = abB;
  r.angriffsBonus = metall?.anb ? mindern(r.boni.AnB ?? 0, metall.anb) : (r.boni.AnB ?? 0);
  r.bEffektiv = s.b === null || s.b === undefined ? null : Math.max(0, s.b - (metall?.b ?? 0));
  r.gwEffektiv = e.Gw === null || e.Gw === undefined ? null : Math.max(1, e.Gw - (metall?.gw ?? 0));
  // Abzüge auf EW:Angriff und WW:Abwehr
  r.kampfAbzuege = [];
  if (metall && (e.St ?? 0) < metall.st) r.kampfAbzuege.push({ wert: -2, grund: `zu schwach für ${r.ruestung.kuerzel} (St ${metall.st})`, nurNah: false });
  if (r.ruestung.kuerzel === "VR" && !items.some((i) => i.type === "fertigkeit" && i.name === "Kampf in Vollrüstung")) r.kampfAbzuege.push({ wert: -2, grund: "Vollrüstung ohne Kampf in Vollrüstung", nurNah: true });
  // automatik false (Einstellung „nur anzeigen“): Erschöpfung und Last werden angezeigt, aber nicht verrechnet
  r.automatik = automatik;
  if (automatik && (s.ap?.wert ?? 1) <= 0 && (s.ap?.max ?? 0) > 0) r.kampfAbzuege.push({ wert: -4, grund: "erschöpft (0 AP)", nurNah: false });
  r.erschoepft = (s.ap?.wert ?? 1) <= 0 && (s.ap?.max ?? 0) > 0;

  // Last (Kodex S. 58): Rüstung und Kleidung zählen nicht mit; über der Normallast ist man belastet
  const zaehlt = (i) => !(i.type === "ruestung" && i.system.getragen);
  const kg = items.filter(zaehlt).reduce((summe, i) => summe + (Number(i.system.gewicht) || 0) * (i.type === "gegenstand" ? i.system.anzahl ?? 1 : 1), 0);
  const zeile = e.St === null || e.St === undefined ? null : LASTEN.find(([bis]) => e.St <= bis) ?? LASTEN.at(-1);
  r.last = { kg: Math.round(kg * 100) / 100, normal: zeile?.[1] ?? null, schwer: zeile?.[2] ?? null, hoechst: zeile?.[3] ?? null };
  r.last.stufe = zeile === null ? "unbekannt" : kg > r.last.hoechst ? "zu schwer" : kg > r.last.normal ? "belastet" : "frei";
  r.belastet = r.last.stufe === "belastet" || r.last.stufe === "zu schwer";
  if (automatik && r.belastet) r.kampfAbzuege.push({ wert: -4, grund: "schwer belastet", nurNah: false });
  if (automatik && r.belastet && r.bEffektiv !== null) r.bEffektiv = Math.floor(r.bEffektiv / 2);

  // schaltbare Zustände
  r.zustaende = Object.fromEntries(ZUSTAENDE.map((z) => [z.id, !!s.zustaende?.[z.id]]));
  for (const z of ZUSTAENDE) {
    if (!r.zustaende[z.id]) continue;
    if (z.angriff) r.kampfAbzuege.push({ wert: z.angriff, grund: z.name, nurNah: !!z.nurNah, nur: "angriff" });
    if (z.abwehr) r.kampfAbzuege.push({ wert: z.abwehr, grund: z.name, nurNah: false, nur: "abwehr" });
  }
  r.wehrlos = r.zustaende.wehrlos;
  // Zuschläge für Angreifer gegen diesen Abenteurer (höchstens einmal +4 aus „sehr leicht“)
  r.gegnerZuschlag = (nah, angreiferLiegt) => {
    const gruende = [];
    if (r.erschoepft && automatik) gruende.push("erschöpft");
    if (r.wehrlos) gruende.push("wehrlos");
    if (r.zustaende.liegend && nah && !angreiferLiegt) gruende.push("liegt am Boden");
    return gruende.length ? { wert: 4, grund: `Ziel ${gruende.join(", ")}` } : null;
  };
  r.abwehr = r.gradAbwehr + abB;

  // Verteidigungswaffe: höchster Wert unter den Verteidigungs-Waffenfertigkeiten, wenn eine passende Waffe bereitliegt
  const vertFert = items.filter((i) => i.type === "waffenfertigkeit" && i.system.verteidigung);
  const vertWaffen = items.filter((i) => i.type === "waffe" && i.system.art === "verteidigung" && i.system.ausgeruestet);
  const passend = vertFert.filter((f) => vertWaffen.some((w) => w.system.fertigkeit === f.name));
  r.verteidigungswaffe = passend.length && !(r.erschoepft && automatik) && !r.wehrlos ? Math.max(...passend.map((f) => f.system.wert)) : null;

  r.resistenzGeist = r.gradAbwehr + (r.boni.ResG ?? 0);
  r.resistenzKoerper = r.gradAbwehr + (r.boni.ResK ?? 0);
  r.kannZaubern = kannZaubern;
  r.zaubern = kannZaubern ? r.gradZaubern + (r.boni.ZauB ?? 0) : null;
  r.raufen = e.St === null || e.Gw === null ? null : fl((e.St + e.Gw) / 20) + r.angriffsBonus + (s.rasse === "Zwerg" ? 1 : 0);

  // Waffen: Erfolgswert aus der passenden Waffenfertigkeit + AnB (+2 Spezialwaffe), Schaden + SchB
  const fertNachName = new Map(items.filter((i) => i.type === "waffenfertigkeit").map((i) => [i.name, i]));
  r.waffen = items.filter((i) => i.type === "waffe").map((w) => {
    const fert = fertNachName.get(w.system.fertigkeit);
    const vert = w.system.art === "verteidigung";
    const spezial = (s.spezialwaffen ?? []).some((x) => x.fertigkeit === w.system.fertigkeit && x.name === (w.system.grundname || w.name));
    const ew = fert ? fert.system.wert + (vert ? 0 : r.angriffsBonus + (spezial ? 2 : 0)) : null;
    const mangel = Object.entries(w.system.mindest ?? {}).filter(([k, v]) => v && (e[k] ?? 0) < v).map(([k, v]) => `${k} ${v}`);
    const schB = r.boni.SchB ?? 0;
    // Schadensbonus nur im Nahkampf und Handgemenge (Kodex S. 69)
    const schaden = w.system.schaden ? (vert || w.system.art === "fernkampf" ? w.system.schaden : `${w.system.schaden}${schB ? vz(schB) : ""}`) : "";
    return { id: w.id, name: w.name, img: w.img, ew, vert, schaden, formel: schadensFormel(w.system.schaden, vert || w.system.art === "fernkampf" ? 0 : schB), grundname: w.system.grundname || w.name, fertigkeit: w.system.fertigkeit, art: w.system.art, ausgeruestet: w.system.ausgeruestet, ohneFertigkeit: !fert, mangel, spezialwaffe: spezial };
  });

  // Fertigkeiten: Erfolgswert = Fertigkeitswert + Bonus der Leiteigenschaft
  r.fertigkeiten = items.filter((i) => i.type === "fertigkeit").map((f) => {
    const b = bonus(e[f.system.leiteigenschaft]) ?? 0;
    return { id: f.id, name: f.name + (f.system.angabe ? ` (${f.system.angabe})` : ""), img: f.img, wert: f.system.wert, bonus: b, ew: f.system.wert + b, le: f.system.leiteigenschaft, pp: f.system.pp ?? 0, verwaltet: !!f.getFlag?.("midgard5-cmt", "cmt") };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));

  // ungelernte Fertigkeiten (Kodex S. 44), ohne bereits gelernte
  const gelernt = new Set(items.filter((i) => i.type === "fertigkeit").map((i) => i.name));
  const lernName = (n) => K().lernName[n] || n;
  r.ungelernt = K().ungelernt.map(([n, w]) => [n, (K().ungelerntRasse[s.rasse] || {})[n] ?? w]).filter(([n]) => !gelernt.has(n) && !gelernt.has(lernName(n)));

  // Sinne und angeborene Fähigkeiten
  const f = Object.fromEntries((s.faehigkeiten ?? []).map((x) => [x.name, x.wert]));
  r.sinne = SINNE.map((n) => ({ name: n === "Riechen" ? "Riechen/Schmecken" : n, wert: f[n] ?? null }));
  r.weitereFaehigkeiten = (s.faehigkeiten ?? []).filter((x) => !SINNE.includes(x.name));

  // Last
  r.gewicht = items.reduce((summe, i) => summe + (Number(i.system.gewicht) || 0) * (i.type === "gegenstand" ? i.system.anzahl ?? 1 : 1), 0);
  return r;
}

/** Schadensangabe wie "1W6–1" (bei zwei Angaben die erste) als Würfelformel, ggf. mit Bonus. */
export function schadensFormel(text, bonus = 0) {
  const t = String(text ?? "").split("/")[0].trim().replace(/[–−]/g, "-").replace(/W/gi, "d").replace(/\s+/g, "");
  if (!/^\d*d\d+([+-]\d+)?$/.test(t)) return null;
  return bonus ? `${t}${bonus > 0 ? "+" : ""}${bonus}` : t;
}

/** Würfelschreibweise der Welt: „W“ (Midgard, Standard) oder „d“ (Einstellung wuerfelSchrift). */
const schrift = () => { try { return globalThis.game?.settings?.get("midgard5-cmt", "wuerfelSchrift") ?? "W"; } catch { return "W"; } };

/** Würfelformel in der gewählten Schreibweise: „1d6-1+3“ → „1W6–1+3“ (bzw. unverändert bei „d“). */
export const wNotation = (f) => (schrift() === "d" ? String(f ?? "") : String(f ?? "").replace(/(\d*)d(\d+)/g, "$1W$2").replace(/-/g, "–"));

/** Name eines Würfels: 20 → „W20“ / „d20“, 100 → „W%“ / „d100“. */
export const wuerfelName = (n) => (schrift() === "d" ? `d${n}` : n === 100 ? "W%" : `W${n}`);
