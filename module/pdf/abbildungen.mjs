// Bildmaterial aus Abenteuern: Karten und Handouts. Läuft im Browser mit pdf.js (Lage der Bilder aus der
// Operatorliste, Ausschnitt aus der gerenderten Seite, damit Beschriftungen über dem Bild erhalten bleiben).
// Die Einordnung selbst (abbildungEinordnen, materialDokument) läuft rein auf Daten und ist in Node prüfbar.

// pdf.js-Operatoren (pdfjs-dist, OPS)
const OPS = { save: 10, restore: 11, transform: 12, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, paintImageMaskXObject: 83, paintImageXObject: 85, paintInlineImageXObject: 86 };
const mal = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

const KARTE = /\b(Karte|Karten|Lageplan|Plan|Grundriss|Übersichtskarte|Stadtplan|Umgebungskarte)\b/;
const HANDOUT = /\b(Handout|Handouts|Brief|Schriftstück|Urkunde|Notiz|Spielerinformation|Kopiervorlage)\b/i;
const GESCHOSS = /\b(Erdgeschoss|Obergeschoss|Untergeschoss|Kellergeschoss|Dachgeschoss|Keller|Ebene [IVX\d]+)\b/;

/**
 * Alle Bilder eines Dokuments mit Lage (PDF-Koordinaten, Ursprung unten links) und Text in und um das Bild.
 * @returns {Promise<Array<{seite, x, y, b, h, anteil, name, textInnen: string[], textUm: string[]}>>}
 */
export async function abbildungenFinden(doc, { von = 1, bis = doc.numPages } = {}) {
  const alle = [];
  for (let n = von; n <= Math.min(bis, doc.numPages); n++) {
    const seite = await doc.getPage(n);
    const [x0, y0, x1, y1] = seite.view;
    const flaeche = (x1 - x0) * (y1 - y0);
    const liste = await seite.getOperatorList();
    const stapel = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const bilder = [];
    for (let i = 0; i < liste.fnArray.length; i++) {
      const fn = liste.fnArray[i], arg = liste.argsArray[i];
      if (fn === OPS.save) stapel.push(ctm);
      else if (fn === OPS.restore) ctm = stapel.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mal(ctm, arg);
      else if (fn === OPS.paintFormXObjectBegin) { stapel.push(ctm); if (arg?.[0]) ctm = mal(ctm, arg[0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stapel.pop() ?? ctm;
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
        // Einheitsquadrat durch die aktuelle Matrix
        const ecken = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]]);
        const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
        const b = { x: Math.max(x0, Math.min(...xs)), y: Math.max(y0, Math.min(...ys)) };
        b.b = Math.min(x1, Math.max(...xs)) - b.x; b.h = Math.min(y1, Math.max(...ys)) - b.y;
        if (b.b > 1 && b.h > 1) bilder.push({ ...b, name: typeof arg?.[0] === "string" ? arg[0] : null, maske: fn === OPS.paintImageMaskXObject });
      }
    }
    if (!bilder.length) continue;
    const text = (await seite.getTextContent()).items.filter((t) => t.str?.trim()).map((t) => ({ s: t.str.trim(), x: t.transform[4], y: t.transform[5], g: Math.hypot(t.transform[2], t.transform[3]) }));
    const flaecheSeite = { flaeche, seitenBreite: x1 - x0, seitenHoehe: y1 - y0, text };
    for (const b of bilder) alle.push(textZuordnen({ seite: n, ...b, ...flaecheSeite }));
  }
  return alle;
}

/** Text in und um ein Bild (Bildunterschrift: bis 30 pt darüber oder darunter, waagerecht überlappend). */
function textZuordnen(a) {
  const { text } = a;
  const innen = text.filter((t) => t.x >= a.x - 1 && t.x <= a.x + a.b && t.y >= a.y - 1 && t.y <= a.y + a.h);
  const um = text.filter((t) => !innen.includes(t) && t.x >= a.x - 20 && t.x <= a.x + a.b && ((t.y < a.y && t.y > a.y - 30) || (t.y > a.y + a.h && t.y < a.y + a.h + 30)));
  // Unterschrift unter dem Bild, von oben nach unten (für Namen in Handout-Dokumenten)
  const unter = text.filter((t) => !innen.includes(t) && t.x >= a.x - 20 && t.x <= a.x + a.b + 20 && t.y < a.y && t.y > a.y - 30).sort((p, q) => q.y - p.y || p.x - q.x);
  return { ...a, anteil: (a.b * a.h) / a.flaeche, textInnen: innen.map((t) => t.s), textUm: um.map((t) => t.s), textUnter: unter.map((t) => t.s),
    seitenText: text.map((t) => t.s).join(" "), innenZeichen: innen.reduce((n, t) => n + t.s.length, 0), seitenZeichen: text.reduce((n, t) => n + t.s.length, 0) };
}

/**
 * Bildteile zusammenfassen, die sich überlappen oder bis auf 6 pt berühren (Brief aus zwei Bildhälften,
 * doppelt übereinandergelegte Fassungen). Masken und Seitenhintergründe bleiben für sich.
 */
export function bildteileZusammenfassen(abbildungen) {
  const out = [];
  for (const seite of [...new Set(abbildungen.map((a) => a.seite))]) {
    const teile = abbildungen.filter((a) => a.seite === seite).map((a) => ({ ...a }));
    const nah = (p, q) => p.x <= q.x + q.b + 6 && q.x <= p.x + p.b + 6 && p.y <= q.y + q.h + 6 && q.y <= p.y + p.h + 6;
    const tauglich = (a) => !a.maske && a.anteil <= 0.85;
    let weiter = true;
    while (weiter) {
      weiter = false;
      for (let i = 0; i < teile.length && !weiter; i++) for (let j = i + 1; j < teile.length; j++) {
        const p = teile[i], q = teile[j];
        if (!tauglich(p) || !tauglich(q) || !nah(p, q)) continue;
        const x = Math.min(p.x, q.x), y = Math.min(p.y, q.y);
        const neu = textZuordnen({ ...p, x, y, b: Math.max(p.x + p.b, q.x + q.b) - x, h: Math.max(p.y + p.h, q.y + q.h) - y, teile: (p.teile ?? 1) + (q.teile ?? 1) });
        teile.splice(j, 1); teile[i] = neu; weiter = true; break;
      }
    }
    out.push(...teile);
  }
  return out;
}

/**
 * Bildunterschriften in Handout- und Karten-Dokumenten: Text außerhalb der Bilder (oder bis 18 pt über der
 * Unterkante eines Bildes ohne eigenen Fließtext) gehört zu dem Bild, an dessen Unterkante er steht:
 * höchstens 55 pt darunter, waagerecht bis 150 pt links und 60 pt rechts der Kanten. Zeilen von oben nach unten,
 * mit Komma verbunden („Turm des Hexenmeisters Corwin, Keller“).
 */
function unterschriftenZuordnen(auswahl) {
  const out = new Map();
  for (const seite of [...new Set(auswahl.map((a) => a.seite))]) {
    const bilder = auswahl.filter((a) => a.seite === seite);
    const schrift = (a) => a.textInnen.length >= 3 && a.innenZeichen / a.textInnen.length >= 15;
    const zu = new Map();
    for (const t of bilder[0].text) {
      const innenVon = bilder.filter((a) => t.x >= a.x - 1 && t.x <= a.x + a.b && t.y >= a.y - 1 && t.y <= a.y + a.h);
      if (innenVon.some((a) => schrift(a) || t.y > a.y + 18)) continue;      // Fließtext im Bild, kein Rand
      const kandidaten = bilder.filter((a) => t.y >= a.y - 55 && t.y <= a.y + 18 && t.x >= a.x - 150 && t.x <= a.x + a.b + 60)
        .sort((p, q) => Math.abs(t.y - p.y) - Math.abs(t.y - q.y));
      if (kandidaten[0]) (zu.get(kandidaten[0]) ?? zu.set(kandidaten[0], []).get(kandidaten[0])).push(t);
    }
    for (const [a, teile] of zu) {
      const zeilen = [];
      for (const t of [...teile].sort((p, q) => q.y - p.y || p.x - q.x)) {
        const z = zeilen.find((l) => Math.abs(l.y - t.y) < 3);
        if (z) z.teile.push(t); else zeilen.push({ y: t.y, teile: [t] });
      }
      out.set(a, zeilen.map((l) => l.teile.sort((p, q) => p.x - q.x).map((t) => t.s).join(" ")).join(", ").replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

/**
 * Inhaltliche Abbildungen auswählen und einordnen. Entfällt: Titelseite, Seitenhintergründe (fast die
 * ganze Seite), Zierrat (klein, Banner und Logos im Querformat über 3,5 : 1, auf vielen Seiten wiederholt), Masken.
 * Karte (geprüft an Start ins Abenteuer und Karmodin 0-4, 87 von 100 Abbildungen richtig): mindestens 30 % der
 * Seite, mindestens drei Beschriftungen als Text im Bild, oder ein Kartenwort am Bild („Lageplan“, „Erdgeschoss“).
 * Dunkle Pläne prüft kartenRegel() zusätzlich an den Bildmerkmalen. Ein Handout-Wort am Bild geht vor.
 * @param {object} o  dokument: "abenteuer" (Karte oder Handout je Bild), "handouts", "karten" (alles dorthin)
 * @returns {Array<{seite, art: "karte"|"handout", titel, automatischerTitel, wortHandout, ...}>} in Dokumentreihenfolge
 */
export function abbildungEinordnen(abbildungen, { dokument = "abenteuer" } = {}) {
  abbildungen = bildteileZusammenfassen(abbildungen);
  const wiederholt = new Map();
  for (const a of abbildungen) if (a.name) wiederholt.set(a.name, (wiederholt.get(a.name) ?? new Set()).add(a.seite));
  const auswahl = abbildungen.filter((a) => !a.maske && a.anteil >= 0.04 && a.b >= a.seitenBreite * 0.2 && a.h >= 60 && a.b / a.h <= 3.5
    && !(a.anteil > 0.85) && (wiederholt.get(a.name)?.size ?? 1) <= 3 && !(dokument === "abenteuer" && a.seite === 1));
  const zaehl = { karte: 0, handout: 0 };
  const unterschriften = dokument !== "abenteuer" ? unterschriftenZuordnen(auswahl) : new Map();
  return auswahl.map((a) => {
    const am = [...a.textUm, ...a.textInnen].join(" ");
    // Text aus ganzen Sätzen über dem Bild: ein Schriftstück (Brief, Auftrag), Kartenbeschriftungen sind kurz
    const schriftstueck = a.textInnen.length >= 3 && a.innenZeichen / a.textInnen.length >= 15;
    const wortHandout = HANDOUT.test(am) || schriftstueck;
    let art;
    if (dokument === "handouts") art = "handout";        // Karten aus einem Handout-Dokument bleiben Handouts
    else if (dokument === "karten") art = "karte";
    else if (wortHandout) art = "handout";
    else art = a.anteil >= 0.3 || a.textInnen.length >= 3 || KARTE.test(am) || GESCHOSS.test(am) ? "karte" : "handout";
    // Handout- und Karten-Dokument: Bildunterschrift als Name („Schriftstück im Besitz des Hünen“)
    const unterschrift = unterschriften.get(a) ?? "";
    zaehl[art]++;
    // Titel: kurze Bildunterschrift mit Karten- bzw. Handout-Wort, sonst durchnummeriert
    const kurz = [...a.textUm, ...a.textInnen].find((t) => t.length >= 4 && t.length <= 60 && (art === "karte" ? KARTE.test(t) || GESCHOSS.test(t) : HANDOUT.test(t)));
    const name = unterschrift && unterschrift.length <= 80 ? unterschrift.charAt(0).toLocaleUpperCase("de") + unterschrift.slice(1) : kurz ? kurz.replace(/[.:]\s*$/, "") : null;
    return { ...a, art, wortHandout, unterschrift: !!(unterschrift && unterschrift.length <= 80), unterschriftZeichen: unterschrift.replace(/[, ]/g, "").length, automatischerTitel: !name, titel: `${name ?? `${art === "karte" ? "Karte" : "Handout"} ${zaehl[art]}`} (S. ${a.seite})`, nr: zaehl[art] };
  });
}

/** Zusätzliche Kartenregel aus Bildmerkmalen: dunkler Plan mit vielen geraden Wänden (Kellergewölbe, Ebenen). */
// zweiter Fall (Bluttränen, Kellerpläne mit grauer Textur): viele gerade Wände, wenig Schraffur (Kanten unter 0,07)
export const kartenRegel = (a, m) => (m.dunkel >= 0.53 && m.linien >= 0.2) || (m.dunkel >= 0.25 && m.linien >= 0.22 && m.kanten < 0.07);

/**
 * Eigenes Material-Dokument erkennen (Handouts oder Karten zu einem Abenteuer, auch als PDF):
 * „Handout“ im Text oder Dateinamen → Handouts (auch wenn Karten darin sind); sonst „Karte(n)/Plan“ → Karten.
 * @returns {"handouts"|"karten"|null}
 */
export const handoutImNamen = (dateiname) => /handout/i.test(String(dateiname ?? "").normalize("NFC"));

export function materialDokument(zeilen, dateiname = "") {
  const anfang = zeilen.filter((z) => z.seite <= 3).map((z) => z.text).join(" ");
  const name = String(dateiname).replace(/\.pdf$/i, "");
  if (handoutImNamen(name) || /\bhandouts?\b/i.test(anfang)) return "handouts";
  if (/\b(karten?|pläne|plan|lagepläne)\b/i.test(name) || /^\s*(Karten|Pläne|Lagepläne)\b/i.test(anfang)) return "karten";
  return null;
}

/**
 * Ausschnitt einer Abbildung als Bild (WebP, längste Seite höchstens maxPixel). Gerendert wird die ganze Seite,
 * damit Beschriftungen und Linien über dem Rasterbild mitkommen.
 * @returns {Promise<{blob: Blob, breite, hoehe}>}
 */
export async function abbildungRendern(doc, a, { maxPixel = 2400, ganzeSeite = false } = {}) {
  const seite = await doc.getPage(a.seite);
  const [x0, y0, , y1] = seite.view;
  const bereich = ganzeSeite ? { x: x0, y: y0, b: a.seitenBreite, h: a.seitenHoehe } : a;
  const skala = Math.min(4, maxPixel / Math.max(bereich.b, bereich.h));
  const vp = seite.getViewport({ scale: skala });
  const leinwand = document.createElement("canvas");
  leinwand.width = Math.ceil(vp.width); leinwand.height = Math.ceil(vp.height);
  await seite.render({ canvasContext: leinwand.getContext("2d"), viewport: vp, background: "#ffffff" }).promise;
  // PDF-Koordinaten (unten links) in Pixel (oben links)
  const px = Math.round((bereich.x - x0) * skala), py = Math.round((y1 - (bereich.y + bereich.h)) * skala);
  const breite = Math.max(1, Math.round(bereich.b * skala)), hoehe = Math.max(1, Math.round(bereich.h * skala));
  const aus = document.createElement("canvas");
  aus.width = breite; aus.height = hoehe;
  aus.getContext("2d").drawImage(leinwand, px, py, breite, hoehe, 0, 0, breite, hoehe);
  const blob = await new Promise((r) => aus.toBlob(r, "image/webp", 0.86));
  return { blob, breite, hoehe };
}

/**
 * Bildmerkmale aus einer verkleinerten Fassung (Graustufen): Anteil dunkler, heller und mittlerer Pixel und
 * Anteil langer gerader Linien (Zeilen oder Spalten, in denen ein dunkler Lauf über ein Drittel der Breite geht).
 */
export async function bildMerkmale(doc, a) {
  const { blob, breite, hoehe } = await abbildungRendern(doc, a, { maxPixel: 240 });
  const bild = await createImageBitmap(blob);
  const c = document.createElement("canvas"); c.width = breite; c.height = hoehe;
  const g = c.getContext("2d"); g.drawImage(bild, 0, 0);
  const d = g.getImageData(0, 0, breite, hoehe).data;
  const grau = new Uint8Array(breite * hoehe);
  let dunkel = 0, hell = 0;
  for (let i = 0; i < grau.length; i++) { const v = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10; grau[i] = v; if (v < 70) dunkel++; else if (v > 225) hell++; }
  const lauf = (laenge, holen) => { let best = 0, akt = 0; for (let k = 0; k < laenge; k++) { if (holen(k) < 110) { akt++; best = Math.max(best, akt); } else akt = 0; } return best; };
  let linienZ = 0, linienS = 0;
  for (let y = 0; y < hoehe; y++) if (lauf(breite, (x) => grau[y * breite + x]) > breite / 3) linienZ++;
  for (let x = 0; x < breite; x++) if (lauf(hoehe, (y) => grau[y * breite + x]) > hoehe / 3) linienS++;
  // Kanten: Anteil benachbarter Pixel mit starkem Helligkeitssprung
  let kanten = 0;
  for (let y = 0; y < hoehe; y++) for (let x = 1; x < breite; x++) if (Math.abs(grau[y * breite + x] - grau[y * breite + x - 1]) > 60) kanten++;
  const n = grau.length;
  return { dunkel: dunkel / n, hell: hell / n, mitte: 1 - (dunkel + hell) / n, linien: (linienZ + linienS) / (breite + hoehe), kanten: kanten / n };
}
