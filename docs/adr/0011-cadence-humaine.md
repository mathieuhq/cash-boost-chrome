# 0011 — Cadence humaine

**Statut** : accepté — 2026-10-12

## Contexte
Le moteur agissait comme une machine : une Action toutes les 30–120 s (tirage uniforme), une à la fois, en alternant les Campaigns, 24 h sur 24, avec un scan toutes les 5–15 min quoi qu'il arrive. Dans XChat, le texte du DM apparaissait d'un bloc et le bouton Envoyer était cliqué dans la même seconde. Chaque signal pris isolément est faible ; ensemble ils dessinent un profil que personne n'a.

Une personne qui gère ses commentaires fait autre chose : elle ouvre un commentaire, envoie le DM, like, répond, puis passe au suivant ; elle enchaîne quelques commentaires, s'arrête, revient plus tard ; elle regarde souvent un post qui vit et rarement un post qui s'est tu ; elle dort ; elle tape.

## Décision
Les constantes vivent dans `DEFAULT_CONFIG.pacing` (ADR 0010) ; les fonctions pures dans `packages/domain/src/pacing.ts`.

- **Un Lead d'une traite.** `act()` prend le prochain Lead de l'ActionQueue et enchaîne ses étapes (DM → like → réponse, 3 au plus) à 5–25 s d'écart, dans la même exécution, via la dépendance `wait` du moteur. L'ordre DM → like → réponse de l'ADR 0009 est inchangé. Un Quota atteint ou une erreur coupe la chaîne ; le Lead reprend plus tard là où il en était. Le round-robin entre Campaigns se fait donc par Lead, plus par Action.
- **Délais tirés vers le court.** `skewedBetween` : `min + (max − min) × u^2,2`. Entre deux Leads : 25 s à 4 min, médiane autour de 55 s. Le tirage uniforme disparaît.
- **Rafales et pauses.** Après 5–12 Actions (taille tirée au sort à chaque rafale), pause de 8–35 min. L'état `tick.burst` compte, `tick.rest = { reason: "break" }` l'affiche.
- **Heures actives.** 8h–21h, heure locale du navigateur, réveil décalé de 0–45 min chaque jour. Hors de la plage : pas de scan, pas d'Action ; la prochaine alarme tombe au réveil. Les Campaigns expirent quand même à l'heure. `tick.rest = { reason: "night" }`.
- **Cadence du scan adaptée.** 5–15 min tant que le post reçoit des Comments (matchés ou non) ; 20–45 min après trois scans vides de suite.
- **Temps de remarque.** Les Comments trouvés par un scan attendent 20 s à 2 min 30 avant la première Action.
- **XChat.** Lecture de 1,5–4 s avant de taper, saisie mot à mot (120–380 ms par mot ; dans l'onglet en arrière-plan Chrome espace les minuteurs d'environ 1 s, un DM de 40 mots prend donc près d'une minute), relecture de 0,6–1,8 s avant Envoyer. Le scan des réponses marque 0,7–2,2 s entre deux pages.
- Le side panel dit pourquoi rien ne se passe : « En veille pour la nuit · reprise vers 08:12 », « Petite pause · reprise à 14:35 ».

Volume (`DEFAULT_CONFIG.volume`, ajouté le même jour) :

- **Montée en charge.** Les plafonds valent 40 % de leur valeur le jour de la première Action du compte dans l'extension, et montent linéairement jusqu'à 100 % au septième jour (`firstActionAt` dans l'état, `rampFraction`). Une pause de plusieurs semaines ne relance pas la rampe. Options affiche « Montée en charge : jour 3/7 ».
- **Cible du jour.** Les plafonds journaliers (DMs, réponses) sont multipliés par un facteur tiré une fois par jour local entre 0,7 et 1 (`tick.dailyTarget`) : le compte ne s'arrête pas sur le même chiffre chaque soir. Les likes par heure ne bougent pas. Les quotas affichés sont ceux réellement appliqués.
- **Pas de réponse à tout le monde.** 70 % des Leads livrés reçoivent la réponse publique « envoyé en DM » (`replyRate`, tiré à la création du Lead, `skipAck`). La réponse « ouvre tes DMs » part toujours : la personne doit agir.
- **Jamais deux fois la même variante.** Dans chaque famille de MessageTemplate, la variante utilisée la fois précédente est exclue du tirage (`tick.lastVariants`).

## Conséquences
- Débit plus faible et moins régulier ; les plafonds de la SPEC restent le maximum, atteint au mieux après une semaine et jamais deux jours de suite sur le même chiffre.
- Environ 30 % des Leads livrés n'ont pas de réponse publique : ils ont le lien en DM, le like, et c'est tout.
- Les heures actives suivent l'horloge de la machine : un utilisateur qui poste à 1h du matin devra attendre 8h. Les exposer dans Options est le prochain pas si le besoin se présente.
- Les chaînes par Lead gardent le service worker occupé jusqu'à une minute (DM XChat compris). Les attentes intermédiaires restent sous 30 s, la limite d'inactivité de MV3 ; les appels `chrome.scripting` qui suivent la relancent.
- Les délais courts entre deux étapes passent par `setTimeout` et non par `chrome.alarms`, dont la granularité minimale (30 s) les aurait écrasés.
- Les tests gardent `random = () => 0` : tous les délais tombent sur leur minimum et les heures actives se testent en heure locale.
