# Redesign del tavolo di gioco

Direzione approvata il 29 ottobre 2026: campi distinti, atmosfera storica, meno testo permanente e statistiche leggibili tramite icone.

- Era e turno nella testata; menu tramite icona.
- Stato dei due giocatori sopra il rispettivo campo, nello stesso ordine: mura, centro città, capacità logistica. Iniziativa indicata da una bandiera.
- Risorse riunite sopra la mano; nomi e capacità disponibili nelle descrizioni accessibili e nei tooltip.
- Rimossi dal campo i conteggi della mano, le etichette delle risorse, le istruzioni a campo vuoto e il comando per aprire la mano.
- Apertura della mano al passaggio del mouse, al focus da tastiera o al tocco. Escape la richiude. Restano trascinamento, doppio clic e giocata contestuale.
- Preferenza di conferma del Passo nel menu partita; conferma ancora attiva per impostazione predefinita.
- La battaglia conserva linee, animazioni e controlli di riproduzione. Lo sfondo di battaglia esistente resta separato.

## Anteprime del gioco

Screenshot del browser con la UI implementata, in Era I e con la mano abbassata:

- [Desktop, 1280 × 800](design/board-redesign-desktop.png)
- [Telefono orizzontale, 800 × 360](design/board-redesign-mobile-landscape.png)
- [Telefono verticale, 360 × 800](design/board-redesign-mobile-portrait.png)

## Sfondo

Asset utilizzato: `apps/web/public/board-art/table-landscape.webp`. Generato con il tool integrato imagegen, quindi convertito in WebP (qualità 88) con Sharp. Nessuna UI è incorporata nell'immagine. Lo stesso paesaggio accompagna le tre Ere durante lo sviluppo; l'Era è indicata nella testata.

Prompt finale:

> Create a production background bitmap asset ONLY, absolutely NO interface, NO text, NO borders, NO icons, NO cards. Wide 16:10 landscape 1920x1200 intended for EPOCHS ancient historical strategy card game. Sophisticated painterly historical art in muted warm bronze, charcoal olive, ivory dusk highlights. A quiet strategic playing ground viewed in a subtly elevated perspective, mostly flat weathered charcoal stone/earth with softly atmospheric fine texture. The central 85 percent of the image from y=16 percent down through y=92 percent MUST be almost uniformly dark, very low contrast, visually quiet, suitable for overlaying two rows of playing cards. Frame only the outermost left and right 6 percent with dark ancient stone terraces, restrained sparse cypress silhouettes and crumbling rock masonry. Top 15 percent a distant atmospheric ancient Mediterranean hill city and mountain ridge, small warm muted sunset between hills, beautiful refined painterly atmospheric depth, avoid bright glaring sun. Bottom edge dissolves softly into dark charcoal. Minimal peripheral decoration, no people, no close-up trees across center, no architecture over central playing ground, no busy details. Premium historical game art, elegant warm atmosphere with dark matte playable space. Do not draw a UI mockup or frames. This is the clean background asset that will be placed underneath real HTML components.
