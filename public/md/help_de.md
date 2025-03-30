
# Hilfe
Die Navigation der virtuellen Exkursionen von RockHopper sollte (hoffentlich!) recht intuitiv sein, aber diese Seite hilft zu verdeutlichen, wie alles funktioniert.
## Navigationssteuerung
Verwenden Sie die Maus, um in 3D-Punktwolken und -Photosphären zu navigieren. Klicken und ziehen Sie, um die Kamera zu drehen, und verwenden Sie die mittlere Maustaste (oder Umschalt+Linksklick), um zu schwenken. Durch Scrollen sollte ein- und ausgezoomt werden.
Doppelklicken Sie auf einen Punktwolkendatensatz, um den Rotationsmittelpunkt zu ändern (dadurch wird auch die Kamera gedreht, um den doppelt angeklickten Punkt zu betrachten). 
## Anmerkungssteuerelemente
Mit „Strg+Linksklick“ können Anmerkungspunkte hinzugefügt werden (diese sollten zunächst als kleine gelbe Kugeln angezeigt werden). Wenn eine Anmerkung fertig ist, drücken Sie die Eingabetaste, um sie zu akzeptieren, oder die Esc-Taste, um sie zu löschen. 
Die Art der hinzuzufügenden Anmerkung wird anhand der Anzahl der Punkte bestimmt:
1 Punkt: Fügen Sie ein „Label“-Objekt mit Text (oder beliebigem HTML) hinzu.
2 Punkte: Fügen Sie ein „Vector“-Objekt hinzu und fügen Sie dessen „Trend“, „Einbruch“ und „Länge“ der Registerkarte „Notizen“ hinzu.
3 Punkte: Fügen Sie ein „Plane“-Objekt hinzu und fügen Sie dessen „Streichen“, „Neigung“ und „Neigungsrichtung“ der Registerkarte „Notizen“ hinzu.
4+ Punkte: Fügen Sie ein „Polyline“-Objekt hinzu. Diese können nützlich sein, um z. B. lineare Merkmale hervorzuheben (oder Objekte von Interesse zu umkreisen).
Beachten Sie, dass Anmerkungen verloren gehen, wenn die Seite aktualisiert wird (es sei denn, Sie führen RockHopper auf einem lokalen Entwicklungsserver aus); das bedeutet, dass alle Änderungen über die Schaltfläche „⬇ Notes“ unten links heruntergeladen werden müssen.
Anmerkungen (und HTML-Labels) können mithilfe der entsprechenden Umschalttasten unten links im 3D-Viewer ein- oder ausgeblendet werden. Die Farbe der (aktuell gezeichneten) Anmerkung kann auch durch Klicken auf das Farbauswahl-Widget geändert werden.
## Visualisierungssteuerelemente
Eine der Hauptstärken von RockHopper ist, dass mehrere Attribute von Punktwolkendatensätzen auf unterschiedliche Weise gestreamt und visualisiert werden können. Diese Visualisierungsstile werden definiert, wenn die Punktwolke in ein streambares Format konvertiert wird, und erhalten (hoffentlich) verständliche Namen. 
Verwenden Sie die Schaltflächen oben links in der 3D-Ansicht, um den Ansichtsstil zu ändern. In der oberen Zeile wird die Farbzuordnung geändert, die zur Definition der Punktfarbe verwendet wird. In der zweiten Zeile können Sie eine Teilmenge der Punkte (basierend auf einer zugrunde liegenden Klassifizierung) entweder hervorheben oder ausblenden. Dies kann z. B. nützlich sein, um verschiedene Daten in einem Zeitreihendatensatz zu visualisieren oder bestimmte Objekte in einer Punktwolke hervorzuheben.
