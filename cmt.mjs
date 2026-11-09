// Midgard 5 – Charakter-Management-Tool (CMT) als Foundry-System (Foundry VTT 14).
// Der Bogen bettet dasselbe Werkzeug ein wie die Browser-Fassung (app.js) und speichert
// dessen Zustand als JSON im Feld system.zustand des Charakters.
import "./daten/kodex.js";
import "./daten/lernkosten.js";
import "./daten/zauber.js";
import "./app.js";

const SYSTEM_ID = "midgard5-cmt";
const SPEICHER_VERZOEGERUNG = 400; // ms; sammelt schnelle Eingaben zu einer Speicherung

class AbenteurerDaten extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    // Gesamter Zustand des Werkzeugs als JSON-Text. Ein Textfeld wird beim Speichern immer
    // vollständig ersetzt; so bleiben gelöschte Einträge (z. B. entfernte Fertigkeiten) gelöscht.
    return { zustand: new f.StringField({ required: true, blank: true, initial: "" }) };
  }
}

class MidgardBogen extends foundry.applications.sheets.ActorSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: ["midgard-cmt-bogen"],
    position: { width: 1100, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
  };

  #cmt = null;
  #timer = null;
  #ausstehend = null;

  /** Zustand aus dem Charakter lesen; ein noch nicht gespeicherter Stand hat Vorrang. */
  #zustand() {
    if (this.#ausstehend) return this.#ausstehend;
    const text = this.actor.system.zustand;
    if (!text) return { name: this.actor.name };
    try {
      return JSON.parse(text);
    } catch (fehler) {
      console.error(`${SYSTEM_ID} | Zustand von ${this.actor.name} nicht lesbar`, fehler);
      ui.notifications.error("Midgard-CMT: Die gespeicherten Daten dieses Charakters sind beschädigt.");
      return { name: this.actor.name };
    }
  }

  async _renderHTML(_context, _options) {
    const wurzel = document.createElement("div");
    this.#cmt = window.MidgardCMT.starte({
      wurzel,
      modus: "foundry",
      version: game.system.version,
      zustand: this.#zustand(),
      // absolut, damit das Stylesheet auch im Druckfenster (about:blank) gefunden wird
      cssUrl: new URL(`systems/${SYSTEM_ID}/styles/cmt.css`, document.baseURI).href,
      speichere: (zustand) => this.#vormerken(zustand),
    });
    return wurzel;
  }

  _replaceHTML(result, content, _options) {
    content.replaceChildren(result);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Der Bogen ist ein <form>; Enter in einem Eingabefeld soll nichts absenden.
    this.element.addEventListener("submit", (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); }, { capture: true });
  }

  #vormerken(zustand) {
    if (!this.isEditable) return;
    this.#ausstehend = JSON.parse(JSON.stringify(zustand));
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#schreiben(), SPEICHER_VERZOEGERUNG);
  }

  async #schreiben() {
    clearTimeout(this.#timer);
    this.#timer = null;
    const zustand = this.#ausstehend;
    if (!zustand) return;
    const aenderung = { "system.zustand": JSON.stringify(zustand) };
    if (zustand.name && zustand.name !== this.actor.name) aenderung.name = zustand.name;
    // render: false, sonst baut Foundry den Bogen bei jeder Eingabe neu auf
    await this.actor.update(aenderung, { render: false });
    if (this.#ausstehend === zustand) this.#ausstehend = null;
  }

  async _preClose(options) {
    await this.#schreiben();
    return super._preClose?.(options);
  }
}

Hooks.once("init", () => {
  CONFIG.Actor.dataModels.abenteurer = AbenteurerDaten;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, MidgardBogen, {
    types: ["abenteurer"],
    makeDefault: true,
    label: "MIDGARD.Bogen",
  });
  console.log(`${SYSTEM_ID} | Midgard-CMT ${game.system.version} geladen`);
});
