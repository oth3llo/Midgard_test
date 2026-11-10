// Ein-Klick-Import der Beschreibungstexte aus den eigenen Regelwerk-PDFs in die Welt-Kompendien.
// Die PDF wird nur im Browser des Spielleiters gelesen (pdf.js); die Texte landen ausschließlich
// in den Kompendien dieser Welt, nicht im System. Erkannt werden „Das Arkanum“ (Zauber) und
// „Der Kodex“ (Fertigkeiten und Waffenfertigkeiten).
import { SYSTEM_ID, packId } from "./kategorien.mjs";
import { textzeilen } from "./pdf/textzeilen.mjs";
import { istArkanum, zauberAusArkanum } from "./pdf/arkanum.mjs";
import { istKodex, fertigkeitenAusKodex } from "./pdf/kodex.mjs";
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
  return { buch: "Das Arkanum", teile: [teil] };
}

async function kodexImportieren(zeilen, ueberschreiben) {
  const K = window.KODEX;
  const aliase = { ...K.lernName };
  const ziele = [];
  for (const kat of ["fertigkeiten", "waffenfertigkeiten"]) {
    const pack = game.packs.get(packId(kat));
    if (pack) ziele.push(...(await pack.getIndex()).map((e) => e.name));
  }
  const gelesen = fertigkeitenAusKodex(zeilen, [...ziele, ...Object.keys(aliase)]);
  const teile = [];
  for (const kat of ["fertigkeiten", "waffenfertigkeiten"]) teile.push(await schreiben(kat, gelesen, { aliase, buch: "Der Kodex", ueberschreiben, nurPassende: true }));
  return { buch: "Der Kodex", teile };
}

/** Schreibt zugeordnete Beschreibungen in ein Kompendium (entsperrt es dafür kurz). */
async function schreiben(kat, gelesen, { aliase, gruppeVon, buch, ueberschreiben, nurPassende = false }) {
  const pack = game.packs.get(packId(kat));
  if (!pack) throw new Error(`Kompendium ${kat} fehlt; zuerst die Welt als Spielleiter laden.`);
  const docs = await pack.getDocuments();
  const ziele = docs.map((d) => ({ _id: d.id, name: d.name, system: d.system, doc: d }));
  const { paare, nichtZugeordnet, ohne } = zuordnen(gelesen, ziele, { aliase, gruppeVon });
  const aenderungen = [], behalten = [];
  for (const [g, z] of paare) {
    const vorher = z.doc.system.beschreibung;
    const importiert = z.doc.getFlag(SYSTEM_ID, "pdfImport");
    if (vorher && !importiert && !ueberschreiben) { behalten.push(z.name); continue; }
    aenderungen.push({ _id: z._id, "system.beschreibung": alsHtml(g.absaetze, `${buch}, S. ${g.seite}`), [`flags.${SYSTEM_ID}.pdfImport`]: { buch, seite: g.seite } });
  }
  if (aenderungen.length) {
    const gesperrt = pack.locked;
    if (gesperrt) await pack.configure({ locked: false });
    try { await Item.updateDocuments(aenderungen, { pack: pack.collection }); }
    finally { if (gesperrt) await pack.configure({ locked: true }); }
  }
  return {
    kategorie: kat, gelesen: gelesen.length, geschrieben: aenderungen.length, behalten,
    // beim Kodex gehören nicht zugeordnete Einträge meist in die andere Kategorie
    nichtZugeordnet: nurPassende ? [] : nichtZugeordnet.map((g) => g.name),
    ohne: ohne.map((z) => z.name),
  };
}

function berichtZeigen(b) {
  const D = foundry.applications?.api?.DialogV2;
  const liste = (titel, l) => (l.length ? `<details><summary>${esc(titel)} (${l.length})</summary><p>${l.map(esc).join(", ")}</p></details>` : "");
  const inhalt = `<div class="midgard-bericht">
    <p>Aus <strong>${esc(b.dateiname)}</strong> (${esc(b.buch)}) übernommen:</p>
    <ul>${b.teile.map((t) => `<li>${esc(t.kategorie)}: ${t.geschrieben} Beschreibungen</li>`).join("")}</ul>
    ${b.teile.map((t) => liste(`${t.kategorie}: vorhandener Text behalten`, t.behalten) + liste(`${t.kategorie}: in der PDF gefunden, aber nicht zugeordnet`, t.nichtZugeordnet) + liste(`${t.kategorie}: ohne Beschreibung aus diesem Buch`, t.ohne)).join("")}
    <p class="hinweis">Die Texte stehen nur in den Kompendien dieser Welt. Tabellen aus dem Buch erscheinen als Fließtext. Bereits auf Charakterbögen liegende Gegenstände behalten ihren alten Stand.</p>
  </div>`;
  if (D) D.prompt({ window: { title: "Regelwerk importiert" }, content: inhalt, ok: { label: "OK" }, rejectClose: false }).catch(() => {});
  else ui.notifications.info(`Midgard: ${b.teile.map((t) => `${t.geschrieben} ${t.kategorie}`).join(", ")} importiert.`);
}
