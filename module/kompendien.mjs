// Legt die Kompendien des Systems in der Welt an und hält sie auf dem Stand der geprüften Daten.
// Die Inhalte stehen in daten/kompendium.js (erzeugt mit foundry/kompendium_erzeugen.mjs). Ändert
// sich dort der Stand, gleicht der Spielleiter beim nächsten Start ab: Einträge mit festen IDs
// werden aktualisiert, neue angelegt, entfallene gelöscht. Selbst angelegte Einträge ohne
// Systemschlüssel bleiben, ebenso Beschreibungen, die in der Welt nachgetragen wurden.
import KOMPENDIUM from "../daten/kompendium.js";
import { KATEGORIEN, SYSTEM_ID, packName, packId } from "./kategorien.mjs";

const ORDNER = "Midgard 5";
const BEHALTEN = ["beschreibung", "kurzwirkung"]; // in der Welt nachgetragene Texte

export function einstellungenRegistrieren() {
  game.settings.register(SYSTEM_ID, "kompendiumStand", {
    scope: "world", config: false, type: String, default: "",
  });
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

/** Gleicht ein Kompendium mit den Solldaten ab. Gibt die Zahl der Änderungen zurück. */
async function abgleichen(pack, soll) {
  const vorhanden = new Map((await pack.getDocuments()).map((d) => [d.id, d]));
  const sollIds = new Set(soll.map((e) => e._id));
  const neu = [], aendern = [], loeschen = [];
  for (const eintrag of soll) {
    const alt = vorhanden.get(eintrag._id);
    if (!alt) { neu.push(eintrag); continue; }
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
  const fehlt = Object.keys(KATEGORIEN).some((k) => !game.packs.get(packId(k)));
  const stand = game.settings.get(SYSTEM_ID, "kompendiumStand");
  if (!erzwingen && !fehlt && stand === KOMPENDIUM.stand) return false;

  ui.notifications.info("Midgard: Kompendien werden eingerichtet …");
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
  ui.notifications.info(`Midgard: Kompendien auf Stand ${KOMPENDIUM.stand}.`);
  return true;
}

export const KOMPENDIUM_STAND = KOMPENDIUM.stand;
