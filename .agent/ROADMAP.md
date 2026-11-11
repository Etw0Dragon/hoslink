# Feuille de route — état après implémentation initiale

## Réalisé dans le code

1. **Fondations** : monolithe Go, PostgreSQL, migration embarquée versionnée, configuration, Dockerfile, Compose, Makefile et documentation.
2. **Professionnels** : inscription, vérification et renvoi d’email, connexion, récupération de mot de passe, révocation des sessions, entreprises/établissements, rôles, équipes et invitations. Validation manuelle avec justification et journal administratif.
3. **Annuaire** : réseau privé, catégories, recherche texte et station, fiches et modification de présentation.
4. **Relations** : conversations privées, demandes de devis, PDF privés, signalements, conditions versionnées et historique, acceptation bilatérale, verrouillage transactionnel des capacités, suspension et réactivation. Priorités de conservation après abonnement.
5. **Préparation commerciale** : page des offres et modèle des droits (places et échéance). Réconciliation périodique des capacités. Aucun achat activé.

## Vérifications effectuées

- Tests unitaires et HTTP avec détecteur de courses : rendu des pages, échappement HTML, CSRF et origine, accès anonyme, rôles, validation SIRET/PDF, emails locaux et limiteur concurrent.
- Analyse `go vet` et compilation du binaire.
- Tests PostgreSQL ajoutés pour isolation conversations/documents, concurrence des places, versions périmées et expiration d’abonnement. Ils sont ignorés sans `TEST_DATABASE_URL`.

## Vérifications restant nécessaires

L’environnement courant ne donne pas accès au socket Docker et ne dispose pas d’un serveur PostgreSQL. Les tests d’intégration et la recette complète en base n’ont donc pas été exécutés. Aucun test visuel en navigateur ni déploiement n’a été réalisé. Ne pas considérer les lots métier comme validés en conditions réelles avant ces vérifications.

## Étapes suivantes

1. Démarrer PostgreSQL dans un environnement autorisé, exécuter les tests d’intégration et la recette de deux comptes décrite dans README.md.
2. Faire la recette visuelle ordinateur/mobile, tester SMTP et raccorder un contrôle antivirus des PDF avant ouverture à un public non maîtrisé.
3. Choisir tarifs, TVA, règles d’impayés/remboursements et prestataire de paiement ; implémenter son checkout et ses notifications authentifiées avec tests de doublons, ordre, échecs et résiliation.
4. Finaliser exploitant, station, mentions légales, CGU, confidentialité et durées de conservation ; mettre en place les procédures RGPD et de rattachement exceptionnel.
5. Configurer HTTPS, surveillance, sauvegardes chiffrées hors serveur et effectuer une restauration réelle.
6. Recette terrain avec hôtel et prestataire, puis ouverture pilote. Mesurer les inscriptions validées, premières mises en relation et accords activés.

Voir docs/OPERATIONS.md pour les limites et prérequis d’exploitation. Aucun service payant souscrit, aucun paiement encaissé, aucune production ouverte.

## Configuration locale PostgreSQL

Le `.env` local contient des identifiants de développement générés et deux URL distinctes : `DATABASE_URL` pour `partenaires`, `TEST_DATABASE_URL` pour `partenaires_test`. Make charge ces variables automatiquement. `make db` attend PostgreSQL puis crée la base de test de manière réexécutable ; `make test-integration` utilise cette dernière. Le `.env` est privé (0600) et ignoré par Git. Configuration et commandes Make vérifiées ; démarrage réel non effectué, Docker Compose indisponible dans cet environnement.

## Correction des messages sans PDF

Le premier essai PostgreSQL du porteur a validé l’expiration, mais révélé un retour 400 au lieu du 404 attendu lors d’une tentative d’injection de message. `FormFile` renvoyait `http.ErrNotMultipart` pour un formulaire texte standard ; ce cas est maintenant traité comme une absence de fichier. L’autorisation SQL reste inchangée. Un test unitaire de régression et une réponse autorisée sans pièce jointe ont été ajoutés. Les tests unitaires/HTTP avec `-race` passent. La relance PostgreSQL depuis cette session reste empêchée par l’interdiction d’ouvrir des sockets réseau ; relancer `make test-integration` dans le terminal utilisateur.

## Refonte Hotlink — 10 novembre 2026

- Nom confirmé : Hotlink. Positionnement élargi à tous les hôtels et prestataires, sans identité de montagne.
- Nouvelle page publique de présentation : navigation horizontale, identité bleu/or/ardoise, présentation du réseau, parcours, deux partenariats gratuits, FAQ et inscription. Aucun tarif inventé.
- Harmonisation des pages métier et formulaires, typographie variable locale sous licence OFL, adaptation mobile, focus clavier, lien d’évitement et réduction des animations.
- Tests Go, détecteur de courses et go vet passent ; détecteur Impeccable sans signalement. Revue des sources et corrections des accès mobiles effectuées.
- Recette visuelle navigateur toujours à faire : Firefox headless termine avec le code 139 dans cet environnement. Aucun déploiement effectué.

## Refonte des parcours B2B — 10 novembre 2026

- Architecture conservée : Go, PostgreSQL, templates HTML et CSS local. Pas de migration React, Tailwind ou shadcn ; aucune dépendance frontend ajoutée.
- Nouvelle route privée `/tableau-de-bord` : accords actifs, propositions non encore acceptées par l’établissement courant, capacité, quatre conversations classées par dernière activité, trois derniers établissements validés. Les requêtes d’activité filtrent explicitement l’établissement courant. Les profils à découvrir ne sont pas des recommandations personnalisées.
- Accueil : proposition de valeur plus directe, exemples de collaborations, appel final aligné à gauche. Identité Hotlink bleu/or/ardoise et police locale conservées.
- Annuaire : filtres fonctionnels existants conservés dans l’URL, compteur des résultats affichés (limite de 100 explicite), réinitialisation et cartes mutualisées avec le tableau de bord.
- Fiche : accès immédiat à « Proposer un partenariat » et au contact, présentation vide explicite et aide aux conditions de l’accord.
- Accords : statuts différenciés par texte et couleur ; distinction entre proposition à examiner et attente du partenaire ; action d’acceptation masquée si déjà acceptée. Décliner ou retirer utilise la clôture existante (`ended`), sans inventer un statut de refus distinct en base. Confirmation avant clôture ou retrait d’un équipier.
- Navigation courante, hiérarchie des pages, formulaires, surfaces, responsive et états vides harmonisés. État d’envoi et protection contre les doubles soumissions via un petit script local ; formulaires utilisables sans JavaScript. Focus visible, réduction des animations et préchargement de la fonte conservés.
- Templates répartis par page ; composant partagé `listing.html`. Sources CSS et JavaScript formatées.
- Vérifications réussies : `go test -race ./...` (hors intégration, variable absente), `go vet ./...`, compilation Go, contrôle syntaxique JavaScript et formatage Prettier. Cache Go redirigé dans `/tmp` pour respecter le système de fichiers.
- Tests ajoutés : rendu du tableau de bord, refus d’accès anonyme, actions selon rôle/acceptation ; contrôle d’isolation des conversations du tableau de bord dans le test PostgreSQL existant.
- Tentative explicite `make test-integration` : bloquée par `socket: operation not permitted` sur PostgreSQL localhost. Nouveau SQL et test d’isolation à valider sur PostgreSQL dans un environnement autorisé.
- Tentative de capture Firefox headless sur les templates rendus : échec code 139. Recette navigateur ordinateur/tablette/mobile et clavier toujours requise ; aucune validation visuelle revendiquée.
- Non implémentés faute de données/API existantes : calcul de distance, filtre de type de partenariat, préférences structurées de partenariat et recommandations personnalisées. Les coordonnées existantes restent celles gérées par le modèle actuel ; pas de faux réglages.
- Aucun paiement, réservation, suivi des commissions, service payant ou déploiement ajouté.

## Refonte photographique Comet / Malt — 10 novembre 2026

- Direction explicitement demandée après retour du porteur : changement visible de composition, recherche centrale, scènes variées du tourisme. Ancienne illustration à anneaux et styles associés supprimés de l’accueil.
- Nouvel accueil : grand titre et composition photographique, recherche métier/destination, catégories en images, présentation narrative, vidéo, parcours, offre gratuite et FAQ. Palette Hotlink conservée.
- Quatre visuels WebP générés, stockés localement et signalés comme illustrations. Ils ne représentent pas les établissements inscrits. Réutilisation dans les cartes d’annuaire et les couvertures des fiches.
- Présentation animée originale MP4 de 18 secondes, sans piste audio, avec lecteur natif, poster, sous-titres VTT et parcours textuel. Aucun autoplay. Fichier H.264 1280 × 720 de 884 881 octets ; provenance dans `web/static/media/README.md`.
- `/presentation` donne accès à l’accueil même connecté, via le logo latéral et « Découvrir Hotlink ». `/` conserve son comportement de redirection.
- `/recherche` conserve les filtres autorisés dans un cookie HttpOnly pendant 30 minutes et les reprend après connexion. Aucun résultat privé montré au visiteur ; les accès annuaire restent inchangés. Pas de redirection vers une URL fournie par l’utilisateur.
- Nouvel accueil isolé dans `landing.css`, icônes SVG mutualisées, anciens styles d’accueil supprimés. CSS/JS versionnés pour renouveler le cache. Binaire `bin/partenaires` reconstruit avec médias et templates embarqués.
- Tests ajoutés et réussis : page publique avec session, recherche préparée anonyme ou non validée, redirection validée, filtres bornés/limités aux clés connues, présence des médias et réponse 206 aux demandes de plage du MP4. Test d’intégration ajouté pour la conservation de recherche après connexion ; il nécessite PostgreSQL.
- Tests Go `-race` hors PostgreSQL, `go vet`, compilation, contrôle syntaxique JavaScript, formatage CSS/JS et métadonnées vidéo vérifiés.
- Nouvelle tentative Firefox headless sur le HTML rendu : code 139, malgré le rendu logiciel. La recette visuelle responsive et clavier reste à réaliser. Aucun serveur actif relancé, aucun déploiement, aucune dépense.

## Accueil inspiré de la maquette — 11 novembre 2026

- Héros et navigation bleu nuit, accents dorés, titre à empattements, composition de trois photographies existantes en arche à droite.
- Recherche blanche arrondie avec bouton doré sous le texte ; liens hôtels/prestataires/partenariats et bandeau de quatre entrées. Recherche GET sur `/recherche` et protection de l’annuaire conservées. Adaptation en une colonne sur mobile.
- Version des feuilles de style renouvelée. Aucun changement métier ni déploiement.
- Tests Go et analyse go vet exécutés. Tentative de capture Firefox headless : échec code 139 ; rendu visuel ordinateur/mobile à vérifier dans un navigateur fonctionnel. Les tests PostgreSQL restent soumis aux prérequis existants.

## Identité Hoslink — 11 novembre 2026

Nom visible remplacé par Hoslink dans les pages, métadonnées et sous-titres. Logo fourni déplacé dans `public/logo.png` et embarqué dans le binaire ; seuls les assets explicitement déclarés sont publiés sur `/public/`. Logo intégré à l’en-tête, à la barre latérale et au pied de page, dimensions adaptées au mobile. Test de disponibilité du logo ajouté au contrôle des médias existant.

## Préparation GitHub et Pages — 11 novembre 2026

- Dépôt confirmé par le porteur : `git@github.com:Etw0Dragon/hoslink.git`. Organisation préparée : publication de l’aperçu depuis `main`, branche d’intégration `backend`, branches courtes et PR. Les sources partagées restent communes ; `main` ne publie aucun serveur ni code source dans l’artefact Pages.
- Générateur `cmd/preview` : 14 pages publiques de démonstration à partir des vrais templates, sans import du backend ni accès base. Navigation sous `/hoslink/` ou une autre base, médias locaux, 404, avertissement statique, états vides, formulaires désactivés dans le HTML et jetons retirés. Liste de types de médias autorisés ; aucun export de `.env`, documents privés, templates ou fichiers Go.
- Parsing des templates et fonctions d’affichage centralisés dans `web/templates.go`, partagés avec l’application. URL de ressources CSS rendues relatives pour Pages.
- Workflows préparés : Pages depuis `main` seulement, permissions minimales et environnement ; CI Go/PostgreSQL 18 sur les deux branches et les PR, artefact téléchargeable des PR, Dependabot, modèles d’issues et de PR.
- Script de configuration GitHub préparé avec contrôles de visibilité publique, dépôt attendu, arbre propre et branches existantes. Création non destructive de `backend`, configuration de Pages et protections de branches. Aucun changement automatique de visibilité ni service payant.
- Documentation complète dans `.agent/GITHUB.md`, index `.agent/README.md` et entrée README. Ignore Git et contexte Docker renforcés pour fichiers locaux, secrets et exports.
- Vérifications locales réussies : `go test -race ./...` hors PostgreSQL, tests d’export sous racine et sous-chemins, liens et ressources CSS, absence de formulaires actifs et de fichiers sensibles, refus d’écrasement ; analyse et compilation avec `-buildvcs=false` car `.git` est inaccessible, syntaxe JavaScript, syntaxe shell et parsing YAML. Le parsing YAML n’est pas une exécution GitHub Actions.
- **Non réalisé à distance** : `.git` monté vide et en lecture seule, GitHub CLI absent et DNS réseau bloqué. Aucune branche créée, aucun commit/push, aucun workflow exécuté sur GitHub, aucune protection appliquée et aucun site Pages publié. Activation à faire depuis le vrai checkout local avec la procédure et le script documentés. Visibilité du dépôt non vérifiée ; ne pas la modifier sans décision.
- Les tests PostgreSQL ne sont pas exécutés localement faute de base accessible ; le workflow CI les exécutera avec sa base éphémère lorsqu’il sera poussé. La recette visuelle navigateur conserve la limite Firefox déjà signalée. Aucun backend déployé et aucune dépense.

## Exécution GitHub après full access — 11 novembre 2026

- Le porteur autorise l’application des changements. Dépôt public `Etw0Dragon/hoslink` vérifié par API ; aucune référence distante, aucune modification de visibilité. Dépôt local initialisé sur `main`, origin SSH confirmé.
- PostgreSQL Docker existant démarré/vérifié via `make db`. `make test` réussit avec détecteur de courses et base réelle. `make test-integration` réussit pour `TestIntegrationIsolationAndCapacity`, `TestIntegrationExpiration` et `TestIntegrationDiscoverySurvivesLogin`. Les anciennes limites d’accès à PostgreSQL ne s’appliquent plus à cette recette.
- GitHub CLI téléchargé depuis la publication officielle, archive contrôlée par SHA-256 ; exécutable dans `/tmp/hoslink-tools`, non ajouté au dépôt. Connexion par device code officielle initiée ; aucun jeton transmis dans la conversation.
- Actions GitHub fixées sur leurs SHA immuables résolus par API officielle, avec commentaires de version et suivi Dependabot.

- Premier commit `a90730b` poussé sur `main` et `backend` sans force push. Connexion GitHub CLI confirmée au compte Etw0Dragon. Actionlint valide les workflows. Secrets locaux exclus du commit après contrôle des valeurs sensibles.
- Pour éviter un verrouillage sans second relecteur, le script applique par défaut zéro approbation tierce obligatoire, avec PR/CI requises. `HOSLINK_REQUIRED_APPROVALS=1` permet d’exiger une approbation une fois la collaboratrice habilitée.
