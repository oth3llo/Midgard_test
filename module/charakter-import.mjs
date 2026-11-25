// Charaktere von außerhalb übernehmen: Charakter-Code der Handy-Fassung (charaktergenerator/tisch.html,
// Nachricht mit Zusammenfassung und Code) oder exportiertes JSON der Browser-Fassung. Daraus entsteht ein
// Abenteurer, den das Erschaffungs- und Lernwerkzeug verwaltet, als wäre er im Bogen gebaut worden.
// Das Paket liefert die Handy-Fassung nicht aus (Erschaffung nur nach Kodex-Import in Foundry).
import { SYSTEM_ID } from "./kategorien.mjs";
import { ausWerkzeug } from "./akteur.mjs";

const { ApplicationV2 } = foundry.applications.api;

const el = (tag, attrs = {}, ...kinder) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinder.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
};

/** Zustand des Werkzeugs aus einem Text: Charakter-Code (ganze Nachricht genügt) oder exportiertes JSON. */
export async function zustandAusText(text) {
  const z = await window.MidgardCMT.codeLesen(text);
  if (z) return z;
  try {
    const d = JSON.parse(text);
    const liste = Array.isArray(d) ? d : Array.isArray(d?.charaktere) ? d.charaktere : [d];
    return liste.find((c) => c && typeof c === "object" && c.eig && c.rasse) ?? null;
  } catch { return null; }
}

/**
 * Legt aus dem Text einen Abenteurer an und übernimmt sofort alle Werte und eingebetteten Gegenstände
 * (über ein unsichtbares Werkzeug, ohne den Bogen zu öffnen). besitzer: Benutzer-ID, die den Charakter
 * besitzen soll (optional).
 */
export async function charakterImportieren(text, { besitzer = null, oeffnen = true } = {}) {
  let zustand;
  try { zustand = await zustandAusText(text); } catch (e) { throw new Error(`Der Charakter-Code ist unvollständig oder beschädigt (${e.message}).`); }
  if (!zustand || typeof zustand !== "object" || !zustand.eig || !zustand.rasse) throw new Error("In diesem Text steht kein Charakter-Code.");
  // eigene ID je Import, damit zweimal Importieren zwei getrennte Charaktere ergibt
  zustand.id = "c" + (foundry.utils.randomID?.(12) ?? Math.random().toString(36).slice(2, 14));
  delete zustand.ansicht;
  delete zustand.besucht;
  zustand.schritt = 99; // letzter Schritt: keine Rückfragen der Erschaffung beim unsichtbaren Start
  const daten = { name: zustand.name || "Neuer Abenteurer", type: "abenteurer", system: { zustand: JSON.stringify(zustand) } };
  if (besitzer) daten.ownership = { default: 0, [besitzer]: globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3 };
  const actor = await Actor.create(daten);
  const werkzeug = window.MidgardCMT.starte({ wurzel: document.createElement("div"), modus: "foundry", zustand, speichere: () => {}, spielleitung: () => true });
  await ausWerkzeug(actor, werkzeug.auswertung(), werkzeug.zustand());
  if (oeffnen) actor.sheet?.render(true);
  return actor;
}

export class CharakterImportFenster extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "midgard-charakter-import", classes: ["midgard-regelwerke", "midgard-charakter-import"], tag: "div",
    window: { title: "Midgard: Charakter-Code importieren", icon: "fa-solid fa-mobile-screen" }, position: { width: 560, height: "auto" },
  };

  static oeffnen() {
    const offen = foundry.applications.instances?.get?.("midgard-charakter-import");
    return (offen ?? new CharakterImportFenster()).render({ force: true });
  }

  async _renderHTML() {
    const spieler = (game.users?.filter?.((u) => !u.isGM) ?? []);
    return el("form", { class: "midgard-regelwerke-wurzel midgard-import-wurzel", onsubmit: (ev) => ev.preventDefault() },
      el("p", { class: "leise", text: "Übernimmt einen Charakter aus einem Charakter-Code (Nachricht der Handy-Fassung) oder einer exportierten Datei der Browser-Fassung. Einfach den ganzen Text einfügen." }),
      el("textarea", { name: "text", rows: 8, placeholder: "Nachricht mit Charakter-Code oder exportiertes JSON hier einfügen." }),
      spieler.length ? el("label", { class: "midgard-import-besitzer" }, "Gehört ",
        el("select", { name: "besitzer" }, el("option", { value: "", text: "niemandem (später zuweisen)" }), spieler.map((u) => el("option", { value: u.id, text: u.name })))) : null,
      el("div", { class: "midgard-regelwerke-knoepfe" },
        el("button", { type: "button", class: "midgard-start-knopf haupt", onclick: () => this.#importieren() }, el("i", { class: "fa-solid fa-file-import" }), " Charakter anlegen")));
  }

  async #importieren() {
    const f = this.element.querySelector("form");
    const text = f.querySelector('[name="text"]').value;
    const besitzer = f.querySelector('[name="besitzer"]')?.value || null;
    try {
      const actor = await charakterImportieren(text, { besitzer });
      ui.notifications.info(`Midgard: „${actor.name}“ angelegt.`);
      this.close();
    } catch (e) {
      ui.notifications.error(`Midgard: ${e.message}`);
    }
  }

  _onRender() {
    // Spielername aus der Nachricht vorwählen, sobald etwas eingefügt ist
    const f = this.element.querySelector("form");
    const feld = f?.querySelector('[name="text"]'), wahl = f?.querySelector('[name="besitzer"]');
    if (!feld || !wahl) return;
    feld.addEventListener("input", async () => {
      const z = await zustandAusText(feld.value).catch(() => null);
      const name = (z?.spieler || "").trim().toLowerCase();
      const treffer = name && [...wahl.options].find((o) => o.value && o.textContent.trim().toLowerCase() === name);
      if (treffer) wahl.value = treffer.value;
    });
  }

  _replaceHTML(inhalt, ziel) { ziel.replaceChildren(inhalt); }
}

/** Knopf „Charakter-Code importieren“ im Reiter Akteure (für alle, die Akteure anlegen dürfen). */
export function knopfEinbauen(_app, html) {
  if (!(game.user.isGM || game.user.can?.("ACTOR_CREATE"))) return;
  const wurzel = html instanceof HTMLElement ? html : html?.[0];
  if (!wurzel || wurzel.querySelector(".midgard-import-knopf")) return;
  const knopf = el("button", { type: "button", class: "midgard-browser-knopf midgard-import-knopf", title: "Charakter aus einem Charakter-Code oder einer exportierten Datei übernehmen" },
    el("i", { class: "fa-solid fa-mobile-screen" }), " Charakter-Code importieren");
  knopf.addEventListener("click", () => CharakterImportFenster.oeffnen());
  (wurzel.querySelector(".header-actions") ?? wurzel.querySelector(".directory-header") ?? wurzel).append(knopf);
}
