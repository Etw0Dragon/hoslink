# Exploitation Node / Coolify

## Variables

Ne jamais réutiliser la base Go. Créer une base PostgreSQL 18 vide et un rôle dédié. Le migrateur refuse la table historique `users` et n’exécute ni suppression ni import.

| Variable | Usage |
| --- | --- |
| `NODE_ENV` | `production` sur Coolify ; `development` ou `test` ailleurs |
| `BASE_URL` | Origine exacte, `https://hoslink.tmfolio.site` en production |
| `DATABASE_URL` | Connexion privée PostgreSQL 18 à `hoslink_node` |
| `BETTER_AUTH_SECRET` | Secret aléatoire d’au moins 32 caractères, stable et sauvegardé séparément |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL injecté à Compose ; hexadécimal conseillé |
| `PORT` | 8080 par défaut |
| `SMTP_URL` | URL SMTP/SMTPS avec identifiants encodés ; obligatoire en production |
| `MAIL_FROM` | Adresse expéditrice autorisée par le service SMTP |
| `MAIL_DIR` | Boîte locale sur disque, développement uniquement, jamais publique |
| `TEST_DATABASE_URL` | Base distincte `hoslink_ts_test` ou `hoslink_ts_test_<suffixe>`, tests uniquement |

Variables obligatoires et format des URL sont validés au démarrage. Les valeurs ne sont jamais à committer. Garder `.env.node` en mode 0600. Prévoir SPF/DKIM/DMARC chez le fournisseur d’email et vérifier les liens reçus sur le domaine final. Le secret Better Auth protège aussi les secrets 2FA chiffrés : sa perte compromet la restauration des authentificateurs.

## Préparer Coolify

1. Importer ce dépôt comme application Docker Compose avec `compose.yaml`, sans `compose.dev.yaml` en production. Définir les secrets et `NODE_ENV=production` dans Coolify. Conserver les noms/identifiants de volumes entre déploiements. Ne rattacher aucun volume de l’ancienne application.
2. PostgreSQL reste sur le réseau privé sans port publié. Raccorder le proxy Coolify au service `app`, port 8080, et configurer le domaine final avec TLS. Le service `migrate` doit finir avec code 0 avant `app`.
3. Exécuter les migrations explicitement avant chaque démarrage / livraison. En CLI : `docker compose --env-file .env.node run --rm migrate`, puis `docker compose --env-file .env.node up -d app`. Dans Coolify, vérifier le succès du service `migrate` et forcer sa recréation à chaque livraison pour ne pas réutiliser un ancien succès. Le serveur ne crée pas le schéma automatiquement.
4. Vérifier `/healthz` (requête réelle en base), emails, cookies `Secure`, absence de ports DB publics, accès privés et réception des signaux d’arrêt. Le serveur arrête son worker et ferme le pool sur SIGTERM/SIGINT.
5. Créer le compte administrateur, confirmer son email, puis lancer dans un conteneur de construction disposant de TypeScript : `npm run admin -- email@example.fr`, ou dans l’image de production : `node dist/admin.js email@example.fr`. Le compte ne pourra accéder aux pages privées qu’après activation confirmée du 2FA.
6. Tester une recréation du conteneur applicatif et vérifier comptes, documents et accords. Les tables et documents persistent dans `hoslink_ts_pg18`. Ne pas exécuter `docker compose down -v` sur un environnement à conserver.

L’image exécute Node 24 sans root. Les dépendances sont verrouillées par `package-lock.json` ; Docker et la CI utilisent `npm ci`.

## Sauvegarde et restauration

Sauvegarder PostgreSQL chaque jour vers un emplacement chiffré hors serveur, avec rétention définie. Les documents privés sont inclus. Sauvegarder séparément les variables et le secret Better Auth avec accès restreint. Un dump local non chiffré est un intermédiaire sensible, pas une sauvegarde finale.

```sh
umask 077
docker compose --env-file .env.node exec -T db pg_dump -U hoslink -d hoslink_node -Fc > hoslink.dump
# Chiffrer puis transférer vers le stockage hors serveur choisi.
```

Pour tester une restauration, créer une base **nouvelle** avec un nom distinct sur PostgreSQL 18, puis :

```sh
# La base hoslink_restore doit avoir été créée explicitement.
docker compose --env-file .env.node exec -T db pg_restore -U hoslink -d hoslink_restore --no-owner --exit-on-error < hoslink.dump
```

Démarrer une instance isolée avec cette URL, une URL applicative de recette, le secret sauvegardé et les envois SMTP désactivés au profit d’une boîte locale. Vérifier connexion/2FA, PDF, accords et réconciliation. Conserver la preuve de restauration avant ouverture. Pour un retour arrière après modification du schéma, restaurer dans une nouvelle base ; ne pas lancer une ancienne application sur un schéma supposé compatible.

## Bascule du domaine

La configuration distante attend les accès Coolify et DNS. Avant bascule, vérifier l’application avec le domaine final (résolution locale adaptée) et effectuer la recette complète. Aucun compte ou document de l’ancienne base n’est importé ; prévenir les utilisateurs de la création de nouveaux comptes.

Réduire le TTL, relever les DNS et réglages Pages existants, configurer le domaine/TLS dans Coolify, puis remplacer le CNAME GitHub Pages par l’enregistrement demandé par Coolify. Après propagation, vérifier HTTPS, `/healthz`, CSS, médias, inscription, vérification, récupération et 2FA depuis un navigateur externe. Retirer le domaine des réglages GitHub Pages et désactiver Pages lorsqu’aucune résolution ne le vise encore. Les fichiers locaux n’effectuent aucune de ces actions distantes.

La CI conserve provisoirement le nom du contrôle requis `Go and PostgreSQL` pour ne pas bloquer les protections existantes ; ses étapes exécutent désormais TypeScript, les tests PostgreSQL et Docker. Renommer le contrôle et mettre à jour les protections ensemble lors de la prochaine intervention GitHub autorisée.

## Limites et ouverture

Achats désactivés. Préparer exploitant, mentions légales, CGU/confidentialité, durées de conservation, procédures RGPD, modération et rattachement exceptionnel. Ajouter un contrôle antivirus des PDF avant ouverture non maîtrisée. Le limiteur Better Auth en mémoire convient à une instance pilote ; prévoir un stockage partagé avant plusieurs réplicas ou un proxy distribué, avec configuration IP fiable. Ne pas se fier à des en-têtes IP envoyés directement par le public.

Les migrations ne modifient jamais des migrations déjà appliquées : elles vérifient leur empreinte. Créer un nouveau fichier SQL pour chaque évolution. La réconciliation utilise un verrou transactionnel global, puis les verrous d’établissements en ordre croissant, comme les acceptations. Surveiller les erreurs de worker, l’espace DB, les échecs SMTP et l’état des sauvegardes sans journaliser les corps de requête, secrets ni liens personnels.

## Installation sur un serveur Coolify neuf

Dans Coolify, valider le serveur et son proxy dans **Servers**, puis créer **Projects → New Project → Production → New Resource → Public Repository**. Utiliser `https://github.com/Etw0Dragon/hoslink`, sélectionner la branche de la migration indiquée dans la pull request (ou `main` une fois fusionnée), choisir **Docker Compose**, base `/`, fichier `/compose.yaml`. Ne pas sélectionner `compose.dev.yaml`. Charger le Compose ; les trois services `db`, `migrate` et `app` doivent apparaître.

Dans **Environment Variables**, définir `NODE_ENV=production`, `BASE_URL=https://hoslink.tmfolio.site`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `SMTP_URL`, `MAIL_FROM`. Générer deux valeurs indépendantes avec `openssl rand -hex 32` pour le mot de passe PostgreSQL et le secret Better Auth. Le Compose construit `DATABASE_URL` automatiquement ; ne pas renseigner l’URL localhost de développement. Ne pas activer « Build Variable » pour les secrets d’exécution.

Dans **Domains**, ajouter HTTPS, hôte `hoslink.tmfolio.site`, service **app**, port interne **8080**, chemin vide. Si la version de Coolify présente un champ unique, saisir `https://hoslink.tmfolio.site:8080` pour `app`. Ne donner aucun domaine à `db` ou `migrate`. Le port 8080 ne doit pas être ouvert publiquement.

Chez le fournisseur DNS, remplacer le CNAME `hoslink` vers GitHub Pages par un enregistrement **A** `hoslink` vers l’IPv4 publique du serveur. Ne conserver un AAAA que si l’IPv6 du serveur est configurée. Les ports entrants 80/443 doivent atteindre le proxy Coolify. Déployer et consulter les logs : PostgreSQL prêt, `migrate` terminé avec code 0, `app` sain. Vérifier `https://hoslink.tmfolio.site/healthz`, puis créer et confirmer un compte avec le SMTP configuré.

Documentation officielle consultée : https://coolify.io/docs/applications/configuration/general et https://coolify.io/docs/core/networking/domains.

### Échec de compilation `tsc: not found` / code 127

Coolify peut injecter `NODE_ENV=production` pendant la construction. Le Dockerfile utilise explicitement `npm ci --include=dev` dans l’étape de compilation, puis retire les dépendances de développement avant l’image finale. Garder `NODE_ENV=production` pour l’exécution. Dans Coolify, les secrets SMTP, base et Better Auth sont des variables d’exécution : désactiver leur option Build Variable. `requireTLS` n’est pas une variable séparée ; `?requireTLS=true` fait partie de la même ligne `SMTP_URL` avec le port 587.
