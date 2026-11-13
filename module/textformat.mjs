// Umstellung gespeicherter Texte auf das aktuelle Kastenformat. Texte, die mit Versionen vor 0.9
// importiert wurden, enthalten Kästen als lose Absätze (<p><strong>leicht (+2)</strong></p> …).
// Beim Start schreibt die Spielleitung sie einmalig in das gegliederte Format um (Stufenmarken,
// Aufzählungen, Kopfleisten), in den Midgard-Kompendien, in der Welt und auf Bögen. Verweise (@UUID)
// bleiben erhalten, weil sie vor der Anreicherung noch Klartext sind.
import { SYSTEM_ID } from "./kategorien.mjs";
import { kastenHtml } from "./pdf/zuordnen.mjs";

const FORMAT = 2; // Stand des Kastenformats; erhöhen, wenn eine neue Umstellung nötig wird
const ALT = /<div class="midgard-kasten">((?:<p>(?:(?!<\/?p[ >]).)*<\/p>\s*)+)<\/div>/gs;
const zurueck = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Kästen im alten Format (nur lose Absätze) in das gegliederte Format umschreiben; sonst unverändert. */
export function kaestenAufwerten(html) {
  if (typeof html !== "string" || !html.includes('<div class="midgard-kasten">')) return html;
  return html.replace(ALT, (ganz, inhalt) => {
    const zeilen = [...inhalt.matchAll(/<p>(.*?)<\/p>/gs)].map((m) => zurueck(m[1].replace(/<\/?strong>/g, "")).trim()).filter(Boolean);
    return zeilen.length ? kastenHtml(zeilen) : ganz;
  });
}

export function einstellungRegistrieren() {
  game.settings.register(SYSTEM_ID, "textFormat", { scope: "world", config: false, type: Number, default: 1 });
}

/** Einmalige Umstellung (nur aktive Spielleitung). Gibt die Zahl der geänderten Texte zurück. */
export async function texteUmstellen({ erzwingen = false } = {}) {
  const gm = game.users.activeGM ?? game.users.find((u) => u.isGM && u.active);
  if (!game.user.isGM || (gm && gm.id !== game.user.id)) return 0;
  if (!erzwingen && (game.settings.get(SYSTEM_ID, "textFormat") ?? 1) >= FORMAT) return 0;
  let n = 0;
  const neu = (alt) => { const t = kaestenAufwerten(alt); return t !== alt ? t : null; };
  const werte = (c) => (c?.values ? [...c.values()] : c?.[Symbol.iterator] ? [...c] : []);
  for (const pack of werte(game.packs)) {
    if (!String(pack.collection ?? "").startsWith("world.midgard-")) continue;
    const docs = await pack.getDocuments();
    const gesperrt = pack.locked;
    let entsperrt = false;
    const oeffnen = async () => { if (gesperrt && !entsperrt) { await pack.configure({ locked: false }); entsperrt = true; } };
    try {
      if (pack.documentName === "JournalEntry") {
        for (const j of docs) {
          const aenderung = j.pages.map((p) => ({ _id: p.id ?? p._id, t: neu(p.text?.content) })).filter((x) => x.t).map((x) => ({ _id: x._id, "text.content": x.t }));
          if (aenderung.length) { await oeffnen(); await j.updateEmbeddedDocuments("JournalEntryPage", aenderung); n += aenderung.length; }
        }
      } else if (pack.documentName === "Item" || pack.documentName === "Actor") {
        const aenderung = docs.map((d) => ({ _id: d.id, t: neu(d.system?.beschreibung) })).filter((x) => x.t).map((x) => ({ _id: x._id, "system.beschreibung": x.t }));
        if (aenderung.length) { await oeffnen(); await (CONFIG[pack.documentName]?.documentClass ?? globalThis[pack.documentName]).updateDocuments(aenderung, { pack: pack.collection }); n += aenderung.length; }
      }
    } finally { if (entsperrt) await pack.configure({ locked: true }); }
  }
  // Welt: Gegenstände, Akteure samt ihrer Gegenstände, Journale
  for (const item of werte(game.items)) { const t = neu(item.system?.beschreibung); if (t) { await item.update({ "system.beschreibung": t }); n++; } }
  for (const actor of werte(game.actors)) {
    const t = neu(actor.system?.beschreibung);
    if (t) { await actor.update({ "system.beschreibung": t }); n++; }
    const items = [...(actor.items ?? [])].map((i) => ({ _id: i.id, t: neu(i.system?.beschreibung) })).filter((x) => x.t).map((x) => ({ _id: x._id, "system.beschreibung": x.t }));
    if (items.length) { await actor.updateEmbeddedDocuments("Item", items); n += items.length; }
  }
  for (const j of werte(game.journal)) {
    const aenderung = [...(j.pages ?? [])].map((p) => ({ _id: p.id, t: neu(p.text?.content) })).filter((x) => x.t).map((x) => ({ _id: x._id, "text.content": x.t }));
    if (aenderung.length) { await j.updateEmbeddedDocuments("JournalEntryPage", aenderung); n += aenderung.length; }
  }
  await game.settings.set(SYSTEM_ID, "textFormat", FORMAT);
  if (n) console.log(`${SYSTEM_ID} | ${n} Texte auf das gegliederte Kastenformat umgestellt`);
  return n;
}
