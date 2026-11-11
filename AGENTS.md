# Instructions du projet

Lire `.agent/PLAN.md` et `.agent/ROADMAP.md` avant toute intervention.

Respecter les décisions validées ; distinguer les propositions et questions ouvertes. Actualiser ces documents lorsque le porteur tranche une question.

Backend Go et PostgreSQL sur infrastructure du projet. Préférer un monolithe modulaire pour le pilote. Ne pas ajouter réservation touristique, paiement des prestations ou suivi des commissions sans demande explicite.

Vérifier les autorisations côté serveur et isoler les données par établissement. Ne jamais exposer les documents privés par une URL publique permanente. Ne pas stocker de secrets dans le dépôt.

Implémenter par lots selon la feuille de route ; ajouter des tests utiles sur autorisations, capacités et paiements. Ne pas engager de dépenses ni ouvrir la production sans avoir résolu les prérequis correspondants.
