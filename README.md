# Hoslink

Réseau professionnel privé français pour hôtels et prestataires. Monolithe TypeScript, Hono (JSX côté serveur, sans React), Better Auth, Drizzle avec `pg`, Node.js **24**, PostgreSQL **18**. Les achats sont désactivés.

La migration utilise une **nouvelle base vide**, sans transfert de comptes. Les anciens cookies Go ne sont pas reconnus. Le migrateur refuse une base contenant l’ancienne table `users`. L’ancien `.env` et l’ancien volume PostgreSQL ne sont pas utilisés ; ne pas les supprimer.

## Développement

```sh
cp .env.example .env.node
# Remplacer les deux valeurs aléatoires et les mots de passe des URL.
# Par exemple : openssl rand -hex 32 (générer deux valeurs distinctes).
npm install
make db
npm run migrate
npm run build
npm run dev
```

Utiliser Node 24. PostgreSQL de développement est publié sur `127.0.0.1:55432`, l’application sur `http://localhost:8080`. `make db` utilise exclusivement le nouveau volume `hoslink_ts_pg18` et crée `hoslink_node` et `hoslink_ts_test`. Les emails sont écrits en fichiers privés dans `var/mail` si `SMTP_URL` est absent. Ne jamais publier ce répertoire. Les liens de vérification sont gérés par Better Auth ; après vérification, se connecter sur `/connexion`.

```sh
npm run typecheck
npm test                           # unitaires ; intégration ignorée sans TEST_DATABASE_URL
make test-integration              # charge .env.node, utilise la base de test dédiée
npm run build
npm start
npm run admin -- personne@example.fr
```

La dernière commande exige un compte dont l’email est vérifié et révoque ses sessions. Sa prochaine connexion passe par `/securite` ; les routes privées sont bloquées côté serveur jusqu’à confirmation d’un code Authenticator. La même page permet la configuration facultative du 2FA, l’affichage initial des codes de secours, la désactivation avec mot de passe et la révocation des sessions. Chaque code de secours est à usage unique. Les QR codes sont générés dans le navigateur, sans service externe.

## Architecture

- `src/auth.ts`, `src/browser/auth.ts` : serveur et client Better Auth, monté sur `/api/auth/*`, emails, sessions en base, vérification, récupération et 2FA.
- `src/db/schema.ts`, `migrations/` : modèles Drizzle et migrations SQL versionnées avec empreintes et verrou de migration. Tables `auth_*` séparées des profils métier. Une vue de lecture `users` joint les profils et identités ; elle ne contient aucun mot de passe.
- `src/business.ts` : établissements, équipes, invitations, conversations, PDF et administration. Validation Zod et autorisations côté serveur.
- `src/partnerships.ts` : acceptations bilatérales, versions, priorités et expiration. Les établissements sont verrouillés dans un ordre stable avant toute activation. La réconciliation périodique utilise un verrou PostgreSQL pour coordonner les instances.
- `src/views/` et `src/queries.ts` : rendu Hono et projections des requêtes d’origine. Le HTML, CSS, médias et routes existants sont conservés. Le JavaScript d’authentification est compilé localement dans `web/static/auth.js`.

Les PDF restent en PostgreSQL, limités à 5 Mo avec contrôle élémentaire `%PDF-`/`%%EOF`. Chaque téléchargement vérifie l’appartenance à la conversation. Seuls `web/static/` et le logo public sont servis comme ressources. Les contrôles de contenu ne remplacent pas un antivirus pour une ouverture à un public non maîtrisé.

Les mutations métier exigent une origine exacte et un jeton CSRF ; Better Auth applique sa propre protection sur ses routes. Les rôles et appartenances ne sont jamais acceptés depuis les formulaires d’inscription. Les invitations métier nécessitent la session d’un compte vérifié avec l’email destinataire. Les filtres de recherche sont conservés 30 minutes après une connexion, sans redirection vers une URL arbitraire.

## Recette avant bascule

Depuis une base de test vide, lancer `make test-integration`. La suite couvre migrations réexécutables, vérification d’email, 2FA, codes incorrects et codes de secours à usage unique, obligation administrateur, rôles, invitations, isolation des conversations/PDF, capacités simultanées, versions et expiration. Les tests n’effacent aucune base : pour une nouvelle exécution utiliser une nouvelle base `hoslink_ts_test_<suffixe>` ou conserver les données de recette.

En complément, avec deux comptes vérifiés : créer deux établissements, attribuer l’administration à un compte, configurer le 2FA, valider les fiches avec justification, chercher puis démarrer une conversation, joindre et télécharger un PDF, proposer et accepter un accord des deux côtés. Tester le renvoi d’email et la récupération du mot de passe depuis les emails locaux, puis vérifier que les anciennes sessions sont refusées. Sur ordinateur et mobile, comparer accueil, navigation, médias, formulaires, filtres et historique à l’aperçu actuel. Vérifier aussi SMTP réel, restauration de sauvegarde et persistance après recréation du conteneur applicatif.

## Coolify

Cible : **https://hoslink.tmfolio.site**. Les fichiers sont préparés ; aucun déploiement distant, changement DNS ou changement de réglage Pages n’est effectué par cette migration. Voir [les opérations](docs/OPERATIONS.md) pour variables, déploiement, sauvegardes, restauration et bascule depuis GitHub Pages. Le workflow Pages et l’export Go ont été retirés. L’historique des décisions reste dans [.agent/PLAN.md](.agent/PLAN.md) et [.agent/ROADMAP.md](.agent/ROADMAP.md).

Sources techniques : [Hono et Better Auth](https://hono.dev/examples/better-auth), [Two Factor](https://better-auth.com/docs/plugins/2fa).
