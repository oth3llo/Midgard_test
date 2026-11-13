// Ein-Klick-Import der Beschreibungstexte aus den eigenen Regelwerk-PDFs in die Welt-Kompendien.
// Die PDF wird nur im Browser des Spielleiters gelesen (pdf.js); die Texte landen ausschließlich
// in den Kompendien dieser Welt, nicht im System. Erkannt werden „Das Arkanum“ (Zauber) und
// „Der Kodex“ (Fertigkeiten, Waffenfertigkeiten, Waffen, Rüstungen, Abenteurertypen, Rassen).
// Die Kompendien sind bis zum Import leer; der Import legt die Einträge an.
import { SYSTEM_ID, packId } from "./kategorien.mjs";
import { textzeilen } from "./pdf/textzeilen.mjs";
import { zauberAusArkanum, zaubermittelAusArkanum } from "./pdf/arkanum.mjs";
import { fertigkeitenAusKodex, typenUndRassenAusKodex, ruestungenAusKodex } from "./pdf/kodex.mjs";
import { buchErkennen, ausgabeFingerabdruck, GEPRUEFTE_AUSGABEN } from "./pdf/erkennung.mjs";
import KOMPENDIUM from "../daten/kompendium.js";
import { zuordnen, alsHtml, gegliedertAlsHtml } from "./pdf/zuordnen.mjs";
import { regelnAusBuch, REGELBEREICHE } from "./pdf/regeln.mjs";
import { gliedern } from "./pdf/gliedern.mjs";
import { textPruefen, pruefbericht, woerterbuchLoeschen } from "./pdf/textpruefung.mjs";
import { allesVerlinken, REGEL_PACK } from "./verlinken.mjs";
import { esc } from "./wuerfe.mjs";
import { eintragBild, bildPfad, slug } from "./bilder.mjs";
import { bestiariumAusKodex, gegnerAusAbenteuer, abenteuerErkennen } from "./pdf/bestiarium.mjs";
import { gegnerAusBestiarium } from "./gegner.mjs";
import { GEGNER_PACK, gegnerPackHolen } from "./kompendien.mjs";

const PFAD = `systems/${SYSTEM_ID}/vendor/pdfjs`;
let pdfjs = null;

async function pdfjsLaden() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(new URL(`${PFAD}/pdf.min.mjs`, document.baseURI).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(`${PFAD}/pdf.worker.min.mjs`, document.baseURI).href;
  return pdfjs;
}

export function einstellungenRegistrieren() {
  // Protokoll der Bestätigungen „rechtmäßig erworben“ (wer, wann, welche Datei, welches Buch)
  game.settings.register(SYSTEM_ID, "importProtokoll", { scope: "world", config: false, type: Array, default: [] });
}

/**
 * Bestätigung vor dem Import. Eine technische Prüfung, ob eine PDF rechtmäßig erworben wurde, ist
 * nicht möglich; die Bestätigung macht die Verantwortung eindeutig und wird in der Welt protokolliert.
 */
export async function bestaetigungEinholen(dateinamen) {
  const D = foundry.applications?.api?.DialogV2;
  if (!D) return true;
  const liste = dateinamen.map((n) => `<li>${esc(n)}</li>`).join("");
  try {
    return await D.confirm({
      window: { title: "Regelwerk importieren" },
      content: `<div class="midgard-dialog"><p>Folgende Datei(en) werden eingelesen:</p><ul>${liste}</ul>
        <p><strong>Ich bestätige, dass ich diese PDF(s) rechtmäßig erworben habe und die Inhalte nur in meiner eigenen Spielrunde nutze.</strong></p>
        <p class="hinweis">Ist ein Buch oder Abenteuer schon importiert, werden alle seine Einträge (Regeln, Zauber, Fertigkeiten, Waffen, Rüstungen, Typen, Rassen, Ausrüstung, Gegner) gelöscht und neu angelegt; Änderungen von Hand an diesen Kompendium-Einträgen gehen dabei verloren. Kopien auf Charakterbögen und in der Welt erhalten den neuen Beschreibungstext, ihre Spielwerte bleiben.</p>
        <p class="hinweis">Die Texte werden nur in den Kompendien dieser Welt gespeichert. Die Bestätigung wird mit Datum und Benutzer in der Welt vermerkt.</p></div>`,
      yes: { label: "Bestätigen und importieren" }, no: { label: "Abbrechen" },
      rejectClose: false,
    });
  } catch { return false; }
}

async function protokollieren(eintrag) {
  const alt = game.settings.get(SYSTEM_ID, "importProtokoll") ?? [];
  await game.settings.set(SYSTEM_ID, "importProtokoll", [...alt, { zeit: new Date().toISOString(), benutzer: game.user.name, ...eintrag }].slice(-50));
}

/** Dateiauswahl, Bestätigung, dann Import. Nur für Spielleiter. */
export async function pdfImportStarten() {
  if (!game.user.isGM) return ui.notifications.warn("Nur der Spielleiter kann Regelwerke importieren.");
  const eingabe = Object.assign(document.createElement("input"), { type: "file", accept: "application/pdf,.pdf", multiple: true });
  eingabe.addEventListener("change", async () => {
    const dateien = [...eingabe.files];
    if (!dateien.length) return;
    if (!(await bestaetigungEinholen(dateien.map((d) => d.name)))) return ui.notifications.info("Midgard: Import abgebrochen.");
    for (const datei of dateien) await pdfImportieren(await datei.arrayBuffer(), { dateiname: datei.name, bestaetigt: true });
  });
  eingabe.click();
}

/**
 * Liest eine Regelwerk-PDF und schreibt die Beschreibungen in die Kompendien.
 * @param {ArrayBuffer} daten
 * @param {object} o  dateiname, stumm (kein Berichtsfenster), bestaetigt (ohne Rückfrage).
 *   Ein erneuter Import ersetzt alles, was zum erkannten Buch oder Abenteuer gehört, vollständig.
 */
export async function pdfImportieren(daten, { dateiname = "PDF", stumm = false, bestaetigt = false } = {}) {
  if (!bestaetigt && !(await bestaetigungEinholen([dateiname]))) { ui.notifications.info("Midgard: Import abgebrochen."); return null; }
  const fortschritt = ui.notifications.info(`Midgard: ${dateiname} wird gelesen …`, { permanent: true });
  try {
    const lib = await pdfjsLaden();
    const doc = await lib.getDocument({ data: new Uint8Array(daten), verbosity: 0 }).promise;
    const zeilen = await textzeilen(doc);
    // Textprüfung: Wörterbuch des Buches für Trennungen und Absatzanfänge (gilt bis zum Ende des Imports)
    textPruefen(zeilen);
    // Erkennung nur am Inhalt (Dateiname spielt keine Rolle)
    const erkannt = buchErkennen(zeilen, doc.numPages);
    // Abenteuerband: nur die Gegner (Kästen mit Spieldaten) in das Kompendium „Gegner“, Ordner je Band
    const abenteuer = erkannt.buch ? null : abenteuerErkennen(zeilen);
    if (abenteuer) {
      // bekannte Wesen (Kodex-Bestiarium und bereits importierte Bände) helfen bei der Einzahl („2 Riesenratten“)
      const pack = game.packs.get(`world.${GEGNER_PACK}`);
      const bekannt = new Set((pack ? await pack.getDocuments() : []).flatMap((d) => [d.name, d.system?.art]).filter(Boolean));
      const gegner = gegnerAusAbenteuer(zeilen, { bekannt });
      const bericht = { buch: abenteuer.titel, teile: [await gegnerSchreiben(gegner, abenteuer.titel)], dateiname, abenteuer: true };
      bericht.kopien = await kopienNachziehen();
      await protokollieren({ datei: dateiname, buch: abenteuer.titel, fingerabdruck: ausgabeFingerabdruck(zeilen, doc.numPages), gepruefteAusgabe: false });
      Hooks.callAll("midgardKompendienGeaendert");
      if (!stumm) berichtZeigen(bericht);
      return bericht;
    }
    if (!erkannt.buch) {
      ui.notifications.warn(`${dateiname}: kein unterstütztes Regelwerk erkannt (unterstützt: Der Kodex, Das Arkanum und Midgard-Abenteuerbände; ${erkannt.treffer} von ${erkannt.gesamt} Merkmalen gefunden).`);
      return null;
    }
    const fingerabdruck = ausgabeFingerabdruck(zeilen, doc.numPages);
    const gepruefteAusgabe = (GEPRUEFTE_AUSGABEN[erkannt.buch] ?? []).includes(fingerabdruck);
    let bericht;
    if (erkannt.buch === "Das Arkanum") bericht = await arkanumImportieren(zeilen);
    else {
      bericht = await kodexImportieren(zeilen);
      await game.settings.set(SYSTEM_ID, "kodexImportiert", true); // Assistent freigeben
    }
    bericht.fingerabdruck = fingerabdruck;
    bericht.gepruefteAusgabe = gepruefteAusgabe;
    await protokollieren({ datei: dateiname, buch: erkannt.buch, fingerabdruck, gepruefteAusgabe });
    bericht.teile.push(await regelnSchreiben(zeilen, bericht.buch));
    bericht.textpruefung = pruefbericht();
    await protokollErgaenzen(bericht.textpruefung.zusammenfassung);
    bericht.links = await allesVerlinken();
    bericht.kopien = await kopienNachziehen();
    bericht.dateiname = dateiname;
    Hooks.callAll("midgardKompendienGeaendert");
    if (!stumm) berichtZeigen(bericht);
    return bericht;
  } catch (fehler) {
    console.error(`${SYSTEM_ID} | PDF-Import`, fehler);
    ui.notifications.error(`Midgard: ${dateiname} konnte nicht gelesen werden (Details in der Konsole).`);
    return null;
  } finally {
    woerterbuchLoeschen();
    fortschritt?.remove?.();
  }
}

/** Ergebnis der Textprüfung am letzten Protokolleintrag vermerken. */
async function protokollErgaenzen(text) {
  const alt = [...(game.settings.get(SYSTEM_ID, "importProtokoll") ?? [])];
  if (!alt.length) return;
  alt[alt.length - 1] = { ...alt.at(-1), textpruefung: text };
  await game.settings.set(SYSTEM_ID, "importProtokoll", alt);
}

async function arkanumImportieren(zeilen) {
  const gelesen = zauberAusArkanum(zeilen).map((z) => ({ ...z, gruppe: z.kategorie ?? z.gruppe }));
  const teil = await schreiben("zauber", gelesen, { gruppeVon: (z) => z.system.gruppe, buch: "Das Arkanum" });
  const ausArkanum = (e) => e.system.quelle === "Arkanum";
  const mittel = zaubermittelAusArkanum(zeilen, KOMPENDIUM.kategorien.gegenstaende.filter(ausArkanum).map((e) => e.name));
  const teil2 = await schreiben("gegenstaende", mittel, { buch: "Das Arkanum", auswahl: ausArkanum });
  return { buch: "Das Arkanum", teile: [teil, teil2] };
}

async function kodexImportieren(zeilen) {
  const K = window.KODEX;
  const aliase = { ...K.lernName };
  const D = KOMPENDIUM.kategorien;
  const namen = [...D.fertigkeiten, ...D.waffenfertigkeiten].map((e) => e.name);
  const fert = fertigkeitenAusKodex(zeilen, [...namen, ...Object.keys(aliase)]);
  const { typen, rassen } = typenUndRassenAusKodex(zeilen);
  const ruestungen = ruestungenAusKodex(zeilen);
  const buch = "Der Kodex", o = { buch, nurPassende: true };
  const teile = [];
  teile.push(await schreiben("fertigkeiten", fert, { ...o, aliase }));
  teile.push(await schreiben("waffenfertigkeiten", fert, { ...o, aliase }));
  // einzelne Waffen: Grundname innerhalb ihrer Waffenfertigkeit (Kodex-Schreibweisen wie „Armbrust, leichte“ unscharf)
  teile.push(await schreiben("waffen", fert.flatMap((f) => f.waffen.map((w) => ({ ...w, gruppe: w.fertigkeit }))), {
    ...o, nurPassende: false, nameVon: (z) => z.system.grundname || z.name, gruppeVon: (z) => z.system.fertigkeit, aliase: { Kampfgabeln: "Kampfgabeln, Paar" },
  }));
  teile.push(await schreiben("ruestungen", ruestungen.map((r) => ({ ...r, name: r.kuerzel })), { ...o, nurPassende: false, nameVon: (z) => z.system.kuerzel }));
  teile.push(await schreiben("typen", typen.flatMap((t) => t.kuerzel.map((k) => ({ ...t, name: k }))), { ...o, nurPassende: false, nameVon: (z) => z.system.kuerzel }));
  teile.push(await schreiben("rassen", rassen, { ...o, nurPassende: false }));
  // Ausrüstung aus den Preislisten: ohne eigene Beschreibung im Kodex
  teile.push(await schreiben("gegenstaende", [], { ...o, auswahl: (e) => e.system.quelle === "Kodex" }));
  teile.push(await gegnerSchreiben(bestiariumAusKodex(zeilen), buch));
  return { buch, teile };
}

/**
 * Gegner (Bestiarium, Abenteuerbände) in das Akteur-Kompendium: ein Ordner je Quelle, darin
 * alphabetisch sortiert. Feste IDs je Quelle und Name. Ein erneuter Import ersetzt alle Gegner dieser
 * Quelle vollständig (auch von Hand geänderte und eigene Notizen); Gegner anderer Quellen bleiben.
 */
async function gegnerSchreiben(wesen, buch) {
  const pack = game.packs.get(`world.${GEGNER_PACK}`) ?? await gegnerPackHolen();
  const ergebnis = { kategorie: "gegner", gelesen: wesen.length, angelegt: 0, ersetzt: 0, geschrieben: 0, nichtZugeordnet: [], ohne: [] };
  if (!wesen.length) return ergebnis;
  const gesperrt = pack.locked;
  if (gesperrt) await pack.configure({ locked: false });
  try {
    const neu = [];
    for (const w of [...wesen].sort((a, b) => a.name.localeCompare(b.name, "de"))) {
      const d = gegnerAusBestiarium(w, { quelle: `${buch}, S. ${w.seite}`, html: alsHtml(w.absaetze, `${buch}, S. ${w.seite}`), img: bildPfad("gegner/gegner") ?? undefined });
      d._id = stabileId(`gegner:${buch}:${w.name}`);
      d.flags = { [SYSTEM_ID]: { pdfImport: { buch, seite: w.seite } } };
      neu.push(d);
    }
    const ids = new Set(neu.map((d) => d._id));
    const alt = (await pack.getDocuments()).filter((d) => ids.has(d.id) || d.getFlag(SYSTEM_ID, "pdfImport")?.buch === buch).map((d) => d.id);
    if (alt.length) await Actor.deleteDocuments(alt, { pack: pack.collection });
    const ordner = await ordnerPfad(pack, [buch], "Actor", {}, "a");
    for (const d of neu) d.folder = ordner;
    await Actor.createDocuments(neu, { pack: pack.collection, keepId: true });
    await leereOrdnerLoeschen(pack);
    Object.assign(ergebnis, { angelegt: neu.length, ersetzt: alt.length, geschrieben: neu.length });
  } finally { if (gesperrt) await pack.configure({ locked: true }); }
  return ergebnis;
}

/**
 * Legt die Einträge einer Kategorie im Welt-Kompendium neu an: Spielwerte aus dem geprüften
 * Datensatz (daten/kompendium.js), Beschreibung aus der PDF. Ein erneuter Import ersetzt alles,
 * was zu diesem Buch gehört, vollständig: vorhandene Einträge werden gelöscht und mit derselben ID
 * neu angelegt (Verweise bleiben gültig), auch von Hand geänderte. Einträge des Datensatzes, zu denen
 * das Buch keinen Text hat, werden ohne Beschreibung angelegt, damit die Kategorie vollständig ist
 * (z. B. Mensch, Schilde). Einträge anderer Bücher im selben Kompendium bleiben unberührt.
 */
// Unterordner je Kategorie: Zauber nach Gruppe, Waffen nach Fertigkeit, Ausrüstung nach Kategorie und Art, Typen nach Art
const ORDNER_VON = {
  zauber: (e) => [e.system.gruppe],
  waffen: (e) => [e.system.fertigkeit],
  gegenstaende: (e) => [e.system.kategorie, e.system.unterkategorie],
  typen: (e) => [e.system.artName],
};

async function schreiben(kat, gelesen, { aliase, gruppeVon, nameVon, buch, nurPassende = false, auswahl = () => true }) {
  const pack = game.packs.get(packId(kat));
  if (!pack) throw new Error(`Kompendium ${kat} fehlt; zuerst die Welt als Spielleiter laden.`);
  const satz = KOMPENDIUM.kategorien[kat].filter(auswahl); // nur Einträge dieses Buches
  const ziele = satz.map((e) => ({ _id: e._id, name: nameVon ? nameVon(e) : e.name, system: e.system, eintrag: e }));
  const gv = gruppeVon && ((z) => gruppeVon(z.eintrag));
  const { paare, nichtZugeordnet } = zuordnen(gelesen, ziele, { aliase, gruppeVon: gv });
  const text = new Map(paare.map(([g, z]) => [z._id, g]));
  const neu = [], ohne = [];
  for (const e of satz) {
    const g = text.get(e._id);
    if (!g) ohne.push(e.name);
    const d = foundry.utils.deepClone(e);
    const bild = eintragBild(kat, e); // eigenes Symbol aus bilder/, sonst das Foundry-Symbol des Datensatzes
    if (bild) d.img = bild;
    d.system.beschreibung = g ? alsHtml(g.absaetze, `${buch}, S. ${g.seite}`) : "";
    d.flags[SYSTEM_ID].pdfImport = g ? { buch, seite: g.seite } : { buch, seite: null };
    neu.push(d);
  }
  // zu ersetzen: alle Einträge dieses Buches (aus dem Datensatz oder mit seiner Importmarke)
  const ids = new Set(satz.map((e) => e._id));
  const alt = (await pack.getDocuments()).filter((d) => ids.has(d.id) || d.getFlag(SYSTEM_ID, "pdfImport")?.buch === buch).map((d) => d.id);
  const gesperrt = pack.locked;
  if (gesperrt) await pack.configure({ locked: false });
  try {
    if (alt.length) await Item.deleteDocuments(alt, { pack: pack.collection });
    if (ORDNER_VON[kat]) {
      const ordnerId = new Map();
      for (const d of neu) {
        const pfad = ORDNER_VON[kat](d).filter(Boolean);
        const schl = pfad.join("/");
        if (!ordnerId.has(schl)) ordnerId.set(schl, pfad.length ? await ordnerPfad(pack, pfad, "Item") : null);
        d.folder = ordnerId.get(schl);
      }
    }
    if (neu.length) await Item.createDocuments(neu, { pack: pack.collection, keepId: true });
    await leereOrdnerLoeschen(pack);
  } finally { if (gesperrt) await pack.configure({ locked: true }); }
  return {
    kategorie: kat, gelesen: gelesen.length, angelegt: neu.length, ersetzt: alt.length, geschrieben: paare.length,
    // beim Kodex gehören nicht zugeordnete Einträge meist in die andere Kategorie
    nichtZugeordnet: nurPassende ? [] : nichtZugeordnet.map((g) => g.name),
    ohne,
  };
}

/** Ordner ohne Einträge und ohne nichtleere Unterordner entfernen (Reste früherer Importe). */
async function leereOrdnerLoeschen(pack) {
  const ordner = [...(pack.folders ?? [])];
  if (!ordner.length) return;
  const belegt = new Set((await pack.getIndex({ fields: ["folder"] })).map((e) => e.folder?.id ?? e.folder).filter(Boolean));
  const eltern = (f) => f.folder?.id ?? f.folder ?? null;
  let weiter = true;
  while (weiter) { // Eltern belegter Ordner sind ebenfalls belegt
    weiter = false;
    for (const f of ordner) if (belegt.has(f.id) && eltern(f) && !belegt.has(eltern(f))) { belegt.add(eltern(f)); weiter = true; }
  }
  const leer = ordner.filter((f) => !belegt.has(f.id)).map((f) => f.id);
  if (leer.length) await Folder.deleteDocuments(leer, { pack: pack.collection });
}

/**
 * Kopien nachziehen: Gegenstände auf Bögen und in der Welt sowie in die Welt übernommene Gegner
 * bekommen nach einem Import die Beschreibung ihres Kompendium-Eintrags. Nur der Text wird ersetzt;
 * Spielwerte (Fertigkeitswert, Anzahl, getragen …) bleiben, weil sie zum Charakter gehören.
 * Zuordnung: fester Schlüssel des Eintrags (flags.midgard5-cmt.schluessel, wird beim Ziehen mitkopiert),
 * sonst Kompendium-Herkunft, sonst eindeutig gleicher Typ und Name.
 */
export async function kopienNachziehen() {
  const werte = (c) => (c?.values ? [...c.values()] : c?.[Symbol.iterator] ? [...c] : []);
  const nachSchluessel = new Map(), nachUuid = new Map(), nachName = new Map();
  for (const pack of werte(game.packs)) {
    if (!String(pack.collection ?? "").startsWith("world.midgard-") || !["Item", "Actor"].includes(pack.documentName)) continue;
    for (const d of await pack.getDocuments()) {
      if (!d.getFlag?.(SYSTEM_ID, "pdfImport")) continue;
      const text = d.system?.beschreibung ?? "";
      const schl = d.getFlag(SYSTEM_ID, "schluessel");
      if (schl) nachSchluessel.set(schl, text);
      nachUuid.set(d.uuid, text);
      const k = `${pack.documentName}|${d.type}|${d.name}`;
      nachName.set(k, nachName.has(k) ? null : text); // null: mehrdeutig, nicht verwenden
    }
  }
  const quelle = (doc, art) => {
    const schl = doc.flags?.[SYSTEM_ID]?.schluessel;
    if (schl && nachSchluessel.has(schl)) return nachSchluessel.get(schl);
    const herkunft = doc._stats?.compendiumSource ?? doc.flags?.core?.sourceId;
    if (herkunft && nachUuid.has(herkunft)) return nachUuid.get(herkunft);
    return nachName.get(`${art}|${doc.type}|${doc.name}`) ?? null;
  };
  let n = 0;
  for (const item of werte(game.items)) {
    const t = quelle(item, "Item");
    if (t !== null && t !== (item.system?.beschreibung ?? "")) { await item.update({ "system.beschreibung": t }); n++; }
  }
  for (const actor of werte(game.actors)) {
    const t = quelle(actor, "Actor");
    if (t !== null && t !== (actor.system?.beschreibung ?? "")) { await actor.update({ "system.beschreibung": t }); n++; }
    const aenderung = werte(actor.items).map((i) => ({ i, t: quelle(i, "Item") })).filter(({ i, t }) => t !== null && t !== (i.system?.beschreibung ?? ""))
      .map(({ i, t }) => ({ _id: i.id, "system.beschreibung": t }));
    if (aenderung.length) { await actor.updateEmbeddedDocuments("Item", aenderung, { render: false }); n += aenderung.length; }
  }
  return n;
}

/** Feste ID aus einem Schlüssel (16 Zeichen, base62), damit Verweise bei erneutem Import gültig bleiben. */
export function stabileId(schluessel) {
  let h = 0xcbf29ce484222325n;
  for (const c of new TextEncoder().encode(schluessel)) h = BigInt.asUintN(64, (h ^ BigInt(c)) * 0x100000001b3n);
  const Z = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "", x = h;
  for (let i = 0; i < 16; i++) { out += Z[Number(x % 62n)]; x = x / 62n || BigInt.asUintN(64, h * BigInt(i + 7)); }
  return out;
}

/**
 * Ordnerpfad in einem Kompendium sicherstellen (z. B. ["Das Arkanum", "Der Konspekt der Zauberer"]).
 * Gibt die ID des innersten Ordners zurück.
 */
async function ordnerPfad(pack, pfad, typ, flags = {}, sortierung = "m") {
  let eltern = null;
  for (const name of pfad.filter(Boolean)) {
    const vorhanden = [...(pack.folders ?? [])].find((f) => f.name === name && (f.folder?.id ?? f.folder ?? null) === eltern);
    if (vorhanden) { eltern = vorhanden.id; continue; }
    const [neu] = await Folder.createDocuments([{ name, type: typ, folder: eltern, sorting: sortierung, flags: { [SYSTEM_ID]: flags } }], { pack: pack.collection });
    eltern = neu.id;
  }
  return eltern;
}

/**
 * Regelkapitel eines Buches als Journale anlegen (vorherige Fassung desselben Buches ersetzen).
 * Ordner: Buch › Buchteil. Ein Journal je Kapitel; Abschnitte mit mindestens drei benannten
 * Einträgen (Götter, Magiergilden, Verletzungen …) werden ein eigenes Journal mit einer Seite je
 * Eintrag, auf das der Abschnitt im Kapitel verweist.
 */
async function regelnSchreiben(zeilen, buch) {
  const pack = game.packs.get(`world.${REGEL_PACK}`);
  if (!pack || !REGELBEREICHE[buch]) return { kategorie: "regeln", angelegt: 0, geschrieben: 0, nichtZugeordnet: [], ohne: [] };
  const kapitel = regelnAusBuch(zeilen, REGELBEREICHE[buch]);
  const gesperrt = pack.locked;
  if (gesperrt) await pack.configure({ locked: false });
  let journale = 0, seitenZahl = 0;
  try {
    const alt = (await pack.getDocuments()).filter((j) => j.getFlag(SYSTEM_ID, "buch") === buch).map((j) => j.id);
    if (alt.length) await JournalEntry.deleteDocuments(alt, { pack: pack.collection });
    const altOrdner = [...(pack.folders ?? [])].filter((f) => f.getFlag?.(SYSTEM_ID, "buch") === buch || f.flags?.[SYSTEM_ID]?.buch === buch).map((f) => f.id);
    if (altOrdner.length) await Folder.deleteDocuments(altOrdner, { pack: pack.collection });
    const seiteDaten = (buchKap, s, i, level = Math.min(3, s.ebene), g = gliedern(s.absaetze)) => ({
      _id: stabileId(`${buch}|${buchKap}|${s.titel}|${i}`), name: s.titel, type: "text", sort: i * 100,
      title: { show: true, level },
      text: { format: 1, content: gegliedertAlsHtml(g, `${buch}, S. ${s.seite}`) },
      // W%-Tabellen als Daten, damit kritische Ereignisse das Ergebnis nachschlagen können
      flags: { [SYSTEM_ID]: { seite: s.seite, ebene: s.ebene, wurftabellen: g.filter((b) => b.wurftabelle).map((b) => b.wurftabelle) } },
    });
    const neu = [];
    let nr = 0;
    for (const k of kapitel) {
      const ordner = await ordnerPfad(pack, [buch, k.teil], "JournalEntry", { buch });
      const kapId = stabileId(`${buch}|${k.titel}`);
      const seiten = [];
      // Kapitelbild des Buchteils (bilder/kapitel/<buchteil>), sobald geliefert
      const kapitelBild = bildPfad(`kapitel/${slug(k.teil)}`);
      // Einträge unter ihrem Abschnitt gruppieren
      for (let i = 0; i < k.seiten.length; i++) {
        const s = k.seiten[i];
        if (s.ebene === 4) continue;
        const kinder = [];
        for (let j = i + 1; j < k.seiten.length && k.seiten[j].ebene === 4; j++) kinder.push(k.seiten[j]);
        if (kinder.length >= 3) {
          const listeId = stabileId(`${buch}|${k.titel}|Liste|${s.titel}`);
          const listenSeiten = kinder.map((c, n) => seiteDaten(s.titel, c, n, 1));
          neu.push({ _id: listeId, name: s.titel, folder: ordner, sort: (nr++) * 100, flags: { [SYSTEM_ID]: { buch, seite: s.seite } }, pages: listenSeiten });
          // im Kapitel: Abschnitt mit Verweisen auf die Einzelseiten
          const verweise = `<ul class="midgard-verweise">${listenSeiten.map((p) => `<li>@UUID[Compendium.${pack.collection}.JournalEntry.${listeId}.JournalEntryPage.${p._id}]{${p.name}}</li>`).join("")}</ul>`;
          const d = seiteDaten(k.titel, s, seiten.length);
          d.text.content = d.text.content.replace(/(<p class="midgard-fundstelle">)/, `${verweise}$1`);
          seiten.push(d);
        } else {
          seiten.push(seiteDaten(k.titel, s, seiten.length));
          for (const c of kinder) seiten.push(seiteDaten(k.titel, c, seiten.length));
        }
      }
      if (kapitelBild && seiten[0]) seiten[0].text.content = `<img class="midgard-kapitelbild" src="${kapitelBild}" alt="">${seiten[0].text.content}`;
      neu.push({ _id: kapId, name: k.titel, folder: ordner, sort: (nr++) * 100, flags: { [SYSTEM_ID]: { buch, seite: k.seite } }, pages: seiten });
    }
    if (neu.length) await JournalEntry.createDocuments(neu, { pack: pack.collection, keepId: true });
    journale = neu.length;
    seitenZahl = neu.reduce((n, j) => n + j.pages.length, 0);
  } finally { if (gesperrt) await pack.configure({ locked: true }); }
  return { kategorie: "regeln", angelegt: seitenZahl, geschrieben: seitenZahl, nichtZugeordnet: [], ohne: [], kapitel: journale };
}

/** Ergebnis der Textprüfung für den Bericht: Zusammenfassung, Beispiele, verdächtige Stellen zum Nachsehen. */
function textpruefungHtml(t) {
  const liste = (titel, l, f = (x) => x) => (l.length ? `<details><summary>${esc(titel)} (${l.length})</summary><p>${l.slice(0, 60).map((x) => esc(f(x))).join("; ")}</p></details>` : "");
  return `<p><strong>Textprüfung:</strong> ${esc(t.zusammenfassung)}.</p>
    ${liste("Fehlende Anfangsbuchstaben ergänzt", t.anfaenge, (x) => `S. ${x.seite}: ${x.alt} → ${x.neu}`)}
    ${liste("Zerrissene Wörter verbunden", t.zusammengefuegt)}
    ${liste("Vorzeitige Umbrüche zusammengeführt", t.umbrueche)}
    ${liste("Verdächtig, bitte im Buch prüfen", t.verdaechtig, (x) => `${x.art}${x.seite ? ` S. ${x.seite}` : ""}: ${x.text}`)}`;
}

function berichtZeigen(b) {
  const D = foundry.applications?.api?.DialogV2;
  const liste = (titel, l) => (l.length ? `<details><summary>${esc(titel)} (${l.length})</summary><p>${l.map(esc).join(", ")}</p></details>` : "");
  const inhalt = `<div class="midgard-bericht">
    <p>Aus <strong>${esc(b.dateiname)}</strong> erkannt: <strong>${esc(b.buch)}</strong>.</p>
    ${b.abenteuer ? `<p class="hinweis">Abenteuerband: Die Gegner aus den Spieldatenkästen stehen im Kompendium „Midgard: Gegner“ im Ordner „${esc(b.buch)}“, alphabetisch sortiert. Abenteuertext und Karten werden nicht übernommen.</p>`
      : b.gepruefteAusgabe ? `<p class="hinweis">Ausgabe ${esc(b.fingerabdruck)}: gegen diese Ausgabe ist der Import geprüft.</p>`
      : `<p class="warnung">Diese Ausgabe (${esc(b.fingerabdruck)}) weicht von der geprüften ab, etwa eine andere Auflage. Bitte die Listen unten prüfen; einzelne Einträge können fehlen oder falsch zugeordnet sein.</p>`}
    <p>Übernommen:</p>
    <ul>${b.teile.map((t) => t.kategorie === "regeln" ? `<li>Regeln: ${t.kapitel ?? 0} Kapitel mit ${t.angelegt} Seiten</li>` : `<li>${esc(t.kategorie)}: ${t.angelegt} angelegt${t.ersetzt ? ` (${t.ersetzt} vorherige ersetzt)` : ""}, ${t.geschrieben} mit Beschreibung</li>`).join("")}</ul>
    ${b.abenteuer ? "" : `<p>${b.links ?? 0} Texte mit Verweisen auf Regeln, Zauber, Fertigkeiten und Gegenstände versehen.</p>`}
    ${b.kopien ? `<p>${b.kopien} Kopien auf Charakterbögen und in der Welt mit dem neuen Beschreibungstext versehen (Spielwerte unverändert).</p>` : ""}
    ${b.textpruefung ? textpruefungHtml(b.textpruefung) : ""}
    ${b.teile.map((t) => liste(`${t.kategorie}: in der PDF gefunden, aber nicht zugeordnet`, t.nichtZugeordnet) + liste(`${t.kategorie}: ohne Beschreibung aus diesem Buch`, t.ohne)).join("")}
    <p class="hinweis">Die Texte stehen nur in den Kompendien dieser Welt. Würfeltabellen, Beispiele und Merkkästen werden erkannt und eigens dargestellt; mehrspaltige Tabellen können unvollständig sein. Ein erneuter Import ersetzt alle Einträge dieses Buches vollständig, auch von Hand geänderte. Kopien auf Charakterbögen und in der Welt erhalten den neuen Beschreibungstext; ihre Spielwerte bleiben.</p>
  </div>`;
  if (D) D.prompt({ window: { title: "Regelwerk importiert" }, content: inhalt, ok: { label: "OK" }, rejectClose: false }).catch(() => {});
  else ui.notifications.info(`Midgard: ${b.teile.map((t) => `${t.geschrieben} ${t.kategorie}`).join(", ")} importiert.`);
}
