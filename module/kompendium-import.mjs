// „In die Welt übernehmen“: Knopf in jedem Midgard-Kompendium (nur Spielleitung). Übernimmt alles oder
// einen Ordner samt Unterordnern in den passenden Bereich der Welt (Gegner → Akteure, Regeln → Journale,
// Ausrüstung und Zauber → Gegenstände) und baut die Ordnerstruktur nach. Bereits übernommene Einträge
// (gleiche Kompendium-Herkunft) werden vollständig ersetzt: gelöscht und mit derselben ID neu angelegt,
// damit ein zweiter Klick nichts verdoppelt, den aktuellen Stand bringt und Verweise gültig bleiben.
import { SYSTEM_ID } from "./kategorien.mjs";

const BEREICH = { Actor: "Akteure", Item: "Gegenstände", JournalEntry: "Journale", RollTable: "Tabellen", Scene: "Szenen" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const elternId = (f) => f?.folder?.id ?? f?.folder ?? null;

/** Ordner eines Kompendiums als Liste mit Pfad („Karmodin 1 › Wölfe“), sortiert. */
export function ordnerListe(pack) {
  const alle = [...(pack.folders ?? [])];
  const nachId = new Map(alle.map((f) => [f.id, f]));
  const pfad = (f) => { const teile = []; for (let x = f; x; x = nachId.get(elternId(x))) teile.unshift(x.name); return teile; };
  return alle.map((f) => ({ id: f.id, pfad: pfad(f) })).sort((a, b) => a.pfad.join(" › ").localeCompare(b.pfad.join(" › "), "de"));
}

/** Herkunft eines Welt-Dokuments (UUID des Kompendium-Eintrags), Foundry 12+ und ältere Markierung. */
const herkunft = (d) => d._stats?.compendiumSource ?? d.flags?.core?.sourceId ?? null;

/**
 * Übernimmt ein Kompendium (oder einen Ordner daraus) in die Welt.
 * @param {CompendiumCollection} pack
 * @param {object} o  ordnerId: nur dieser Ordner samt Unterordnern (sonst alles)
 * @returns {{angelegt: number, ersetzt: number, ordner: number, bereich: string}}
 */
export async function packInWelt(pack, { ordnerId = null } = {}) {
  const art = pack.documentName;
  const welt = game.collections.get(art);
  const Klasse = CONFIG[art]?.documentClass ?? globalThis[art];
  if (!welt || !Klasse) throw new Error(`Kompendium-Art ${art} wird nicht unterstützt.`);
  const packOrdner = [...(pack.folders ?? [])];
  const nachId = new Map(packOrdner.map((f) => [f.id, f]));
  // gewählter Ordner und alle darunter
  const teilbaum = new Set();
  if (ordnerId) {
    const sammeln = (id) => { teilbaum.add(id); for (const f of packOrdner) if (elternId(f) === id) sammeln(f.id); };
    sammeln(ordnerId);
  }
  const docs = (await pack.getDocuments()).filter((d) => !ordnerId || teilbaum.has(d.folder?.id ?? d.folder));
  // Wurzelordner in der Welt: Name des Kompendiums; darunter die Ordner des Kompendiums
  const weltOrdner = (name, eltern) => game.folders.find((f) => f.type === art && f.name === name && (elternId(f) ?? null) === (eltern ?? null));
  let neueOrdner = 0;
  const ordnerAnlegen = async (name, eltern, vorlage) => {
    const da = weltOrdner(name, eltern);
    if (da) return da.id;
    const f = await Folder.create({ name, type: art, folder: eltern ?? null, sorting: vorlage?.sorting ?? "a", color: vorlage?.color ?? null });
    neueOrdner++;
    return f.id;
  };
  const wurzel = await ordnerAnlegen(pack.metadata?.label ?? pack.title ?? pack.collection, null, { sorting: "a", color: "#6b3f1d" });
  const weltId = new Map();
  const ziel = async (packFolderId) => {
    if (!packFolderId || !nachId.has(packFolderId)) return wurzel;
    if (weltId.has(packFolderId)) return weltId.get(packFolderId);
    const f = nachId.get(packFolderId);
    const id = await ordnerAnlegen(f.name, await ziel(elternId(f)), f);
    weltId.set(packFolderId, id);
    return id;
  };
  // bereits übernommene Einträge: löschen und mit derselben ID neu anlegen
  const vorhanden = new Map();
  for (const w of welt) { const h = herkunft(w); if (h) vorhanden.set(h, w.id); }
  const neu = [], alt = [];
  for (const d of docs) {
    const daten = welt.fromCompendium ? welt.fromCompendium(d, { keepId: false }) : (() => { const o = d.toObject(); delete o._id; return o; })();
    const altId = vorhanden.get(d.uuid);
    if (altId) { alt.push(altId); daten._id = altId; }
    daten.folder = await ziel(d.folder?.id ?? d.folder);
    daten._stats = { ...(daten._stats ?? {}), compendiumSource: d.uuid };
    neu.push(daten);
  }
  for (let i = 0; i < alt.length; i += 100) await Klasse.deleteDocuments(alt.slice(i, i + 100));
  for (let i = 0; i < neu.length; i += 100) await Klasse.createDocuments(neu.slice(i, i + 100), { keepId: true });
  return { angelegt: neu.length, ersetzt: alt.length, ordner: neueOrdner, bereich: BEREICH[art] ?? art };
}

/** Rückfrage (alles oder ein Ordner), dann übernehmen und das Ergebnis melden. */
export async function importDialog(pack) {
  if (!game.user.isGM) return ui.notifications.warn("Nur die Spielleitung kann Kompendien in die Welt übernehmen.");
  const liste = ordnerListe(pack);
  const anzahl = (await pack.getIndex()).length ?? pack.index?.size ?? 0;
  if (!anzahl) return ui.notifications.info(`${pack.metadata?.label ?? pack.title}: noch leer. Zuerst die passende PDF importieren.`);
  const D = foundry.applications?.api?.DialogV2;
  let ordnerId = null;
  if (D) {
    const optionen = [`<option value="">Alles (${anzahl} Einträge)</option>`, ...liste.map((o) => `<option value="${esc(o.id)}">${"  ".repeat(o.pfad.length - 1)}${esc(o.pfad.at(-1))}</option>`)].join("");
    const wahl = await D.prompt({
      window: { title: `${pack.metadata?.label ?? pack.title}: in die Welt übernehmen` },
      content: `<div class="midgard-dialog"><p>Übernimmt die Einträge mit ihrer Ordnerstruktur in die ${esc(BEREICH[pack.documentName] ?? pack.documentName)} der Welt. Bereits übernommene werden vollständig ersetzt (Änderungen daran gehen verloren).</p>
        ${liste.length ? `<label>Was übernehmen? <select name="ordner">${optionen}</select></label>` : ""}</div>`,
      ok: { label: "Übernehmen", callback: (_ev, knopf) => knopf.form?.elements?.ordner?.value ?? "" },
      rejectClose: false,
    }).catch(() => null);
    if (wahl === null || wahl === undefined) return null;
    ordnerId = wahl || null;
  }
  const hinweis = ui.notifications.info("Midgard: Einträge werden übernommen …", { permanent: true });
  try {
    const e = await packInWelt(pack, { ordnerId });
    ui.notifications.info(`Midgard: ${e.angelegt} Einträge in die ${e.bereich} übernommen${e.ersetzt ? `, davon ${e.ersetzt} ersetzt` : ""}${e.ordner ? `, ${e.ordner} Ordner angelegt` : ""}.`);
    return e;
  } catch (fehler) {
    console.error(`${SYSTEM_ID} | Übernehmen`, fehler);
    ui.notifications.error("Midgard: Übernehmen fehlgeschlagen (Details in der Konsole).");
    return null;
  } finally { hinweis?.remove?.(); }
}

/** Knopf im Kompendium-Fenster (alle Kompendien „Midgard: …“ dieser Welt, nur Spielleitung). */
export function knopfEinrichten() {
  Hooks.on("renderCompendium", (app, html) => {
    const pack = app.collection ?? app.options?.collection;
    if (!game.user.isGM || !pack || !String(pack.collection ?? "").startsWith("world.midgard-")) return;
    const wurzel = html instanceof HTMLElement ? html : html?.[0];
    if (!wurzel || wurzel.querySelector(".midgard-in-welt")) return;
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "midgard-in-welt";
    knopf.innerHTML = `<i class="fa-solid fa-file-import" aria-hidden="true"></i> In die Welt übernehmen`;
    knopf.title = `Einträge mit Ordnerstruktur in die ${BEREICH[pack.documentName] ?? pack.documentName} der Welt übernehmen`;
    knopf.addEventListener("click", () => importDialog(pack));
    const ort = wurzel.querySelector(".directory-header, header.directory-header") ?? wurzel.querySelector(".window-content") ?? wurzel;
    ort.prepend(knopf);
  });
}
