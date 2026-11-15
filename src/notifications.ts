import type pg from 'pg';
import type { Queryable } from './db/index.js';
import type { Config } from './config.js';
import { transaction } from './db/index.js';
import { mailer } from './mail.js';
export async function notify(tx: Queryable, establishment: number, kind: 'message'|'partnership', entity: number, title: string) {
 await tx.query(`INSERT INTO notifications(user_id,establishment_id,kind,entity_id,title)
 SELECT m.user_id,m.establishment_id,$2,$3,$4 FROM memberships m JOIN profiles p ON p.id=m.user_id JOIN auth_user u ON u.id=p.auth_user_id
 WHERE m.establishment_id=$1 AND u.email_verified AND ($2='message' OR m.role='owner')`,[establishment,kind,entity,title]);
}
export async function deliverNotifications(pool: pg.Pool, cfg: Config) {
 const send = mailer(cfg);
 // A row lock prevents two application workers from sending the same queued email concurrently.
 for(let i=0;i<20;i++) {
  const processed = await transaction(pool,async tx => {
   const n = (await tx.query(`SELECT n.*,u.email FROM notifications n JOIN profiles p ON p.id=n.user_id JOIN auth_user u ON u.id=p.auth_user_id
    JOIN memberships m ON m.user_id=n.user_id AND m.establishment_id=n.establishment_id
    WHERE n.email_sent_at IS NULL AND n.email_retry_at<=now() AND n.email_attempts<5 AND n.read_at IS NULL AND u.email_verified
    ORDER BY n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1`)).rows[0];
   if(!n) return false;
   try {
    await send(n.email,'Hoslink · '+n.title,cfg.BASE_URL+(n.kind==='message'?`/messages/${n.entity_id}`:'/partenariats'));
    await tx.query('UPDATE notifications SET email_sent_at=now() WHERE id=$1',[n.id]);
   } catch {
    await tx.query("UPDATE notifications SET email_attempts=email_attempts+1,email_retry_at=now()+interval '15 minutes' WHERE id=$1",[n.id]);
   }
   return true;
  });
  if(!processed) break;
 }
}
