// Was ein Charakter verwenden kann: Grundlage für den Kompendium-Browser der Spieler (sie sehen nur, was
// ihr Charakter nutzen bzw. lernen kann). Dieselben Regeln wie im Erschaffungswerkzeug:
// Waffen: Mindestwerte St/Gs/Gw erreicht, für Gnome und Halblinge nicht zu groß (Kodex S. 37/44),
//         Zauberstäbe nur für Zauberer (Typ-Art „Z“);
// Zauber: Gruppe laut Lerntabelle für den Abenteurertyp lernbar, Schwarze Magie nicht für Elfen.
// Rüstungen und Gegenstände haben im Datensatz keine Voraussetzungen.

const KLEIN = ["Gnom", "Halbling"];

/**
 * Prüfer für einen Akteur, oder null ohne Akteur. pruefe(kat, eintrag) gibt den Grund zurück, warum der
 * Eintrag nicht verwendbar ist, sonst null. eintrag: {name, system} wie im Kompendium-Index.
 */
export function verwendbarkeit(actor) {
  if (!actor || actor.type !== "abenteurer") return null;
  const s = actor.system ?? {};
  const eig = s.eigenschaften ?? {};
  const typ = s.typ ?? "";
  const klein = KLEIN.includes(s.rasse);
  const zauberer = s.typArt === "Z";
  const gruppen = new Set(Object.keys(globalThis.LERNKOSTEN?.zauberKosten?.[typ] ?? {}));
  const nurZauberer = globalThis.KODEX?.nurZauberer ?? ["Zauberstäbe"];
  return {
    name: actor.name,
    pruefe(kat, e) {
      const x = e?.system ?? {};
      if (kat === "waffen") {
        for (const [k, min] of Object.entries(x.mindest ?? {})) {
          if (!min) continue;
          const wert = eig[k];
          if (wert === null || wert === undefined) continue; // Wert noch nicht eingetragen: nicht ausblenden
          if (wert < min) return `${k} ${min} nötig (${wert})`;
        }
        if (klein && x.kleineVerboten) return `für ${s.rasse === "Gnom" ? "Gnome" : "Halblinge"} zu groß`;
        if (nurZauberer.includes(x.fertigkeit) && !zauberer) return "nur für Zauberer";
        return null;
      }
      if (kat === "zauber") {
        if (!gruppen.has(x.gruppe)) return typ ? `${s.typName || typ} lernt keine Zauber der Gruppe ${x.gruppe}` : "kein Abenteurertyp";
        if (s.rasse === "Elf" && x.ursprung === "schwarzmagisch") return "Schwarze Magie: für Elfen verboten";
        return null;
      }
      return null;
    },
  };
}

/** Kategorien, die für Spieler gefiltert werden (und deren Foundry-Kompendien sie nicht direkt sehen). */
export const GEFILTERT = ["waffen", "zauber"];
