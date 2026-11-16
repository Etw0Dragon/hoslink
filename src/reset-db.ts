import { pathToFileURL } from 'node:url';
import { database, transaction } from './db/index.js';
export function resetConfirmation(url: string) {
 const target=new URL(url);
 return `--confirm-reset=${target.hostname}:${target.port || '5432'}${decodeURIComponent(target.pathname)}`;
}
export async function resetDatabase(env: NodeJS.ProcessEnv,args: string[]) {
 if(!env.DATABASE_URL) throw Error('DATABASE_URL obligatoire');
 const expected=resetConfirmation(env.DATABASE_URL);
 if(args.length!==1 || args[0]!==expected) throw Error(`Suppression de tous les comptes et données métier. Arrêtez l’application, sauvegardez la base puis confirmez avec ${expected}`);
 const {pool}=database(env.DATABASE_URL);
 try {
  await transaction(pool,async tx=>{
   // Only tables belonging to this application; schema and migrations remain intact.
   await tx.query('TRUNCATE billing_paid_invoices,billing_subscriptions,billing_checkouts,billing_customers,billing_slot_purchases,document_events,document_signatures,document_challenges,document_requests,document_versions,document_templates,business_documents,notifications,conversation_reads,partnership_reviews,retained_partnerships,partnership_versions,partnerships,attachments,messages,conversations,establishment_photos,memberships,tokens,audit,establishments,companies,profiles,auth_two_factor,auth_session,auth_account,auth_verification,auth_user RESTART IDENTITY');
  });
 }finally{await pool.end();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await resetDatabase(process.env,process.argv.slice(2));console.log('Base vidée : schéma et migrations conservés.');}
 catch(e){console.error(e instanceof Error?e.message:e);process.exitCode=1;}
}
