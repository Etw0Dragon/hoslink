# GitHub et aperçu frontend Hoslink

## Décision du 11 novembre 2026

Dépôt indiqué par le porteur : `git@github.com:Etw0Dragon/hoslink.git`.

Objectif : permettre à la collaboratrice de consulter le frontend après chaque **push sur main**, sans serveur applicatif payant. Les commits uniquement locaux, les commits de branches de travail et ceux de `backend` ne remplacent pas le site partagé.

GitHub Pages convient à cette phase de maquette et de recette visuelle. Il sert uniquement HTML, CSS, JavaScript et médias ; il n’exécute ni Go ni PostgreSQL. Ce n’est pas l’ouverture du service métier en production.

## Organisation retenue

| Branche | Rôle | Publication |
| --- | --- | --- |
| `main` | Référence du frontend et des sources partagées, prête à montrer | Aperçu statique Pages automatique après chaque push réussi |
| `backend` | Intégration et travail sur l’application complète Go/PostgreSQL | CI uniquement, aucun hébergement backend |
| `feat/<sujet>`, `fix/<sujet>` | Modifications courtes soumises en PR | Artefact statique téléchargeable dans la CI des PR |

**Une branche n’est pas un mécanisme d’isolation ni d’hébergement.** Les sources serveur restent présentes sur `main`, pour garder un historique commun, permettre les tests et réutiliser exactement les mêmes templates. Le workflow Pages ne publie que `dist/`, jamais le dépôt entier. La branche `backend` part de `main` et ne contient pas une seconde copie indépendante du frontend. La suppression du backend de `main` n’apporterait aucune économie et multiplierait les conflits.

Un seul dépôt ne permet pas de rendre `main` public et `backend` privé. Si le code serveur doit rester confidentiel, choisir un dépôt backend privé séparé, et non une autre branche de ce dépôt public. Cette visibilité n’a pas été changée dans cette session.

Le générateur est `cmd/preview`, sa logique est dans `internal/preview`. Le rendu HTML et les fonctions d’affichage sont partagés via `web.Templates()`. Aucun import de l’application ou du stockage dans le générateur ; aucune base, SMTP, session ou variable secrète nécessaire.

## Ce que la collaboratrice voit

URL de l’aperçu : **https://etw0dragon.github.io/hoslink/**. Le résultat vérifié du déploiement est consigné dans `ROADMAP.md`.

Accueil et présentation, connexion, inscription, récupération d’accès, recherche, informations, puis vues vides du tableau de bord, annuaire, partenariats, messages, établissement, équipe et offres. Le lien « Explorer l’interface » du bandeau ouvre le tableau de bord.

Le bandeau indique que c’est un aperçu sans compte connecté. Les données sont vides ; les deux places affichées sont la règle gratuite validée, pas des données d’un client. Aucun établissement, message ou témoignage réel ou fictif n’est publié. La page recherche explique la limite statique. Les formulaires sont remplacés par des champs désactivés **avant publication**, sans dépendre du JavaScript ; les jetons sont retirés. Il n’y a aucun envoi, achat, authentification ni contrôle métier simulé.

L’aperçu est public et porte `noindex,nofollow`, ce qui demande aux moteurs de ne pas l’indexer mais ne restreint aucun accès. Ne jamais y placer de contenu confidentiel. La vidéo existante est réutilisée telle quelle ; les anciens noms éventuels incrustés dans ce média ne sont pas régénérés automatiquement.

## GitHub Actions

### `Pages` — `.github/workflows/pages.yml`

1. Push sur `main` ou relance manuelle sur `main` seulement.
2. Tests de l’export statique.
3. Lecture du chemin Pages par `configure-pages` : compatible `/hoslink/` et racine d’un futur domaine personnalisé.
4. Génération de `dist/`, réécriture des URL HTML et utilisation d’URL CSS relatives.
5. Publication de cet artefact uniquement par `deploy-pages`, dans l’environnement `github-pages`.

Les permissions Actions par défaut du dépôt sont limitées à la lecture et l’approbation de PR par Actions est désactivée. Le build lit le dépôt ; seul le job de publication reçoit `pages: write` et `id-token: write`. Aucun PAT ni secret serveur nécessaire. Les déploiements sont sérialisés et ne s’annulent pas pendant une publication. Les permissions persistantes du checkout sont désactivées.

### `CI` — `.github/workflows/ci.yml`

Sur les pushes de `main`/`backend` et les PR vers ces branches : formatage Go, `go vet`, `go test -race -count=1 ./...`, compilation, syntaxe JavaScript et export statique. Un service **PostgreSQL 18 éphémère** permet aux tests existants d’isolation, capacité concurrente et expiration de réellement s’exécuter sur GitHub. Le mot de passe CI est une valeur jetable publique, sans rapport avec les identifiants locaux ou de production.

Sur PR, artefact `hoslink-preview-<numéro>` conservé 7 jours. Il s’agit d’un téléchargement, pas d’une URL de prévisualisation publique par PR : Pages propose un seul site par dépôt. Aucun déploiement non approuvé de code de PR, aucun `pull_request_target`, aucun secret transmis aux PR.

### Entretien

Dependabot vérifie les modules Go et les actions chaque semaine ; ses mises à jour passent par PR et CI. Les actions utilisent des SHA de commit immuables résolus et vérifiés auprès de l’API des dépôts officiels (`checkout`/`setup-go`/`setup-node` v6, actions Pages selon leur version propre). Les commentaires conservent les versions lisibles ; Dependabot assure les propositions de mises à jour.

Les images PostgreSQL suivent `18-alpine`, comme le développement local ; une validation de digest est une amélioration possible, pas effectuée.

## Configuration et reproduction depuis un terminal local

### État particulier de cette session

La première session exposait `.git` vide et en lecture seule, avec réseau bloqué. Le porteur a ensuite accordé le full access et demandé l’application des changements. Le dépôt distant a été vérifié public et sans référence Git ; le répertoire local ne contenait aucun historique. Un dépôt `main` a donc été initialisé sans écraser d’historique, avec `origin` pointant sur le dépôt confirmé. La connexion SSH fonctionne et l’authentification officielle GitHub CLI au compte Etw0Dragon a réussi. `main` et `backend` sont poussées ; Pages, les protections et l’environnement sont configurés. L’état effectivement appliqué est consigné dans `ROADMAP.md`. Les anciennes limitations restent un historique, pas une description du nouvel environnement.

### Prérequis

- Git, Go 1.26+, GitHub CLI `gh` et une authentification ayant les droits d’administration du dépôt.
- Vérifier les branches et l’historique réels : `git status`, `git branch -avv`, `git remote -v`.
- Le dépôt doit exister. Pages gratuit nécessite un dépôt public avec GitHub Free ; aucune modification automatique de visibilité. Si le dépôt est privé, décider d’abord entre une offre GitHub compatible et un dépôt public séparé destiné à l’aperçu. Aucune offre payante n’est souscrite.
- Inviter la collaboratrice avec le rôle adapté si elle doit relire les PR ; aucun compte ou invitation n’a été inventé ou envoyé.

Si le répertoire local est déjà un checkout : conserver l’historique et vérifier que `origin` pointe vers `git@github.com:Etw0Dragon/hoslink.git`. Ajouter `origin` seulement s’il manque. Ne pas employer de `push --force`.

Si ce n’est réellement pas encore un checkout : cloner le dépôt dans **un nouveau répertoire**, puis y reporter les fichiers du projet en excluant `.git`, `.env`, `.aws`, `.codex`, `.agents`, `var`, `bin`, `dist` et les sauvegardes. Ne pas écraser le `.git` du clone. Ne faire `git init -b main` que si l’on a vérifié que le dépôt distant est neuf et qu’aucun historique n’est à conserver.

### Préparer le commit

Sur une branche `main` existante ou correctement créée à partir de l’historique distant, vérifier les changements et les secrets avant d’ajouter les **chemins explicites** :

```sh
# Adapter le choix des fichiers aux modifications présentes ; ne pas utiliser git add . aveuglément.
git add .agent .github .gitignore .dockerignore Makefile README.md scripts/configure-github.sh
git add cmd/preview internal/preview web/templates.go internal/app/app.go web/static/app.css web/static/preview.css
git diff --cached --stat
git diff --cached --check
# Inclure aussi les changements Hoslink précédents s’ils ne sont pas encore committés, après revue.
git commit -m "ci: add GitHub Pages preview and PostgreSQL checks"
```

Les dossiers d’outillage locaux `.aws/`, `.codex/`, `.agents/` sont ignorés ; `.env`, exports et sauvegardes aussi. `.gitignore` n’enlève pas un secret déjà présent dans l’historique : vérifier la liste suivie et traiter un secret déjà publié en le révoquant. Ne jamais copier le contenu d’un fichier secret dans un ticket.

### Appliquer la configuration préparée

```sh
gh auth login
sh scripts/configure-github.sh
```

Le script vérifie que le dépôt est public, que l’arbre est propre et que `origin` correspond au dépôt attendu. Il récupère l’historique, crée `backend` depuis `main` si elle n’existe ni localement ni sur le distant, et pousse `main` et `backend` sans écrasement. Une branche backend distante existante est conservée. Il configure ensuite :

- `main` comme branche par défaut ; suppression des branches de travail après fusion.
- Pages avec **Source : GitHub Actions**, pas « Deploy from a branch ».
- Environnement `github-pages` avec politique explicite `main`. Les politiques préexistantes sont affichées, pas supprimées : retirer manuellement toute autre autorisation indésirable dans Settings → Environments.
- Protection de `main` et `backend` : PR, approbation configurable, CI `Go and PostgreSQL`, branche à jour, discussions résolues, historique linéaire, aucun force push ni suppression ; administrateurs inclus.
- Relance du workflow Pages sur `main`.

**Attention opératoire :** le script remplace les paramètres de protection des deux branches par cette politique ; relire sa section JSON avant exécution si le dépôt possède déjà des règles. Par défaut, aucune approbation tierce n’est obligatoire pour ne pas bloquer le porteur seul ; PR, CI et discussions résolues restent obligatoires. Une fois la collaboratrice habilitée, lancer `HOSLINK_REQUIRED_APPROVALS=1 sh scripts/configure-github.sh` pour exiger une approbation. Le script ne règle ni visibilité, ni accès de la collaboratrice, ni abonnement.

Il s’arrête au premier échec sans annuler les étapes précédentes. Après correction, il peut être relancé ; vérifier les politiques d’environnement affichées. Les protections existantes peuvent empêcher le premier push : intégrer la préparation par PR dans ce cas.

Contrôler ensuite les workflows `CI` et `Pages` dans Actions et le lien dans Settings → Pages. Un workflow préparé localement ne prouve pas que GitHub l’a exécuté.

## Travail quotidien sans divergence

### Changement frontend

```sh
git switch main
git pull --ff-only
git switch -c feat/accueil
# modifier web/templates et web/static, puis vérifier
go test ./internal/preview ./web
git add <fichiers-revus>
git commit -m "feat: improve homepage"
git push -u origin feat/accueil
# ouvrir une PR vers main ; CI + relecture ; fusion squash ou rebase
```

Après fusion, Pages se met à jour automatiquement. Partager l’URL constante à la collaboratrice. Pour ses retours, ouvrir une issue avec URL, commit/date, navigateur, étapes et capture éventuelle ; les modèles sont fournis.

### Travail backend

Créer une branche courte depuis `backend`, puis PR vers `backend`. Ramener régulièrement `main` dans `backend` via une **PR `main` → `backend` avec fusion rebase** pour reprendre le frontend et garder l’historique linéaire. Ne pas utiliser un merge commit si la protection d’historique linéaire est active. Pour éviter les conflits et les gros lots, maintenir les changements backend courts et les réintégrer dans `main` par PR quand ils passent les tests. Une modification de template faite côté backend doit être réintégrée sur `main` pour apparaître sur Pages.

**Ne jamais recopier manuellement les templates entre branches.** La branche backend est une branche d’intégration temporaire, pas une seconde source de vérité à conserver divergente pendant des mois. Si elle n’a plus de travail spécifique, la réaligner par une PR, sans force push. Le maintien durable d’un backend privé demande un second dépôt.

## Recette locale du site statique

```sh
go test ./internal/preview ./web
# Le dossier de sortie doit être neuf : aucune suppression automatique.
go run ./cmd/preview -out .preview/hoslink -base-path /hoslink
python3 -m http.server 4173 --directory .preview
# ouvrir http://localhost:4173/hoslink/
```

Pour reconstruire, supprimer **uniquement l’export jetable** `.preview/hoslink` ou choisir un nouveau dossier. L’exporteur refuse toute destination existante pour ne pas effacer un checkout accidentellement. `make preview` génère dans `dist`, `make preview-test` contrôle l’export ; `PAGES_BASE_PATH` et `PAGES_OUT` sont surchargeables. Le Makefile charge le `.env` pour les commandes backend historiques ; le générateur n’en utilise aucune valeur.

Vérifier ordinateur/mobile, logo, fontes, photos, vidéo, ancres, navigation, états vides et absence d’envoi. Les tests automatisés couvrent les liens locaux, les chemins imbriqués, les ressources CSS, les formulaires désactivés, l’absence de jetons/sources privées et le refus d’écraser une destination.

## Diagnostic et retour arrière

- **404 des images ou de la fonte** : vérifier `base_path`, le chemin du dépôt, l’export et la dernière exécution Pages.
- **Pages ne se lance pas** : le commit doit être poussé sur `main`, Actions activé et Pages configuré avec GitHub Actions.
- **Publication refusée** : vérifier les permissions du job, l’environnement et la politique de branche `main`.
- **CI bloquée** : lire le job `Go and PostgreSQL`, notamment le service PostgreSQL et les tests d’intégration ; ne pas ignorer les tests pour rendre le voyant vert.
- **Mauvaise version affichée** : vérifier le commit du déploiement dans Actions ; rechargement sans cache puis inspecter le workflow.
- **Régression** : PR de `git revert <commit>` sur `main`, fusion après CI ; Pages republie la version corrigée. Ne pas réécrire l’historique partagé.
- **Arrêter l’aperçu** : Settings → Pages → Unpublish site ; aucun backend à arrêter, aucune base à payer. Le dépôt reste accessible selon sa visibilité.

## Coûts et périmètre

Aucun service payant, hébergement backend, domaine, secret de paiement ni production métier n’est configuré. Pages est adapté à la démonstration publique. Les conditions et quotas GitHub peuvent évoluer ; vérifier le plan et la facturation du compte avant activation. L’application commerciale réelle devra être hébergée sur l’infrastructure du projet avec ses prérequis de sécurité, juridiques et de sauvegarde ; Pages ne remplace pas cela.

## Références officielles consultées le 11 novembre 2026

- [GitHub Pages : fonctionnement, disponibilité selon le plan et URL de projet](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Workflows personnalisés Pages : build, artefact, environnement et permissions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Source de publication Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

- [API des protections de branches](https://docs.github.com/en/rest/branches/branch-protection)
- [API des politiques de déploiement](https://docs.github.com/en/rest/deployments/branch-policies)
- [Options de configuration du dépôt avec GitHub CLI](https://cli.github.com/manual/gh_repo_edit)

## État vérifié après activation — 11 novembre 2026

- Dépôt public, branches `main` et `backend` poussées ; `main` par défaut.
- Aperçu publié et accessible : https://etw0dragon.github.io/hoslink/. HTTPS imposé, source GitHub Actions, environnement limité à `main`.
- [Première publication Pages réussie](https://github.com/Etw0Dragon/hoslink/actions/runs/43016395074).
- [CI complète PostgreSQL réussie sur GitHub](https://github.com/Etw0Dragon/hoslink/actions/runs/43016417032), en plus de la recette PostgreSQL locale.
- Protections appliquées à `main` et `backend` : PR et contrôle `Go and PostgreSQL` émis par l’application GitHub Actions officielle (ID 15368 vérifié par API), historique linéaire, discussions résolues, aucun force push ni suppression, administrateurs inclus ; zéro approbation tierce obligatoire au pilote.
- Permissions Actions par défaut en lecture, approbation de PR par Actions désactivée. Actions épinglées par SHA. Lien du site renseigné dans la présentation du dépôt.
- Vérification HTTP : 21 pages/ressources répondent 200, formulaires absents des pages publiées ; `.env`, sources serveur et fichier Go du logo répondent 404.
- GitHub CLI installé dans `~/.local/bin/gh` à partir de l’archive officielle vérifiée ; authentification locale hors dépôt. Aucun jeton committé.
- Aucun backend hébergé et aucune production métier ouverte. La documentation historique indiquant un blocage décrit la session antérieure, pas cet état vérifié.
