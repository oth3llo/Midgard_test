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
  if (neu.length || aenderungen.length) {
    const gesperrt = pack.locked;
    if (gesperrt) await pack.configure({ locked: false });
    try {
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

function berichtZeigen(b) {
  const D = foundry.applications?.api?.DialogV2;
  const liste = (titel, l) => (l.length ? `<details><summary>${esc(titel)} (${l.length})</summary><p>${l.map(esc).join(", ")}</p></details>` : "");
  const inhalt = `<div class="midgard-bericht">
    <p>Aus <strong>${esc(b.dateiname)}</strong> (${esc(b.buch)}) übernommen:</p>
    <ul>${b.teile.map((t) => `<li>${esc(t.kategorie)}: ${t.angelegt} neu angelegt, ${t.geschrieben} mit Beschreibung</li>`).join("")}</ul>
    ${b.teile.map((t) => liste(`${t.kategorie}: vorhandener Text behalten`, t.behalten) + liste(`${t.kategorie}: in der PDF gefunden, aber nicht zugeordnet`, t.nichtZugeordnet) + liste(`${t.kategorie}: ohne Beschreibung aus diesem Buch`, t.ohne)).join("")}
    <p class="hinweis">Die Texte stehen nur in den Kompendien dieser Welt. Tabellen aus dem Buch erscheinen als Fließtext. Bereits auf Charakterbögen liegende Gegenstände behalten ihren alten Stand.</p>
  </div>`;
  if (D) D.prompt({ window: { title: "Regelwerk importiert" }, content: inhalt, ok: { label: "OK" }, rejectClose: false }).catch(() => {});
  else ui.notifications.info(`Midgard: ${b.teile.map((t) => `${t.geschrieben} ${t.kategorie}`).join(", ")} importiert.`);
}
