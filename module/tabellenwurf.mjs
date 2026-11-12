// Würfeln auf importierte Tabellen (Regel-Journale, Gegenstandsbögen, Kompendium-Browser): Ein Klick auf
// „W% würfeln“ würfelt, sucht die passende Zeile und schreibt Tabellentitel, Wurf und Ergebnistext in den
// Chat; die Zeile wird in der Tabelle kurz hervorgehoben.
import { wuerfelName } from "./regeln.mjs";
import { imBereich, nachricht, esc } from "./wuerfe.mjs";

/** Zeilen einer Würfeltabelle aus dem HTML: [{bereich, html, zeile}] */
export function tabellenZeilen(tabelle) {
  return [...tabelle.querySelectorAll("tbody tr")].map((tr) => {
    const zellen = tr.querySelectorAll("td");
    return zellen.length >= 2 ? { bereich: zellen[0].textContent.trim(), html: zellen[1].innerHTML, text: zellen[1].textContent.replace(/\s+/g, " ").trim(), zeile: tr } : null;
  }).filter(Boolean);
}

/** Würfelt auf eine Tabelle und meldet das Ergebnis im Chat. Gibt {wert, zeile} zurück. */
export async function aufTabelleWuerfeln(tabelle) {
  const zeilen = tabellenZeilen(tabelle);
  // Würfel aus dem Datenattribut, sonst aus der höchsten Zahl der Tabelle (falls Foundry Attribute entfernt)
  const hoechste = Math.max(0, ...zeilen.map((z) => Number(z.bereich.split(/[–-]/).pop()) || 0));
  const formel = tabelle.dataset.wuerfel || tabelle.querySelector(".midgard-tabellenwurf")?.dataset.wuerfel
    || (hoechste <= 6 ? "1d6" : hoechste <= 10 ? "1d10" : hoechste <= 20 ? "1d20" : "1d100");
  const roll = await new Roll(formel).evaluate();
  const treffer = zeilen.find((z) => imBereich(z.bereich, roll.total)) ?? null;
  const titel = tabelle.querySelector(".midgard-tabellentitel")?.textContent.trim() || "Tabelle";
  const seiten = Number(formel.replace(/^\d*d/, "")) || 100;
  // Verweise (@UUID) sind im Journal schon als Links gerendert; im Chat genügt ihr Text
  const ergebnis = treffer ? treffer.html.replace(/<a [^>]*class="[^"]*content-link[^"]*"[^>]*>(?:<i[^>]*><\/i>)?\s*([\s\S]*?)<\/a>/g, "$1") : "";
  await nachricht(null, `<div class="midgard-karte mk-tabelle">
    <header>${esc(titel)}</header>
    <div class="mk-wurf"><span class="mk-w20">${roll.total}</span> <small>${esc(wuerfelName(seiten))}</small>${treffer ? ` · Bereich <strong>${esc(treffer.bereich)}</strong>` : ""}</div>
    ${treffer ? `<p class="mk-tabellenergebnis">${ergebnis}</p>` : `<p class="mk-klein">Kein Eintrag für ${roll.total} gefunden.</p>`}
  </div>`, [roll], { tabelle: { titel, wert: roll.total, bereich: treffer?.bereich ?? null } });
  if (treffer) {
    zeilen.forEach((z) => z.zeile.classList.remove("midgard-gewuerfelt"));
    treffer.zeile.classList.add("midgard-gewuerfelt");
    treffer.zeile.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }
  return { wert: roll.total, zeile: treffer };
}

/** Ein Klick-Empfänger für das ganze Dokument (Journale werden neu gezeichnet; so bleibt der Knopf wirksam). */
export function tabellenwurfEinrichten() {
  const ausloesen = (ev) => {
    const knopf = ev.target.closest?.(".midgard-tabellenwurf");
    if (!knopf) return;
    if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
    const tabelle = knopf.closest("table.midgard-wurftabelle");
    if (!tabelle) return;
    ev.preventDefault();
    ev.stopPropagation();
    aufTabelleWuerfeln(tabelle);
  };
  document.addEventListener("click", ausloesen, true);
  document.addEventListener("keydown", ausloesen, true);
}
