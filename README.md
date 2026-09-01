# Notizbuch (OneNote-MD v2)

Eine moderne Webanwendung im OneNote-Stil, die Notizen als **Markdown-Dateien** in **Ordnern/Unterordnern** ablegt — jedes Notizbuch ist ein Ordner, jede Seite eine `.md`-Datei. Keine Datenbank: deine Notizen sind normale Dateien auf der Festplatte.

## Features
- **WYSIWYG-Editor** (wie OneNote) mit 1-Klick-Umschaltung in den **Markdown-Editor**
- **Responsive** Design für Desktop und Mobile
- **Verschieben & Kopieren** von Notiz-Seiten und Ordnern (per Kontext-Menü im Baum)
- **Bilder & Anlagen** einfügen und **hochladen** (per Toolbar, Drag & Drop oder Einfügen/Bild)
- **Dublette** einer Seite mit einem Klick
- **Sprache** Deutsch ⇄ Englisch (umschaltbar)
- **Darkmode** (hell/dunkel/auto)
- **Tags** pro Seite (optional abschaltbar)
- **KI-Assistent** für die Notizerstellung mit **DeepSeek**, **Claude (Anthropic)** und **ChatGPT (OpenAI)** — API-Keys werden in der App hinterlegt
- **OneNote-Import** vom Tool [alxnbl/onenote-md-exporter](https://github.com/alxnbl/onenote-md-exporter) — inklusive **Assets**-Ordner (Unterordner `.assets`/`assets` in jedem Ordner werden mit importiert und angezeigt)

## Schnellstart (lokal)
```bash
npm install
npm start
```
Danach läuft die App auf http://localhost:3500

## Ordnerstruktur
- `data/notes/` — deine Notizbücher/Notizen (Markdown + assets)
- `data/imports/` — hierhin legst du OneNote-Exporte (Ordner oder `.zip`), die du importieren willst
- `data/settings.json` — Sprache, Theme, Tags, KI-Keys

## Einrichtung KI
Im KI-Assistenten oben rechts: Anbieter wählen, API-Key eintragen (wird lokal gespeichert), Modell optional anpassen, dann Thema eingeben und „Erzeugen". Der Text kann direkt in die Seite eingefügt werden.

## Docker (Unraid)
Siehe `Dockerfile`. Datenträger `/app/data` auf einen Host-Pfad mappen (z. B. `/mnt/user/appdata/onenote`), Port 3500 freigeben.

## Dauerhafter Betrieb (Linux/systemd)
```bash
sudo cp onenote-md.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now onenote-md.service
```
Die App startet dann automatisch mit dem System und wird bei Abstürzen neu gestartet.

Nach dem Import: Seite im Baum anklicken, um den Import zu sehen. Lege Export-.zip unter `data/imports/` ab und klicke „Importieren".
