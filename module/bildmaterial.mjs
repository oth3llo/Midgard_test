// Bildmaterial aus Abenteuern (Handouts und Karten) in die Kompendien „Midgard: Handouts“ und „Midgard: Karten“.
// Je Abenteuer ein Ordner, Einträge in der Reihenfolge des Dokuments, je Eintrag eine Bildseite mit Fundstelle.
// Die Bilder werden als Dateien in den Weltordner geladen (worlds/<welt>/midgard/<abenteuer>/), weil Foundry
// Bildseiten nur mit Dateipfad speichert. Ein erneuter Import ersetzt alle Einträge dieses Abenteuers.
import { SYSTEM_ID } from "./kategorien.mjs";
import { HANDOUT_PACK, KARTEN_PACK, bildPacksHolen } from "./kompendien.mjs";
import { abbildungenFinden, abbildungEinordnen, abbildungRendern, bildMerkmale, kartenRegel } from "./pdf/abbildungen.mjs";
import { slug } from "./bilder.mjs";
import { esc } from "./wuerfe.mjs";

const FP = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

/** Ordner im Datenverzeichnis anlegen (Teil für Teil; vorhandene Ordner sind kein Fehler). */
async function ordnerAnlegen(pfad) {
  let akt = "";
  for (const teil of pfad.split("/").filter(Boolean)) {
    akt = akt ? `${akt}/${teil}` : teil;
    try { await FP().createDirectory("data", akt, {}); } catch { /* vorhanden */ }
  }
}

async function hochladen(blob, pfad, name) {
  const datei = new File([blob], name, { type: blob.type || "image/webp" });
  const antwort = await FP().upload("data", pfad, datei, {}, { notify: false });
  if (antwort === false || antwort?.status === "error") throw new Error(`Hochladen fehlgeschlagen: ${pfad}/${name}`);
  return antwort?.path ?? `${pfad}/${name}`;
}

/** Feste ID aus einem Schlüssel (wie beim übrigen Import), damit Verweise bei erneutem Import gültig bleiben. */
function stabileId(schluessel) {
  let h = 0xcbf29ce484222325n;
  for (const c of new TextEncoder().encode(schluessel)) h = BigInt.asUintN(64, (h ^ BigInt(c)) * 0x100000001b3n);
  const Z = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "", x = h;
  for (let i = 0; i < 16; i++) { out += Z[Number(x % 62n)]; x = x / 62n || BigInt.asUintN(64, h * BigInt(i + 7)); }
  return out;
}

async function ordnerPfad(pack, name) {
  const vorhanden = [...(pack.folders ?? [])].find((f) => f.name === name && !(f.folder?.id ?? f.folder));
  if (vorhanden) return vorhanden.id;
  // Reihenfolge der Einträge wie im Dokument (manuelle Sortierung)
  const [neu] = await Folder.createDocuments([{ name, type: "JournalEntry", folder: null, sorting: "m" }], { pack: pack.collection });
  return neu.id;
}

/**
 * Abbildungen eines Abenteuers oder Material-Dokuments finden, einordnen und anlegen.
 * @param {object} doc  pdf.js-Dokument
 * @param {object} o  titel: Name des Abenteuers (Ordner), dokument: "abenteuer" | "handouts" | "karten"
 */
export async function bildmaterialImportieren(doc, { titel, dokument = "abenteuer" }) {
  const gefunden = await abbildungenFinden(doc);
  let liste = abbildungEinordnen(gefunden, { dokument });
  if (dokument === "abenteuer") {
    // Bildmerkmale für die Unterscheidung Karte/Handout (dunkle Pläne mit geraden Wänden)
    for (const a of liste) if (a.art === "handout" && !a.wortHandout) {
      const m = await bildMerkmale(doc, a);
      if (kartenRegel(a, m)) a.art = "karte";
    }
    const n = { karte: 0, handout: 0 };
    for (const a of liste) { a.nr = ++n[a.art]; if (a.automatischerTitel) a.titel = `${a.art === "karte" ? "Karte" : "Handout"} ${a.nr} (S. ${a.seite})`; }
  } else {
    // Material-Dokument: nichts darf verloren gehen. Seiten ohne Abbildung (Briefe als Text) und Seiten mit
    // nennenswertem Text neben den Abbildungen kommen als ganze Seite, sonst je Abbildung ein Eintrag.
    // Text neben den Abbildungen ohne Bildunterschriften (die werden zu Namen); Leerzeichen zählen nicht
    const seitenLeerzeichen = (s) => (gefunden.find((a) => a.seite === s)?.text ?? []).reduce((n, t) => n + (t.s.match(/\s/g)?.length ?? 0), 0);
    const textNeben = (s) => {
      const auf = gefunden.filter((a) => a.seite === s);
      const gewaehlt = liste.filter((a) => a.seite === s);
      return (auf[0]?.seitenZeichen ?? 0) - gewaehlt.reduce((n, a) => n + (a.innenZeichen ?? 0) + (a.unterschriftZeichen ?? 0), 0) - seitenLeerzeichen(s);
    };
    liste = liste.filter((a) => textNeben(a.seite) <= 150);
    const mitBild = new Set(liste.map((a) => a.seite));
    const art = dokument === "karten" ? "karte" : "handout";
    for (let s = 1; s <= doc.numPages; s++) if (!mitBild.has(s)) {
      const seite = await doc.getPage(s);
      const [x0, y0, x1, y1] = seite.view;
      liste.push({ seite: s, art, x: x0, y: y0, b: x1 - x0, h: y1 - y0, seitenBreite: x1 - x0, seitenHoehe: y1 - y0, ganzeSeite: true });
    }
    liste.sort((a, b) => a.seite - b.seite || (b.y + b.h) - (a.y + a.h) || a.x - b.x);
    liste.forEach((a, i) => { a.nr = i + 1; if (!a.unterschrift) a.titel = `${art === "karte" ? "Kartenblatt" : "Handout-Blatt"} ${i + 1} (S. ${a.seite})`; });
  }
  return bildmaterialSchreiben(doc, liste, titel, { quelle: dokument === "abenteuer" ? "band" : dokument });
}

// Herkunft im selben Abenteuer-Ordner: zuerst der Band, dann eigene Handout- und Karten-Dokumente
const QUELLE_SORT = { band: 0, handouts: 100000, karten: 200000 };

/**
 * Einträge anlegen: Bild rendern und hochladen, Journal mit Bildseite. Ersetzt werden nur die Einträge desselben
 * Abenteuers aus derselben Quelle (Band, Handout-Dokument oder Karten-Dokument).
 */
export async function bildmaterialSchreiben(doc, liste, titel, { quelle = "band" } = {}) {
  const packs = await bildPacksHolen();
  const ergebnis = { kategorie: "bildmaterial", handouts: 0, karten: 0, ersetzt: 0, angelegt: 0, geschrieben: 0, nichtZugeordnet: [], ohne: [] };
  const ziel = `worlds/${game.world?.id ?? "welt"}/midgard/${slug(titel) || "abenteuer"}`;
  await ordnerAnlegen(ziel);
  const neu = { [HANDOUT_PACK]: [], [KARTEN_PACK]: [] };
  for (const a of liste) {
    const packName = a.art === "karte" ? KARTEN_PACK : HANDOUT_PACK;
    const { blob, breite, hoehe } = await abbildungRendern(doc, a, { ganzeSeite: !!a.ganzeSeite });
    const datei = `${quelle}-${a.art}-${String(a.nr).padStart(2, "0")}-s${a.seite}.webp`;
    const src = await hochladen(blob, ziel, datei);
    const id = stabileId(`bild:${titel}:${quelle}:${a.art}:${a.nr}`);
    neu[packName].push({
      _id: id, name: a.titel, sort: QUELLE_SORT[quelle] + neu[packName].length * 100,
      flags: { [SYSTEM_ID]: { pdfImport: { buch: titel, quelle, seite: a.seite, art: a.art }, bild: { breite, hoehe, ganzeSeite: !!a.ganzeSeite } } },
      pages: [{ _id: stabileId(`bild:${titel}:${quelle}:${a.art}:${a.nr}:seite`), name: a.titel, type: "image", src, title: { show: false, level: 1 },
        image: { caption: `${titel}, S. ${a.seite}` }, sort: 0 }],
    });
  }
  for (const [name, pack] of Object.entries(packs)) {
    const gesperrt = pack.locked;
    if (gesperrt) await pack.configure({ locked: false });
    try {
      const alt = (await pack.getDocuments()).filter((d) => { const f = d.getFlag?.(SYSTEM_ID, "pdfImport"); return f?.buch === titel && (f.quelle ?? "band") === quelle; }).map((d) => d.id);
      if (alt.length) await JournalEntry.deleteDocuments(alt, { pack: pack.collection });
      ergebnis.ersetzt += alt.length;
      if (neu[name].length) {
        const ordner = await ordnerPfad(pack, titel);
        for (const d of neu[name]) d.folder = ordner;
        await JournalEntry.createDocuments(neu[name], { pack: pack.collection, keepId: true });
      }
      // leere Abenteuer-Ordner (alles ins andere Kompendium gewandert) entfernen
      const belegt = new Set((await pack.getDocuments()).map((d) => d.folder?.id ?? d.folder).filter(Boolean));
      const leer = [...(pack.folders ?? [])].filter((f) => !belegt.has(f.id)).map((f) => f.id);
      if (leer.length) await Folder.deleteDocuments(leer, { pack: pack.collection });
    } finally { if (gesperrt) await pack.configure({ locked: true }); }
  }
  ergebnis.handouts = neu[HANDOUT_PACK].length;
  ergebnis.karten = neu[KARTEN_PACK].length;
  ergebnis.angelegt = ergebnis.geschrieben = ergebnis.handouts + ergebnis.karten;
  return ergebnis;
}

/**
 * Einen Eintrag ins jeweils andere Kompendium verschieben (Handout ↔ Karte), z. B. wenn die automatische
 * Einordnung danebenlag. ID, Bild und Ordner (Abenteuer) bleiben; der Eintrag kommt ans Ende seines Ordners.
 */
export async function bildmaterialVerschieben(eintrag) {
  const von = eintrag?.pack ? game.packs.get(eintrag.pack.collection ?? eintrag.pack) : null;
  const name = String(von?.collection ?? "").replace(/^world\./, "");
  if (![HANDOUT_PACK, KARTEN_PACK].includes(name)) return null;
  const packs = await bildPacksHolen();
  const nach = packs[name === HANDOUT_PACK ? KARTEN_PACK : HANDOUT_PACK];
  const art = name === HANDOUT_PACK ? "karte" : "handout";
  const daten = eintrag.toObject ? eintrag.toObject() : foundry.utils.deepClone(eintrag);
  const imp = daten.flags?.[SYSTEM_ID]?.pdfImport ?? {};
  const titel = imp.buch ?? "Ohne Abenteuer";
  const sperren = [von, nach].filter((p) => p.locked);
  for (const p of sperren) await p.configure({ locked: false });
  try {
    const ordner = await ordnerPfad(nach, titel);
    const vorhanden = (await nach.getDocuments()).filter((d) => (d.folder?.id ?? d.folder) === ordner);
    daten.folder = ordner;
    daten.sort = (Math.max(-100, ...vorhanden.map((d) => d.sort ?? 0)) + 100);
    daten.flags[SYSTEM_ID].pdfImport = { ...imp, art, verschoben: true };
    await JournalEntry.deleteDocuments([eintrag.id], { pack: von.collection });
    await JournalEntry.createDocuments([daten], { pack: nach.collection, keepId: true });
    const belegt = new Set((await von.getDocuments()).map((d) => d.folder?.id ?? d.folder).filter(Boolean));
    const leer = [...(von.folders ?? [])].filter((f) => !belegt.has(f.id)).map((f) => f.id);
    if (leer.length) await Folder.deleteDocuments(leer, { pack: von.collection });
  } finally { for (const p of sperren) await p.configure({ locked: true }); }
  ui.notifications?.info(`Midgard: „${daten.name}“ nach ${art === "karte" ? "Karten" : "Handouts"} verschoben.`);
  return nach.collection;
}

/** Knopf im Journal-Fenster eines Handouts oder einer Karte (nur Spielleitung): ins andere Kompendium verschieben. */
export function knopfEinrichten() {
  Hooks.on("renderJournalEntrySheet", (app, html) => {
    const d = app.document;
    const name = String(d?.pack ?? "").replace(/^world\./, "");
    if (!game.user.isGM || ![HANDOUT_PACK, KARTEN_PACK].includes(name)) return;
    const wurzel = html instanceof HTMLElement ? html : html?.[0];
    if (!wurzel || wurzel.querySelector(".midgard-bild-verschieben")) return;
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "midgard-bild-verschieben";
    const ziel = name === HANDOUT_PACK ? "Karten" : "Handouts";
    knopf.innerHTML = `<i class="fa-solid ${name === HANDOUT_PACK ? "fa-map" : "fa-scroll"}" aria-hidden="true"></i> Nach ${esc(ziel)} verschieben`;
    knopf.title = `Falsch eingeordnet? Diesen Eintrag ins Kompendium „Midgard: ${ziel}“ verschieben`;
    knopf.addEventListener("click", async () => { await app.close?.(); await bildmaterialVerschieben(d); });
    (wurzel.querySelector(".window-content") ?? wurzel).prepend(knopf);
  });
}
