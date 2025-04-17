# Einführung
Der Textinhalt in RockHopper-virtuellen Exkursionen ist in (anpassbaren) Registerkarten organisiert, die z. B. eine Registerkarte „Guide“ enthalten sollten, um uns die coolen Dinge über jeden Ort in Ihrer virtuellen Exkursion zu erzählen, und eine Registerkarte „Notes“, damit die Schüler Notizen machen (oder Aufgaben für Hausarbeiten erledigen) können. Zusätzliche Registerkarten mit „Further reading“ oder „Help“ können ebenfalls eine gute Idee sein.
All diese Textinhalte werden als leicht bearbeitbare Markdown-Dateien (.md) gespeichert. Dies bietet einen guten Kompromiss zwischen einfacher Formatierung und Flexibilität. Eine nützliche Anleitung zum Schreiben von Markdown-Dateien finden Sie [hier](https://www.markdownguide.org/cheat-sheet/).
Um den Markdown in Ihrem Browser zu bearbeiten, doppelklicken Sie auf diesen Text. Wenn Sie fertig sind,
verwenden Sie „Umschalt+Eingabe“, um den Markdown erneut zu rendern. Wenn Sie einen lokalen Entwicklungsserver verwenden (weitere Informationen finden Sie auf der Seite RockHoppers [GitHub](https://github.com/samthiele/rockhopper)), werden diese Änderungen automatisch in Ihrer virtuellen Tour gespeichert. Sobald eine Tour live ist (gehostet von einem statischen Webserver), sind Änderungen für alle außer der Registerkarte „Notes“ deaktiviert. Änderungen in „Notes“ können über die Schaltfläche „⬇ MD“ unten links heruntergeladen werden.
## Ausgefallene Markdown-Texte
Markdown-Texte können lang und detailliert sein und in mehrere Sprachen übersetzt werden (siehe Schaltflächen unten links). Sie können auch verschiedene Medien wie Bilder enthalten.
![Lassen Sie sich nicht von Markdown unterkriegen!](https://upload.wikimedia.org/wikipedia/commons/7/7b/ZSL_London_-_Northern_rockhopper_penguin_%2801%29.jpg)
Tabellen sind ebenfalls möglich:
| Kopfzeile 1 | Kopfzeile 2 |
|----------|----------|
| Daten 1 | Daten 2 |
Ebenso wie Multiple-Choice-Fragen, um Ihre Schüler auf Trab zu halten!
---
Sind Pinguine Punk?
- [x] Ja
- [ ] Nein
- [ ] Manchmal
---
Audio kann sehr hilfreich sein - glauben Sie, dass RockHopper singen können?
> Audio https://xeno-canto.org/sounds/uploaded/YYMEPEMBFR/XC952603-S_Rock_Hop_West_Pt_Falkland_Is.mp3
Und auch YouTube-Videos!
> YouTube https://www.youtube.com/embed/lVD1WaMaqDc?si=jXZzNdHYJXJSLbYg
## Verknüpfungen zu Überschriften und Websites
Der Hash-Teil der URL (der Teil nach dem #-Zeichen) kann zur Erstellung interner Verknüpfungen verwendet werden, sodass Markdown-Verknüpfungen zur Navigation innerhalb und zwischen verschiedenen Websites in einer virtuellen Exkursion verwendet werden können.  
[Gehe zu Stopp 1](./#site1)
[Gehe zu Stopp 2](./#site2)
[Gehe zu Photosphere](./#photosphere)
Wenn diese Standorte in der Datei „index.json“ der Tour registriert sind, werden beim Klicken auf den Link entsprechende Änderungen im Viewer (Kameraposition, Renderstil, Punktsichtbarkeit usw.) vorgenommen.
Überschriften, die den gleichen Namen wie ein Standort haben (Leerzeichen und Groß-/Kleinschreibung werden ignoriert), werden ebenfalls automatisch angezeigt, wenn auf die oben genannten Links geklickt wird. Dies kann dabei helfen, Textinhalte mit dem abzugleichen, was auf einer Punktwolke oder Photosphäre angezeigt wird.
# Tour
Eine virtuelle Exkursion ist in der Regel in mehrere Standorte oder Stopps unterteilt. Diese können jeweils unabhängige Datensätze verwenden (z. B. von weit voneinander entfernten Standorten) oder als unterschiedliche Standorte oder Ansichten einer einzelnen Punktwolke oder Photosphäre definiert werden.
Je nach Größe der Tour können alle Standorte in einer einzigen Markdown-Datei beschrieben werden (wie hier), oder es kann für jeden Standort eine andere Markdown-Datei geladen werden. In der Datei „index.json“ der Tour muss lediglich angegeben werden, welche Markdown-Datei für jeden Standort geladen werden soll.
## [Standort 1](./#site1)
Standort 1 zeigt einen Aufschluss, an dem ich ein paar coole Kieselsteine für meine Sammlung gefunden habe. Ich habe die „Highlight“-Tools verwendet, um die Gesteinseinheit zu zeigen, aus der diese stammen. 
![Meine abgefahrene Steinesammlung](https://upload.wikimedia.org/wikipedia/commons/4/41/Pet_rock.jpg)
## [Standort 2](./#site2)
Dies ist ein anderer Standort in derselben Punktwolke, diesmal mit einer Verwerfung. Ich habe einige Anmerkungen hinzugefügt, um die Lage und Ausrichtung dieser Verwerfung hervorzuheben, obwohl dies über die Schaltfläche „Anmerkungen“ ein- und ausgeschaltet werden kann.
![Der Fluss von Pinguinen durch offene, schichtparallele und schichtsenkrechte Brüche ist ein spannender und noch wenig erforschter Ansatz für zukünftige Forschung](https://birdoftheweek.home.blog/wp-content/uploads/2022/01/image.png)
## [Standort 3](./#site3)
Zusätzlich zu Punktwolkendaten kann RockHopper zur Visualisierung von
. Diese können nützlich sein, um ein immersives Erlebnis zu schaffen und die Atmosphäre eines Ortes einzufangen.  
Wie bei Punktwolken können Anmerkungsebenen zu Fotosphären hinzugefügt werden, indem Sie „Strg+Linksklick“ verwenden (weitere Informationen finden Sie auf der Registerkarte „Hilfe“). Diese können nützlich sein, um wichtige Merkmale zu kennzeichnen oder hervorzuheben.