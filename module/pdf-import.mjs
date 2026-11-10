// Ein-Klick-Import der Beschreibungstexte aus den eigenen Regelwerk-PDFs in die Welt-Kompendien.
// Die PDF wird nur im Browser des Spielleiters gelesen (pdf.js); die Texte landen ausschließlich
// in den Kompendien dieser Welt, nicht im System. Erkannt werden „Das Arkanum“ (Zauber) und
// „Der Kodex“ (Fertigkeiten, Waffenfertigkeiten, Waffen, Rüstungen, Abenteurertypen, Rassen).
// Die Kompendien sind bis zum Import leer; der Import legt die Einträge an.
import { SYSTEM_ID, packId } from "./kategorien.mjs";
import { textzeilen } from "./pdf/textzeilen.mjs";
import { istArkanum, zauberAusArkanum, zaubermittelAusArkanum } from "./pdf/arkanum.mjs";
import { istKodex, fertigkeitenAusKodex, typenUndRassenAusKodex, ruestungenAusKodex } from "./pdf/kodex.mjs";
import KOMPENDIUM from "../daten/kompendium.js";
import { zuordnen, alsHtml } from "./pdf/zuordnen.mjs";
import { regelnAusBuch, REGELBEREICHE } from "./pdf/regeln.mjs";
import { allesVerlinken, REGEL_PACK } from "./verlinken.mjs";
import { esc } from "./wuerfe.mjs";

const PFAD = `systems/${SYSTEM_ID}/vendor/pdfjs`;
let pdfjs = null;

async function pdfjsLaden() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(new URL(`${PFAD}/pdf.min.mjs`, document.baseURI).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(`${PFAD}/pdf.worker.min.mjs`, document.baseURI).href;
  return pdfjs;
}

/** Dateiauswahl, dann Import. Nur für Spielleiter. */
export async function pdfImportStarten() {
  if (!game.user.isGM) return ui.notifications.warn("Nur der Spielleiter kann Regelwerke importieren.");
  const eingabe = Object.assign(document.createElement("input"), { type: "file", accept: "application/pdf,.pdf", multiple: true });
  eingabe.addEventListener("change", async () => {
    for (const datei of eingabe.files) await pdfImportieren(await datei.arrayBuffer(), { dateiname: datei.name });
  });
  eingabe.click();
}

/**
 * Liest eine Regelwerk-PDF und schreibt die Beschreibungen in die Kompendien.
 * @param {ArrayBuffer} daten
 * @param {object} o  dateiname, ueberschreiben (auch vorhandene, nicht importierte Texte ersetzen), stumm (kein Berichtsfenster)
 */
export async function pdfImportieren(daten, { dateiname = "PDF", ueberschreiben = false, stumm = false } = {}) {
  const fortschritt = ui.notifications.info(`Midgard: ${dateiname} wird gelesen …`, { permanent: true });
  try {
    const lib = await pdfjsLaden();
    const doc = await lib.getDocument({ data: new Uint8Array(daten), verbosity: 0 }).promise;
    const zeilen = await textzeilen(doc);
    let bericht;
    if (istArkanum(zeilen)) bericht = await arkanumImportieren(zeilen, ueberschreiben);
    else if (istKodex(zeilen)) bericht = await kodexImportieren(zeilen, ueberschreiben);
    else {
      ui.notifications.warn(`${dateiname}: kein unterstütztes Regelwerk erkannt (unterstützt: Der Kodex, Das Arkanum).`);
      return null;
    }
    bericht.teile.push(await regelnSchreiben(zeilen, bericht.buch));
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
    fortschritt?.remove?.();
  }
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
  return { buch, teile };
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
    if (!doc) {
      const d = foundry.utils.deepClone(e);
      d.system.beschreibung = html;
      d.flags[SYSTEM_ID].pdfImport = flag;
      neu.push(d);
      continue;
    }
    if (!g) continue;
    // selbst geschriebener Text (Eintrag ohne Importmarke) bleibt, außer auf ausdrücklichen Wunsch
    if (doc.system.beschreibung && !doc.getFlag(SYSTEM_ID, "pdfImport") && !ueberschreiben) { behalten.push(e.name); continue; }
    aenderungen.push({ _id: e._id, "system.beschreibung": html, [`flags.${SYSTEM_ID}.pdfImport`]: flag });
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
async function ordnerPfad(pack, pfad, typ, flags = {}) {
  let eltern = null;
  for (const name of pfad.filter(Boolean)) {
    const vorhanden = [...(pack.folders ?? [])].find((f) => f.name === name && (f.folder?.id ?? f.folder ?? null) === eltern);
    if (vorhanden) { eltern = vorhanden.id; continue; }
    const [neu] = await Folder.createDocuments([{ name, type: typ, folder: eltern, sorting: "m", flags: { [SYSTEM_ID]: flags } }], { pack: pack.collection });
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
    const seiteDaten = (buchKap, s, i, level = Math.min(3, s.ebene)) => ({
      _id: stabileId(`${buch}|${buchKap}|${s.titel}|${i}`), name: s.titel, type: "text", sort: i * 100,
      title: { show: true, level },
      text: { format: 1, content: alsHtml(s.absaetze, `${buch}, S. ${s.seite}`) },
      flags: { [SYSTEM_ID]: { seite: s.seite, ebene: s.ebene } },
    });
    const neu = [];
    let nr = 0;
    for (const k of kapitel) {
      const ordner = await ordnerPfad(pack, [buch, k.teil], "JournalEntry", { buch });
      const kapId = stabileId(`${buch}|${k.titel}`);
      const seiten = [];
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
      neu.push({ _id: kapId, name: k.titel, folder: ordner, sort: (nr++) * 100, flags: { [SYSTEM_ID]: { buch, seite: k.seite } }, pages: seiten });
    }
    if (neu.length) await JournalEntry.createDocuments(neu, { pack: pack.collection, keepId: true });
    journale = neu.length;
    seitenZahl = neu.reduce((n, j) => n + j.pages.length, 0);
  } finally { if (gesperrt) await pack.configure({ locked: true }); }
  return { kategorie: "regeln", angelegt: seitenZahl, geschrieben: seitenZahl, behalten: [], nichtZugeordnet: [], ohne: [], kapitel: journale };
}

function berichtZeigen(b) {
  const D = foundry.applications?.api?.DialogV2;
  const liste = (titel, l) => (l.length ? `<details><summary>${esc(titel)} (${l.length})</summary><p>${l.map(esc).join(", ")}</p></details>` : "");
  const inhalt = `<div class="midgard-bericht">
    <p>Aus <strong>${esc(b.dateiname)}</strong> (${esc(b.buch)}) übernommen:</p>
    <ul>${b.teile.map((t) => t.kategorie === "regeln" ? `<li>Regeln: ${t.kapitel ?? 0} Kapitel mit ${t.angelegt} Seiten</li>` : `<li>${esc(t.kategorie)}: ${t.angelegt} neu angelegt, ${t.geschrieben} mit Beschreibung</li>`).join("")}</ul>
    <p>${b.links ?? 0} Texte mit Verweisen auf Regeln, Zauber, Fertigkeiten und Gegenstände versehen.</p>
    ${b.teile.map((t) => liste(`${t.kategorie}: vorhandener Text behalten`, t.behalten) + liste(`${t.kategorie}: in der PDF gefunden, aber nicht zugeordnet`, t.nichtZugeordnet) + liste(`${t.kategorie}: ohne Beschreibung aus diesem Buch`, t.ohne)).join("")}
    <p class="hinweis">Die Texte stehen nur in den Kompendien dieser Welt. Tabellen aus dem Buch erscheinen als Fließtext. Bereits auf Charakterbögen liegende Gegenstände behalten ihren alten Stand.</p>
  </div>`;
  if (D) D.prompt({ window: { title: "Regelwerk importiert" }, content: inhalt, ok: { label: "OK" }, rejectClose: false }).catch(() => {});
  else ui.notifications.info(`Midgard: ${b.teile.map((t) => `${t.geschrieben} ${t.kategorie}`).join(", ")} importiert.`);
}
