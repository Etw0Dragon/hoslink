// Original business queries, with positional projection mapped to view fields.
export const queries = {
  conversations: [
    {
      sql: "SELECT c.id,c.subject,c.quote,e.name,to_char(c.created_at,'DD/MM/YYYY') FROM conversations c JOIN establishments e ON e.id=CASE WHEN c.a=$1 THEN c.b ELSE c.a END WHERE c.a=$1 OR c.b=$1 ORDER BY c.id DESC LIMIT 100",
      fields: ["ID", "Subject", "Quote", "Name", "Date"],
    },
  ],
  conversation: [
    {
      sql: "SELECT c.id,c.subject,c.quote,e.name FROM conversations c JOIN establishments e ON e.id=CASE WHEN c.a=$2 THEN c.b ELSE c.a END WHERE c.id=$1 AND (c.a=$2 OR c.b=$2)",
      fields: ["ID", "Subject", "Quote", "Name"],
    },
    {
      sql: "SELECT m.id,e.name,m.body,to_char(m.created_at,'DD/MM/YYYY HH24:MI'),COALESCE(d.id,0),COALESCE(d.name,'') FROM messages m JOIN establishments e ON e.id=m.establishment_id LEFT JOIN attachments d ON d.message_id=m.id WHERE m.conversation_id=$1 ORDER BY m.id LIMIT 500",
      fields: ["ID", "Name", "Body", "Date", "OtherID", "FileName"],
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
      sql: "SELECT id,name,category,station,city,description FROM establishments WHERE status='approved' AND id<>$1 ORDER BY created_at DESC,id DESC LIMIT 3",
      fields: ["ID", "Name", "Category", "Station", "City", "Description"],
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
      sql: "SELECT id,name,category,station,city,description FROM establishments WHERE status='approved' AND id<>$1 AND ($2='' OR name ILIKE '%'||$2||'%' OR description ILIKE '%'||$2||'%') AND ($3='' OR category=$3 OR ($3='prestataires' AND category<>'hotel')) AND ($4='' OR station ILIKE '%'||$4||'%') ORDER BY name LIMIT 100",
      fields: ["ID", "Name", "Category", "Station", "City", "Description"],
    },
  ],
  profile: [
    {
      sql: "SELECT id,name,category,station,city,description,address,siret FROM establishments WHERE id=$1 AND status='approved'",
      fields: [
        "ID",
        "Name",
        "Category",
        "Station",
        "City",
        "Description",
        "Body",
        "Subject",
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
      sql: "SELECT p.id,e.id,e.name,p.status,p.version,v.terms,CASE WHEN p.a=$1 THEN p.accepted_a ELSE p.accepted_b END,to_char(p.created_at,'DD/MM/YYYY') FROM partnerships p JOIN establishments e ON e.id=CASE WHEN p.a=$1 THEN p.b ELSE p.a END JOIN partnership_versions v ON v.partnership_id=p.id AND v.version=p.version WHERE p.a=$1 OR p.b=$1 ORDER BY p.id DESC",
      fields: [
        "ID",
        "OtherID",
        "Name",
        "Status",
        "Version",
        "Terms",
        "Accepted",
        "Date",
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
      sql: "SELECT v.version,v.terms,u.name,to_char(v.created_at,'DD/MM/YYYY HH24:MI') FROM partnership_versions v JOIN partnerships p ON p.id=v.partnership_id JOIN users u ON u.id=v.author_id WHERE p.id=$1 AND (p.a=$2 OR p.b=$2) ORDER BY v.version DESC",
      fields: ["Version", "Terms", "Name", "Date"],
    },
  ],
} as const;
