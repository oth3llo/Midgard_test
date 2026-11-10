// Hinweis auf neue Systemversionen in der laufenden Welt. Foundry selbst prüft nur auf dem
// Einrichtungsbildschirm; installieren lässt sich ein Update auch nur dort.
const MANIFEST = "https://raw.githubusercontent.com/oth3llo/Midgard_test/main/system.json";

export async function updatePruefen() {
  if (!game.user.isGM) return null;
  try {
    const url = `${game.system.manifest || MANIFEST}?t=${Date.now()}`; // am Zwischenspeicher vorbei
    const antwort = await fetch(url, { cache: "no-store" });
    if (!antwort.ok) return null;
    const neu = (await antwort.json()).version;
    const alt = game.system.version;
    if (!foundry.utils.isNewerVersion(neu, alt)) return { neu, alt, verfuegbar: false };
    ui.notifications.info(
      `Midgard 5: Version ${neu} ist verfügbar (installiert: ${alt}). Zum Aktualisieren die Welt beenden, im Einrichtungsbildschirm unter „Spielsysteme“ nach Updates suchen und bei Midgard 5 „Aktualisieren“ wählen.`,
      { permanent: true },
    );
    return { neu, alt, verfuegbar: true };
  } catch (fehler) {
    console.warn("midgard5-cmt | Update-Prüfung nicht möglich", fehler);
    return null;
  }
}
