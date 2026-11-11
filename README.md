# Hoslink

Nom de travail d’une plateforme B2B privée entre hôtels et prestataires locaux. Monolithe Go, PostgreSQL, HTML rendu côté serveur. Interface française responsive, sans dépendance JavaScript ni police externe.

## Aperçu frontend sur GitHub Pages

Dépôt : `git@github.com:Etw0Dragon/hoslink.git`. `main` publie uniquement l’export statique ; `backend` sert au travail sur l’application complète, sans hébergement backend automatique. Les mêmes templates servent aux deux modes. L’aperçu permet de parcourir les pages sans compte ni base ; les formulaires sont désactivés.

La procédure complète, les branches, la CI PostgreSQL, les réglages GitHub, les limites de gratuité et le suivi sont documentés dans [.agent/GITHUB.md](.agent/GITHUB.md). L’état de la configuration distante et les vérifications effectuées sont consignés dans `.agent/ROADMAP.md`.

```sh
make preview-test
go run ./cmd/preview -out .preview/hoslink -base-path /hoslink
python3 -m http.server 4173 --directory .preview
# http://localhost:4173/hoslink/
```

## Démarrage local

Prérequis : Go 1.26 ou supérieur, PostgreSQL 18 (ou Docker Compose).

```sh
# Le .env local est déjà préparé ; Make le charge automatiquement.
make db
make run
```

Sur une nouvelle copie du projet, copier `.env.example` vers `.env` et remplacer `CHANGE_ME` dans les trois variables PostgreSQL par le même mot de passe. Le `.env` est ignoré par Git.

`make db` démarre PostgreSQL et crée aussi `partenaires_test`, y compris avec un volume déjà initialisé. La base applicative `partenaires` reste séparée. Si le volume existant utilise un ancien mot de passe, conserver ce mot de passe dans `.env` : changer une variable ne change pas le mot de passe d’un volume existant.

Ouvrir http://localhost:8080. Les migrations versionnées sont appliquées au démarrage avec verrou de migration. `go run ./cmd/server migrate` applique uniquement les migrations.

Sans Docker, créer la base avec PostgreSQL puis renseigner `DATABASE_URL`. Pour exécuter aussi l’application dans Docker : `docker compose --profile app up --build`.

## Premier parcours

1. Créer un compte sur `/inscription`.
2. En développement, lire le lien dans un fichier `var/mail/*.eml`, puis confirmer l’email. Ces fichiers contiennent des liens privés, ne pas les partager.
3. Se connecter et soumettre un établissement avec un vrai SIRET valide.
4. Donner le rôle administrateur au compte vérifié :

   ```sh
   go run ./cmd/server admin votre-email@example.fr
   ```

5. Valider le dossier dans `/administration` en consignant la vérification du représentant.
6. Créer un second compte et établissement, valider, puis essayer recherche, messages, PDF et partenariat dans deux navigateurs ou sessions distinctes.

L’envoi SMTP est utilisé si `SMTP_ADDR` est renseigné. En production, `APP_ENV=production`, une `BASE_URL` HTTPS et SMTP sont obligatoires. Les cookies deviennent alors Secure. Ne pas activer le mode production derrière un accès HTTP.

## Fonctionnalités

Comptes et vérification d’email, renvoi de lien, réinitialisation du mot de passe avec révocation des sessions, entreprises et établissements, invitations et équipes, validation manuelle, annuaire privé et filtres, signalements, conversations et demandes de devis, PDF privés (5 Mo), accords versionnés avec historique, acceptations bilatérales et contrôle transactionnel de la capacité.

Deux places gratuites par établissement. Le modèle conserve les places achetées et l’échéance d’abonnement ; un traitement périodique suspend les accords dépassant la capacité après expiration. La priorité de conservation est choisie dans les partenariats, puis les plus anciens sont conservés. Les opérations de capacité prennent les verrous dans le même ordre.

Les achats sont **désactivés**. Aucun faux paiement ni fournisseur arbitraire n’est installé : prix, prestataire, TVA, impayés et remboursements restent à finaliser avant l’intégration. Les pages juridiques affichent explicitement leur statut de préparation.

## Vérification

```sh
make test
make build
# Utilise TEST_DATABASE_URL du .env :
make test-integration
```

Avec le `.env` chargé, `make test` exécute aussi les tests PostgreSQL : démarrer la base avec `make db` au préalable. Les commandes `go run` directes nécessitent de charger les variables (`set -a; . ./.env; set +a`).

Les tests d’intégration créent un schéma isolé temporaire et le détruisent. Sans `TEST_DATABASE_URL`, ils sont explicitement ignorés. Les autres tests couvrent rendu HTML, protections de formulaires, accès anonyme et validation des documents.

## Exploitation

Consulter [docs/OPERATIONS.md](docs/OPERATIONS.md), [.agent/PLAN.md](.agent/PLAN.md) et [.agent/ROADMAP.md](.agent/ROADMAP.md). Aucun déploiement public n’a été effectué.

### Voir la nouvelle interface

Après modification du frontend, arrêter le serveur avec Ctrl+C puis lancer `make run` : les templates et médias sont embarqués dans le binaire Go, sans rechargement à chaud. Ouvrir **http://localhost:8080/presentation** pour voir le nouvel accueil, même avec un compte connecté. Le chemin `/` peut rediriger vers l’espace privé. L’annuaire et les fiches utilisent aussi les nouveaux visuels.

Si vous lancez `bin/partenaires`, exécuter `make build` avant de redémarrer ce binaire. Avec Docker : `docker compose --profile app up -d --build app`. Recharger le navigateur avec Ctrl+Maj+R. Les médias sont locaux ; la recherche de l’accueil conserve ses filtres à la connexion, mais les résultats restent réservés aux établissements validés.
