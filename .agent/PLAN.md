# Plateforme de partenariats B2B

## Objectif

Construire avec le porteur du projet Hotlink, un réseau privé français reliant tous les hôtels et les prestataires professionnels : bien-être, activités, location et services. Le positionnement et l’identité visuelle ne sont pas limités à la montagne.

## Décisions validées

- Nom : **Hoslink** ; destiné à tous les hôtels et prestataires, sans direction artistique de montagne (décision du 10 novembre 2026).
- France uniquement au lancement, interface française responsive.
- Annuaire réservé aux professionnels validés manuellement.
- Une entreprise peut posséder plusieurs établissements ; chaque établissement a sa fiche, son équipe et sa capacité de partenaires.
- Les hôtels comme les prestataires sont soumis aux mêmes limites commerciales.
- Deux partenaires actifs gratuits par établissement.
- Achat unique de places permanentes supplémentaires ou abonnement mensuel illimité. Prix à définir avant commercialisation.
- Une place achetée est réutilisable lorsqu’un partenariat prend fin.
- Un accord ne devient actif que lorsque les deux côtés l’acceptent et disposent chacun d’une place.
- Discussions et demandes de devis libres ; devis sous forme de PDF joints.
- Accords prévoyant réductions clients et/ou commissions entre partenaires.
- Ventes, commissions, contrats de prestation et règlements entre partenaires suivis hors plateforme.
- Après résiliation de l’abonnement, choix des accords à conserver ; suspension des autres avec historique conservé.
- Backend Go et base hébergée sur le serveur du projet souhaités.
- Aucune entreprise exploitante créée à ce jour.

## Parcours et autorisations

1. Création d’un compte personnel, vérification de l’email et rattachement à une entreprise et un établissement.
2. Saisie du SIRET, des informations professionnelles et du rôle du représentant.
3. Contrôle administratif de l’entreprise et de l’autorisation du représentant, puis publication de la fiche et accès au réseau.
4. Recherche par catégorie et localisation, consultation d’une fiche, conversation et demande de devis.
5. Proposition de conditions de partenariat et acceptation bilatérale. Vérification transactionnelle des capacités au moment de l’activation.
6. Consultation des accords, achat de capacité ou gestion de l’abonnement.

Rôles proposés : responsable d’établissement, collaborateur et administrateur plateforme. Les collaborateurs consultent et échangent ; les responsables invitent, acceptent les accords et gèrent la facturation. Les administrateurs valident et modèrent, avec accès sensible journalisé.

Une entreprise déjà enregistrée ne doit pas pouvoir être revendiquée simplement en saisissant son SIRET. Prévoir une procédure manuelle de rattachement et de récupération d’accès.

## Règles commerciales proposées à confirmer avant développement de la facturation

- Capacité hors abonnement : deux places gratuites plus les places achetées.
- Une relation active unique par paire d’établissements ; les demandes réciproques ne créent pas deux accords.
- Modification des conditions : nouvelle acceptation des deux parties, conservation des versions précédentes.
- Résiliation effective à la fin de la période payée. Sans choix du responsable, conserver les accords les plus anciens dans la capacité disponible.
- Suspension : accès à l’historique et aux messages maintenu, accord marqué inactif dans le service. Elle ne résilie pas automatiquement les obligations contractuelles externes.
- Réactivation : capacité disponible et confirmation des deux parties.
- Paiements portant uniquement sur les services de la plateforme, via une page hébergée par un prestataire de paiement. Aucun stockage de carte.
- Droits activés uniquement après confirmation serveur authentifiée ; notifications de paiement traitées de manière idempotente.
- Fixer les prix HT, la TVA applicable, les remboursements et le traitement des impayés avant ouverture des ventes.

## Architecture proposée

Monolithe modulaire Go, PostgreSQL et interface web rendue côté serveur avec JavaScript ciblé. Ces choix détaillés sont des propositions techniques, pas des exigences exprimées par le porteur.

Modules : identité, organisations et équipes, annuaire, conversations et documents, partenariats, facturation et administration.

Entités principales : utilisateur, entreprise, établissement, appartenance et rôle, conversation, message, pièce jointe, demande de devis, partenariat et version des conditions, achat de place, abonnement, événement de paiement et événement d’audit.

Toutes les opérations vérifient côté serveur l’identité, le rôle et l’établissement autorisé. Les transitions de partenariat et de capacité utilisent des transactions et contraintes en base pour résister aux requêtes simultanées.

Base et documents privés non exposés directement sur Internet. Téléchargements autorisés par établissement, limites de taille et de type des fichiers, contrôle des contenus avant mise à disposition. Sessions sécurisées, protection CSRF, limitation des tentatives de connexion et récupération de compte à jetons expirants.

Infrastructure initiale : un serveur applicatif avec PostgreSQL, HTTPS, service d’envoi d’emails et sauvegardes chiffrées quotidiennes hors serveur. Séparer les environnements de développement et production. Tester la restauration avant ouverture. Ne pas introduire de microservices pour le pilote.

## Cadre juridique à préparer

Le SIREN identifie l’entreprise, le SIRET un établissement. Exiger le SIRET avant publication est une règle d’admission proposée, pas une obligation universelle d’ouverture de compte. Un numéro public ne prouve pas le pouvoir du représentant.

Avant commercialisation : immatriculer l’exploitant, préparer mentions légales, CGU, conditions de vente des places et abonnements, règles de modération et répartition des responsabilités. Faire vérifier les clauses de commissions d’apport d’affaires et la qualification exacte du service selon son fonctionnement final.

RGPD : identifier les traitements et leurs bases légales, informer dès la collecte, limiter les données, fixer les durées de conservation, gérer les droits et encadrer les sous-traitants. Prévoir la conservation légale des factures indépendamment de la fermeture d’un compte. Éviter les traceurs non essentiels au pilote ; examiner leur régime avant tout ajout.

Sources officielles consultées pendant le cadrage :
- https://entreprendre.service-public.gouv.fr/vosdroits/F31190
- https://annuaire-entreprises.data.gouv.fr/definitions/numero-siret
- https://entreprendre.service-public.gouv.fr/vosdroits/F37351?lang=fr
- https://www.cnil.fr/fr/comprendre-le-rgpd/les-six-grands-principes-du-rgpd

Ces éléments sont un cadrage ; ils ne constituent pas une validation juridique exhaustive du modèle.

## Validation et critères d’ouverture

- Refus d’accès aux messages et documents d’un autre établissement, y compris par URL directe.
- Inscription, validation, invitations, récupération de compte et séparation des rôles opérationnelles.
- Impossible de dépasser les places par acceptations simultanées ou requêtes répétées.
- Gestion correcte des paiements échoués, dupliqués et reçus dans le désordre.
- Résiliation, choix des accords conservés, suspension et réactivation vérifiés.
- Documents privés, limites d’envoi et restauration de sauvegarde vérifiés.
- Recette avec au moins un hôtel et un prestataire sur le parcours complet.
- Vérification de la charge sur les parcours réels ; objectifs chiffrés à fixer après estimation des utilisateurs simultanés.

## Décisions restantes avant les lots concernés

Périmètre du pilote ; budget d’hébergement et date cible ; identité de l’exploitant ; prix et politique d’impayés/remboursements ; prestataires de paiement et d’email ; durées de conservation ; volumétrie et objectifs de disponibilité.

Ces inconnues n’empêchent pas de commencer les comptes et l’annuaire. Elles doivent être résolues avant achat de services, mise en production ou activation de la facturation selon leur nature.

## Choix d’implémentation de cette première version

Nom validé le 10 novembre 2026 : **Hoslink**. Public : tous les hôtels et prestataires, sans identité de montagne. Le code utilise Go et PostgreSQL avec rendu HTML côté serveur. Les propositions de règles de capacité ci-dessus sont implémentées comme valeurs par défaut ; la facturation externe reste désactivée jusqu’aux décisions commerciales.

Les fichiers PDF sont stockés dans PostgreSQL pour simplifier l’isolation et les sauvegardes du pilote. Le contrôle initial est limité à la taille et à la structure élémentaire du PDF : ajouter un scanner avant ouverture à un public non maîtrisé.

L’état vérifié et les travaux restant à faire sont tenus dans ROADMAP.md. La présence du code ne vaut pas validation d’une recette PostgreSQL ou d’un lancement juridique.

## Évolution frontend demandée le 10 novembre 2026

La refonte B2B conserve le rendu Go côté serveur et les routes métier. Un tableau de bord privé en lecture seule agrège l’activité de l’établissement courant ; il ne change pas les règles d’accès ou de capacité. Le composant de carte et les pages sont désormais répartis dans les templates HTML. Les filtres de distance, types structurés et préférences restent hors implémentation tant que les données correspondantes ne sont pas disponibles. Les limites de validation PostgreSQL et navigateur sont consignées dans ROADMAP.md.

## Direction frontend précisée par le porteur

Le 10 novembre 2026, le porteur juge la première refonte trop proche de l’existant et demande une inspiration Comet/Malt, avec recherche, images et vidéo si possible. Il choisit des scènes variées du tourisme. La nouvelle composition conserve le nom et la palette Hotlink ; les médias sont des illustrations, sans faux établissements ou témoignages. L’annuaire reste privé. La page publique est accessible sur `/presentation`, même après connexion.

## Accueil — référence précisée le 11 novembre 2026

Le porteur demande les couleurs bleu nuit/or et la recherche arrondie de la variante en bas à gauche de sa maquette, avec la disposition de la variante en haut à droite : navigation horizontale, texte à gauche, composition photographique en arche à droite et bandeau de quatre entrées sous le héros. Le nom validé Hotlink est conservé. Cette évolution concerne l’accueil public ; les règles d’accès au réseau restent inchangées.

## Nom et logo validés le 11 novembre 2026

Le porteur renomme le site **Hoslink** (remplace Hotlink). Le logo PNG fourni est déplacé dans `public/logo.png`, servi sur `/public/logo.png` et intégré dans l’en-tête public, la navigation privée et le pied de page. Son ratio original est conservé.

## GitHub et aperçu gratuit — décision du 11 novembre 2026

Le porteur demande GitHub Pages depuis `main` et une branche `backend` pour l’application complète ; dépôt fourni : `git@github.com:Etw0Dragon/hoslink.git`. L’aperçu statique est construit depuis les mêmes templates, sans base ni serveur applicatif hébergé, avec états vides et formulaires désactivés. Les sources partagées restent dans l’historique commun ; seule la sortie statique est publiée.

Les commits frontend deviennent visibles après push/fusion sur `main` et succès du workflow Pages. CI Go/PostgreSQL sur `main`, `backend` et PR ; PR et relecture recommandées. Une branche du même dépôt ne rend pas le backend privé. Visibilité du dépôt non confirmée, aucune transformation en dépôt public autorisée par défaut. Configuration et procédures détaillées dans `.agent/GITHUB.md`. L’accès Git/réseau étant indisponible dans cette session, création des branches et activation distante restent à effectuer via le script préparé dans un terminal autorisé.

## Application GitHub après full access — 11 novembre 2026

Le porteur a explicitement autorisé l’exécution de la configuration préparée. Le dépôt distant est vérifié public et sans références Git ; aucun changement de visibilité n’est nécessaire. L’accès SSH et le réseau fonctionnent ; initialisation d’un historique local `main` autorisée dans ce répertoire sans `.git`. La base PostgreSQL de développement existante est accessible : les trois tests d’intégration passent. La connexion GitHub CLI officielle a été validée et les branches `main` et `backend` poussées. La configuration du pilote impose PR et CI ; l’approbation tierce est optionnelle tant qu’aucune collaboratrice habilitée n’est configurée.
