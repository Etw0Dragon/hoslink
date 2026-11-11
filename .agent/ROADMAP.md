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

## GitHub et Pages activés — 11 novembre 2026

- `main` et `backend` existent sur le dépôt public. Pages configuré avec GitHub Actions, HTTPS imposé, environnement limité à la branche `main`. URL vérifiée : https://etw0dragon.github.io/hoslink/.
- Publication Pages réussie : https://github.com/Etw0Dragon/hoslink/actions/runs/43016395074. CI complète Go/PostgreSQL réussie : https://github.com/Etw0Dragon/hoslink/actions/runs/43016417032.
- Vérification publique : 21 pages et ressources répondent HTTP 200 ; formulaires absents des pages de démonstration. `.env`, `internal/app/app.go` et `public/embed.go` répondent 404.
- Protections réellement appliquées sur les deux branches : PR, CI `Go and PostgreSQL`, branche à jour, historique linéaire, discussions résolues, pas de force push ni suppression, administrateurs inclus. Approbation tierce optionnelle tant qu’aucun second relecteur habilité n’est défini.
- Permissions Actions par défaut en lecture, approbation de PR par Actions désactivée. Lien public ajouté à la présentation GitHub. GitHub CLI vérifié installé dans `~/.local/bin/gh`, aucune dépendance à un exécutable temporaire après redémarrage.
- Cette activation remplace les anciens blocages Git/réseau décrits plus haut. Aucun secret publié, aucun coût backend engagé, aucun service métier ouvert en production.

## Domaine personnalisé et correction du préfixe — 11 novembre 2026

- Domaine demandé : https://hoslink.tmfolio.site/. CNAME DNS vérifié vers `etw0dragon.github.io`. Pages configuré avec ce domaine ; certificat approuvé et HTTPS imposé. HTTP redirige correctement vers HTTPS.
- Relance Pages après changement de domaine : génération avec `base_path` vide. Les liens HTML ne contiennent plus `/hoslink/static/` ni `/hoslink/public/`. Vérification de 21 pages et ressources : HTTP 200 sur le nouveau domaine, sans formulaires actifs.
- Domaine canonique consigné dans `CNAME`, utilisé par le script et contrôlé par le workflow contre `configure-pages.outputs.host`. Configuration Actions et documentation actualisées ; le fichier CNAME seul ne remplace pas le réglage Pages API.
- Contrôles de fusion : les validations manuelles, même réussies, ne satisfont pas la règle GitHub. Relance de la PR via fermeture/réouverture pour obtenir un véritable événement `pull_request`. Aucune protection désactivée ni fusion administrateur forcée.

## Migration TypeScript / Hono / Better Auth — 11 novembre 2026

Le code Go et son export statique sont remplacés par `src/`, Node 24 et PostgreSQL 18. Les requêtes métier de lecture, le HTML et les ressources existantes sont repris ; les mutations sont portées avec validation Zod, isolation par établissement, invitations métier, documents privés, versions et verrous transactionnels. Better Auth et Drizzle gèrent l’identité séparément des profils métier. Le client ajoute vérification, récupération, révocation, Authenticator et codes de secours ; le middleware bloque l’administrateur sans 2FA confirmé.

Les nouvelles migrations SQL sont sérialisées et vérifiées par empreintes. Elles refusent une ancienne base Go. Compose utilise de nouveaux volumes et noms de bases, sans accès à l’ancienne base. Docker, CI TypeScript/PostgreSQL, commandes npm et guide Coolify/sauvegarde/bascule sont préparés. Les réglages distants GitHub Pages, Coolify et DNS restent inchangés.

**Limites de vérification de cette session** : résolution DNS npm indisponible et accès Docker refusé. L’installation des nouvelles dépendances, le typecheck complet, les tests Hono/Better Auth/PostgreSQL, le build Docker, la recette responsive et la persistance ne peuvent pas être annoncés comme réussis. La base de test cible est préparée dans les fichiers mais n’a pas pu être créée physiquement. Les tests ajoutés doivent être exécutés avant fusion et ouverture. Générer le lockfile npm et passer à `npm ci` dès que le registre est accessible. Les anciennes réussites Go ne valident pas le nouveau runtime.

Contrôles effectivement exécutés sur cette migration : parsing de 20 fichiers TypeScript/TSX sans diagnostic de syntaxe avec le compilateur TypeScript local d’un autre projet, contrôle syntaxique de `web/static/app.js`, parsing JSON/YAML et `git diff --check`. Une inspection structurelle temporaire de 20 états de pages a vérifié la conversion et l’échappement ; elle n’utilise pas le runtime Hono et ne compte donc pas comme recette applicative. Tentatives `npm run typecheck`, `npm test`, `npm run build` : outils absents faute d’installation des dépendances. Tentative Docker : socket refusé. Tentative Playwright : navigateur Chromium absent. Node hôte est 26 ; le runtime Node 24 n’a pas été exécuté localement. Aucun résultat de test PostgreSQL, de capture visuelle ou de build Docker n’est revendiqué.

## Vérifications avant push GitHub — 11 novembre 2026

L’accès réseau et Docker autorisé lève les blocages précédents : dépendances installées, `package-lock.json` ajouté, Docker et CI passés à `npm ci`. Contrôle TypeScript complet et compilation réussis. Suite réelle PostgreSQL 18 exécutée sur un conteneur et une base de test distincts de l’ancienne application : **12 tests réussis**, aucun ignoré. Les scénarios couvrent identité, email, récupération/révocation, 2FA et obligation administrateur, codes de secours, isolation, rôles, invitations, recherche conservée, concurrence des capacités, versions et expiration. Le limiteur est désactivé uniquement avec NODE_ENV=test pour ces scénarios ; un test séparé vérifie le refus 429 avec la configuration normale.

Dépendances Node HTTP, SMTP et esbuild mises à jour après audit : zéro vulnérabilité de production signalée par npm. Construction Docker Node 24 réussie ; les tests locaux utilisent le Node 26 hôte. Les anciennes bases et volumes n’ont pas été modifiés. La recette visuelle responsive, le SMTP réel, une restauration et le déploiement distant restent à réaliser. Le guide d’installation sur un Coolify neuf est dans `docs/OPERATIONS.md`.

## Correction du build Coolify — 11 novembre 2026

Échec utilisateur code 127 reproduit avec `ARG NODE_ENV=production` : npm omet les dépendances de développement et la compilation échoue avec `tsc: not found`. Le Dockerfile exige maintenant `npm ci --include=dev` avant compilation, en conservant le nettoyage `npm prune --omit=dev` pour l’image finale. Vérification de l’image corrigée avec la même injection de NODE_ENV. Documentation des variables d’exécution et du paramètre SMTP `requireTLS` actualisée.

## Appareils de confiance et refonte de l’espace professionnel — 11 novembre 2026

- Option « Faire confiance à cet appareil pendant 30 jours » sur Authenticator et code de secours. Cookie natif Better Auth signé, HttpOnly, SameSite=Lax, Secure en production, contrôlé par les enregistrements serveur. Expiration et révocation imposent à nouveau le second facteur. Réinitialiser le mot de passe révoque aussi les appareils mémorisés.
- Révocation des appareils depuis `/securite`, mutation protégée par origine, CSRF et identité. Après connexion, accès direct à l’administration pour un administrateur et au tableau de bord pour un établissement validé, en conservant la priorité des filtres de recherche.
- Nouveau layout Hono JSX commun à l’entreprise et la sécurité : navigation bleu nuit, actions dorées, fond chaud, logo et typographie hérités de l’accueil. Les pages de connexion et d’A2F reprennent une composition photographique en arche. Navigation mobile horizontale avec destination active visible et déconnexion accessible. Aucun établissement ou résultat inventé dans l’application.
- Vérifications : typecheck et build, 14 tests PostgreSQL/unitaires réussis, dont navigateur mémorisé/nouveau, cookie falsifié, expiration et révocation. Chromium : 7 pages à 1440 et 390 px sans débordement horizontal ni erreur JavaScript, captures inspectées ; case de confiance et opt-out, erreur de code/réessai et déconnexion mobile vérifiés dans le navigateur. Les captures utilisent uniquement des états locaux de recette, pas des comptes de production.

## Mode test-prod

`NODE_ENV=test-prod` conserve HTTPS, SMTP, les cookies sécurisés, l’email vérifié et l’A2F administrateur ; les nouveaux établissements avec SIRET unique à 14 chiffres sont validés automatiquement et inscrits au journal. La base actuelle conserve les données de recette après retour en production. Voir docs/OPERATIONS.md.
