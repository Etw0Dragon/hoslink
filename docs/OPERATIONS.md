# Exploitation du pilote

## Prérequis d’ouverture

Immatriculer l’exploitant ; finaliser mentions légales, CGU, confidentialité, durées de conservation et procédure de contact. Recruter des professionnels pour une recette réelle. Les textes présents sont des indications de développement, pas les documents contractuels définitifs.

Définir la station et le budget. Héberger dans un environnement séparé du développement, placer le serveur derrière un proxy HTTPS, conserver la base sur un réseau privé et garder des secrets propres à la production. Ne pas exposer PostgreSQL publiquement. SMTP doit être configuré et testé (délivrabilité, liens et récupération).

Le compte admin est promu uniquement en ligne de commande. Les contrôles de représentation doivent être réalisés hors plateforme et consignés lors de la décision. Une procédure de rattachement exceptionnel doit vérifier l’identité avant toute modification des appartenances en base.

## Sauvegarde et restauration

Les pièces jointes sont dans PostgreSQL et sont incluses dans les dumps. Exécuter quotidiennement un dump PostgreSQL au format custom, le chiffrer avec l’outil de gestion de secrets choisi, et transférer le résultat dans un stockage indépendant du serveur. Ne pas conserver les mots de passe ou clés de chiffrement avec la sauvegarde.

Exemple de dump local depuis le conteneur :

```sh
umask 077
docker compose exec -T db pg_dump -U partenaires -d partenaires -Fc > sauvegarde.dump
```

Ce dump n’est pas encore chiffré : le chiffrer et transférer avant de considérer la sauvegarde comme terminée. Automatisation, chiffrement, destination et rétention sont à configurer avec les moyens d’hébergement retenus.

Tester sur une base vide séparée :

```sh
pg_restore --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" sauvegarde.dump
```

Vérifier les comptes, fiches, accords et téléchargement d’un PDF avec un compte autorisé. Consigner date, durée et résultat. Une sauvegarde non restaurée n’est pas un critère d’ouverture satisfait.

## Surveillance et limites

`GET /healthz` contrôle la connexion PostgreSQL et retourne 503 si indisponible. Collecter les logs structurés, surveiller erreurs, espace disque, latence et échécs SMTP. Les erreurs métier ne journalisent pas les mots de passe ou jetons.

Les emails de développement sont écrits en fichiers privés ; les supprimer selon la politique définie. Sessions et jetons expirés sont purgés chaque minute. Prévoir des tâches de conservation pour les autres données après validation des durées légales.

Le traitement de capacité verrouille tous les établissements pendant la réconciliation : adapté au pilote, à optimiser avant une forte volumétrie. Les conversations affichent actuellement les 500 premiers messages et les listes sont bornées ; ajouter une pagination avant montée en charge.

Les PDF subissent des contrôles de taille et de structure élémentaire et sont téléchargés comme pièces jointes privées. Cela ne remplace pas un antivirus ou une désinfection de contenu ; raccorder un scanner avant ouverture à un public non maîtrisé.

Le limiteur de tentatives est en mémoire, par adresse réseau, pour une instance ; définir le proxy de confiance et un stockage partagé avant plusieurs instances. Ne pas interpréter librement X-Forwarded-For.

La suppression/export RGPD, la suppression de compte et la gestion des demandes de rattachement sont des procédures administratives à établir pour le pilote. Les signalements et décisions sont consignés dans `audit` ; une console de consultation est disponible dans l’administration.

## Paiements futurs

Choisir le prestataire et les prix avant implémentation. Utiliser son checkout hébergé ; vérifier les signatures serveur, la devise, le montant et le produit côté serveur. Enregistrer les identifiants uniques des événements, traiter les doublons et ordres de réception, contrôler l’état chez le prestataire et réconcilier les droits. Tester échec, remboursement, résiliation et impayé dans son environnement de test. Ne jamais activer des places en se fiant à une redirection du navigateur.
