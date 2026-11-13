// Export eines Abenteurers zum Abschreiben in den analogen Bogen: eine übersichtliche Liste aller Werte,
// gegliedert nach den M5-Datenblättern (Figuren-, Abenteuer-, Zauberblatt), damit klar ist, wo welcher
// Wert hingehört. Was auf mehreren Blättern steht, erscheint nur einmal (mit Hinweis). Ausgabe zum
// Drucken oder als PDF, als HTML-Datei und als Text. Die Werte kommen aus system.abgeleitet wie im Bogen.
import { EIGENSCHAFTEN, ZAUBERGRUPPEN, vz } from "./regeln.mjs";

const { ApplicationV2 } = foundry.applications.api;
const SCHRIFT = "systems/midgard5-cmt/schrift/";

const leer = (w) => w === null || w === undefined || w === "";
const t = (w) => (leer(w) ? "–" : String(w));
const fmt = (n) => Number(n || 0).toLocaleString("de-DE");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// HTML aus Textfeldern (Merkmale, Notizen) als schlichter Text
const ohneHtml = (h) => {
  if (!h) return "";
  const d = document.createElement("div");
  d.innerHTML = String(h).replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n");
  return d.textContent.replace(/\n{3,}/g, "\n\n").trim();
};

// ------------------------------------------------------------------ Datenblätter wie auf Papier
// Feldbelegung nach den M5-Datenblättern (Figuren-, Abenteurer- und Zauberblatt): Fertigkeiten mit
// Erfolgswert, Waffenfertigkeiten mit ihrem Wert, Waffen mit EW einschließlich Angriffsbonus,
// auf dem Zauberblatt unter „Prozess“ die Zaubergruppe (mit * bei Spezialisierung).

/** Werte für die drei Datenblätter. */
export function blattDaten(actor) {
  const s = actor.system, d = s.abgeleitet, b = d.boni, p = s.persoenlich ?? {};
  const items = [...actor.items];
  const fert = items.filter((i) => i.type === "fertigkeit");
  const ewVon = new Map(d.fertigkeiten.map((f) => [f.id, f.ew]));
  const sprache = (f) => /sprache|^Sprechen/i.test(f.name);
  // wie im Beispielbogen: Muttersprache und „Sprechen“ unter dem Namen der Sprache, die Gemeinsprache unter ihrem Namen
  const anzeigeName = (f) => (/^(Muttersprache|Sprechen)/.test(f.name) && f.system.angabe ? f.system.angabe : sprache(f) ? f.name : f.name + (f.system.angabe ? ` (${f.system.angabe})` : ""));
  const nachName = (x, y) => (sprache(x) && sprache(y) ? (/^Mutter/.test(y.name) - /^Mutter/.test(x.name)) : 0) || anzeigeName(x).localeCompare(anzeigeName(y), "de");
  // Reihenfolge wie im Beispielbogen: Fertigkeiten, Waffenfertigkeiten, Sprachen
  const liste = [
    ...fert.filter((f) => !sprache(f)).sort(nachName).map((f) => [anzeigeName(f), vz(ewVon.get(f.id)), f.system.pp || ""]),
    ...items.filter((i) => i.type === "waffenfertigkeit").sort((x, y) => x.name.localeCompare(y.name, "de")).map((w) => [w.name, vz(w.system.wert), w.system.pp || ""]),
    ...fert.filter(sprache).sort(nachName).map((f) => [anzeigeName(f), vz(ewVon.get(f.id)), f.system.pp || ""]),
    // angeborene Fähigkeiten außer den Sinnen (die stehen in der Fußzeile)
    ...d.weitereFaehigkeiten.map((x) => [`${x.name} (angeboren)`, x.wert ? vz(x.wert) : "", ""]),
  ];
  const sinn = Object.fromEntries(d.sinne.map((x) => [x.name, x.wert === null ? "" : String(x.wert)]));
  const zauber = items.filter((i) => i.type === "zauber").sort((x, y) => ZAUBERGRUPPEN.indexOf(x.system.gruppe) - ZAUBERGRUPPEN.indexOf(y.system.gruppe) || x.system.stufe - y.system.stufe || x.name.localeCompare(y.name, "de"));
  const mittel = items.filter((i) => i.type === "gegenstand" && (i.system.kategorie === "Zaubermittel" || /spruchrolle|schriftrolle|trank|trunk|elixier|amulett|zauber/i.test(i.name)));
  return {
    figur: actor.name, spieler: s.spieler ?? "", typ: [s.typName, s.rasse].filter(Boolean).join(" · "), grad: s.grad ?? "", spezialisierung: s.spezialisierung ?? "",
    eig: Object.fromEntries(EIGENSCHAFTEN.map((k) => [k, s.eigenschaften[k] ?? ""])), b: s.b ?? "", raufen: d.raufen,
    boni: { ausdauer: b.AusB, schaden: b.SchB, angriff: b.AnB, abwehr: b.AbB, resistenz: `${t(b.ResG)}/${t(b.ResK)}`, zaubern: b.ZauB },
    lp: s.lp?.max ?? "", ap: s.ap?.max ?? "", gg: s.gg ?? "", sg: s.sg?.max ?? "",
    konto: { datum: new Date().toLocaleDateString("de-DE"), es: fmt(s.es), ep: fmt(s.ep), gold: `${fmt(s.gold)} GS` },
    pers: { geburtsdatum: p.geburtsdatum ?? "", alter: p.alter ?? "", hand: p.hand ?? "", groesse: p.groesse ?? "", gestalt: p.gestalt ?? "", gewicht: p.gewicht ?? "", stand: p.stand ?? "", heimat: p.heimat ?? "", glaube: p.glaube ?? "", merkmale: ohneHtml(s.merkmale) },
    liste, zaubern: d.kannZaubern ? d.zaubern : null,
    sinne: [["Sehen", sinn.Sehen], ["Nachtsicht", sinn.Nachtsicht], ["Hören", sinn["Hören"]], ["Riechen/Schmecken", sinn["Riechen/Schmecken"]], ["Sechster Sinn", sinn["Sechster Sinn"]]],
    abwehr: d.abwehr, vertWaffe: d.verteidigungswaffe, resistenz: `${d.resistenzGeist}/${d.resistenzKoerper}`,
    mitRuestung: { angriff: d.angriffsBonus !== (b.AnB ?? 0) ? d.angriffsBonus : null, abwehr: d.abwehrBonusMitRuestung !== (b.AbB ?? 0) ? d.abwehrBonusMitRuestung : null },
    ruestung: { name: d.ruestung.rs ? d.ruestung.name : "", kuerzel: d.ruestung.kuerzel, rs: d.ruestung.rs ? String(d.ruestung.rs) : "–",
      b: d.bEffektiv !== null && d.bEffektiv !== s.b ? d.bEffektiv : "", gw: d.gwEffektiv !== null && d.gwEffektiv !== s.eigenschaften.Gw ? d.gwEffektiv : "" },
    waffen: d.waffen.map((w) => [w.name, w.ew === null ? "" : String(w.ew), schadenKurz(w.schaden)]),
    zauberPP: ZAUBERGRUPPEN.map((g) => [g, s.zauberPP?.[g] || ""]),
    zauber: zauber.map((z) => { const y = z.system; return { ap: y.ap, prozess: y.gruppe + (s.spezialisierung && s.spezialisierung === y.gruppe ? " *" : ""), name: z.name, zd: y.zauberdauer, rw: y.reichweite, wb: y.wirkungsbereich, wd: y.wirkungsdauer, wz: y.wirkungsziel, art: y.art }; }),
    mittel: mittel.map((m) => [m.name + (m.system.anzahl > 1 ? ` (${m.system.anzahl})` : "")]),
    ausruestung: [
      ...items.filter((i) => i.type === "gegenstand" && !mittel.includes(i)).map((g) => [g.name, t(g.system.anzahl), leer(g.system.gewicht) ? "" : String(g.system.gewicht).replace(".", ",")]),
      ...items.filter((i) => i.type === "ruestung" && i.id !== d.ruestung.id).map((r) => [`${r.name} (${r.system.kuerzel}, nicht getragen)`, "1", leer(r.system.gewicht) ? "" : String(r.system.gewicht).replace(".", ",")]),
    ],
    last: `${fmt(d.last.kg)} kg${d.last.normal !== null ? ` (Normallast ${d.last.normal} kg)` : ""}`,
    startAusruestung: s.ausruestungText ?? "",
    notizen: ohneHtml(s.notizen),
  };
}

// „1W6–1+3“ → „1W6+2“: Grundschaden und Schadensbonus zusammengefasst, wie man es auf Papier einträgt
export const schadenKurz = (text) => {
  const m = String(text ?? "").trim().match(/^(\d*W\d+)((?:\s*[+–−-]\s*\d+)*)$/);
  if (!m) return String(text ?? "");
  const summe = [...m[2].matchAll(/([+–−-])\s*(\d+)/g)].reduce((a, [, z, n]) => a + (z === "+" ? 1 : -1) * Number(n), 0);
  return m[1] + (summe > 0 ? `+${summe}` : summe < 0 ? `–${-summe}` : "");
};

// ------------------------------------------------------------------ Übersicht
/** Gliederung nach Blättern: [{blatt, hinweis?, abschnitte: [{titel, paare | spalten+zeilen | text, breit?}]}]. */
export function uebersichtDaten(actor) {
  const D = blattDaten(actor);
  const voll = (paare) => paare.filter(([, w]) => !leer(w) && w !== "–");
  const fert = { titel: "Gelernte und angeborene Fertigkeiten", spalten: ["Fertigkeit", "Wert", "PP"], zahlen: [1, 2],
    zeilen: [...D.liste.map(([n, w, pp]) => [n, w, pp ? String(pp) : ""]), ...(D.zaubern === null ? [] : [["Zaubern", vz(D.zaubern), ""]])] };
  const blaetter = [];
  blaetter.push({ blatt: "Figurenblatt", abschnitte: [
    { titel: "Figur", paare: voll([["Figur", D.figur], ["Spieler", D.spieler], ["Typ", D.typ], ["Grad", D.grad], ["Spezialisierung", D.spezialisierung]]) },
    { titel: "Eigenschaften", paare: [...EIGENSCHAFTEN.map((k) => [k, t(D.eig[k])]), ["B", t(D.b)], ["Raufen", vz(D.raufen)]], raster: true },
    { titel: "Persönlicher Bonus für", paare: [["Ausdauer", vz(D.boni.ausdauer)], ["Schaden", vz(D.boni.schaden)], ["Angriff", vz(D.boni.angriff)], ["Abwehr", vz(D.boni.abwehr)], ["Resistenz", D.boni.resistenz], ["Zaubern", vz(D.boni.zaubern)]], raster: true },
    { titel: "LP, AP, Gnade, Gunst", paare: [["LP-Max.", t(D.lp)], ["AP-Max.", t(D.ap)], ["GG", t(D.gg)], ["SG", t(D.sg)]], raster: true },
    { titel: "Konto", paare: [["Datum", D.konto.datum], ["ES", D.konto.es], ["EP", D.konto.ep], ["Geld", D.konto.gold]] },
    { titel: "Persönliches", paare: voll([["Geburtsdatum", D.pers.geburtsdatum], ["Alter", D.pers.alter], ["Händigkeit", D.pers.hand], ["Größe", D.pers.groesse], ["Gestalt", D.pers.gestalt], ["Gewicht", D.pers.gewicht], ["Stand", D.pers.stand], ["Heimat", D.pers.heimat], ["Glaube", D.pers.glaube]]) },
    { titel: "Besondere Merkmale", text: D.pers.merkmale },
    fert,
    { titel: "Sinne (Fußzeile)", paare: D.sinne.map(([n, w]) => [n, w ? `+${w}` : "+"]) },
  ] });
  blaetter.push({ blatt: "Abenteuerblatt", hinweis: "Figur, Typ, Grad, GG, SG, Eigenschaften, LP, AP, Fertigkeiten und Sinne wie auf dem Figurenblatt.", abschnitte: [
    { titel: "Kampfwerte", paare: [["Abwehr", vz(D.abwehr)], ["mit Verteidigungswaffe", D.vertWaffe === null ? "" : vz(D.vertWaffe)], ["Resistenz", D.resistenz], ["Zaubern", D.zaubern === null ? "" : vz(D.zaubern)]].filter(([, w]) => w !== "") },
    { titel: "Bonus für", paare: [["Schaden", vz(D.boni.schaden)], ["Angriff", vz(D.boni.angriff)], ["Abwehr", vz(D.boni.abwehr)],
      ...(D.mitRuestung.angriff !== null ? [["Angriff mit Rüstung", vz(D.mitRuestung.angriff)]] : []), ...(D.mitRuestung.abwehr !== null ? [["Abwehr mit Rüstung", vz(D.mitRuestung.abwehr)]] : [])] },
    { titel: "Rüstung", paare: voll([["Rüstung", D.ruestung.name || "keine"], ["RK", D.ruestung.kuerzel], ["auf LP-Verlust", D.ruestung.rs], ["B mit Rüstung", D.ruestung.b], ["Gw mit Rüstung", D.ruestung.gw]]) },
    { titel: "Waffen", spalten: ["Waffe", "Fert.wert", "Schaden"], zahlen: [1], zeilen: [...D.waffen.map(([n, ew, sch]) => [n, leer(ew) ? "–" : vz(Number(ew)), sch || "–"]), ["Raufen", vz(D.raufen), "–"]] },
    { titel: "Zauber-PP je Prozess", paare: D.zauberPP.filter(([, w]) => w).map(([g, w]) => [g, String(w)]) },
  ] });
  if (D.zauber.length || D.mittel.length || D.zaubern !== null) blaetter.push({ blatt: "Zauberblatt", hinweis: "Figur, Typ und Grad wie auf dem Figurenblatt.", abschnitte: [
    { titel: "Zaubern", paare: D.zaubern === null ? [] : [["Zaubern", vz(D.zaubern)], ...(D.spezialisierung ? [["Spezialisierung", `${D.spezialisierung} (* = +2 auf EW:Zaubern)`]] : [])] },
    { titel: "Zauber", breit: true, spalten: ["Zauber", "AP", "Prozess", "Zauberdauer", "Reichweite", "Wirkungsbereich", "Wirkungsdauer", "Wirk.ziel", "Art"],
      zeilen: D.zauber.map((z) => [z.name, t(z.ap), t(z.prozess), t(z.zd), t(z.rw), t(z.wb), t(z.wd), t(z.wz), t(z.art)]) },
    { titel: "Wichtige magische Gegenstände, Trünke, Schriftrollen", spalten: ["Gegenstand"], zeilen: D.mittel },
  ] });
  blaetter.push({ blatt: "Ausrüstung", hinweis: "Waffen und getragene Rüstung stehen beim Abenteuerblatt, Zaubermittel beim Zauberblatt.", abschnitte: [
    { titel: "Gegenstände", breit: true, spalten: ["Gegenstand", "Anzahl", "kg"], zahlen: [1, 2], zeilen: D.ausruestung },
    { titel: "Ausrüstung bei Spielbeginn", text: D.startAusruestung },
    { titel: "Last", text: D.last },
  ] });
  blaetter.push({ blatt: "Notizen", abschnitte: [{ titel: "Notizen und Hintergrund", breit: true, text: D.notizen }] });
  // leere Abschnitte, Blätter und Tabellenspalten weglassen (etwa „Wirkung“ vor dem PDF-Import)
  for (const b of blaetter) {
    b.abschnitte = b.abschnitte.filter((a) => a.paare?.length || a.zeilen?.length || a.text);
    for (const a of b.abschnitte.filter((x) => x.zeilen)) {
      const behalten = a.spalten.map((_, i) => i === 0 || a.zeilen.some((r) => !leer(r[i]) && r[i] !== "–"));
      const neu = (i) => behalten.slice(0, i).filter(Boolean).length;
      a.zahlen = (a.zahlen ?? []).filter((i) => behalten[i]).map(neu);
      a.spalten = a.spalten.filter((_, i) => behalten[i]);
      a.zeilen = a.zeilen.map((r) => r.filter((_, i) => behalten[i]));
    }
  }
  return { name: D.figur, unter: D.typ + (D.grad ? ` · Grad ${D.grad}` : ""), blaetter: blaetter.filter((b) => b.abschnitte.length) };
}

/** Übersicht als HTML-Dokument (A4 hoch, druckfertig, Kästchen zum Abhaken). */
export function alsHtml(daten, { schrift = SCHRIFT, datum = new Date() } = {}) {
  const ab = '<span class="ab" title="übertragen"></span>';
  const abschnitt = (a) => {
    let inhalt;
    if (a.paare) inhalt = a.raster
      ? `<ul class="raster">${a.paare.map(([n, w]) => `<li>${ab}<span class="n">${esc(n)}</span> <b>${esc(t(w))}</b></li>`).join("")}</ul>`
      : `<table class="paare"><tbody>${a.paare.map(([n, w]) => `<tr><td class="k">${ab}</td><th>${esc(n)}</th><td>${esc(t(w))}</td></tr>`).join("")}</tbody></table>`;
    else if (a.zeilen) {
      const z = new Set(a.zahlen ?? []);
      inhalt = `<table class="liste"><thead><tr><th class="k"></th>${a.spalten.map((c, i) => `<th${z.has(i) ? ' class="z"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${a.zeilen.map((r) => `<tr><td class="k">${ab}</td>${r.map((c, i) => `<td${z.has(i) ? ' class="z"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    } else inhalt = `<p class="text">${esc(a.text)}</p>`;
    return `<section${a.breit ? ' class="breit"' : ""}><h3>${esc(a.titel)}</h3>${inhalt}</section>`;
  };
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(daten.name)} · Werte zum Übertragen</title><style>
@font-face { font-family: "Alegreya"; src: url("${schrift}Alegreya-400.woff2") format("woff2"); font-weight: 400 500; }
@font-face { font-family: "Alegreya"; src: url("${schrift}Alegreya-700.woff2") format("woff2"); font-weight: 600 800; }
@font-face { font-family: "Alegreya SC"; src: url("${schrift}AlegreyaSC-700.woff2") format("woff2"); font-weight: 400 800; }
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
html { background: #fff; color: #1d1a16; }
body { margin: 0 auto; max-width: 186mm; padding: 6mm 4mm; font: 10pt/1.35 "Alegreya", Georgia, serif; }
header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1d1a16; margin-bottom: 3mm; }
h1 { font: 700 19pt/1.1 "Alegreya SC", "Alegreya", serif; margin: 0; }
header p { margin: 0; color: #5a5146; }
.blatt { margin: 0 0 5mm; }
h2 { font: 700 12.5pt "Alegreya SC", "Alegreya", serif; margin: 0 0 1mm; padding: 1mm 2mm; background: #ece6da; border-left: 3px solid #8a6d3b; break-after: avoid; }
.hinweis { margin: 0 0 2mm; font-size: 8.5pt; font-style: italic; color: #5a5146; }
.spalten { columns: 2; column-gap: 7mm; }
section { break-inside: avoid; margin: 0 0 3mm; }
section.breit { column-span: all; }
h3 { font: 700 9.5pt "Alegreya SC", "Alegreya", serif; margin: 0 0 0.8mm; padding-bottom: 0.4mm; border-bottom: 1px solid #b8a98f; letter-spacing: 0.02em; color: #4a3d2a; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.4mm 1.2mm; vertical-align: top; font-weight: 400; }
tbody tr { border-bottom: 0.5px solid #e2dacb; }
thead th { font-size: 8pt; color: #5a5146; border-bottom: 1px solid #b8a98f; }
.paare th { width: 55%; } .paare td:last-child { font-weight: 700; }
.liste td:first-of-type + td { font-weight: 400; }
.z { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } td.z { font-weight: 700; }
.breit .liste td { font-size: 8.5pt; } .breit .liste td:nth-child(2) { font-weight: 700; }
.raster { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6mm 3mm; }
.raster li { border-bottom: 0.5px solid #e2dacb; padding: 0.3mm 0; white-space: nowrap; }
.raster .n { color: #5a5146; } .raster b { float: right; }
.k { width: 4.5mm; padding-right: 0; }
.ab { display: inline-block; width: 2.6mm; height: 2.6mm; border: 0.8px solid #a8987e; border-radius: 0.5mm; margin-right: 1.2mm; vertical-align: -0.2mm; cursor: pointer; }
.erledigt { color: #a39784; } .erledigt .ab { background: #4a3d2a; border-color: #4a3d2a; }
.text { margin: 0; white-space: pre-wrap; }
footer { margin-top: 2mm; font-size: 8pt; color: #8a7a62; text-align: right; }
@media print { body { padding: 0; } .ab { cursor: auto; } .blatt + .blatt { break-before: auto; } }
</style></head><body>
<header><h1>${esc(daten.name)}</h1><p>${esc(daten.unter)}</p></header>
${daten.blaetter.map((b) => `<div class="blatt"><h2>${esc(b.blatt)}</h2>${b.hinweis ? `<p class="hinweis">${esc(b.hinweis)}</p>` : ""}<div class="spalten">${b.abschnitte.map(abschnitt).join("")}</div></div>`).join("\n")}
<footer>Midgard 5 · Werte zum Übertragen in den Papierbogen, Stand ${datum.toLocaleDateString("de-DE")} · Kästchen anklicken, was übertragen ist</footer>
<script>document.addEventListener("click", (e) => { const k = e.target.closest(".ab"); if (k) k.closest("tr, li").classList.toggle("erledigt"); });</script>
</body></html>`;
}

/** Übersicht als schlichter Text (zum Kopieren in Notizen oder Nachrichten). */
export function alsText(daten) {
  const zeilen = [daten.name, daten.unter, ""];
  for (const b of daten.blaetter) {
    zeilen.push(`=== ${b.blatt.toUpperCase()} ===`);
    if (b.hinweis) zeilen.push(`(${b.hinweis})`);
    for (const a of b.abschnitte) {
      zeilen.push(a.titel);
      if (a.paare) { const w = Math.max(...a.paare.map(([n]) => n.length)); for (const [n, v] of a.paare) zeilen.push(`  ${n.padEnd(w)}  ${t(v)}`); }
      else if (a.zeilen) {
        const breiten = a.spalten.map((c, i) => Math.max(c.length, ...a.zeilen.map((r) => String(r[i] ?? "").length)));
        const zeile = (r) => "  " + r.map((c, i) => (a.zahlen?.includes(i) ? String(c ?? "").padStart(breiten[i]) : String(c ?? "").padEnd(breiten[i]))).join("  ").trimEnd();
        zeilen.push(zeile(a.spalten), ...a.zeilen.map(zeile));
      } else zeilen.push(...String(a.text).split("\n").map((x) => `  ${x}`));
    }
    zeilen.push("");
  }
  return zeilen.join("\n").trimEnd() + "\n";
}

const knopf = (text, symbol, onclick, haupt = false) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = `midgard-start-knopf${haupt ? " haupt" : ""}`;
  b.innerHTML = `<i class="fa-solid ${symbol}" aria-hidden="true"></i> ${esc(text)}`;
  b.addEventListener("click", onclick);
  return b;
};
const dateiname = (name, endung) => `${String(name || "Abenteurer").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "_") || "Abenteurer"}.${endung}`;

/** Fenster mit Vorschau des Übertragungsblatts und den Ausgabewegen. */
export class ExportFenster extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["midgard-export"], tag: "div",
    window: { title: "Werte zum Übertragen", icon: "fa-solid fa-file-export", resizable: true },
    position: { width: 860, height: 860 },
  };

  constructor(actor, options = {}) { super(options); this.actor = actor; }

  get title() { return `Werte zum Übertragen: ${this.actor.name}`; }

  #html() { return alsHtml(uebersichtDaten(this.actor), { schrift: new URL(SCHRIFT, document.baseURI).href }); }

  async _renderHTML() {
    const wurzel = document.createElement("div");
    wurzel.className = "midgard-export-wurzel midgard-cmt";
    const leiste = document.createElement("div");
    leiste.className = "midgard-export-leiste";
    const rahmen = document.createElement("iframe");
    rahmen.className = "midgard-export-vorschau";
    rahmen.title = "Vorschau der Werte zum Übertragen";
    rahmen.srcdoc = this.#html();
    leiste.append(
      knopf("Drucken / als PDF", "fa-print", () => rahmen.contentWindow?.print(), true),
      knopf("Als Text kopieren", "fa-copy", () => this.#kopieren()),
      knopf("HTML speichern", "fa-download", () => this.#speichern()),
      Object.assign(document.createElement("small"), { className: "leise", textContent: "Geordnet nach Figuren-, Abenteuer- und Zauberblatt. Kästchen abhaken, was übertragen ist." }));
    wurzel.append(leiste, rahmen);
    return wurzel;
  }

  _replaceHTML(inhalt, ziel) { ziel.replaceChildren(inhalt); }

  async #kopieren() {
    const text = alsText(uebersichtDaten(this.actor));
    try { await (game.clipboard?.copyPlainText?.(text) ?? navigator.clipboard.writeText(text)); ui.notifications?.info("Midgard: Werte als Text kopiert."); }
    catch { ui.notifications?.warn("Midgard: Kopieren nicht erlaubt. Bitte „HTML speichern“ oder Drucken nutzen."); }
  }

  #speichern() {
    const speichern = foundry.utils?.saveDataToFile;
    const name = dateiname(this.actor.name, "html");
    if (speichern) return speichern(this.#html(), "text/html", name);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([this.#html()], { type: "text/html" })), download: name });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

/** Übertragungsblatt eines Akteurs öffnen. */
export function exportOeffnen(actor) { return new ExportFenster(actor).render({ force: true }); }
