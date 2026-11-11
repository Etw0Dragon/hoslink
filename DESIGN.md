# Hotlink — système visuel

## Direction actuelle

Refonte demandée le 10 novembre 2026 après rejet d’une première passe trop proche du rendu précédent. Références explicites : [Malt](https://www.malt.fr/) pour la recherche centrale et les entrées par métier ; [Comet](https://www.comet.co/) pour la composition éditoriale et la place des médias. Préférence confirmée : scènes variées du tourisme.

Le produit conserve son identité bleu/or, sa police locale et son positionnement hôtel/prestataires. La composition suit une approche éditoriale proche de l’ancrage Swiss, avec priorité aux références et couleurs demandées : grands titres sans-serif, asymétrie, recherche native, photographie et séparateurs fins. Les anneaux abstraits de l’ancien accueil sont remplacés par des scènes d’hôtellerie, de kayak, de bien-être et de restauration.

## Palette et typographie

- Encre : `#182f43`, texte fort, navigation et panneau de présentation vidéo.
- Bleu d’action : `#215e97`, actions, liens et mots mis en avant.
- Or : `#e2aa24`, point du logotype et accents ponctuels.
- Fond public blanc, surfaces secondaires `#edf3f7`.
- Fond de l’espace privé `#f5f7fa`, cartes blanches.
- Texte secondaire `#536171`, séparateurs `#dce4eb`.
- Les états métier conservent des couleurs sémantiques distinctes et un libellé visible.

Adwaita Sans variable sous licence OFL, servie localement sous le nom Hotlink Sans. Titre d’accueil de 48 à 76 px sur ordinateur, environ 40 à 65 px sur mobile. Titres de section de 32 à 48 px, texte courant de 14 à 17 px, interligne de 1,7. Les titres restent limités à un tracking de -0,04 em. Le préchargement de la police est défini dans le layout commun.

## Accueil : convaincre et orienter

Le premier écran associe un titre explicite à gauche et une grande photographie d’hôtel à droite, complétée par une vignette de kayak. La barre de recherche métier/destination occupe toute la largeur sous ces deux régions. Les suggestions sont de vrais liens vers une recherche par catégorie.

La suite de la page comporte quatre catégories photographiques, une section narrative sur les complémentarités entre métiers, une présentation vidéo sur fond bleu nuit, un parcours en trois étapes, l’offre de deux partenariats gratuits, une FAQ native et un appel à rejoindre le réseau.

L’accueil ne contient aucun témoignage, établissement fictif, compteur de clients ou logo partenaire inventé. Les modèles de collaboration sont expliqués sans présenter de nouvelles fonctions de réservation, paiement ou suivi de commissions.

## Recherche et accès

- `/` garde le comportement existant de redirection des utilisateurs connectés.
- `/presentation` affiche toujours la page publique, y compris avec une session. Le logo de la barre latérale et le lien « Découvrir Hotlink » y donnent accès.
- `/recherche` prépare les filtres ; les professionnels validés rejoignent directement l’annuaire.
- Un visiteur voit une explication de l’accès privé et peut se connecter ou s’inscrire. Ses filtres sont conservés 30 minutes dans un cookie HttpOnly et repris après connexion ; seuls les paramètres connus sont acceptés.
- Les résultats, les fiches et les messages conservent leurs contrôles d’accès côté serveur.

## Espace privé

L’annuaire possède un en-tête photographique, un formulaire de filtres en GET et des cartes partagées avec le tableau de bord. Chaque carte utilise un visuel de catégorie avec la mention « Illustration d’activité ». La validation professionnelle, la localisation, le nom, la présentation et le lien de contact restent issus du modèle existant.

La fiche reprend ce principe de couverture d’activité, puis met en avant le nom, la validation et les actions de contact/proposition. Aucun visuel n’est présenté comme la photo réelle d’un établissement.

Les cartes sont arrondies à 12 px ; la profondeur reste discrète. Les accords actifs, en attente, suspendus ou terminés portent un texte distinct. Les formulaires et la navigation conservent leurs actions et routes. La navigation active utilise `aria-current`.

## Médias

Les quatre visuels WebP sont générés et servis localement. Le premier visuel est prioritaire ; les autres images de la page sont chargées paresseusement, avec dimensions explicites. Leur statut d’illustration est indiqué à proximité des visuels.

La vidéo est une présentation animée originale de 18 secondes issue de ces visuels, et non un tournage. H.264, 1280 × 720, 25 images/s, environ 865 Ko, sans piste sonore. Lecteur HTML natif avec contrôles, `preload="none"`, poster local et piste française VTT. Le parcours est aussi décrit en texte. Pas de lecture automatique ni de service vidéo tiers.

Provenance et format détaillés dans `web/static/media/README.md`.

## Responsive et accessibilité

Sous 760 px, l’accueil passe en une colonne, la recherche s’empile et les catégories restent en deux colonnes. La photographie secondaire est réduite. La navigation publique occupe sa propre ligne. La vidéo conserve un ratio 16/9 et les étapes passent sous le lecteur.

Les contrôles restent natifs, avec labels visibles, focus explicite, lien d’évitement et prise en compte de `prefers-reduced-motion`. Les contenus importants n’exigent aucune animation. Les fermetures d’accord et retraits de membres disposent d’une confirmation. Les états d’envoi restaurent les boutons après un retour arrière.

## Sources et validation

- Styles partagés et espace privé : `web/static/app.css`.
- Accueil : `web/static/landing.css`, chargé uniquement pour cette page.
- Templates : `web/templates/`, composants communs `listing.html` et `icons.html`.
- Les URL CSS/JS sont versionnées pour renouveler le cache lors de cette refonte.
- Les composants Hono JSX rendent le HTML côté serveur ; les médias restent locaux. Recompiler le TypeScript et reconstruire l’image Docker après modification.

Tests de rendu, accès privé, filtres, médias et lecture partielle du MP4 exécutés ; syntaxe JavaScript, formatage, compilation et analyse Go vérifiés. La recette PostgreSQL et le parcours complet avec connexion restent soumis à un environnement autorisant la base. Firefox headless termine toujours avec le code 139 : aucune validation visuelle sur ordinateur/mobile n’est revendiquée. La capture HTML locale préparée sert uniquement à la recette, pas de preuve de rendu validé.


Migration TypeScript du 11 novembre 2026 : les validations Go historiques ci-dessus ne valident pas le nouveau runtime. La recette visuelle et fonctionnelle Hono reste à exécuter ; voir `.agent/ROADMAP.md`.
