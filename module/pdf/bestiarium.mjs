// Spieldaten von Tieren, Fabelwesen und Nichtspielerfiguren aus dem Kodex („Kleines Bestiarium“,
// Abschnitt „Wesen von A - Z“, und „Nichtspielerfiguren“). Jeder Eintrag beginnt mit einer Kopfzeile
// „Adler (Greifvogel, Grad 2)“, gefolgt von den Spieldaten (LP/AP/RK, St/Gw/In/B, Abwehr/Resistenz,
// Angriff, weitere Fähigkeiten) und der Beschreibung. Läuft rein auf Daten (Node und Browser).
import { absaetze, verbinden } from "./textzeilen.mjs";

const KOPF = /^(.+?) \((?:(.+?), )?Grad (\d+)\)$/;
const STAT = /^(?:(?:LP|St|Abwehr|Angriff|SchB|Gf)\b|Bes\.|»?Zaubern)/;
// eine Zeile, die nur aus Fertigkeiten besteht: „Wahrnehmung+15 (Sehen)“, „Spurensuche+12, Tarnen+8“
const FERT = /^[A-ZÄÖÜ][\wäöüßÄÖÜ\/ ]*[+–-]\d+(\s*\([^)]*\))?(,\s*[A-ZÄÖÜ][\wäöüßÄÖÜ\/ ]*[+–-]\d+(\s*\([^)]*\))?)*\.?$/;
const offen = (t) => (t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length;
const unfertig = (t) => /[-–,;:]$|\b(oder|und|im|nur|zusätzlich|auch)$/.test(t) || offen(t);
// Zusatz vor einem Angriff: „im Flug“, „nur beim Anspringen“, „im Handgemenge zusätzlich“, „nur im Flug oder Handgemenge“
const ZUSATZ = /^((?:nur\s+)?(?:im|beim|nach)\s+[A-ZÄÖÜ][\wäöüß]+(?:\s+oder\s+[A-ZÄÖÜ][\wäöüß]+)?(?:\s+(?:zusätzlich|auch))?|gleichzeitig|selten|zusätzlich)\s+/;

/** „Angriff: …“ in einzelne Angriffe und Raufen zerlegen. */
export function angriffeZerlegen(text) {
  let t = text.replace(/^Angriff\s*:\s*/, "").trim();
  let raufen = null;
  // Raufen am Ende, abgetrennt mit „ - “ (Kodex) oder „; “ (Abenteuerbände)
  const r = t.match(/(?:\s[-–]|;)\s*Raufen\s*\+\s*(\d+)\s*(?:\(([^)]*)\))?\s*$/);
  if (r) { raufen = { ew: Number(r[1]), schaden: (r[2] ?? "").trim() }; t = t.slice(0, r.index).trim(); }
  t = t.replace(/\s[-–]$/, "").trim();
  if (!t || /^keiner?$/i.test(t)) return { angriffe: [], raufen };
  // an Kommas und „oder“ außerhalb von Klammern trennen
  const teile = [];
  let tiefe = 0, akt = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "(") tiefe++;
    if (c === ")") tiefe--;
    // „oder“ trennt Angriffe, außer innerhalb eines Zusatzes („nur im Flug oder Handgemenge“)
    const wort = c === "," || c === ";" ? 1 : t.startsWith(" oder ", i) && !/(?:im|beim)\s+[A-ZÄÖÜ][\wäöüß]+$/.test(akt) ? 6 : t.startsWith(" und ", i) && /^ und (?:\d+×)?[A-ZÄÖÜ]/.test(t.slice(i)) ? 5 : 0;
    if (tiefe === 0 && wort) {
      teile.push(akt.trim()); akt = "";
      i += wort - 1;
      continue;
    }
    akt += c;
  }
  teile.push(akt.trim());
  const angriffe = [];
  for (const teil of teile.filter(Boolean)) {
    const z = teil.match(ZUSATZ);
    const rest = z ? teil.slice(z[0].length) : teil;
    const m = rest.match(/^(?:(\d+)×)?([^+(]*?)\s*(?:\+\s*(\d+)%?)?\s*(?:\(([^)]*)\))?$/);
    if (!m || !m[2]) continue;
    const zusatz = z ? z[1] : "", innen = (m[4] ?? "").trim();
    const wurf = innen.replace(/^je\s+/, "").match(/\d*W\d+(?:\s*[+–-]\s*\d+)?/);
    const formel = wurf ? wurf[0].replace(/\s+/g, "") : /^1 Schadenspunkt/.test(innen) ? "1" : "";
    angriffe.push({
      name: m[2].trim() + (zusatz ? ` (${zusatz})` : ""), anzahl: m[1] ? Number(m[1]) : 1,
      ew: m[3] ? Number(m[3]) : null, schaden: innen, formel,
    });
  }
  return { angriffe, raufen };
}

/** Wert wie „t50“, „*“ oder „70“: Zahl, wenn möglich, sonst der Text. */
const wert = (w) => (/^\d+$/.test(w ?? "") ? Number(w) : w ?? "");
// „2W6 –1“ → „2W6–1“
const formel = (t) => String(t ?? "").replace(/\s+(?=[+–-]\s*\d)/g, "").replace(/([+–-])\s+/g, "$1").trim();

/** Spieldaten aus den Zeilen eines Eintrags. */
export function spieldatenLesen(zeilen) {
  const s = { lpFormel: "", apFormel: "", rk: "", gf: null, st: "", gw: "", in: "", b: "", abwehr: null, resistenzGeist: null, resistenzKoerper: null, schb: null, angriffe: [], raufen: null, faehigkeiten: [] };
  for (const z of zeilen) {
    if (/^LP\s/.test(z)) {
      const m = z.match(/^LP\s+(.+?)\s+AP\s+(.+?)\s+(\S*R)\b(?:\s+Gf\s+(\d+))?/);
      if (m) { s.lpFormel = formel(m[1]); s.apFormel = formel(m[2]); s.rk = m[3]; s.gf = m[4] ? Number(m[4]) : null; }
    } else if (/^St\s/.test(z)) {
      const m = z.match(/^St\s+(\S+)\s+Gw\s+(\S+)\s+In\s+(\S+)\s+B\s+(\S+)/);
      if (m) Object.assign(s, { st: wert(m[1]), gw: wert(m[2]), in: wert(m[3]), b: m[4] });
      const sb = z.match(/SchB\s*([+–-]\s*\d+)/); if (sb) s.schb = Number(sb[1].replace("–", "-").replace(/\s/g, ""));
    } else if (/^Abwehr/.test(z)) {
      const a = z.match(/^Abwehr\s*\+?\s*(\d+)/); if (a) s.abwehr = Number(a[1]);
      const r = z.match(/Resistenz\s*\+?\s*(\d+|\*)\s*\/\s*(\d+|\*)/);
      if (r) { s.resistenzGeist = r[1] === "*" ? null : Number(r[1]); s.resistenzKoerper = r[2] === "*" ? null : Number(r[2]); }
      if (!a || !r) s.faehigkeiten.push(z);   // „Abwehr var Resistenz var“
    } else if (/^Angriff/.test(z)) {
      Object.assign(s, angriffeZerlegen(z));
    } else s.faehigkeiten.push(z.replace(/^»(Zaubern[^«]*)«/, "$1"));
  }
  if (s.gf === null && s.grad !== undefined) s.gf = s.grad + 3;
  return s;
}

/**
 * Alle Wesen aus „Wesen von A - Z“ bis zum Ende der „Nichtspielerfiguren“.
 * @returns {Array<{name, art, grad, seite, werte, absaetze}>}
 */
export function bestiariumAusKodex(zeilen) {
  const start = zeilen.findIndex((z) => /^Wesen von A\s*-\s*Z$/.test(z.text) && z.groesse >= 14);
  if (start < 0) return [];
  let ende = zeilen.findIndex((z, i) => i > start && z.groesse >= 24);   // „Die Kosten des Abenteuers“
  if (ende < 0) ende = zeilen.length;
  const bereich = zeilen.slice(start + 1, ende).filter((z) => !(/^\d{1,3}$/.test(z.text) && z.groesse >= 14));
  const fliess = bereich.map((z) => z.abstand).filter((a) => a > 5 && a < 20).sort((a, b) => a - b);
  const abstand = fliess[Math.floor(fliess.length / 2)] || 12;
  const wesen = [];
  const istKopf = (i) => KOPF.test(bereich[i]?.text ?? "") && /^LP\s/.test(bereich[i + 1]?.text ?? "");
  for (let i = 0; i < bereich.length; i++) {
    if (!istKopf(i)) continue;
    const [, name, art, grad] = bereich[i].text.match(KOPF);
    // Spieldaten: bekannte Anfänge, reine Fertigkeitszeilen und Fortsetzungen unvollständiger Zeilen
    const stat = [];
    let j = i + 1;
    while (j < bereich.length && !istKopf(j)) {
      const t = bereich[j].text;
      // Fortsetzung: Zeile davor unvollständig, oder diese beginnt klein bzw. mit „(“
      if (stat.length && (unfertig(stat.at(-1)) || /^[(a-zäöüß]/.test(t))) { stat[stat.length - 1] = verbinden(stat.at(-1), t); j++; continue; }
      if (STAT.test(t) || FERT.test(t)) { stat.push(t); j++; continue; }
      break;
    }
    const text = [];
    while (j < bereich.length && !istKopf(j)) {
      // Zwischenüberschriften (z. B. „Nichtspielerfiguren“) gehören nicht zur Beschreibung
      if (bereich[j].groesse < 13) text.push(bereich[j]);
      j++;
    }
    const werte = spieldatenLesen(stat);
    werte.gf ??= Number(grad) + 3;   // Standard Grad+3, wenn nicht angegeben (Kodex S. 182)
    wesen.push({ name: art ? name : `${name}, Grad ${grad}`.replace(/^Normaler Mensch, Grad 0$/, "Normaler Mensch"), art: art ?? "Mensch", grad: Number(grad), seite: bereich[i].seite, werte, absaetze: absaetze(text, abstand) });
    i = j - 1;
  }
  return wesen;
}

// ------------------------------------------------------------------ Abenteuerbände
// Kompaktes Format der Abenteuer (Kasten am Rand, kleinere Schrift):
//   Ratsgardist (Krieger, Grad 3)
//   14 LP, 24 AP - KR - St 70, Gw 60, In 50, B 24
//   Angriff: Streitaxt+9 (1W6+2), kleiner Schild+2; Raufen+6 (1W6–3) - Abwehr+12, Resistenz+12/13
//   Bes.: …   Zaubern+15: …
// „Abwehr“ und „Resistenz“ stehen in Kapitälchen, die pdf.js als fremde Zeichen liest; gelesen wird
// deshalb nur Anfangsbuchstabe und Zahl. Die Werte sind fest (keine Würfelformeln).
// LP, AP und Rüstklasse fest am Anfang; St, Gw, In, B dahinter in beliebiger Reihenfolge („B26“, „MW+12 - Gw 50, St 90, B18“)
const KOMPAKT = /^(\*|\d+)\s*LP,\s*(∞|\*|\d+)\s*AP(?:\s*\([^)]*\))?\s*[-–]\s*(\S+)\s*[-–]\s*(.*\b(?:St|Gw)\b.*)$/;
const wertAus = (t, k) => t.match(new RegExp(`\\b${k}\\s*([^,\\s]+)`))?.[1]?.trim() ?? "";
const ABWEHR = /\s[-–]\s*A[^\d+]{0,14}\+\s*(\d+)\s*(\([^)]*\))?\s*,?\s*R[^\d+]{0,16}\+\s*(\d+|\*)\s*\/\s*\+?(\d+|\*)/;
/** Text an einem Trenner aufteilen, aber nicht innerhalb von Klammern. */
function ausserhalbKlammern(text, trenner) {
  const teile = [];
  let tiefe = 0, akt = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") tiefe++;
    if (c === ")") tiefe = Math.max(0, tiefe - 1);
    const m = tiefe === 0 ? text.slice(i).match(trenner) : null;
    if (m) { teile.push(akt.trim()); akt = ""; i += m[0].length - 1; continue; }
    akt += c;
  }
  teile.push(akt.trim());
  return teile;
}
const SEITENZAHL = (z) => /^\d{1,3}$/.test(z.text) && z.groesse >= 12;
const VERTEIDIGUNG = /schild|parier|buckler|kampfgabel/i;

// Anzahl vor dem Namen („2 Riesenratten“, „Zwölf Opfermesser“): ein Eintrag je Art, die Anzahl als Hinweis
const ZAHLWORT = { zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, "zwölf": 12, zwanzig: 20 };
const ANZAHL = new RegExp(`^(\\d+|${Object.keys(ZAHLWORT).join("|")})\\s+(.+)$`, "i");

/** Einzahl eines Wortes: bekannter Kandidat (Kodex, derselbe Band) vor wenigen Regeln; sonst unverändert. */
export function einzahl(wort, bekannt = new Set()) {
  const klein = (x) => x.toLocaleLowerCase("de");
  const bek = new Set([...bekannt].map(klein));
  const kandidaten = [wort, wort.replace(/äuse$/, "aus"), wort.replace(/ies$/, "ie"), wort.replace(/s$/, ""), wort.replace(/en$/, ""), wort.replace(/n$/, ""), wort.replace(/e$/, ""), `${wort}r`];
  const treffer = kandidaten.find((k) => k !== wort && bek.has(klein(k)));
  if (treffer) return treffer;
  if (bek.has(klein(wort))) return wort;
  for (const [re, ers] of [[/ratten$/, "ratte"], [/äuse$/, "aus"], [/trolle$/, "troll"], [/aten$/, "at"], [/ies$/, "ie"], [/lette$/, "lett"]]) if (re.test(wort)) return wort.replace(re, ers);
  return wort;
}

/** „2 Riesenratten“ → { anzahl: 2, name: "Riesenratte" }; ohne Anzahl unverändert. */
export function anzahlAbtrennen(text, bekannt = new Set()) {
  const m = String(text).match(ANZAHL);
  if (!m) return { anzahl: null, name: text };
  const anzahl = /^\d+$/.test(m[1]) ? Number(m[1]) : ZAHLWORT[m[1].toLocaleLowerCase("de")];
  if (!anzahl || anzahl < 2) return { anzahl: null, name: text };
  const woerter = m[2].split(" ");
  // führende Adjektive („Albische Seefahrer“) in die Einzahl, dann das erste Hauptwort
  let i = 0;
  while (i < woerter.length - 1 && /isch(e)$/.test(woerter[i])) { woerter[i] = `${woerter[i]}r`; i++; }
  woerter[i] = einzahl(woerter[i], bekannt);
  return { anzahl, name: woerter.join(" "), plural: m[2] };
}

/** Gegner aus einem Abenteuerband (alle Kästen im kompakten Format). bekannt: Namen und Arten bereits bekannter Wesen. */
export function gegnerAusAbenteuer(zeilen, { bekannt = new Set() } = {}) {
  // Namen ohne Anzahl aus diesem Band helfen bei der Einzahl der übrigen
  const eigene = new Set(zeilen.map((z) => z.text.match(KOPF)).filter(Boolean).flatMap((m) => [m[1], m[2]]).filter((x) => x && !ANZAHL.test(x)));
  const alle = new Set([...bekannt, ...eigene]);
  const wesen = [];
  const istKopf = (i) => KOPF.test(zeilen[i]?.text ?? "") && KOMPAKT.test(zeilen[i + 1]?.text ?? "");
  for (let i = 0; i < zeilen.length; i++) {
    if (!istKopf(i)) continue;
    const kopf = zeilen[i], groesse = kopf.groesse;
    const [, nameRoh, artRoh, grad] = kopf.text.match(KOPF);
    const { anzahl, name, plural } = anzahlAbtrennen(nameRoh, alle);
    const art = artRoh && anzahl ? artRoh.split(" ").map((w, k, l) => (k === l.length - 1 ? einzahl(w, alle) : w)).join(" ") : artRoh;
    const [, lp, ap, rk, rest] = zeilen[i + 1].text.match(KOMPAKT);
    const [st, gw, inn, b] = [wertAus(rest, "St"), wertAus(rest, "Gw"), wertAus(rest, "In"), wertAus(rest, "B")];
    // weitere Angaben in der Wertezeile (z. B. „MW+12“) als Fähigkeit
    const sonst = rest.split(/\s*[-–,]\s+/).map((x) => x.trim()).filter((x) => x && !/^(St|Gw|In|B)(?=\s|\d|\*|t\d|$)/.test(x));
    // Angriffszeile(n) bis einschließlich Abwehr/Resistenz, danach Besonderheiten
    let j = i + 2, angriff = "";
    while (j < zeilen.length && !istKopf(j) && (zeilen[j].groesse === groesse || SEITENZAHL(zeilen[j])) && !ABWEHR.test(angriff)) {
      if (!SEITENZAHL(zeilen[j])) angriff = angriff ? verbinden(angriff, zeilen[j].text) : zeilen[j].text;
      j++;
    }
    const extra = [];
    while (j < zeilen.length && !istKopf(j) && zeilen[j].groesse === groesse) {
      const t = zeilen[j].text;
      if (extra.length && (unfertig(extra.at(-1)) || /^[(a-zäöüß]/.test(t))) { extra[extra.length - 1] = verbinden(extra.at(-1), t); j++; continue; }
      if (STAT.test(t) || FERT.test(t) || /^\*/.test(t) || /^»/.test(t)) { extra.push(t); j++; continue; }
      break;
    }
    // Beschreibung: nur der Text im selben Kasten (gleiche Schriftgröße), nicht der Abenteuertext daneben
    const text = [];
    while (j < zeilen.length && !istKopf(j) && zeilen[j].groesse === groesse && zeilen[j].seite <= kopf.seite + 1) text.push(zeilen[j++]);
    const m = angriff.match(ABWEHR);
    // nach den Angriffen und Raufen können Sondermanöver folgen („- Kehlbiss“, „- Klammern, Raserei“)
    const [angriffText, ...manoever] = ausserhalbKlammern(m ? angriff.slice(0, m.index) : angriff, /^\s+[-–]\s+/);
    // in Bestiarium-Schreibweise übersetzen und mit demselben Leser auswerten
    const werte = spieldatenLesen([
      `LP ${lp} AP ${ap} ${rk}`,
      m ? `Abwehr+${m[1]} Resistenz+${m[3]}/${m[4]}` : "Abwehr var Resistenz var",
      angriffText.trim(), ...sonst, ...extra.map((x) => x.replace(/^\*/, "")),
    ]);
    Object.assign(werte, { st: wert(st), gw: wert(gw), in: wert(inn), b });
    if (m?.[2]) werte.faehigkeiten.unshift(`Abwehr ${m[2].replace(/[()]/g, "")}`);
    if (manoever.filter(Boolean).length) werte.faehigkeiten.unshift(`Sonderangriffe: ${manoever.filter(Boolean).join(", ")}`);
    // Schilde und Parierwaffen sind keine Angriffe: als Hinweis führen
    const vert = werte.angriffe.filter((x) => VERTEIDIGUNG.test(x.name));
    if (vert.length) {
      werte.angriffe = werte.angriffe.filter((x) => !vert.includes(x));
      werte.faehigkeiten.unshift(`Verteidigung: ${vert.map((x) => `${x.name}${x.ew !== null ? `+${x.ew}` : ""}`).join(", ")}`);
    }
    werte.gf ??= Number(grad) + 3;
    wesen.push({ name, art: art ?? "", grad: Number(grad), seite: kopf.seite, werte, absaetze: absaetze(text, 11), anzahl, auftritt: anzahl ? `${anzahl} ${plural}` : null });
    i = j - 1;
  }
  // gleicher Name mehrfach im Band (z. B. an mehreren Schauplätzen): Seitenzahl anhängen
  const zaehl = {};
  for (const w of wesen) zaehl[w.name] = (zaehl[w.name] || 0) + 1;
  const proSeite = {};
  for (const w of wesen) {
    if (zaehl[w.name] < 2) continue;
    const k = `${w.name}|${w.seite}`;
    proSeite[k] = (proSeite[k] || 0) + 1;
    const gleicheSeite = wesen.filter((x) => x.name === w.name && x.seite === w.seite).length > 1;
    w.neuerName = `${w.name} (S. ${w.seite}${gleicheSeite ? `, ${proSeite[k]}` : ""})`;
  }
  for (const w of wesen) if (w.neuerName) { w.name = w.neuerName; delete w.neuerName; }
  return wesen;
}

/**
 * Abenteuerband erkennen: „Start ins Abenteuer“ an seinen Abenteuern, sonst jeder Band mit dem Vermerk
 * „Fantasy-Abenteuer auf der Welt Midgard“ auf den ersten Seiten (Titel aus der Titelseite, Kampagnenteil
 * als Vorsatz, z. B. „Karmodin 1: Weißer Wolf und Seelenfresser“). Nur am Inhalt, nie am Dateinamen.
 */
export function abenteuerErkennen(zeilen) {
  const norm = (t) => String(t).toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+\d+$/, "").trim();
  const inhalt = new Set(zeilen.filter((z) => z.seite <= 6).map((z) => norm(z.text)));
  if (["die kinder des ogers", "das hügelgrab bei clydach", "blutmond", "die stadt thame"].filter((t) => inhalt.has(t)).length >= 3) return { titel: "Start ins Abenteuer" };
  const vermerk = zeilen.find((z) => z.seite <= 6 && /^Fantasy-Abenteuer auf der Welt Midgard$/.test(z.text));
  if (!vermerk) return null;
  const seite = zeilen.filter((z) => z.seite === vermerk.seite);
  const gross = Math.max(...seite.map((z) => z.groesse));
  const titel = seite.filter((z) => z.groesse === gross).map((z) => z.text).join(" ").replace(/\s+/g, " ").trim();
  const kampagne = seite.map((z) => z.text.match(/^Die (.+?)-Kampagne\s*[-–]\s*(?:Teil (\d+)|Vorspiel)$/)).find(Boolean);
  return { titel: kampagne ? `${kampagne[1]} ${kampagne[2] ?? 0}: ${titel}` : titel };
}

