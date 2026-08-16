import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env");
const rl = createInterface({ input: stdin, output: stdout });

function mask(s) {
  return s.length <= 20 ? s : s.slice(0, 12) + "…" + s.slice(-6);
}

async function main() {
  console.log("");
  console.log("  🔌  Connect this app to Supabase");
  console.log("  ─────────────────────────────────");
  console.log("  You'll paste 3 things from your Supabase dashboard.");
  console.log("  Copy, paste, press Enter. That's it.\n");

  const dbUrl = (await rl.question("  1) Connection string  (starts with postgresql://…)\n  > ")).trim();
  const supabaseUrl = (await rl.question("\n  2) Project URL  (like https://xxxx.supabase.co)\n  > ")).trim();
  const serviceKey = (await rl.question("\n  3) Service role key  (long letters/numbers)\n  > ")).trim();

  if (!dbUrl.startsWith("postgres")) {
    console.log("\n  ❌ That doesn't look like a connection string — it should start with postgresql://");
    process.exit(1);
  }
  if (!supabaseUrl.startsWith("http")) {
    console.log("\n  ❌ The project URL should start with https://");
    process.exit(1);
  }
  if (serviceKey.length < 20) {
    console.log("\n  ❌ The service role key looks too short — copy the WHOLE thing.");
    process.exit(1);
  }

  console.log("\n  Checking the connection…");
  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await pool.query("SELECT 1");
    console.log("  ✅ Database connection works!");
  } catch (e) {
    console.log("  ⚠️  Couldn't connect yet: " + e.message);
    console.log("  Don't worry — I saved your settings anyway. Start the app and we'll fix it.");
  } finally {
    await pool.end();
  }

  fs.writeFileSync(
    ENV_PATH,
    `# Supabase connection (created by "npm run connect")\nDATABASE_URL=${dbUrl}\nSUPABASE_URL=${supabaseUrl}\nSUPABASE_SERVICE_ROLE_KEY=${serviceKey}\n`
  );

  console.log("\n  ✅ Saved to .env");
  console.log("  DATABASE_URL      " + mask(dbUrl));
  console.log("  SUPABASE_URL      " + supabaseUrl);
  console.log("  SERVICE_ROLE_KEY  " + mask(serviceKey));
  console.log("\n  You're done! Start the app with:  npm start\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
