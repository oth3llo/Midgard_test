// Erfolgs-, Widerstands- und Prüfwürfe nach dem Kodex (S. 50-53) mit Chatkarten und Praxispunkten
// (S. 152-153). Kritische Ergebnisse werden angezeigt; die Folgetabellen stehen im Kodex und
// werden hier nur mit ihrem W%-Wurf und der Fundstelle genannt, nicht abgeschrieben.
import { SYSTEM_ID } from "./kategorien.mjs";
import { vz } from "./regeln.mjs";

export const SCHWIERIGKEIT = [[8, "äußerst leicht"], [6, "besonders leicht"], [4, "sehr leicht"], [2, "leicht"], [0, "normal"], [-2, "schwer"], [-4, "sehr schwer"], [-6, "besonders schwer"], [-8, "äußerst schwer"]];

export function einstellungenRegistrieren() {
  game.settings.register(SYSTEM_ID, "ppModus", {
    name: "Praxispunkte", hint: "Der Kodex vergibt PP nur bei sinnvollem Einsatz und höchstens einen je Szene und Fertigkeit (S. 152). „Vorschlag“ zeigt einen Knopf in der Chatkarte, „automatisch“ bucht sofort.",
    scope: "world", config: true, type: String, default: "knopf",
    choices: { knopf: "Vorschlag mit Knopf", automatisch: "Automatisch gutschreiben" },
  });
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export { esc };

/** Abfrage von Zuschlag/Abzug. Gibt null bei Abbruch zurück. */
export async function zuschlagAbfragen(titel, { hinweise = [], extra = "" } = {}) {
  const D = foundry.applications?.api?.DialogV2;
  if (!D) return { mod: 0 };
  const optionen = SCHWIERIGKEIT.map(([w, t]) => `<option value="${w}" ${w === 0 ? "selected" : ""}>${vz(w)} ${t}</option>`).join("");
  const inhalt = `<div class="midgard-dialog">
    ${hinweise.length ? `<ul class="hinweise">${hinweise.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    <label>Schwierigkeit <select name="schwierigkeit">${optionen}</select></label>
    <label>weiterer Zuschlag <input type="number" name="frei" value="0" step="1"></label>
    ${extra}
  </div>`;
  try {
    return await D.prompt({
      window: { title: titel },
      content: inhalt,
      ok: {
        label: "Würfeln",
        callback: (_ev, knopf) => {
          const f = knopf.form.elements;
          const daten = { mod: Number(f.schwierigkeit.value || 0) + Number(f.frei.value || 0) };
          for (const e of knopf.form.querySelectorAll("[data-zusatz]")) daten[e.name] = e.type === "checkbox" ? e.checked : e.value;
          return daten;
        },
      },
      rejectClose: false,
    });
  } catch {
    return null;
  }
}

function ergebnisText(w) {
  if (w.krit === "erfolg") return "kritischer Erfolg";
  if (w.krit === "fehler") return "kritischer Fehler";
  return w.erfolg ? "Erfolg" : "Misserfolg";
}

/** Würfelt 1W20 und wertet nach Kodex aus. ziel: Mindestergebnis (EW 20, WW Ergebnis des Gegners). */
export async function w20(wert, mod = 0, ziel = 20) {
  const roll = await new Roll("1d20").evaluate();
  const d20 = roll.total;
  const gesamt = d20 + wert + mod;
  const krit = d20 === 20 ? "erfolg" : d20 === 1 ? "fehler" : null;
  const erfolg = krit === "erfolg" || (krit !== "fehler" && gesamt >= ziel);
  return { roll, d20, wert, mod, gesamt, ziel, krit, erfolg };
}

/** Prozentwurf für Folgetabellen kritischer Ereignisse. */
export async function prozent() {
  return (await new Roll("1d100").evaluate());
}

/** Chatnachricht mit Würfen und Systemdaten erzeugen. */
export async function nachricht(actor, inhalt, rolls = [], flags = {}) {
  const daten = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: inhalt,
    rolls,
    flags: { [SYSTEM_ID]: flags },
  };
  ChatMessage.applyRollMode?.(daten, game.settings.get("core", "rollMode"));
  return ChatMessage.create(daten);
}

export function wurfZeile(w) {
  return `<div class="mk-wurf"><span class="mk-w20 ${w.krit ?? ""}">${w.d20}</span> ${vz(w.wert)}${w.mod ? ` ${vz(w.mod)}` : ""} = <strong class="mk-gesamt">${w.gesamt}</strong></div>`;
}

/**
 * Erfolgs- oder Widerstandswurf mit Chatkarte.
 * @param {Actor} actor
 * @param {object} o  titel, wert, art ("EW"|"WW"), ziel, mod, pp {schwelle, ziel, name}, zusatz (HTML), ohneDialog, hinweise
 */
export async function erfolgswurf(actor, o) {
  let mod = o.mod ?? 0, ziel = o.ziel ?? 20;
  if (!o.ohneDialog) {
    const extra = o.gegnerFragen ? `<label>Ergebnis des gegnerischen EW <input type="number" name="gegen" data-zusatz value="20" step="1"></label>` : "";
    const a = await zuschlagAbfragen(`${o.art ?? "EW"}:${o.titel}`, { hinweise: o.hinweise, extra });
    if (!a) return null;
    mod += a.mod;
    if (o.gegnerFragen && a.gegen !== undefined && a.gegen !== "") ziel = Number(a.gegen);
  }
  const w = await w20(o.wert, mod, ziel);
  let ppHtml = "", ppFlag = null;
  if (o.pp && w.d20 >= o.pp.schwelle && w.erfolg) {
    ppFlag = { actor: actor.uuid, ziel: o.pp.ziel, name: o.pp.name };
    ppHtml = await ppVorschlag(actor, ppFlag);
  }
  const krit = w.krit ? await kritHinweis(w.krit, o.art === "WW" ? "abwehr" : "fertigkeit") : null;
  const inhalt = `<div class="midgard-karte">
    <header>${esc(o.art ?? "EW")}:${esc(o.titel)}${ziel !== 20 || o.art === "WW" ? ` <small>gegen ${ziel}</small>` : ""}</header>
    ${wurfZeile(w)}
    <p class="mk-ergebnis ${w.erfolg ? "gut" : "schlecht"}">${ergebnisText(w)}</p>
    ${o.zusatz ?? ""}${krit?.html ?? ""}${ppHtml}
  </div>`;
  const msg = await nachricht(actor, inhalt, [w.roll, ...(krit?.roll ? [krit.roll] : [])], { wurf: { art: o.art ?? "EW", titel: o.titel, gesamt: w.gesamt, d20: w.d20 }, pp: ppFlag });
  return { ...w, message: msg };
}

/** Prüfwurf mit W%: gelingt bei höchstens Eigenschaftswert (+ Zuschlag), 100 misslingt immer. */
export async function pruefwurf(actor, { titel, wert, ohneDialog = false }) {
  let mod = 0;
  if (!ohneDialog) {
    const a = await zuschlagAbfragen(`PW:${titel}`, { hinweise: ["Zuschlag verändert den Zielwert (negativ = schwerer)."] });
    if (!a) return null;
    mod = a.mod;
  }
  const roll = await new Roll("1d100").evaluate();
  const zielwert = (wert ?? 0) + mod;
  const erfolg = roll.total !== 100 && roll.total <= zielwert;
  const inhalt = `<div class="midgard-karte">
    <header>PW:${esc(titel)}</header>
    <div class="mk-wurf"><span class="mk-w20">${roll.total}</span> gegen <strong class="mk-gesamt">${zielwert}</strong></div>
    <p class="mk-ergebnis ${erfolg ? "gut" : "schlecht"}">${erfolg ? "Erfolg" : "Misserfolg"}</p>
  </div>`;
  return nachricht(actor, inhalt, [roll], { wurf: { art: "PW", titel, gesamt: roll.total } });
}

/** Hinweis auf kritische Folgen mit W%-Wurf und Fundstelle. */
export async function kritHinweis(krit, bereich) {
  if (bereich === "fertigkeit") {
    return { html: `<p class="mk-krit">${krit === "erfolg" ? "Die Anwendung ist hervorragend gelungen." : "Ein katastrophaler Fehler ist unterlaufen."} (Kodex S. 51)</p>` };
  }
  const tabelle = { angriffFehler: ["Tabelle 4: kritischer Fehler bei Angriffen", "S. 88"], abwehrFehler: ["Tabelle 5: kritischer Fehler bei der Abwehr", "S. 88"], abwehrErfolg: ["Tabelle 6: kritischer Erfolg bei der Abwehr", "S. 89"], schaden: ["Tabelle 7: kritischer Schaden", "S. 91"] }[bereich];
  if (!tabelle) return null;
  const roll = await prozent();
  return { roll, html: `<p class="mk-krit">${tabelle[0]}: W% = <strong>${roll.total}</strong> (Kodex ${tabelle[1]})</p>` };
}

// ------------------------------------------------------------------ Praxispunkte

/** Knopf oder sofortige Buchung je nach Einstellung. */
async function ppVorschlag(actor, pp) {
  if (game.settings.get(SYSTEM_ID, "ppModus") === "automatisch" && actor.isOwner) {
    await ppGutschreiben(actor, pp.ziel);
    pp.vergeben = true;
    return `<p class="mk-pp">1 Praxispunkt für ${esc(pp.name)} gutgeschrieben.</p>`;
  }
  return `<p class="mk-pp">Praxispunkt möglich für ${esc(pp.name)} <button type="button" data-midgard-aktion="pp">PP gutschreiben</button></p>`;
}

/**
 * Bucht 1 PP. ziel: {typ: "item", id} oder {typ: "zauber", gruppe}. Bei Charakteren, die das
 * Erschaffungswerkzeug verwaltet, wird der PP auch in dessen Zustand und Protokoll gebucht,
 * sonst würde ihn der nächste Abgleich überschreiben.
 */
export async function ppGutschreiben(actor, ziel) {
  const s = actor.system;
  let schluessel, name;
  if (ziel.typ === "zauber") {
    schluessel = `Z:${ziel.gruppe}`; name = `Zaubern: ${ziel.gruppe}`;
    await actor.update({ [`system.zauberPP.${ziel.gruppe}`]: (s.zauberPP?.[ziel.gruppe] ?? 0) + 1 });
  } else {
    const item = actor.items.get(ziel.id);
    if (!item) return ui.notifications.warn("Fertigkeit nicht mehr vorhanden.");
    schluessel = item.getFlag(SYSTEM_ID, "cmt"); name = item.name;
    await item.update({ "system.pp": (item.system.pp ?? 0) + 1 });
  }
  if (s.zustand && schluessel) {
    const z = JSON.parse(s.zustand);
    z.spiel ??= {};
    z.spiel.pp ??= {};
    const vorher = JSON.parse(JSON.stringify({ spiel: { ...z.spiel, protokoll: undefined }, eig: z.eig, pAwurf: z.pAwurf, Wkwurf: z.Wkwurf, Au: z.Au, festPA: z.festPA ?? null, festWk: z.festWk ?? null }));
    z.spiel.pp[schluessel] = (z.spiel.pp[schluessel] || 0) + 1;
    z.spiel.protokoll ??= [];
    const eintrag = { zeit: new Date().toISOString(), text: `1 PP für ${name} (Würfelwurf)` };
    z.spiel.protokoll.unshift({ ...eintrag, vorher });
    await actor.update({ "system.zustand": JSON.stringify(z), "system.protokoll": [eintrag, ...(s.protokoll ?? [])] });
  }
  ui.notifications.info(`${actor.name}: 1 PP für ${name}.`);
}
