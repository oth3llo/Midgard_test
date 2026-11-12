// Gliedert die Blöcke eines Abschnitts (Ergebnis von absaetze()) für die Darstellung:
// W%-Tabellen, Aufzählungen, nummerierte Handlungsschritte, Merkkästen („Erfolgswurf: 1W20 + …“),
// Beispiele, Randnotizen, Fußnoten und Tabellentitel. Arbeitet rein auf Daten (Node und Browser).
import { verbinden } from "./textzeilen.mjs";
import { umbruchMelden, lueckeMelden, wortLuecke } from "./textpruefung.mjs";

const AUFZ = /^(?:[•▪■◆]|[-–])\s+/;
const BEREICH = /^(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?\s+(?:[†*]\s*)?(\S.*)$/;
const NUMMER = /^(\d{1,2})([a-z]?)\.\s+(\S.*)$/;
const TITEL = /^(Tabelle \d+[a-z]?)\s*:\s*(.*)$/;
const TITEL_AM_ENDE = /\s(Tabelle \d+[a-z]?:\s*[^.]{3,80})$/;
// Zeile einer kleinen Wertetabelle: „Grad 1 2 5 10 15 20 25 30“, „FW +11 +12 +13 …“
const WERTZEILE = /^([A-Za-zÄÖÜäöü][\wäöüß.]{0,14})((?:\s+[+–-]?\d[\d.,]*){3,})$/;
// Beispiel nach Midgard-Art: Figur mit Werten in Klammern, „Ailinn (Wahrnehmung+6, …)“
const BEISPIEL = /[A-ZÄÖÜ][a-zäöüß]+ \((?:[A-ZÄÖÜ][\wäöüß]*[+–-]\d+|Grad \d+)/;

const text = (b) => (typeof b === "string" ? b : null);

/** Würfel zur höchsten Zahl einer Tabelle. */
export function wuerfelFuer(max) {
  return max <= 6 ? "1d6" : max <= 10 ? "1d10" : max <= 20 ? "1d20" : "1d100";
}

/** Tabellentitel aus dem Block davor lösen („Tabelle 5: …“ allein, als Kasten oder am Ende eines Absatzes). */
function titelAbtrennen(out) {
  const vor = out.at(-1);
  if (vor === undefined) return null;
  const t = text(vor);
  if (t !== null) {
    const m = t.match(TITEL);
    if (m) { out.pop(); return `${m[1]}: ${m[2]}`.replace(/:\s*$/, ""); }
    const e = t.match(TITEL_AM_ENDE);
    if (e) { out[out.length - 1] = t.slice(0, e.index).trim(); return e[1].trim(); }
    return null;
  }
  if (vor.kasten && vor.kasten.length <= 2 && TITEL.test(vor.kasten[0])) { out.pop(); return vor.kasten.join(" ").replace(/:\s+/, ": "); }
  return null;
}

/** Nächster Bereich einer W%-Tabelle in den Blöcken ab j (höchstens zwei Blöcke weiter)? */
function folgtBereich(bl, j, erwartet) {
  for (let k = j; k < Math.min(bl.length, j + 3); k++) {
    const m = text(bl[k])?.match(BEREICH);
    if (m) return +m[1] === erwartet;
  }
  return false;
}

/**
 * W%-Tabelle ab Index i: mindestens drei lückenlos aufeinanderfolgende Bereiche („01-10 …“, „11-20 …“).
 * Zwischen zwei Zeilen stehende Erläuterungen (Einschübe, Folgezeilen) gehören zur Zeile davor.
 */
function wurftabelle(bl, i) {
  const zeilen = [];
  let j = i, erwartet = null, folgeTitel = null;
  // Zeile wie „11-20 kurzer Schock“ mit Erläuterung darunter: Stichwort und Erläuterung getrennt halten
  const anhaengen = (t) => {
    const z = zeilen.at(-1);
    if (z.detail !== undefined) z.detail = /[.!?:]$/.test(z.detail) ? `${z.detail} ${t}` : verbinden(z.detail, t);
    else if (!/[.!?:,;]$/.test(z.text) && /^[A-ZÄÖÜ0-9„]/.test(t) && z.text.length <= 60) z.detail = t;
    else z.text = /[.!?:]$/.test(z.text) ? `${z.text} ${t}` : verbinden(z.text, t);
  };
  for (; j < bl.length; j++) {
    const b = bl[j], t = text(b);
    const m = t?.match(BEREICH);
    if (m) {
      const von = +m[1], bis = m[2] ? +m[2] : von;
      if (bis < von || (erwartet !== null && von !== erwartet)) break;
      if (erwartet === null && von > 1) break;
      zeilen.push({ von, bis, text: m[3].replace(/\s{2,}/g, " ").trim() });
      erwartet = bis + 1;
      continue;
    }
    if (!zeilen.length) break;
    const inhalt = t ?? b.einschub ?? (b.kasten ? b.kasten.join(" ") : null);
    if (inhalt === null) break;
    const sauber = inhalt.replace(/^[•▪]\s*:\s*/, "");
    if (/^[a-zäöüß(]/.test(sauber) || folgtBereich(bl, j + 1, erwartet)) { anhaengen(sauber); continue; }
    break;
  }
  if (zeilen.length < 3) return null;
  // „… 1W6 Runden später wieder zu sich. Tabelle 7: Kritischer Schaden“: Titel der nächsten Tabelle abtrennen
  const letzte = zeilen.at(-1), e = letzte.text.match(TITEL_AM_ENDE);
  if (e) { letzte.text = letzte.text.slice(0, e.index).trim(); folgeTitel = e[1].trim(); }
  const max = letzte.bis;
  const breite = String(max).length >= 3 ? 2 : String(max).length;
  const fmt = (n) => (n === 100 ? "100" : String(n).padStart(breite, "0"));
  return {
    ende: j,
    folgeTitel,
    block: {
      wurftabelle: {
        wuerfel: wuerfelFuer(max),
        zeilen: zeilen.map((z) => [z.von === z.bis ? fmt(z.von) : `${fmt(z.von)}–${fmt(z.bis)}`, z.text, ...(z.detail ? [z.detail] : [])]),
      },
    },
  };
}

/**
 * Merkzeilen eines Regelkastens: kurze Zeilen „Erfolg bei: Eigenschaftswert“ / „oder weniger“,
 * davor eine Überschrift ohne Doppelpunkt („Prüfwurf mit W%“).
 */
const MERKZEILE = /^([A-ZÄÖÜ][^:]{1,30}):\s+(\S.*)$/;
function merkzeilen(bl, i) {
  const paare = [];
  let j = i;
  for (; j < bl.length; j++) {
    const t = text(bl[j]);
    if (t === null || t.length > 70) break;
    const m = t.match(MERKZEILE);
    if (m) { paare.push([m[1], m[2].replace(/[,-]$/, (c) => (c === "-" ? "-" : ""))]); continue; }
    if (paare.length && /^[a-zäöüß(]/.test(t) && t.length < 50) { const p = paare.at(-1); p[1] = verbinden(p[1], t).replace(/,$/, ""); continue; }
    break;
  }
  return paare.length >= 2 ? { ende: j, block: { merk: paare } } : null;
}

/** Nummerierte Schritte („1. …“, „2a. …“) mit Unterpunkten. */
function schritte(bl, i) {
  const punkte = [];
  let j = i;
  for (; j < bl.length; j++) {
    const b = bl[j], t = text(b);
    const m = t?.match(NUMMER);
    if (m) {
      const p = { marke: `${m[1]}${m[2]}.`, text: m[3], unter: [] };
      const oben = punkte.at(-1);
      // „2f.“ gehört unter „2.“; ohne passenden Oberpunkt steht er selbst oben
      if (m[2] && oben && !/[a-z]\.$/.test(oben.marke)) oben.unter.push(p); else punkte.push(p);
      continue;
    }
    const letzter = punkte.at(-1)?.unter.at(-1) ?? punkte.at(-1);
    if (!letzter) break;
    // Punkt läuft in einem eingerückten Kasten weiter („1. Der Abenteurer hat sich um mehr als die Hälfte seiner“ + Kasten),
    // darin oft weitere Unterpunkte („… 2a. mit einer Nahkampfwaffe angreifen. 2b. ein Handgemenge einleiten.“)
    if (b.kasten && !/[.:!?)]$/.test(letzter.text)) {
      const [erste, ...rest] = b.kasten.join(" ").split(/\s(?=\d{1,2}[a-z]\.\s)/);
      letzter.text = verbinden(letzter.text, erste);
      for (const r of rest) {
        const u = r.match(/^(\d{1,2}[a-z])\.\s+(.*)$/);
        punkte.at(-1).unter.push({ marke: `${u[1]}.`, text: u[2], unter: [] });
      }
      continue;
    }
    if (b.einschub && !/[.:!?)]$/.test(letzter.text)) { letzter.text = verbinden(letzter.text, b.einschub); continue; }
    if (t !== null && /^[a-zäöüß(]/.test(t)) { letzter.text = verbinden(letzter.text, t); continue; }
    break;
  }
  const anzahl = punkte.reduce((n, p) => n + 1 + p.unter.length, 0);
  return anzahl >= 2 ? { ende: j, block: { schritte: punkte } } : null;
}

/** Kleine Wertetabelle aus Zeilen wie „Grad 1 2 5 10 …“ / „FW +11 +12 …“. */
function wertetabelle(bl, i) {
  const reihen = [];
  let j = i;
  for (; j < bl.length; j++) {
    const m = text(bl[j])?.match(WERTZEILE);
    if (!m) break;
    const r = [m[1], ...m[2].trim().split(/\s+/)];
    if (reihen.length && r.length !== reihen[0].length) break;
    reihen.push(r);
  }
  return reihen.length >= 2 ? { ende: j, block: { tabelle: reihen, kopfSpalte: true } } : null;
}

/**
 * Kasten mit nummerierten Schritten als ein Fließtext („Der Ablauf eines Angriffs 1. Der Angreifer …
 * 2. … *: Fällt beim …“): Titel, Schritte und Fußnote trennen. Gibt null zurück, wenn es keine
 * Folge 1., 2., … gibt.
 */
export function kastenMitSchritten(text) {
  const t = String(text ?? "");
  const erster = t.search(/(^|\s)1\.\s+\S/);
  if (erster < 0 || !/\s2\.\s+\S/.test(t.slice(erster + 2))) return null;
  const titel = t.slice(0, erster).trim();
  if (titel.length > 70) return null;
  let rest = t.slice(erster).trim(), fussnote = null;
  const f = rest.match(/\s\*+\s?:\s*(.+)$/);
  if (f) { fussnote = f[1].trim(); rest = rest.slice(0, f.index).trim(); }
  // an „ 2. Der …“ trennen, aber nicht an Verweisen wie „siehe 2.“ oder „aus 1.)“
  const teile = rest.split(/(?<=[.:!?)]\s|^)(?=\d{1,2}\.\s+[A-ZÄÖÜ])/).map((x) => x.trim()).filter(Boolean);
  const punkte = teile.map((x) => { const m = x.match(/^(\d{1,2})\.\s+(.*)$/s); return m ? { marke: `${m[1]}.`, text: m[2].trim(), unter: [] } : null; });
  if (punkte.some((p) => !p) || punkte.length < 2) return null;
  const bloecke = [{ schritte: punkte }];
  if (fussnote) bloecke.push({ fussnote });
  return { box: { titel: titel || null, bloecke } };
}

/**
 * @param {Array} bloecke  Strings und Objekte ({tabelle}, {kasten}, {einschub, klein})
 * @returns {Array} gegliederte Blöcke
 */
export function gliedern(bloecke) {
  const bl = (bloecke ?? []).filter((b) => b !== "" && b !== null && b !== undefined);
  const out = [];
  let naechsterTitel = null;
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i], t = text(b);
    if (t !== null) {
      if (/^(?:Abbildung \d+\s*)+$|^vorher nachher$/.test(t)) continue; // Bildunterschriften ohne Bild
      const wt = BEREICH.test(t) && wurftabelle(bl, i);
      if (wt) {
        const titel = titelAbtrennen(out) ?? naechsterTitel;
        naechsterTitel = wt.folgeTitel;
        if (titel) wt.block.wurftabelle.titel = titel;
        out.push(wt.block); i = wt.ende - 1; continue;
      }
      const mz = MERKZEILE.test(t) && t.length <= 70 && merkzeilen(bl, i);
      if (mz) {
        const vor = text(out.at(-1));
        if (vor && vor.length <= 40 && !/[.:;,]$/.test(vor)) { out.pop(); mz.block.titel = vor; }
        out.push(mz.block); i = mz.ende - 1; continue;
      }
      const st = NUMMER.test(t) && schritte(bl, i);
      if (st) { out.push(st.block); i = st.ende - 1; continue; }
      const wz = WERTZEILE.test(t) && wertetabelle(bl, i);
      if (wz) {
        const vor = text(out.at(-1));
        if (vor && vor.length <= 60 && !/[.:;]$/.test(vor)) { out.pop(); wz.block.titel = vor; }
        out.push(wz.block); i = wz.ende - 1; continue;
      }
      if (AUFZ.test(t)) {
        const liste = [];
        let j = i;
        for (; j < bl.length && text(bl[j]) !== null && AUFZ.test(bl[j]); j++) liste.push(bl[j].replace(AUFZ, ""));
        out.push({ liste });
        i = j - 1;
        continue;
      }
      if (/^\*+\s?:?\s/.test(t)) { out.push({ fussnote: t.replace(/^\*+\s?:?\s*/, "") }); continue; }
      // vorzeitiger Umbruch: voriger Absatz ohne Satzende, dieser beginnt klein mitten im Satz
      const vor = text(out.at(-1));
      if (vor !== null && !/[.!?:;“"»«)…]$/.test(vor) && /^[a-zäöüß]/.test(t)) {
        // getrenntes Wort, das zusammen keines ergibt: dazwischen fehlt Text, also nicht verkleben
        const stamm = vor.match(/(\p{L}+)-$/u)?.[1], rest = t.match(/^\p{L}+/u)?.[0];
        if (stamm && rest && wortLuecke(stamm, rest)) { lueckeMelden(vor, t); out.push(t); continue; }
        umbruchMelden(vor, t);
        out[out.length - 1] = verbinden(vor, t);
        continue;
      }
      out.push(t);
      continue;
    }
    if (b.wert) { out.push(b); continue; }
    if (b.tabelle) {
      const titel = titelAbtrennen(out) ?? naechsterTitel;
      naechsterTitel = null;
      const zwei = b.tabelle.every((r) => r.filter(Boolean).length === 2 && r.findIndex(Boolean) === 0);
      if (!titel && b.tabelle.length >= 2 && zwei && b.tabelle.every((r) => /:$/.test(r[0]))) {
        out.push({ merk: b.tabelle.map((r) => [r[0].replace(/:$/, ""), r.filter(Boolean)[1]]) });
        continue;
      }
      out.push(titel ? { ...b, titel } : b);
      continue;
    }
    if (b.kasten && kastenMitSchritten(b.kasten.join(" "))) { out.push(kastenMitSchritten(b.kasten.join(" "))); continue; }
    if (b.einschub) {
      const box = kastenMitSchritten(b.einschub);
      if (box) { out.push(box); continue; }
      out.push(b.klein || BEISPIEL.test(b.einschub) ? { beispiel: b.einschub } : { randnotiz: b.einschub });
      continue;
    }
    out.push(b);
  }
  return out;
}
