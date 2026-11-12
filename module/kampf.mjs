// Kampf nach dem Kodex (S. 69-73, 87): EW:Angriff, Schadenswurf, WW:Abwehr des Getroffenen,
// leichter Treffer (nur AP) oder schwerer Treffer (AP und LP abzüglich Rüstungsschutz).
// Der Angreifer würfelt; jedes anvisierte Ziel erhält in der Chatkarte eine Aufforderung zur
// Abwehr. Ob der Verteidiger selbst würfelt oder automatisch abgewehrt wird, ist einstellbar.
import { SYSTEM_ID } from "./kategorien.mjs";
import { vz, wNotation } from "./regeln.mjs";
import { w20, wurfZeile, nachricht, kritHinweis, zuschlagAbfragen, esc, ppGutschreiben } from "./wuerfe.mjs";

const SOCKET = `system.${SYSTEM_ID}`;
// Gegen Parierwaffen, Buckler und Stockwaffen helfen diese nur bei folgenden Angriffen (Kodex S. 70)
const LEICHTE_NAHKAMPFWAFFEN = ["Einhandschwerter", "Fechtwaffen", "Parierwaffen", "Stichwaffen", "Stockwaffen", "Spießwaffen", "Zauberstäbe"];
// Kleine Schilde helfen nicht gegen zweihändige Hiebwaffen
const ZWEIHAENDIGE_HIEBWAFFEN = ["Zweihandschlagwaffen", "Zweihandschwerter"];
// Rüstungsschutz gegen diese Geschosse höchstens 3 (Kodex S. 71-72)
const DURCHSCHLAGEND = ["Armbrust, schwere", "Langbogen", "Kompositbogen"];

export function einstellungenRegistrieren() {
  game.settings.register(SYSTEM_ID, "abwehrModus", {
    name: "Abwehr im Kampf",
    hint: "Wer den WW:Abwehr würfelt, wenn ein Angriff trifft.",
    scope: "world", config: true, type: String, default: "spieler",
    choices: {
      spieler: "Spieler würfeln selbst, Spielleiterfiguren automatisch",
      selbst: "Immer selbst würfeln (Spielleiter für seine Figuren)",
      automatisch: "Immer automatisch",
    },
  });
}

// ------------------------------------------------------------------ Angriff

/** Angriff mit einer Waffe des Akteurs auf die anvisierten Ziele. */
export async function angreifen(actor, waffeId, { ohneDialog = false } = {}) {
  const d = actor.system.abgeleitet;
  const w = d.waffen.find((x) => x.id === waffeId);
  if (!w) return;
  if (w.vert) return ui.notifications.warn(`${w.name} dient der Abwehr, nicht dem Angriff.`);
  if (w.ew === null) return ui.notifications.warn(`${actor.name} beherrscht ${w.fertigkeit} nicht. Ungelernter Einsatz: Kodex S. 92.`);
  const ziele = [...(game.user.targets ?? [])].map((t) => t.actor).filter((a) => a && a !== actor);
  const nah = w.art !== "fernkampf";
  const hinweise = [];
  let mod = 0;
  // Zusammensetzung für die Chatkarte
  const fertWert = actor.items.find((i) => i.type === "waffenfertigkeit" && i.name === w.fertigkeit)?.system.wert ?? 0;
  const teile = [[w.fertigkeit, fertWert], ["Angriffsbonus", d.angriffsBonus], ...(w.spezialwaffe ? [["Spezialwaffe", 2]] : [])];
  for (const a of d.kampfAbzuege) if ((!a.nurNah || nah) && a.nur !== "abwehr") { mod += a.wert; hinweise.push(`${vz(a.wert)} ${a.grund}`); teile.push([a.grund, a.wert]); }
  const zuschlag = ziele.length === 1 ? ziele[0].system.abgeleitet?.gegnerZuschlag?.(nah, d.zustaende?.liegend) : null;
  if (zuschlag) { mod += zuschlag.wert; hinweise.push(`${vz(zuschlag.wert)} ${zuschlag.grund}`); teile.push([zuschlag.grund, zuschlag.wert]); }
  if (ziele.length > 1) hinweise.push("Mehrere Ziele: Zuschläge gegen erschöpfte, wehrlose oder liegende Ziele bitte von Hand eintragen.");
  if (!ziele.length) hinweise.push("Kein Ziel anvisiert: Abwehr wird nicht angefordert.");
  if (!ohneDialog) {
    const a = await zuschlagAbfragen(`EW:Angriff mit ${w.name}`, { hinweise, wert: w.ew, basisMod: mod });
    if (!a) return;
    mod += a.mod;
    teile.push(...(a.teile ?? []));
  }
  const angriff = await w20(w.ew, mod);
  const rolls = [angriff.roll];
  let schaden = null, krit = null;
  if (angriff.erfolg && w.formel) {
    const r = await new Roll(w.formel).evaluate();
    rolls.push(r);
    schaden = { formel: w.formel, gesamt: Math.max(0, r.total) };
  }
  if (angriff.krit === "fehler") krit = await kritHinweis("fehler", "angriffFehler");
  if (krit?.roll) rolls.push(krit.roll);
  const pp = angriff.krit === "erfolg" ? { actor: actor.uuid, ziel: { typ: "item", id: actor.items.find((i) => i.type === "waffenfertigkeit" && i.name === w.fertigkeit)?.id }, name: w.fertigkeit } : null;
  const daten = {
    angreifer: actor.uuid, angreiferName: actor.name, waffe: w.name, grundname: w.grundname, fertigkeit: w.fertigkeit, art: w.art,
    gesamt: angriff.gesamt, d20: angriff.d20, krit: angriff.krit, erfolg: angriff.erfolg, schaden,
    ziele: angriff.erfolg ? ziele.map((z) => ({ uuid: z.uuid, name: z.name, erledigt: false })) : [],
  };
  const inhalt = `<div class="midgard-karte mk-angriff">
    <header>EW:Angriff · ${esc(w.name)}</header>
    ${wurfZeile(angriff, teile)}
    <p class="mk-ergebnis ${angriff.erfolg ? "gut" : "schlecht"}">${angriff.krit === "erfolg" ? "kritischer Treffer" : angriff.krit === "fehler" ? "kritischer Fehler" : angriff.erfolg ? "Treffer" : "verfehlt"}</p>
    ${schaden ? `<p class="mk-schaden">Schaden ${esc(wNotation(w.formel))}: <strong>${schaden.gesamt}</strong></p>` : ""}
    ${krit?.html ?? ""}
    ${angriff.krit === "erfolg" ? `<p class="mk-krit">Kritischer Treffer: nur ein kritisch erfolgreicher WW:Abwehr hebt ihn auf (Kodex S. 87).</p>` : ""}
    ${pp ? `<p class="mk-pp">Praxispunkt möglich für ${esc(pp.name)} <button type="button" data-midgard-aktion="pp">PP gutschreiben</button></p>` : ""}
    ${daten.ziele.length ? `<ul class="mk-ziele">${daten.ziele.map((z) => `<li data-ziel="${esc(z.uuid)}"><span>${esc(z.name)}</span> <button type="button" data-midgard-aktion="abwehr" data-ziel="${esc(z.uuid)}">WW:Abwehr</button></li>`).join("")}</ul>` : ""}
  </div>`;
  const msg = await nachricht(actor, inhalt, rolls, { angriff: daten, pp });
  for (const z of daten.ziele) {
    const ziel = await fromUuid(z.uuid);
    if (ziel && automatisch(ziel)) await abwehrAnfordern(msg, z.uuid, { automatisch: true });
  }
  return msg;
}

/** Wird die Abwehr dieses Ziels automatisch gewürfelt? */
function automatisch(ziel) {
  const modus = game.settings.get(SYSTEM_ID, "abwehrModus");
  if (modus === "automatisch") return true;
  if (modus === "selbst") return false;
  return !ziel.hasPlayerOwner;
}

/** Abwehr ausführen, wo es darf: beim Besitzer des Ziels oder beim Spielleiter über den Socket. */
export async function abwehrAnfordern(message, zielUuid, opt = {}) {
  const ziel = await fromUuid(zielUuid);
  if (!ziel) return;
  if (ziel.isOwner) return abwehren(message, zielUuid, opt);
  if (opt.automatisch) {
    if (!game.users.activeGM) return ui.notifications.warn("Für die automatische Abwehr muss ein Spielleiter angemeldet sein.");
    game.socket.emit(SOCKET, { aktion: "abwehr", message: message.id, ziel: zielUuid });
  } else {
    ui.notifications.warn(`Nur wer ${ziel.name} führt, kann die Abwehr würfeln.`);
  }
}

// ------------------------------------------------------------------ Abwehr

/** Verteidigungswaffe des Ziels, die gegen diesen Angriff hilft (Kodex S. 70). */
function verteidigungswaffe(ziel, angriff) {
  const d = ziel.system.abgeleitet;
  if (d.erschoepft) return null;
  const bereit = ziel.items.filter((i) => i.type === "waffe" && i.system.ausgeruestet && (i.system.art === "verteidigung" || i.system.fertigkeit === "Stockwaffen"));
  const kandidaten = [];
  for (const w of bereit) {
    const fert = ziel.items.find((i) => i.type === "waffenfertigkeit" && i.name === w.system.fertigkeit);
    if (!fert) continue;
    const g = w.system.grundname || w.name;
    let hilft;
    if (g === "Schild, großer") hilft = true;
    else if (g === "Schild, kleiner") hilft = angriff.art !== "fernkampf" && !ZWEIHAENDIGE_HIEBWAFFEN.includes(angriff.fertigkeit);
    else hilft = angriff.art !== "fernkampf" && (LEICHTE_NAHKAMPFWAFFEN.includes(angriff.fertigkeit) || angriff.grundname === "Buckler");
    if (hilft) kandidaten.push({ name: w.name, wert: fert.system.wert, fertigkeitId: fert.id, fertigkeit: fert.name });
  }
  return kandidaten.sort((a, b) => b.wert - a.wert)[0] ?? null;
}

/** WW:Abwehr gegen einen Angriff aus einer Chatkarte würfeln und den Schaden anwenden. */
export async function abwehren(message, zielUuid, { automatisch: auto = false } = {}) {
  const angriff = message.getFlag(SYSTEM_ID, "angriff");
  const eintrag = angriff?.ziele.find((z) => z.uuid === zielUuid);
  if (!eintrag) return;
  if (eintrag.erledigt) return ui.notifications.info(`${eintrag.name} hat bereits abgewehrt.`);
  const ziel = await fromUuid(zielUuid);
  const d = ziel.system.abgeleitet;
  const nah = angriff.art !== "fernkampf";
  const vw = verteidigungswaffe(ziel, angriff);
  let mod = 0;
  const hinweise = [`gegen ${angriff.gesamt} (${angriff.angreiferName}, ${angriff.waffe})`];
  const teile = [["Abwehr (Grad)", d.gradAbwehr], ["Abwehrbonus", d.abwehrBonusMitRuestung]];
  for (const a of d.kampfAbzuege) if ((!a.nurNah || nah) && a.nur !== "angriff") { mod += a.wert; hinweise.push(`${vz(a.wert)} ${a.grund}`); teile.push([a.grund, a.wert]); }
  if (d.wehrlos) return wehrlosGetroffen(message, ziel, angriff, zielUuid);
  let mitVW = !!vw;
  if (!auto) {
    const extra = vw ? `<label class="zeile"><input type="checkbox" name="vw" data-zusatz checked> ${esc(vw.name)} einsetzen (${vz(vw.wert)})</label>` : "";
    const a = await zuschlagAbfragen(`WW:Abwehr · ${ziel.name}`, { hinweise, extra, wert: d.abwehr, ziel: angriff.gesamt, basisMod: mod + (vw?.wert ?? 0) });
    if (!a) return;
    mod += a.mod;
    teile.push(...(a.teile ?? []));
    mitVW = vw && a.vw !== false;
  }
  if (mitVW) { mod += vw.wert; teile.push([vw.name, vw.wert]); }
  const ww = await w20(d.abwehr, mod, angriff.gesamt);
  // Kritischer Treffer: nur ein kritischer WW:Abwehr hebt ihn auf (dann leichter Schaden)
  let gelungen = angriff.krit === "erfolg" ? ww.krit === "erfolg" : ww.erfolg;
  const kritSchaden = angriff.krit === "erfolg" && !gelungen;
  const rolls = [ww.roll];
  const zusatz = [];
  if (ww.krit === "fehler") { const k = await kritHinweis("fehler", "abwehrFehler"); if (k.roll) rolls.push(k.roll); zusatz.push(k.html); }
  if (ww.krit === "erfolg" && nah && angriff.krit !== "erfolg") { const k = await kritHinweis("erfolg", "abwehrErfolg"); if (k.roll) rolls.push(k.roll); zusatz.push(k.html); }
  if (kritSchaden) { const k = await kritHinweis("erfolg", "schaden"); if (k.roll) rolls.push(k.roll); zusatz.push(k.html); }
  if (angriff.krit === "erfolg" && gelungen) zusatz.push(`<p class="mk-krit">Beide Würfe kritisch: Die Ergebnisse heben sich auf, nur leichter Schaden.</p>`);

  const ergebnis = schadenBerechnen(ziel, angriff, !gelungen);
  await ziel.update({ "system.ap.wert": ergebnis.apNeu, "system.lp.wert": ergebnis.lpNeu });
  const pp = mitVW && ww.krit === "erfolg" ? { actor: ziel.uuid, ziel: { typ: "item", id: vw.fertigkeitId }, name: vw.fertigkeit } : null;
  const inhalt = `<div class="midgard-karte mk-abwehr">
    <header>WW:Abwehr · ${esc(ziel.name)} <small>gegen ${angriff.gesamt}${auto ? ", automatisch" : ""}</small></header>
    ${wurfZeile(ww, teile)}${mitVW ? `<p class="mk-klein">mit ${esc(vw.name)} ${vz(vw.wert)}</p>` : ""}
    <p class="mk-ergebnis ${gelungen ? "gut" : "schlecht"}">${gelungen ? "abgewehrt: leichter Treffer" : "schwerer Treffer"}</p>
    <p class="mk-schaden">${ergebnis.text}</p>
    ${zusatz.join("")}
    ${pp ? `<p class="mk-pp">Praxispunkt möglich für ${esc(pp.name)} <button type="button" data-midgard-aktion="pp">PP gutschreiben</button></p>` : ""}
  </div>`;
  await nachricht(ziel, inhalt, rolls, { abwehr: { angriff: message.id, ziel: zielUuid, gelungen, ...ergebnis }, pp });
  await zielErledigt(message, zielUuid, gelungen);
}

/** Wehrlose dürfen keinen WW:Abwehr würfeln, jeder Treffer ist schwer (Kodex S. 71). */
async function wehrlosGetroffen(message, ziel, angriff, zielUuid) {
  const ergebnis = schadenBerechnen(ziel, angriff, true);
  await ziel.update({ "system.ap.wert": ergebnis.apNeu, "system.lp.wert": ergebnis.lpNeu });
  const rolls = [];
  const zusatz = [];
  if (angriff.krit === "erfolg") { const k = await kritHinweis("erfolg", "schaden"); if (k.roll) rolls.push(k.roll); zusatz.push(k.html); }
  const inhalt = `<div class="midgard-karte mk-abwehr">
    <header>WW:Abwehr · ${esc(ziel.name)} <small>gegen ${angriff.gesamt}</small></header>
    <p class="mk-ergebnis schlecht">wehrlos: keine Abwehr möglich, schwerer Treffer</p>
    <p class="mk-schaden">${ergebnis.text}</p>
    ${zusatz.join("")}
  </div>`;
  await nachricht(ziel, inhalt, rolls, { abwehr: { angriff: message.id, ziel: zielUuid, gelungen: false, ...ergebnis } });
  await zielErledigt(message, zielUuid, false);
}

/** Schaden nach Kodex S. 61-62, 69, 71: AP sinken höchstens auf 0, LP nur bei schwerem Treffer. */
export function schadenBerechnen(ziel, angriff, schwer) {
  const s = ziel.system, d = s.abgeleitet;
  const schaden = angriff.schaden?.gesamt ?? 0;
  let rs = d.ruestung?.rs ?? 0;
  if (DURCHSCHLAGEND.includes(angriff.grundname)) rs = Math.min(rs, 3);
  const apVerlust = Math.min(s.ap.wert, schaden);
  const lpVerlust = schwer ? Math.max(0, schaden - rs) : 0;
  const apNeu = s.ap.wert - apVerlust, lpNeu = s.lp.wert - lpVerlust;
  const folgen = [];
  if (apNeu <= 0) folgen.push("erschöpft (0 AP)");
  if (lpNeu < 0) folgen.push("tödlich verwundet (LP unter 0)");
  else if (lpNeu === 0) folgen.push("0 LP: kann sich nicht mehr bewegen");
  else if (lpNeu <= 3) folgen.push("dem Tode nah (höchstens 3 LP)");
  else if (lpNeu * 2 <= s.lp.max) folgen.push("halbe LP verloren: AP höchstens halbes Maximum, B halbiert");
  const text = `${schaden} Schaden: −${apVerlust} AP${schwer ? `, −${lpVerlust} LP (Rüstungsschutz ${rs})` : ""}. Jetzt ${lpNeu} LP, ${apNeu} AP.${folgen.length ? " " + folgen.join("; ") + "." : ""}`;
  return { schaden, rs, apVerlust, lpVerlust, apNeu, lpNeu, text };
}

async function zielErledigt(message, zielUuid, gelungen) {
  if (message.isOwner || game.user.isGM) {
    const angriff = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "angriff"));
    for (const z of angriff.ziele) if (z.uuid === zielUuid) Object.assign(z, { erledigt: true, gelungen });
    return message.setFlag(SYSTEM_ID, "angriff", angriff);
  }
  game.socket.emit(SOCKET, { aktion: "erledigt", message: message.id, ziel: zielUuid, gelungen });
}

// ------------------------------------------------------------------ Socket und Chatkarten

export function socketEinrichten() {
  game.socket.on(SOCKET, async (daten) => {
    const gm = game.users.activeGM;
    if (!gm || gm.id !== game.user.id) return; // nur der aktive Spielleiter bearbeitet Anfragen
    const message = game.messages.get(daten.message);
    if (!message) return;
    if (daten.aktion === "abwehr") await abwehren(message, daten.ziel, { automatisch: true });
    if (daten.aktion === "erledigt") await zielErledigt(message, daten.ziel, daten.gelungen);
  });
}

/** Knöpfe in Chatkarten: Abwehr nur für Besitzer des Ziels, PP für Besitzer und Spielleiter. */
export function karteEinrichten(message, html) {
  const wurzel = html instanceof HTMLElement ? html : html?.[0];
  if (!wurzel) return;
  const angriff = message.getFlag(SYSTEM_ID, "angriff");
  for (const knopf of wurzel.querySelectorAll("[data-midgard-aktion=abwehr]")) {
    const z = angriff?.ziele.find((x) => x.uuid === knopf.dataset.ziel);
    const ziel = z ? fromUuidSync(z.uuid) : null;
    if (!z || z.erledigt) { knopf.replaceWith(Object.assign(document.createElement("span"), { className: "mk-erledigt", textContent: z?.gelungen ? "abgewehrt (leicht)" : "schwer getroffen" })); continue; }
    if (!ziel?.isOwner) { knopf.disabled = true; knopf.title = "Nur wer diese Figur führt, würfelt die Abwehr."; continue; }
    knopf.addEventListener("click", () => { knopf.disabled = true; abwehrAnfordern(message, z.uuid).finally(() => (knopf.disabled = false)); });
  }
  for (const knopf of wurzel.querySelectorAll("[data-midgard-aktion=ap]")) {
    const actor = ChatMessage.getSpeakerActor(message.speaker);
    if (!actor?.isOwner) { knopf.disabled = true; continue; }
    knopf.addEventListener("click", async () => {
      knopf.disabled = true;
      const n = Number(knopf.dataset.ap) || 0;
      await actor.update({ "system.ap.wert": Math.max(0, actor.system.ap.wert - n) });
      ui.notifications.info(`${actor.name}: −${n} AP.`);
    });
  }
  const pp = message.getFlag(SYSTEM_ID, "pp");
  for (const knopf of wurzel.querySelectorAll("[data-midgard-aktion=pp]")) {
    const actor = pp ? fromUuidSync(pp.actor) : null;
    if (!pp || pp.vergeben) { knopf.replaceWith(Object.assign(document.createElement("span"), { className: "mk-erledigt", textContent: "gutgeschrieben" })); continue; }
    if (!actor?.isOwner || !pp.ziel?.id && pp.ziel?.typ !== "zauber") { knopf.disabled = true; continue; }
    knopf.addEventListener("click", async () => {
      knopf.disabled = true;
      await ppGutschreiben(actor, pp.ziel);
      if (message.isOwner || game.user.isGM) await message.setFlag(SYSTEM_ID, "pp", { ...pp, vergeben: true });
    });
  }
}
