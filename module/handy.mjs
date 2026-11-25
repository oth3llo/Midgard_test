// Handy-Ansicht: Spieler, die sich mit dem Handy anmelden, landen nicht auf der Spielfläche, sondern im
// Charakterbogen ihres zugewiesenen Charakters, bildschirmfüllend und im Retro-Stil (retro.css, Klasse
// html.retro). Während der Erschaffung öffnet sich „Erschaffung & Lernen“; mit der Übergabe steigen sie
// bei den Fertigkeiten ein. Die Spielfläche (WebGL) wird auf Handys abgeschaltet, das spart Ladezeit.
import { SYSTEM_ID } from "./kategorien.mjs";

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

export function einstellungenRegistrieren() {
  game.settings.register(SYSTEM_ID, "handyAnsicht", {
    name: "Handy-Ansicht",
    hint: "Auf dem Handy öffnet sich statt der Spielfläche der eigene Charakterbogen, bildschirmfüllend und im Retro-Stil; die Spielfläche wird auf diesem Gerät abgeschaltet. „Automatisch“ erkennt Handys an Touch-Bedienung und schmalem Bildschirm. Gilt nur für dieses Gerät; die Spielleitung bekommt die Ansicht nie automatisch.",
    scope: "client", config: true, type: String, default: "auto",
    choices: { auto: "Automatisch", immer: "Immer", nie: "Nie" },
    requiresReload: true,
  });
}

/** Läuft dieses Gerät in der Handy-Ansicht? (Spielleitung nur, wenn ausdrücklich „Immer“) */
export function istHandy() {
  let wahl = "auto";
  try { wahl = game.settings.get(SYSTEM_ID, "handyAnsicht") ?? "auto"; } catch { /* vor der Registrierung */ }
  if (wahl === "immer") return true;
  if (wahl === "nie" || game.user?.isGM) return false;
  const touch = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const schmal = Math.min(window.innerWidth, window.screen?.width || window.innerWidth) < 820;
  return touch && schmal;
}

/** Charakter des Spielers: zugewiesener Charakter, sonst der einzige eigene Abenteurer. */
export function eigenerCharakter() {
  if (game.user?.character) return game.user.character;
  const eigene = (game.actors?.filter?.((a) => a.type === "abenteurer" && a.isOwner) ?? []);
  return eigene.length === 1 ? eigene[0] : null;
}

/** Bogen des Charakters bildschirmfüllend öffnen; während der Erschaffung im Werkzeug. */
export async function handyBogenOeffnen(actor = eigenerCharakter()) {
  if (!actor) {
    ui.notifications?.warn("Midgard: Dir ist noch kein Charakter zugewiesen. Die Spielleitung trägt ihn unter Benutzerkonfiguration › Charakter ein.", { permanent: true });
    return null;
  }
  const bogen = actor.sheet;
  const phase = actor.getFlag?.(SYSTEM_ID, "phase");
  const inErschaffung = phase === "sl" || phase === "spieler" || !actor.system?.typ;
  bogen.reiterWaehlen?.(inErschaffung ? "werkzeug" : "uebersicht", { zeichnen: false });
  await bogen.render({ force: true });
  bogen.element?.classList.add("midgard-handy");
  return bogen;
}

/** Beim Start: Handy erkennen, Spielfläche abschalten, Retro-Stil setzen, Bogen öffnen. */
export async function beimStartHandy() {
  if (!istHandy()) return false;
  // Spielfläche abschalten (gilt ab dem nächsten Laden; einmal neu laden, damit das Handy gleich entlastet ist)
  try {
    if (!game.settings.get("core", "noCanvas")) {
      await game.settings.set("core", "noCanvas", true);
      if (game.canvas?.ready || globalThis.canvas?.ready) { window.location.reload(); return true; }
    }
  } catch { /* Einstellung fehlt (ältere/neuere Foundry): ohne weiter */ }
  document.documentElement.classList.add("retro", "midgard-handy-aktiv");
  // Knopf zum Wiederöffnen, falls der Bogen geschlossen wird
  if (!document.querySelector(".midgard-handy-knopf")) {
    document.body.append(el("button", { type: "button", class: "midgard-handy-knopf", onclick: () => handyBogenOeffnen() }, el("i", { class: "fa-solid fa-user" }), " Mein Charakter"));
  }
  await handyBogenOeffnen();
  return true;
}
