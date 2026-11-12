// Erfolgs-, Widerstands- und Prüfwürfe nach dem Kodex (S. 50-53) mit Chatkarten und Praxispunkten
// (S. 152-153). Kritische Ergebnisse werden angezeigt; die Folgetabellen stehen im Kodex und
// werden hier nur mit ihrem W%-Wurf und der Fundstelle genannt, nicht abgeschrieben.
import { SYSTEM_ID } from "./kategorien.mjs";
import { vz, wuerfelName } from "./regeln.mjs";

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
export async function zuschlagAbfragen(titel, { hinweise = [], extra = "", wert = null, ziel = 20, basisMod = 0 } = {}) {
  const D = foundry.applications?.api?.DialogV2;
  if (!D) return { mod: 0, teile: [] };
  const optionen = SCHWIERIGKEIT.map(([w, t]) => `<option value="${w}" ${w === 0 ? "selected" : ""}>${vz(w)} ${t}</option>`).join("");
  const kennung = `midgard-dialog-${Math.random().toString(36).slice(2, 8)}`;
  const inhalt = `<div class="midgard-dialog ${kennung}">
    ${hinweise.length ? `<ul class="hinweise">${hinweise.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    <label>Schwierigkeit <select name="schwierigkeit">${optionen}</select></label>
    <label>weiterer Zuschlag <input type="number" name="frei" value="0" step="1"></label>
    ${extra}
    ${wert !== null ? `<p class="vorschau" aria-live="polite"></p>` : ""}
  </div>`;
  // Vorschau „Erfolg ab Wurf …“, aktualisiert bei jeder Änderung
  const vorschau = (wurzel) => {
    const box = wurzel?.querySelector?.(".vorschau");
    if (!box) return;
    const f = (n) => Number(wurzel.querySelector(`[name="${n}"]`)?.value || 0);
    const gegen = wurzel.querySelector('[name="gegen"]');
    const zielWert = gegen ? Number(gegen.value || 20) : ziel;
    const noetig = zielWert - wert - basisMod - f("schwierigkeit") - f("frei");
    box.innerHTML = noetig <= 2 ? "Gelingt bei jedem Wurf außer 1." : noetig >= 20 ? "Gelingt nur mit einer 20." : `Erfolg ab Wurf <strong>${noetig}</strong> auf dem W20.`;
  };
  const einrichten = () => {
    const wurzel = document.querySelector(`.${kennung}`);
    if (!wurzel || wurzel.dataset.eingerichtet) return;
    wurzel.dataset.eingerichtet = "1";
    vorschau(wurzel);
    wurzel.addEventListener("input", () => vorschau(wurzel));
    wurzel.addEventListener("change", () => vorschau(wurzel));
  };
  try {
    setTimeout(einrichten, 0);
    return await D.prompt({
      window: { title: titel },
      content: inhalt,
      render: () => einrichten(),
      ok: {
        label: "Würfeln",
        callback: (_ev, knopf) => {
          const f = knopf.form.elements;
          const schwierigkeit = Number(f.schwierigkeit.value || 0), frei = Number(f.frei.value || 0);
          const daten = { mod: schwierigkeit + frei, teile: [] };
          if (schwierigkeit) daten.teile.push([SCHWIERIGKEIT.find(([w]) => w === schwierigkeit)?.[1] ?? "Schwierigkeit", schwierigkeit]);
          if (frei) daten.teile.push(["Zuschlag", frei]);
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

/**
 * Fertigkeiten, die laut Einstellung verdeckt gewürfelt werden (Kodex S. 52 „Wer würfelt?“).
 * Gibt den Würfelmodus zurück („blindroll“, „gmroll“) oder null.
 */
export function verdeckterModus(titel) {
  const modus = game.settings.get(SYSTEM_ID, "verdecktModus");
  if (!modus || modus === "aus") return null;
  const name = String(titel ?? "").replace(/\s*\(.*$/, "").trim().toLocaleLowerCase("de");
  const liste = String(game.settings.get(SYSTEM_ID, "verdeckteFertigkeiten") ?? "").split(/[,;\n]/).map((x) => x.trim().toLocaleLowerCase("de")).filter(Boolean);
  return liste.includes(name) ? modus : null;
}

/** Chatnachricht mit Würfen und Systemdaten erzeugen. rollMode überschreibt den gewählten Würfelmodus. */
export async function nachricht(actor, inhalt, rolls = [], flags = {}, rollMode = null) {
  const daten = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: inhalt,
    rolls,
    flags: { [SYSTEM_ID]: flags },
  };
  ChatMessage.applyRollMode?.(daten, rollMode ?? game.settings.get("core", "rollMode"));
  if (rollMode) daten.rollMode = rollMode;
  return ChatMessage.create(daten);
}

/** Wurfzeile mit aufklappbarer Zusammensetzung (z. B. Fertigkeitswert, Leiteigenschaft, Zuschläge). */
export function wurfZeile(w, teile = []) {
  const liste = teile.filter(([, v]) => v);
  const details = liste.length ? `<details class="mk-teile"><summary>Zusammensetzung</summary><ul>${liste.map(([t, v]) => `<li><span>${esc(t)}</span> <strong>${vz(v)}</strong></li>`).join("")}<li class="mk-summe"><span>${wuerfelName(20)}</span> <strong>${w.d20}</strong></li></ul></details>` : "";
  return `<div class="mk-wurf"><span class="mk-w20 ${w.krit ?? ""}">${w.d20}</span> ${vz(w.wert)}${w.mod ? ` ${vz(w.mod)}` : ""} = <strong class="mk-gesamt">${w.gesamt}</strong></div>${details}`;
}

/**
 * Erfolgs- oder Widerstandswurf mit Chatkarte.
 * @param {Actor} actor
 * @param {object} o  titel, wert, art ("EW"|"WW"), ziel, mod, pp {schwelle, ziel, name}, zusatz (HTML), ohneDialog, hinweise
 */
export async function erfolgswurf(actor, o) {
  let mod = o.mod ?? 0, ziel = o.ziel ?? 20;
  const teile = [...(o.teile ?? []), ...(o.modTeile ?? [])];
  if (!o.ohneDialog) {
    const extra = o.gegnerFragen ? `<label>Ergebnis des gegnerischen EW <input type="number" name="gegen" data-zusatz value="20" step="1"></label>` : "";
    const a = await zuschlagAbfragen(`${o.art ?? "EW"}:${o.titel}`, { hinweise: o.hinweise, extra, wert: o.wert, ziel, basisMod: mod });
    if (!a) return null;
    mod += a.mod;
    teile.push(...(a.teile ?? []));
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
    ${wurfZeile(w, teile)}
    <p class="mk-ergebnis ${w.erfolg ? "gut" : "schlecht"}">${ergebnisText(w)}</p>
    ${o.zusatz ?? ""}${krit?.html ?? ""}${ppHtml}
  </div>`;
  const verdeckt = o.art === "WW" ? null : verdeckterModus(o.titel);
  const msg = await nachricht(actor, inhalt, [w.roll, ...(krit?.roll ? [krit.roll] : [])], { wurf: { art: o.art ?? "EW", titel: o.titel, gesamt: w.gesamt, d20: w.d20, verdeckt: !!verdeckt }, pp: ppFlag }, verdeckt);
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

const KRIT_TABELLEN = {
  angriffFehler: [4, "Tabelle 4: kritischer Fehler bei Angriffen", "S. 88"], abwehrFehler: [5, "Tabelle 5: kritischer Fehler bei der Abwehr", "S. 88"],
  abwehrErfolg: [6, "Tabelle 6: kritischer Erfolg bei der Abwehr", "S. 89"], schaden: [7, "Tabelle 7: kritischer Schaden", "S. 91"],
};

/** Liegt w im Bereich „01–10“, „96–99“ oder „100“? */
export function imBereich(bereich, w) {
  const [a, b] = String(bereich).split(/[–-]/).map((x) => Number(x));
  return w >= a && w <= (Number.isFinite(b) ? b : a);
}

/**
 * Zeile einer importierten W%-Tabelle (Seiten-Flag „wurftabellen“ im Regel-Kompendium).
 * @returns {{titel, bereich, text, uuid}|null}
 */
export async function tabelleNachschlagen(nummer, wert) {
  const pack = game.packs.get("world.midgard-regeln");
  if (!pack) return null;
  for (const j of await pack.getDocuments()) {
    for (const p of j.pages ?? []) {
      for (const t of p.flags?.[SYSTEM_ID]?.wurftabellen ?? []) {
        if (!new RegExp(`^Tabelle ${nummer}\\b`).test(t.titel ?? "")) continue;
        const z = t.zeilen.find(([b]) => imBereich(b, wert));
        if (z) return { titel: t.titel, bereich: z[0], text: z[2] ? `${z[1]}: ${z[2]}` : z[1], uuid: p.uuid };
      }
    }
  }
  return null;
}

/**
 * Hinweis auf kritische Folgen je nach Einstellung „kritModus“: nur Hinweis mit Würfelknopf,
 * W%-Wurf mit Fundstelle, oder Wurf samt Ergebnis aus der importierten Tabelle.
 */
export async function kritHinweis(krit, bereich) {
  if (bereich === "fertigkeit") {
    return { html: `<p class="mk-krit">${krit === "erfolg" ? "Die Anwendung ist hervorragend gelungen." : "Ein katastrophaler Fehler ist unterlaufen."} (Kodex S. 51)</p>` };
  }
  const tabelle = KRIT_TABELLEN[bereich];
  if (!tabelle) return null;
  const [nummer, titel, seite] = tabelle;
  const modus = game.settings.get(SYSTEM_ID, "kritModus") ?? "wurf";
  if (modus === "hinweis") return { html: `<p class="mk-krit">${titel} (Kodex ${seite}): [[/r 1d100]]{${wuerfelName(100)} würfeln}</p>` };
  const roll = await prozent();
  const kopf = `${titel}: ${wuerfelName(100)} = <strong>${roll.total}</strong> (Kodex ${seite})`;
  if (modus !== "tabelle") return { roll, html: `<p class="mk-krit">${kopf}</p>` };
  const z = await tabelleNachschlagen(nummer, roll.total);
  if (!z) return { roll, html: `<p class="mk-krit">${kopf}</p><p class="mk-klein">Tabelle nicht importiert: Ergebnis im Kodex nachschlagen.</p>` };
  return { roll, ergebnis: z, html: `<p class="mk-krit">${kopf}</p><p class="mk-krit-ergebnis"><strong>${esc(z.bereich)}</strong> ${esc(z.text)} @UUID[${z.uuid}]{Tabelle}</p>` };
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
