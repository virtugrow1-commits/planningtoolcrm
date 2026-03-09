import * as fs from 'fs';

function fixFile(filePath: string) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Replace fetchAll filters { user_id: userId } with {}
  content = content.replace(/\{ user_id: userId \}/g, "{}");

  // Replace .eq('user_id', userId) and similar single-user filters with a no-op or broader filter
  content = content.replace(/\.eq\('user_id', userId\)/g, ".not('id', 'is', null)");
  
  // Also for ghl-sync where it might use user.id or authUser.id
  content = content.replace(/\.eq\('user_id',\s*user\.id\)/g, ".not('id', 'is', null)");
  content = content.replace(/\.eq\('user_id',\s*authUser\.id\)/g, ".not('id', 'is', null)");

  // For ghl-webhook and ghl-auto-sync we already assign newly created records to userId (which is the primary user), which is fine.
  // But we want to ensure updates/fetches don't filter out other users' records.
  
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Fixed ${filePath}`);
}

['supabase/functions/ghl-auto-sync/index.ts', 'supabase/functions/ghl-webhook/index.ts'].forEach(file => {
  if (fs.existsSync(file)) {
    fixFile(file);
  } else {
    console.log(`File not found: ${file}`);
  }
});
