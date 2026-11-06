# Poker-Turnieruhr

Eine vollständig lokale Turnieruhr ohne Cloud, Server oder externe Abhängigkeiten.

## Start

`index.html` per Doppelklick in einem modernen Browser öffnen. Für Vollbild oben rechts auf **Vollbild** klicken.

## Persistenz und unterbrochene Sitzungen

- Der Stand wird während eines laufenden Timers zweimal pro Sekunde in `localStorage` gespeichert.
- Solange die Seite geöffnet ist, berechnet die Uhr den Stand aus echten Zeitstempeln. Dadurch bleibt sie auch bei gedrosseltem Hintergrund-Tab korrekt.
- Bei Reload, Browserneustart oder nach einem Absturz wird der letzte gespeicherte Stand **immer pausiert** wiederhergestellt.
- Zeit, in der die Seite geschlossen war, wird niemals nachträglich abgezogen. Erst **Fortsetzen** startet die Uhr wieder.
- **Neu starten** löscht den Turnierfortschritt nach Sicherheitsabfrage; angepasste Blindlevel und Toneinstellungen bleiben erhalten.

## Bedienung

- Leertaste: Start/Pause/Fortsetzen
- Pfeiltasten links/rechts: Level wechseln
- Gong, Lautstärke, Blindwerte und Leveldauer: Einstellungen

Der Gong wird über die Web-Audio-Funktion des Browsers erzeugt und benötigt keine Audiodatei.
