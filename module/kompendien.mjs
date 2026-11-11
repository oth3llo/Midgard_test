// Legt die (zunächst leeren) Kompendien des Systems in der Welt an. Gefüllt werden sie erst durch
// den Import der eigenen Regelwerk-PDFs (module/pdf-import.mjs): Spielwerte aus dem geprüften
// Datensatz daten/kompendium.js, Texte aus der PDF. Ändert sich der Datensatz, gleicht der
// Spielleiter beim nächsten Start die vorhandenen Einträge ab (feste IDs); entfallene werden
// gelöscht. Selbst angelegte Einträge und nachgetragene Texte bleiben.
// Einträge früherer Versionen, die ohne Import angelegt wurden, werden entfernt.
import KOMPENDIUM from "../daten/kompendium.js";
import { KATEGORIEN, SYSTEM_ID, packName, packId } from "./kategorien.mjs";

const ORDNER = "Midgard 5";
const BEHALTEN = ["beschreibung", "kurzwirkung"]; // in der Welt nachgetragene Texte

export function einstellungenRegistrieren() {
  game.settings.register(SYSTEM_ID, "kompendiumStand", {
    scope: "world", config: false, type: String, default: "",
  });
  // Freigabe des Erschaffungs- und Lernassistenten: erst nach dem Import des offiziellen Kodex
  game.settings.register(SYSTEM_ID, "kodexImportiert", {
    scope: "world", config: false, type: Boolean, default: false,
    onChange: () => Hooks.callAll("midgardKodexStatus"),
  });
  // 2 = Kompendien werden nur noch durch den PDF-Import gefüllt
  game.settings.register(SYSTEM_ID, "kompendiumModell", { scope: "world", config: false, type: Number, default: 1 });
}

const Sammlung = () => foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;

async function ordner() {
  const vorhanden = game.folders.find((o) => o.type === "Compendium" && o.name === ORDNER);
  if (vorhanden) return vorhanden;
  try {
    return await Folder.create({ name: ORDNER, type: "Compendium", color: "#6b3f1d" });
  } catch (fehler) {
    console.warn(`${SYSTEM_ID} | Kompendium-Ordner nicht angelegt`, fehler);
    return null;
  }
}

async function packHolen(kat, ziel) {
  let pack = game.packs.get(packId(kat));
  if (!pack) {
    pack = await Sammlung().createCompendium({ name: packName(kat), label: `Midgard: ${KATEGORIEN[kat].label}`, type: "Item" });
  }
  if (ziel && pack.folder?.id !== ziel.id && typeof pack.setFolder === "function") {
    await pack.setFolder(ziel).catch((e) => console.warn(`${SYSTEM_ID} | Ordner für ${kat}`, e));
  }
  return pack;
}

/** Journal-Kompendium für die Regeltexte (gefüllt durch den PDF-Import). */
async function regelPackHolen() {
  let pack = game.packs.get("world.midgard-regeln");
  if (!pack) pack = await Sammlung().createCompendium({ name: "midgard-regeln", label: "Midgard: Regeln", type: "JournalEntry" });
  const ziel = await ordner();
  if (ziel && pack.folder?.id !== ziel.id && typeof pack.setFolder === "function") await pack.setFolder(ziel).catch(() => {});
  if (!pack.locked) await pack.configure({ locked: true });
  return pack;
}

/** Gleicht ein Kompendium mit den Solldaten ab. Gibt die Zahl der Änderungen zurück. */
async function abgleichen(pack, soll) {
  const vorhanden = new Map((await pack.getDocuments()).map((d) => [d.id, d]));
  const sollIds = new Set(soll.map((e) => e._id));
  const neu = [], aendern = [], loeschen = [];
  for (const eintrag of soll) {
    const alt = vorhanden.get(eintrag._id);
    if (!alt) continue; // angelegt wird nur durch den Import
    // aus früheren Versionen: ohne Import angelegt und ohne nachgetragenen Text
    if (!alt.getFlag?.(SYSTEM_ID, "pdfImport") && !alt.system.beschreibung && !alt.system.kurzwirkung) { loeschen.push(alt.id); continue; }
    const daten = foundry.utils.deepClone(eintrag);
    for (const k of BEHALTEN) if (!daten.system[k] && alt.system[k]) daten.system[k] = alt.system[k];
    daten.flags = foundry.utils.mergeObject(alt.toObject().flags ?? {}, daten.flags, { inplace: false });
    aendern.push(daten);
  }
  for (const [id, d] of vorhanden) {
    if (!sollIds.has(id) && d.getFlag?.(SYSTEM_ID, "schluessel")) loeschen.push(id);
  }
  const opt = { pack: pack.collection };
  if (loeschen.length) await Item.deleteDocuments(loeschen, opt);
  // recursive: false ersetzt system vollständig, damit entfallene Felder nicht stehen bleiben
  if (aendern.length) await Item.updateDocuments(aendern, { ...opt, recursive: false, diff: false });
  if (neu.length) await Item.createDocuments(neu, { ...opt, keepId: true });
  return neu.length + aendern.length + loeschen.length;
}

/**
 * Legt fehlende Kompendien an und gleicht sie ab, wenn sich der Datenstand geändert hat.
 * Läuft nur beim aktiven Spielleiter, damit nicht mehrere Clients gleichzeitig schreiben.
 * @param {boolean} erzwingen  auch bei gleichem Stand abgleichen
 */
export async function kompendienAufbauen(erzwingen = false) {
  const gm = game.users.activeGM ?? game.users.find((u) => u.isGM && u.active);
  if (!game.user.isGM || (gm && gm.id !== game.user.id)) return false;
  const fehlt = Object.keys(KATEGORIEN).some((k) => !game.packs.get(packId(k))) || !game.packs.get("world.midgard-regeln");
  const stand = game.settings.get(SYSTEM_ID, "kompendiumStand");
  const modell = game.settings.get(SYSTEM_ID, "kompendiumModell");
  if (!erzwingen && !fehlt && stand === KOMPENDIUM.stand && modell === 2) return false;

  await regelPackHolen();
  if (fehlt) ui.notifications.info("Midgard: Kompendien werden angelegt. Gefüllt werden sie über „Regelwerk-PDF importieren“ im Kompendium-Reiter.");
  const ziel = await ordner();
  for (const [kat, soll] of Object.entries(KOMPENDIUM.kategorien)) {
    const pack = await packHolen(kat, ziel);
    const gesperrt = pack.locked;
    if (gesperrt) await pack.configure({ locked: false });
    try {
      const n = await abgleichen(pack, soll);
      console.log(`${SYSTEM_ID} | Kompendium ${kat}: ${soll.length} Einträge, ${n} Änderungen`);
    } finally {
      await pack.configure({ locked: true });
    }
  }
  await game.settings.set(SYSTEM_ID, "kompendiumStand", KOMPENDIUM.stand);
  await game.settings.set(SYSTEM_ID, "kompendiumModell", 2);
  console.log(`${SYSTEM_ID} | Kompendien auf Stand ${KOMPENDIUM.stand}`);
  return true;
}

export const KOMPENDIUM_STAND = KOMPENDIUM.stand;

/**
 * Notbehelf ohne PDF: legt alle Einträge mit Spielwerten, aber ohne Beschreibung an
 * (Konsole: game.midgard.kompendienOhnePdf()). Ein späterer PDF-Import ergänzt die Texte.
 */
export async function kompendienOhnePdf() {
  if (!game.user.isGM) return;
  for (const [kat, soll] of Object.entries(KOMPENDIUM.kategorien)) {
    const pack = await packHolen(kat, null);
    const vorhanden = new Set((await pack.getIndex()).map((e) => e._id));
    const neu = soll.filter((e) => !vorhanden.has(e._id)).map((e) => {
      const d = foundry.utils.deepClone(e);
      d.flags[SYSTEM_ID].pdfImport = { buch: null, seite: null };
      return d;
    });
    if (!neu.length) continue;
    const gesperrt = pack.locked;
    if (gesperrt) await pack.configure({ locked: false });
    try { await Item.createDocuments(neu, { pack: pack.collection, keepId: true }); }
    finally { if (gesperrt) await pack.configure({ locked: true }); }
  }
  Hooks.callAll("midgardKompendienGeaendert");
}

/** Ist der Kodex aus der PDF importiert? (Fertigkeiten mit Importmarke „Der Kodex“ im Kompendium) */
export async function kodexImportiertPruefen() {
  const gm = game.users.activeGM ?? game.users.find((u) => u.isGM && u.active);
  if (!game.user.isGM || (gm && gm.id !== game.user.id)) return game.settings.get(SYSTEM_ID, "kodexImportiert");
  const pack = game.packs.get(packId("fertigkeiten"));
  const docs = pack ? await pack.getDocuments() : [];
  const da = docs.some((d) => d.getFlag?.(SYSTEM_ID, "pdfImport")?.buch === "Der Kodex" && d.getFlag(SYSTEM_ID, "pdfImport")?.seite);
  if (da !== game.settings.get(SYSTEM_ID, "kodexImportiert")) await game.settings.set(SYSTEM_ID, "kodexImportiert", da);
  return da;
}
