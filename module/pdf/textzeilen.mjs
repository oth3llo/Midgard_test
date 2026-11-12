import { trennstelle, woerterVerbinden } from "./textpruefung.mjs";

// Zerlegt PDF-Seiten (pdf.js) in Textzeilen in Lesereihenfolge: zweispaltiger Satz,
// linke Spalte von oben nach unten, dann rechte. Läuft im Browser (Foundry) und in Node (Tests).

/**
 * @param {object} doc        pdf.js-Dokument
 * @param {number} von, bis   Seitennummern (1-basiert, einschließlich)
 * @returns {Promise<Array<{text, x, y, groesse, schrift, seite, spalte, abstand}>>}
 */
export async function textzeilen(doc, von = 1, bis = doc.numPages) {
  const alle = [];
  for (let n = von; n <= Math.min(bis, doc.numPages); n++) {
    const seite = await doc.getPage(n);
    const breite = seite.view[2] - seite.view[0];
    const hoehe = seite.view[3] - seite.view[1];
    const inhalt = await seite.getTextContent();
    const stuecke = inhalt.items.filter((i) => i.str !== undefined && (i.str.trim() || i.hasEOL)).map((i) => ({
      text: i.str, x: i.transform[4], y: i.transform[5], groesse: Math.round(Math.hypot(i.transform[2], i.transform[3]) * 10) / 10,
      schrift: i.fontName, breite: i.width,
    }));
    const mitte = breite / 2;
    // Grundschrift der Seite: die Schrift mit dem meisten Text
    const menge = new Map();
    for (const st of stuecke) menge.set(st.schrift, (menge.get(st.schrift) || 0) + st.text.length);
    const grundschrift = [...menge].sort((a, b) => b[1] - a[1])[0]?.[0];
    // Kästen quer über dem Mittelsteg (z. B. „Der Ablauf eines Angriffs“, Kodex S. 69): Zweispaltiger
    // Fließtext überquert die Mitte nie; ein Stück, das es tut, gehört zu einem Kasten. Alles in dessen
    // Höhenbereich rechts von seiner linken Kante wird als eigener Block (Spalte 2) gelesen.
    const kaesten = stegKaesten(stuecke, mitte);
    // Fortsetzung einer Fließtextzeile gehört nicht zum Kasten: ein Stück im Kastenbereich, das ohne Lücke
    // (unter 10 pt) an ein Stück links der Kastenkante oder an eine schon erkannte Fortsetzung anschließt
    // rechts begrenzt durch die Breite der Kastenstücke: Fließtext der rechten Spalte daneben bleibt Fließtext
    const imBereich = (s, k) => s.y >= k.yMin - 1 && s.y <= k.yMax + 1 && s.x >= k.x - 2 && s.x <= k.xMax + 10;
    const fortsetzungen = new Set();
    for (const k of kaesten) {
      const zone = stuecke.filter((s) => s.text.trim() && imBereich(s, k)).sort((a, b) => a.x - b.x);
      let neu = true;
      while (neu) {
        neu = false;
        for (const s of zone) {
          if (fortsetzungen.has(s)) continue;
          const davor = stuecke.some((t) => t !== s && Math.abs(t.y - s.y) < 2 && t.x < s.x && t.x + (t.breite ?? 0) > s.x - 10
            && (t.x < k.x - 2 || fortsetzungen.has(t)));
          if (davor) { fortsetzungen.add(s); neu = true; }
        }
      }
    }
    const imKasten = (s) => !fortsetzungen.has(s) && kaesten.find((k) => imBereich(s, k));
    const proSpalte = [[], [], []];
    for (const spalte of [0, 1, 2]) {
      const teil = stuecke.filter((s) => s.text.trim() && (spalte === 2 ? imKasten(s) : !imKasten(s) && (spalte === 0 ? s.x < mitte - 5 : s.x >= mitte - 5)));
      // Zeilen: gleiche Grundlinie (Toleranz 2 pt)
      teil.sort((a, b) => b.y - a.y || a.x - b.x);
      const zeilen = [];
      for (const s of teil) {
        const z = zeilen.find((l) => Math.abs(l.y - s.y) < 2);
        if (z) z.teile.push(s); else zeilen.push({ y: s.y, teile: [s] });
      }
      zeilen.sort((a, b) => b.y - a.y);
      // Initiale (großer Anfangsbuchstabe über mehrere Zeilen): der obersten Zeile rechts daneben voranstellen
      for (const ini of zeilen.filter((l) => l.teile.length === 1 && l.teile[0].groesse >= 30 && l.teile[0].text.trim().length <= 2)) {
        const t = ini.teile[0];
        const daneben = zeilen.filter((l) => l !== ini && l.y >= t.y - 8 && l.y <= t.y + t.groesse * 1.1 && l.teile[0].x > t.x);
        if (!daneben.length) continue;
        const oben = daneben.reduce((a, b) => (b.y > a.y ? b : a));
        oben.teile.sort((a, b) => a.x - b.x);
        oben.teile[0] = { ...oben.teile[0], text: t.text.trim() + oben.teile[0].text.trimStart() };
        for (const l of daneben) l.nebenInitiale = true;
        ini.weg = true;
      }
      for (let k = zeilen.length - 1; k >= 0; k--) if (zeilen[k].weg) zeilen.splice(k, 1);
      let vorher = null;
      for (const z of zeilen) {
        z.teile.sort((a, b) => a.x - b.x);
        let text = "";
        let ende = null;
        for (const t of z.teile) {
          if (ende !== null && t.x - ende > t.groesse * 0.15 && !text.endsWith(" ") && !t.text.startsWith(" ")) text += " ";
          text += t.text;
          ende = t.x + t.breite;
        }
        text = text.replace(/\s+/g, " ").replace(/^[\uE000-\uF8FF]\s*/, "").trim();
        if (!text) continue;
        const kopf = z.teile.reduce((a, b) => (b.groesse > a.groesse ? b : a));
        // Tabellenspalten: Stücke, zwischen denen eine deutliche Lücke liegt
        const spalten = [];
        let sEnde = null;
        for (const t of z.teile) {
          const tt = t.text.replace(/\s+/g, " ");
          if (sEnde !== null && t.x - sEnde > Math.max(t.groesse * 1.5, 12)) spalten.push({ x: t.x, text: tt.trim() });
          else if (spalten.length) spalten.at(-1).text = (spalten.at(-1).text + (sEnde !== null && t.x - sEnde > t.groesse * 0.15 ? " " : "") + tt).replace(/\s+/g, " ");
          else spalten.push({ x: t.x, text: tt.trim() });
          sEnde = t.x + t.breite;
        }
        // Aufzählung (Sonderzeichen aus dem privaten Unicode-Bereich am Zeilenanfang) und fetter Einstieg:
        // erste zusammenhängende Folge von Stücken in einer anderen Schrift als der Grundschrift
        const aufzaehlung = /^[\uE000-\uF8FF•▪■◆]/.test(z.teile[0].text.trim());
        let fett = "", imFett = false, gelesen = 0;
        for (const t of z.teile) {
          const tt = t.text.trim();
          if (!tt || /^[\uE000-\uF8FF•▪■◆]+$/.test(tt)) continue;
          if (t.schrift !== grundschrift) { fett += (fett ? " " : "") + tt; imFett = true; }
          else if (imFett || (gelesen += tt.length) > 60) break;
        }
        proSpalte[spalte].push({ text, x: z.teile[0].x, ende: z.teile.at(-1).x + z.teile.at(-1).breite, y: z.y, aufzaehlung, fett: fett.replace(/[:*\s]+$/, "").replace(/\*/g, "").trim(), groesse: kopf.groesse, schrift: kopf.schrift, seite: n, spalte, hoehe, abstand: vorher === null ? null : vorher - z.y,
          spalten: spalten.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text), nebenInitiale: !!z.nebenInitiale });
        vorher = z.y;
      }
    }
    // Kastenzeilen in die linke Spalte vor die erste Zeile unterhalb des Kastens setzen
    const [links, rechts, kasten] = proSpalte;
    if (kasten.length) {
      for (const z of kasten) z.kasten = true;
      const unten = Math.min(...kaesten.map((k) => k.yMin));
      const pos = links.findIndex((z) => z.y < unten);
      links.splice(pos < 0 ? links.length : pos, 0, ...kasten);
    }
    alle.push(...links, ...rechts);
  }
  ligaturenReparieren(alle);
  // Einzug je Seite und Spalte: Abstand zum linken Rand des Fließtexts (Kästen sind eingerückt)
  const rand = new Map();
  for (const z of alle) {
    if (z.text.length < 40) continue;
    const k = `${z.seite}/${z.spalte}`, x = Math.round(z.x);
    const m = rand.get(k) ?? new Map();
    m.set(x, (m.get(x) || 0) + 1);
    rand.set(k, m);
  }
  for (const z of alle) {
    const m = rand.get(`${z.seite}/${z.spalte}`);
    const basis = m ? [...m].sort((a, b) => b[1] - a[1])[0][0] : z.x;
    z.einzug = z.kasten ? Math.max(20, Math.round(z.x - basis)) : z.nebenInitiale ? 0 : Math.round(z.x - basis);
  }
  return alle;
}

/**
 * Kästen, die über den Mittelsteg reichen. Anker sind Textstücke, die links der Mitte beginnen und
 * rechts davon enden; der Höhenbereich wird um benachbarte Stücke erweitert, die in der linken
 * Seitenhälfte ungewöhnlich weit rechts beginnen (Kastentitel, kurze Kastenzeilen).
 * @returns {Array<{x, yMin, yMax}>}
 */
export function stegKaesten(stuecke, mitte) {
  const text = stuecke.filter((s) => s.text.trim() && s.groesse >= 7.5 && s.groesse <= 12.5);
  const anker = text.filter((s) => s.x < mitte - 5 && s.x + (s.breite ?? 0) > mitte + 8 && s.x > mitte * 0.6);
  if (!anker.length) return [];
  // Gruppen nach Höhe (Lücke über 40 pt trennt Kästen)
  anker.sort((a, b) => b.y - a.y);
  const gruppen = [];
  for (const a of anker) {
    const g = gruppen.at(-1);
    const ende = a.x + (a.breite ?? 0);
    if (g && g.yMin - a.y < 40) { g.yMin = Math.min(g.yMin, a.y); g.x = Math.min(g.x, a.x); g.xMax = Math.max(g.xMax, ende); }
    else gruppen.push({ x: a.x, xMax: ende, yMin: a.y, yMax: a.y });
  }
  // erweitern: Stücke links der Mitte, die weit rechts beginnen (nicht am Spaltenrand), nahe am Kasten
  const randLinks = Math.min(...text.filter((s) => s.x < mitte - 5).map((s) => s.x));
  for (const g of gruppen) {
    let geaendert = true;
    while (geaendert) {
      geaendert = false;
      for (const s of text) {
        if (s.x >= mitte - 5 || s.x < Math.max(randLinks + 60, mitte * 0.6)) continue;
        if (s.y > g.yMax + 30 || s.y < g.yMin - 30 || (s.y <= g.yMax && s.y >= g.yMin && s.x >= g.x)) continue;
        g.yMin = Math.min(g.yMin, s.y); g.yMax = Math.max(g.yMax, s.y); g.x = Math.min(g.x, s.x); g.xMax = Math.max(g.xMax, s.x + (s.breite ?? 0)); geaendert = true;
      }
    }
  }
  // rechts erweitern um Tabellenspalten (kurze Stücke gleicher Ausrichtung), nicht um Fließtext der rechten
  // Spalte (Stücke, die überwiegend bis an den rechten Rand reichen)
  for (const g of gruppen) {
    const kandidaten = text.filter((s) => s.y >= g.yMin - 1 && s.y <= g.yMax + 1 && s.x > g.xMax + 10);
    const nachKante = new Map();
    for (const s of kandidaten) { const k = Math.round(s.x / 4); nachKante.set(k, [...(nachKante.get(k) ?? []), s]); }
    for (const liste of nachKante.values()) {
      // Fließtext: überwiegend lange Stücke (Zeilen einer Spalte); Tabellenzellen sind kurz, auch rechtsbündige
      const fliesstext = liste.filter((s) => (s.breite ?? 0) >= 110).length / liste.length >= 0.5;
      if (!fliesstext) g.xMax = Math.max(g.xMax, ...liste.map((s) => s.x + (s.breite ?? 0)));
    }
  }
  return gruppen;
}

/**
 * Manche PDFs geben die Ligaturen fl, ff, fi mit einem Leerzeichen dahinter aus („Pfl anzenkunde“).
 * Verbunden wird nur, wenn das Bruchstück danach im Buch nicht als eigenes Wort vorkommt;
 * so bleibt „Angriff mit“ getrennt, „Angriff e“ wird zu „Angriffe“.
 */
export function ligaturenReparieren(zeilen) {
  const LIG = /(ffi|ffl|ff|fl|fi) ([a-zäöüß][a-zäöüß-]*)/g;
  const woerter = new Map();
  for (const z of zeilen) {
    for (const m of z.text.matchAll(/(^|[\s(„"])([a-zäöüß]+)/g)) {
      const vorher = z.text.slice(Math.max(0, m.index - 4), m.index + m[1].length);
      if (/(ffi|ffl|ff|fl|fi) $/.test(vorher)) continue; // Bruchstück nach Ligatur zählt nicht
      woerter.set(m[2], (woerter.get(m[2]) || 0) + 1);
    }
  }
  // kurze Bruchstücke wie „s“, „e“, „en“ sind Wortenden, außer echten Kurzwörtern
  const KURZ = new Set(["in", "an", "am", "um", "zu", "so", "da", "ob", "es", "er", "im", "ab", "je", "ja", "wo", "du", "wir", "ihr", "sie"]);
  const reparieren = (text) => text.replace(LIG, (ganz, lig, rest) => {
      const wort = rest.replace(/-$/, "");
      const eigenes = wort.length <= 2 ? KURZ.has(wort) : woerter.has(wort);
      return eigenes ? ganz : lig + rest;
    });
  for (const z of zeilen) {
    for (const sp of z.spalten ?? []) sp.text = reparieren(sp.text);
    z.text = z.text.replace(LIG, (ganz, lig, rest) => {
      const wort = rest.replace(/-$/, "");
      const eigenes = wort.length <= 2 ? KURZ.has(wort) : woerter.has(wort);
      return eigenes ? ganz : lig + rest;
    });
  }
}

/** Zwei Zeilen verbinden; an Trennstellen entscheidet das Wörterbuch des Buches (textpruefung.mjs), sonst die Grundregel. */
export const verbinden = (akt, text) => {
  if (!akt) return text;
  if (/\p{L}-$/u.test(akt)) { const t = trennstelle(akt, text); if (t !== null) return t; }
  if (/[a-zäöüß]-$/.test(akt) && /^[a-zäöüß]/.test(text) && !/^(und|oder|bzw\.|sowie)\b/.test(text)) return akt.slice(0, -1) + text;
  return `${akt} ${text}`;
};

/**
 * Fügt Zeilen zu Blöcken zusammen: Absätze (Text), Tabellen ({tabelle: [[Zelle, …], …]}) und
 * eingerückte Kästen ({kasten: [Zeile, …]}). Silbentrennung am Zeilenende wird aufgelöst.
 */
const AUFZAEHLUNG = /^(?:[•▪■◆]|[-–])\s/;

export function absaetze(zeilen, zeilenabstand) {
  const out = [];
  let akt = "";
  const absatzEnde = () => { if (akt) out.push(woerterVerbinden(akt)); akt = ""; };
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    // Aufzählungspunkt mit hängendem Einzug: die eingerückten Folgezeilen gehören zum Punkt
    if (akt && AUFZAEHLUNG.test(akt) && !AUFZAEHLUNG.test(z.text) && (z.spalten?.length ?? 1) < 2
      && z.abstand !== null && z.abstand >= 0 && z.abstand < zeilenabstand * 1.45) {
      akt = verbinden(akt, z.text);
      continue;
    }
    if (AUFZAEHLUNG.test(z.text)) absatzEnde();
    // Tabelle: mindestens zwei aufeinanderfolgende Zeilen mit zwei oder mehr Spalten
    if ((z.spalten?.length ?? 0) >= 2 && (zeilen[i + 1]?.spalten?.length ?? 0) >= 2) {
      absatzEnde();
      const tab = [];
      let j = i;
      for (; j < zeilen.length; j++) {
        const r = zeilen[j];
        const n = r.spalten?.length ?? 0;
        if (n >= 2) { tab.push(r); continue; }
        // einspaltige Zeile innerhalb der Tabelle: Fortsetzung einer Zelle oder Zwischenüberschrift
        const naechste = zeilen[j + 1];
        if (n === 1 && tab.length && (naechste?.spalten?.length ?? 0) >= 2 && (r.abstand ?? 99) < zeilenabstand * 1.6) { tab.push(r); continue; }
        if (n === 1 && tab.length && (r.abstand ?? 99) < zeilenabstand * 1.3 && r.x > tab[0].x + 20) { tab.push(r); continue; }
        break;
      }
      out.push({ tabelle: tabelleBauen(tab) });
      i = j - 1;
      continue;
    }
    // eingerückter Kasten: Zeilen einzeln behalten, Stufen wie „sehr leicht (+4)“ als eigene Zeile
    if ((z.einzug ?? 0) >= 8) {
      absatzEnde();
      const kasten = [];
      let j = i;
      let k = i;
      while (k < zeilen.length && (zeilen[k].einzug ?? 0) >= 8 && (zeilen[k].spalten?.length ?? 1) < 2) k++;
      const rechts = Math.max(...zeilen.slice(i, k).map((x) => x.ende ?? 0));
      for (; j < k; j++) {
        const t = zeilen[j].text, letzte = kasten.at(-1), vorige = zeilen[j - 1];
        // neuer Eintrag nach einer Stufe „(+4)“ oder wenn die vorige Zeile nicht bis zum rechten Rand reichte
        const kurz = vorige && (vorige.ende ?? rechts) < rechts - 15;
        const neueZeile = !letzte || /\([+–-]\d+\)$/.test(t) || /\([+–-]\d+\)$/.test(letzte) || (kurz && /^[A-ZÄÖÜ„(]/.test(t));
        if (neueZeile) kasten.push(t); else kasten[kasten.length - 1] = verbinden(letzte, t);
      }
      if (kasten.length > 1) { out.push({ kasten }); i = j - 1; continue; }
      // zusammenhängender eingerückter Text (Beispiel, Randnotiz): ein Block statt einer Zeile je Absatz
      if (k - i >= 2) { out.push({ einschub: woerterVerbinden(kasten[0]), klein: zeilen.slice(i, k).every((x) => x.groesse < 9.6) }); i = k - 1; continue; }
      // einzelne eingerückte Zeile: normaler Text
    }
    // Großer Abstand beginnt einen Absatz, außer der Satz läuft erkennbar weiter (Kasten oder
    // Beispiel mitten in der Spalte): voriger Text ohne Satzende und Zeile beginnt klein.
    const satzLaeuft = !/[.!?:“")]$/.test(akt) && /^[a-zäöüß]/.test(z.text);
    if (akt && z.abstand !== null && (z.abstand > zeilenabstand * 1.45 || z.abstand < 0) && !satzLaeuft) absatzEnde();
    akt = verbinden(akt, z.text);
  }
  absatzEnde();
  return out.filter((b) => (typeof b === "string" ? b.length > 1 : true));
}

/** Spalten über alle Zeilen ausrichten und Zellen zuordnen. */
function tabelleBauen(zeilen) {
  const xs = [];
  for (const z of zeilen) for (const s of z.spalten ?? []) {
    const nah = xs.find((x) => Math.abs(x.x - s.x) <= 8);
    if (nah) { nah.n++; } else xs.push({ x: s.x, n: 1 });
  }
  const spalten = xs.filter((x) => x.n >= 2 || zeilen.length < 3).map((x) => x.x).sort((a, b) => a - b);
  const index = (x) => { let best = 0; for (let k = 0; k < spalten.length; k++) if (Math.abs(spalten[k] - x) < Math.abs(spalten[best] - x)) best = k; return best; };
  const reihen = [];
  for (const z of zeilen) {
    const zellen = Array(spalten.length).fill("");
    for (const s of z.spalten ?? [{ x: z.x, text: z.text }]) { const k = index(s.x); zellen[k] = zellen[k] ? verbinden(zellen[k], s.text) : s.text; }
    const belegt = zellen.filter(Boolean).length;
    // einspaltige Fortsetzungszeile an die vorige Zelle derselben Spalte anhängen
    if (belegt === 1 && reihen.length && !zellen[0] && (z.abstand ?? 99) < 16) {
      const k = zellen.findIndex(Boolean);
      reihen.at(-1)[k] = verbinden(reihen.at(-1)[k], zellen[k]);
      continue;
    }
    reihen.push(zellen);
  }
  return reihen;
}
