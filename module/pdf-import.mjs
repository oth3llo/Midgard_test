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
 * @param {object} o  dateiname, ueberschreiben (auch vorhandene, nicht importierte Texte ersetzen), stumm (kein Berichtsfenster)
 */
export async function pdfImportieren(daten, { dateiname = "PDF", ueberschreiben = false, stumm = false, bestaetigt = false } = {}) {
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
      const gegner = gegnerAusAbenteuer(zeilen);
      const bericht = { buch: abenteuer.titel, teile: [await gegnerSchreiben(gegner, abenteuer.titel)], dateiname, abenteuer: true };
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
    if (erkannt.buch === "Das Arkanum") bericht = await arkanumImportieren(zeilen, ueberschreiben);
    else {
      bericht = await kodexImportieren(zeilen, ueberschreiben);
      await game.settings.set(SYSTEM_ID, "kodexImportiert", true); // Assistent freigeben
    }
    bericht.fingerabdruck = fingerabdruck;
    bericht.gepruefteAusgabe = gepruefteAusgabe;
    await protokollieren({ datei: dateiname, buch: erkannt.buch, fingerabdruck, gepruefteAusgabe });
    bericht.teile.push(await regelnSchreiben(zeilen, bericht.buch));
    bericht.textpruefung = pruefbericht();
    await protokollErgaenzen(bericht.textpruefung.zusammenfassung);
    bericht.links = await allesVerlinken();
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

async function arkanumImportieren(zeilen, ueberschreiben) {
  const gelesen = zauberAusArkanum(zeilen).map((z) => ({ ...z, gruppe: z.kategorie ?? z.gruppe }));
  const teil = await schreiben("zauber", gelesen, { gruppeVon: (z) => z.system.gruppe, buch: "Das Arkanum", ueberschreiben });
  const ausArkanum = (e) => e.system.quelle === "Arkanum";
  const mittel = zaubermittelAusArkanum(zeilen, KOMPENDIUM.kategorien.gegenstaende.filter(ausArkanum).map((e) => e.name));
  const teil2 = await schreiben("gegenstaende", mittel, { buch: "Das Arkanum", ueberschreiben, auswahl: ausArkanum });
  return { buch: "Das Arkanum", teile: [teil, teil2] };
}

async function kodexImportieren(zeilen, ueberschreiben) {
  const K = window.KODEX;
  const aliase = { ...K.lernName };
  const D = KOMPENDIUM.kategorien;
  const namen = [...D.fertigkeiten, ...D.waffenfertigkeiten].map((e) => e.name);
  const fert = fertigkeitenAusKodex(zeilen, [...namen, ...Object.keys(aliase)]);
  const { typen, rassen } = typenUndRassenAusKodex(zeilen);
  const ruestungen = ruestungenAusKodex(zeilen);
  const buch = "Der Kodex", o = { buch, ueberschreiben, nurPassende: true };
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
 * Gegner (Bestiarium) in das Akteur-Kompendium: ein Ordner je Quelle, darin alphabetisch sortiert.
 * Feste IDs je Quelle und Name; erneuter Import aktualisiert die Spieldaten, eigene Notizen bleiben.
 */
async function gegnerSchreiben(wesen, buch) {
  const pack = game.packs.get(`world.${GEGNER_PACK}`) ?? await gegnerPackHolen();
  const ergebnis = { kategorie: "gegner", gelesen: wesen.length, angelegt: 0, geschrieben: 0, behalten: [], nichtZugeordnet: [], ohne: [] };
  if (!wesen.length) return ergebnis;
  const vorhanden = new Map((await pack.getDocuments()).map((d) => [d.id, d]));
  const gesperrt = pack.locked;
  if (gesperrt) await pack.configure({ locked: false });
  try {
    const ordner = await ordnerPfad(pack, [buch], "Actor", {}, "a");
    const neu = [], aendern = [];
    for (const w of [...wesen].sort((a, b) => a.name.localeCompare(b.name, "de"))) {
      const d = gegnerAusBestiarium(w, { quelle: `${buch}, S. ${w.seite}`, html: alsHtml(w.absaetze, `${buch}, S. ${w.seite}`), img: bildPfad("gegner/gegner") ?? undefined });
      d._id = stabileId(`gegner:${buch}:${w.name}`);
      d.folder = ordner;
      d.flags = { [SYSTEM_ID]: { pdfImport: { buch, seite: w.seite } } };
      const alt = vorhanden.get(d._id);
      if (!alt) { neu.push(d); continue; }
      d.system.notizen = alt.system.notizen ?? "";
      aendern.push({ _id: d._id, name: d.name, folder: ordner, system: d.system, [`flags.${SYSTEM_ID}.pdfImport`]: d.flags[SYSTEM_ID].pdfImport });
    }
    if (neu.length) await Actor.createDocuments(neu, { pack: pack.collection, keepId: true });
    if (aendern.length) await Actor.updateDocuments(aendern, { pack: pack.collection, recursive: false, diff: false });
    Object.assign(ergebnis, { angelegt: neu.length, geschrieben: neu.length + aendern.length });
  } finally { if (gesperrt) await pack.configure({ locked: true }); }
  return ergebnis;
}

/**
 * Legt die Einträge einer Kategorie im Welt-Kompendium an bzw. ergänzt sie: Spielwerte aus dem
 * geprüften Datensatz (daten/kompendium.js), Beschreibung aus der PDF. Einträge des Datensatzes,
 * zu denen das Buch keinen Text hat, werden ohne Beschreibung angelegt, damit die Kategorie
 * vollständig ist (z. B. Mensch, Schilde).
 */
// Unterordner je Kategorie: Zauber nach Gruppe, Waffen nach Fertigkeit, Ausrüstung nach Kategorie und Art, Typen nach Art
const ORDNER_VON = {
  zauber: (e) => [e.system.gruppe],
  waffen: (e) => [e.system.fertigkeit],
  gegenstaende: (e) => [e.system.kategorie, e.system.unterkategorie],
  typen: (e) => [e.system.artName],
};

async function schreiben(kat, gelesen, { aliase, gruppeVon, nameVon, buch, ueberschreiben, nurPassende = false, auswahl = () => true }) {
  const pack = game.packs.get(packId(kat));
  if (!pack) throw new Error(`Kompendium ${kat} fehlt; zuerst die Welt als Spielleiter laden.`);
  const vorhanden = new Map((await pack.getDocuments()).map((d) => [d.id, d]));
  const satz = KOMPENDIUM.kategorien[kat].filter(auswahl); // nur Einträge dieses Buches
  const ziele = satz.map((e) => ({ _id: e._id, name: nameVon ? nameVon(e) : e.name, system: e.system, eintrag: e }));
  const gv = gruppeVon && ((z) => gruppeVon(z.eintrag));
  const { paare, nichtZugeordnet } = zuordnen(gelesen, ziele, { aliase, gruppeVon: gv });
  const text = new Map(paare.map(([g, z]) => [z._id, g]));
  const neu = [], aenderungen = [], behalten = [], ohne = [];
  for (const e of satz) {
    const g = text.get(e._id);
    const html = g ? alsHtml(g.absaetze, `${buch}, S. ${g.seite}`) : "";
    const flag = g ? { buch, seite: g.seite } : { buch, seite: null };
    if (!g) ohne.push(e.name);
    const doc = vorhanden.get(e._id);
    const bild = eintragBild(kat, e); // eigenes Symbol aus bilder/, sonst das Foundry-Symbol des Datensatzes
    if (!doc) {
      const d = foundry.utils.deepClone(e);
      if (bild) d.img = bild;
      d.system.beschreibung = html;
      d.flags[SYSTEM_ID].pdfImport = flag;
      neu.push(d);
      continue;
    }
    if (bild && doc.img !== bild) aenderungen.push({ _id: e._id, img: bild });
    if (!g) continue;
    // selbst geschriebener Text (Eintrag ohne Importmarke) bleibt, außer auf ausdrücklichen Wunsch
    if (doc.system.beschreibung && !doc.getFlag(SYSTEM_ID, "pdfImport") && !ueberschreiben) { behalten.push(e.name); continue; }
    const vorhandeneAenderung = aenderungen.find((x) => x._id === e._id);
    if (vorhandeneAenderung) Object.assign(vorhandeneAenderung, { "system.beschreibung": html, [`flags.${SYSTEM_ID}.pdfImport`]: flag });
    else aenderungen.push({ _id: e._id, "system.beschreibung": html, [`flags.${SYSTEM_ID}.pdfImport`]: flag });
  }
  if (neu.length || aenderungen.length || ORDNER_VON[kat]) {
    const gesperrt = pack.locked;
    if (gesperrt) await pack.configure({ locked: false });
    try {
      if (ORDNER_VON[kat]) {
        const ordnerId = new Map();
        for (const e of satz) {
          const pfad = ORDNER_VON[kat](e).filter(Boolean);
          const schl = pfad.join("/");
          if (!ordnerId.has(schl)) ordnerId.set(schl, pfad.length ? await ordnerPfad(pack, pfad, "Item") : null);
          const f = ordnerId.get(schl);
          const d = neu.find((x) => x._id === e._id);
          if (d) d.folder = f;
          else if (vorhanden.get(e._id) && (vorhanden.get(e._id).folder?.id ?? vorhanden.get(e._id).folder ?? null) !== f) {
            const a = aenderungen.find((x) => x._id === e._id);
            if (a) a.folder = f; else aenderungen.push({ _id: e._id, folder: f });
          }
        }
      }
      if (neu.length) await Item.createDocuments(neu, { pack: pack.collection, keepId: true });
      if (aenderungen.length) await Item.updateDocuments(aenderungen, { pack: pack.collection });
    } finally { if (gesperrt) await pack.configure({ locked: true }); }
  }
  return {
    kategorie: kat, gelesen: gelesen.length, angelegt: neu.length, geschrieben: paare.length - behalten.length, behalten,
    // beim Kodex gehören nicht zugeordnete Einträge meist in die andere Kategorie
    nichtZugeordnet: nurPassende ? [] : nichtZugeordnet.map((g) => g.name),
    ohne,
  };
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
  if (!pack || !REGELBEREICHE[buch]) return { kategorie: "regeln", angelegt: 0, geschrieben: 0, behalten: [], nichtZugeordnet: [], ohne: [] };
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
  return { kategorie: "regeln", angelegt: seitenZahl, geschrieben: seitenZahl, behalten: [], nichtZugeordnet: [], ohne: [], kapitel: journale };
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
    <ul>${b.teile.map((t) => t.kategorie === "regeln" ? `<li>Regeln: ${t.kapitel ?? 0} Kapitel mit ${t.angelegt} Seiten</li>` : `<li>${esc(t.kategorie)}: ${t.angelegt} neu angelegt, ${t.geschrieben} mit Beschreibung</li>`).join("")}</ul>
    ${b.abenteuer ? "" : `<p>${b.links ?? 0} Texte mit Verweisen auf Regeln, Zauber, Fertigkeiten und Gegenstände versehen.</p>`}
    ${b.textpruefung ? textpruefungHtml(b.textpruefung) : ""}
    ${b.teile.map((t) => liste(`${t.kategorie}: vorhandener Text behalten`, t.behalten) + liste(`${t.kategorie}: in der PDF gefunden, aber nicht zugeordnet`, t.nichtZugeordnet) + liste(`${t.kategorie}: ohne Beschreibung aus diesem Buch`, t.ohne)).join("")}
    <p class="hinweis">Die Texte stehen nur in den Kompendien dieser Welt. Würfeltabellen, Beispiele und Merkkästen werden erkannt und eigens dargestellt; mehrspaltige Tabellen können unvollständig sein. Bereits auf Charakterbögen liegende Gegenstände behalten ihren alten Stand.</p>
  </div>`;
  if (D) D.prompt({ window: { title: "Regelwerk importiert" }, content: inhalt, ok: { label: "OK" }, rejectClose: false }).catch(() => {});
  else ui.notifications.info(`Midgard: ${b.teile.map((t) => `${t.geschrieben} ${t.kategorie}`).join(", ")} importiert.`);
}
