// Original business queries, with positional projection mapped to view fields.
export const queries = {
  conversations: [{
 sql: "SELECT c.id,c.subject,c.quote,e.name,to_char(COALESCE(latest.at,c.created_at),'DD/MM/YYYY HH24:MI'),(SELECT count(*) FROM messages m WHERE m.conversation_id=c.id AND m.establishment_id<>$1 AND m.id>COALESCE((SELECT last_message_id FROM conversation_reads WHERE conversation_id=c.id AND user_id=$2 AND establishment_id=$1),0)),COALESCE(latest.body,'') FROM conversations c JOIN establishments e ON e.id=CASE WHEN c.a=$1 THEN c.b ELSE c.a END LEFT JOIN LATERAL (SELECT m.created_at AS at,m.body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) latest ON true WHERE c.a=$1 OR c.b=$1 ORDER BY COALESCE(latest.at,c.created_at) DESC,c.id DESC LIMIT 100",
 fields: ["ID","Subject","Quote","Name","Date","Unread","Preview"]
 }],
  conversation: [
    {
      sql: "SELECT c.id,c.subject,c.quote,e.name FROM conversations c JOIN establishments e ON e.id=CASE WHEN c.a=$2 THEN c.b ELSE c.a END WHERE c.id=$1 AND (c.a=$2 OR c.b=$2)",
      fields: ["ID", "Subject", "Quote", "Name"],
    },
    {
      sql: "SELECT m.id,e.name,m.body,to_char(m.created_at,'DD/MM/YYYY HH24:MI'),COALESCE(d.id,0),COALESCE(d.name,''),m.establishment_id,bd.id,dv.content->>'title',dv.version,CASE dr.status WHEN 'sent' THEN 'Envoyé' WHEN 'accepted' THEN 'Accepté' WHEN 'refused' THEN 'Refusé' WHEN 'signing' THEN 'À signer' WHEN 'signed' THEN 'Signé' WHEN 'superseded' THEN 'Remplacé' END,dv.content->>'reference' FROM messages m JOIN establishments e ON e.id=m.establishment_id LEFT JOIN attachments d ON d.message_id=m.id LEFT JOIN document_versions dv ON dv.id=m.document_version_id LEFT JOIN business_documents bd ON bd.id=dv.document_id LEFT JOIN document_requests dr ON dr.version_id=dv.id WHERE m.conversation_id=$1 ORDER BY m.id LIMIT 500",
      fields: ["ID", "Name", "Body", "Date", "OtherID", "FileName", "EstablishmentID", "DocumentID", "DocumentTitle", "DocumentVersion", "DocumentStatus", "DocumentReference"],
    },
  ],
  dashboard: [
    {
      sql: "SELECT\n (SELECT count(*) FROM partnerships WHERE (a=$1 OR b=$1) AND status='active'),\n (SELECT count(*) FROM partnerships WHERE (a=$1 OR b=$1) AND status='pending' AND NOT CASE WHEN a=$1 THEN accepted_a ELSE accepted_b END),\n 2+purchased_slots,COALESCE(subscription_until>now(),false)\n FROM establishments WHERE id=$1",
      fields: ["Active", "Pending", "Slots", "Unlimited"],
    },
    {
      sql: "SELECT c.id,e.name,c.subject,c.quote,to_char(latest.at,'DD/MM/YYYY HH24:MI')\n FROM conversations c JOIN establishments e ON e.id=CASE WHEN c.a=$1 THEN c.b ELSE c.a END\n CROSS JOIN LATERAL (SELECT COALESCE(max(m.created_at),c.created_at) AS at FROM messages m WHERE m.conversation_id=c.id) latest\n WHERE c.a=$1 OR c.b=$1 ORDER BY latest.at DESC,c.id DESC LIMIT 4",
      fields: ["ID", "Name", "Subject", "Quote", "Date"],
    },
    {
      sql: "SELECT e.id,e.name,e.category,e.station,e.city,e.description,COALESCE((SELECT id FROM establishment_photos WHERE establishment_id=e.id AND kind='profile'),0) FROM establishments e WHERE e.status='approved' AND e.id<>$1 AND (($2='hotel' AND e.category<>'hotel') OR ($2<>'hotel' AND e.category='hotel')) ORDER BY e.created_at DESC,e.id DESC LIMIT 3",
      fields: ["ID", "Name", "Category", "Station", "City", "Description", "PhotoID"],
    },
  ],
  account: [
    {
      sql: "SELECT e.id,e.name,e.status,m.role FROM memberships m JOIN establishments e ON e.id=m.establishment_id WHERE m.user_id=$1 ORDER BY e.name",
      fields: ["ID", "Name", "Status", "Role"],
    },
  ],
  directory: [
    {
      sql: "SELECT e.id,e.name,e.category,e.station,e.city,e.address,e.description,COALESCE((SELECT id FROM establishment_photos WHERE establishment_id=e.id AND kind='profile'),0),e.latitude,e.longitude FROM establishments e WHERE e.status='approved' AND e.id<>$1 AND NOT EXISTS (SELECT 1 FROM regexp_split_to_table(lower(translate($2::text, 'àâäéèêëîïôöùûüÿçœ', 'aaaeeeeiioouuuyco')), '\\s+') AS keyword(word) WHERE word <> '' AND lower(translate(concat_ws(' ',e.name,e.description,e.city,e.station,e.address,e.provider_offer->>'activities',e.provider_offer->>'area',e.provider_offer->>'seasons',e.provider_offer->>'languages',e.provider_offer->>'audience',e.provider_offer->>'benefits',CASE e.category WHEN 'ski' THEN 'ski skis location louer matériel materiel équipement equipement neige glisse' WHEN 'spa' THEN 'spa bien-être bien etre bienetre wellness massage massages sauna hammam détente detente soins relaxation' WHEN 'activite' THEN 'activité activités activite activites loisirs excursion excursions sortie sorties sport sports aventure' WHEN 'hotel' THEN 'hôtel hôtels hotel hotels hébergement hebergement hébergements hebergements hôtellerie hotellerie' ELSE 'autres services service prestataire prestataires fournisseur fournisseurs' END), 'àâäéèêëîïôöùûüÿçœ', 'aaaeeeeiioouuuyco')) NOT LIKE '%' || replace(replace(replace(word, chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%') AND e.category=ANY($3::text[]) AND ($4='' OR e.station ILIKE '%'||$4||'%') AND ($5='' OR e.city ILIKE '%'||$5||'%') AND ($6='' OR e.address ILIKE '%'||$6||'%') AND ($7::double precision IS NULL OR (e.latitude BETWEEN $8::double precision AND $9::double precision AND CASE WHEN $10::double precision <= $11::double precision THEN e.longitude BETWEEN $10::double precision AND $11::double precision ELSE e.longitude >= $10::double precision OR e.longitude <= $11::double precision END)) ORDER BY e.name LIMIT 200",
      fields: ["ID", "Name", "Category", "Station", "City", "Address", "Description", "PhotoID", "Latitude", "Longitude"],
    },
  ],
  profile: [
    {
      sql: "SELECT e.id,e.name,e.category,e.station,e.city,e.description,e.address,e.siret,COALESCE((SELECT id FROM establishment_photos WHERE establishment_id=e.id AND kind='profile'),0),e.latitude,e.longitude,e.provider_offer FROM establishments e WHERE e.id=$1 AND e.status='approved'",
      fields: [
        "ID",
        "Name",
        "Category",
        "Station",
        "City",
        "Description",
        "Body",
        "Subject",
        "PhotoID",
        "Latitude",
        "Longitude",
        "ProviderOffer",
      ],
    },
  ],
  team: [
    {
      sql: "SELECT u.id,u.name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.establishment_id=$1 ORDER BY u.name",
      fields: ["ID", "Name", "Description", "Role"],
    },
  ],
  admin: [
    {
      sql: "SELECT e.id,e.name,e.status,e.siret,e.address,e.city,e.station,c.name || ' · Responsables : ' || COALESCE((SELECT string_agg(u.name || ' <' || u.email || '>', ', ') FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.establishment_id=e.id AND m.role='owner'),'') FROM establishments e JOIN companies c ON c.id=e.company_id ORDER BY e.status,e.created_at LIMIT 200",
      fields: [
        "ID",
        "Name",
        "Status",
        "Subject",
        "Body",
        "City",
        "Station",
        "Description",
      ],
    },
    {
      sql: "SELECT a.entity_id,a.action,a.note,COALESCE(u.email,'Système'),to_char(a.created_at,'DD/MM/YYYY HH24:MI') FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100",
      fields: ["ID", "Subject", "Body", "Name", "Date"],
    },
  ],
  partnerships: [
    {
      sql: "SELECT p.id,e.id,e.name,p.status,p.version,v.terms,CASE WHEN p.a=$1 THEN p.accepted_a ELSE p.accepted_b END,to_char(p.created_at,'DD/MM/YYYY'),v.details,(p.status='pending' AND p.created_at < now()-interval '7 days'),(COALESCE((SELECT next_review FROM partnership_reviews WHERE partnership_id=p.id AND establishment_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1),NULLIF(v.details->>'renewal','')::date) <= CURRENT_DATE+7),COALESCE((SELECT jsonb_agg(r ORDER BY r.created_at DESC) FROM (SELECT e.name AS name,r.outcome,r.note,r.next_review,to_char(r.created_at,'DD/MM/YYYY') AS created_at FROM partnership_reviews r JOIN establishments e ON e.id=r.establishment_id WHERE r.partnership_id=p.id ORDER BY r.created_at DESC,r.id DESC LIMIT 20) r),'[]'::jsonb) FROM partnerships p JOIN establishments e ON e.id=CASE WHEN p.a=$1 THEN p.b ELSE p.a END JOIN partnership_versions v ON v.partnership_id=p.id AND v.version=p.version WHERE p.a=$1 OR p.b=$1 ORDER BY p.id DESC",
      fields: [
        "ID",
        "OtherID",
        "Name",
        "Status",
        "Version",
        "Terms",
        "Accepted",
        "Date",
        "Details", "PendingReminder", "ReviewReminder", "Reviews",
      ],
    },
  ],
  offers: [
    {
      sql: "SELECT 2+purchased_slots,COALESCE(subscription_until>now(),false),(SELECT count(*) FROM partnerships WHERE status='active' AND (a=$1 OR b=$1)) FROM establishments WHERE id=$1",
      fields: ["Slots", "Unlimited", "Active"],
    },
  ],
  history: [
    {
      sql: "SELECT v.version,v.terms,u.name,to_char(v.created_at,'DD/MM/YYYY HH24:MI'),v.details FROM partnership_versions v JOIN partnerships p ON p.id=v.partnership_id JOIN users u ON u.id=v.author_id WHERE p.id=$1 AND (p.a=$2 OR p.b=$2) ORDER BY v.version DESC",
      fields: ["Version", "Terms", "Name", "Date", "Details"],
    },
  ],
} as const;
