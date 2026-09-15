# Bewerbungs Coach – HTML 1.0.2

Aufruf: https://ginardlabs.github.io/HTML-Bewerbungstracker-Apps/coach/

Fortsetzung von Bewerbungs_Coach_HTML_Test.html vom 13.09.2026 / native Coach-App 1.0.1.

- Importierte Teilnehmenden-Backups und eigene Berichtsfilter werden automatisch lokal in IndexedDB gespeichert. Keine Cloud-Synchronisation.
- «Speichern & Backups»: Gesamtsicherung aller Personen, Dokumente und Berichtsfilter. Wiederherstellung ersetzt die bisherigen Coach-Daten in einer gemeinsamen Datenbanktransaktion.
- Das Gesamtbackup (`kick-coach-backup`, Version 1) lässt sich zwischen den HTML-Coach-Apps auf Android, iPhone und PC austauschen.
- Für die vorhandene installierte Coach-App: einzelne Personen als `kick-backup`, Version 3, exportieren und dort über «Backups laden» importieren. Die bisherige native App kann ein Coach-Gesamtbackup noch nicht einlesen; eigene Berichtsfilter werden über Personen-Backups nicht übertragen.
- Private allgemeine Aufgaben werden wie bisher beim Teilnehmenden-Import ausgeschlossen und nicht exportiert.
- PDF-Dateien und Backups stehen in einem Dialog zum Herunterladen oder – falls vom Browser unterstützt – zum Teilen bereit. «Jetzt teilen» ruft den Systemdialog direkt durch einen neuen Fingertipp auf.
- Auf dem iPhone Safari, auf Android Chrome verwenden. Bei Bedarf zum Home-/Startbildschirm hinzufügen und danach immer diesen Zugang nutzen. Browser- und Home-Bildschirm-Zugänge können getrennte Speicherbereiche haben.
- Nach dem vollständigen ersten Laden ist ein Offline-Start möglich. Browserdaten nicht löschen und regelmässig ein Backup ausserhalb des Browsers sichern.

Die bestehenden PDF.js-, html2canvas- und jsPDF-Bibliotheken werden aus der benachbarten Tracker-Datei `../index.html` geladen. Nur die Bibliotheksblöcke werden übernommen, niemals der Tracker-Anwendungscode. Der Offline-Cache enthält ausschliesslich öffentliche Programmdateien. Die grosse Tracker-Datei wird beim ersten Offline-Setup mitgesichert. Bei Updates die Cache-Version in `sw.js` erhöhen.

Vorhandene Tracker-Dateien und sein Datenspeicher werden durch diese Veröffentlichung nicht verändert.
