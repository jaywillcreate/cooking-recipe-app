import { pool } from './pool';
import { SEED_RECIPES } from './seedData';

/** Idempotently inserts the shared seed catalog (owner_id = NULL). */
async function main() {
  let inserted = 0;
  for (const r of SEED_RECIPES) {
    const res = await pool.query(
      `INSERT INTO recipes
         (owner_id, origin, title, cuisine, mins, time_label, difficulty, rating, reviews, description, tags, ingredients, steps, nutrition, source)
       SELECT NULL, 'seed', $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
       WHERE NOT EXISTS (SELECT 1 FROM recipes WHERE title = $1 AND origin = 'seed')`,
      [r.title, r.cuisine, r.mins, r.time, r.difficulty, r.rating, r.reviews, r.desc, r.tags, r.ingredients, r.steps, JSON.stringify(r.nutrition), r.source ?? null],
    );
    inserted += res.rowCount ?? 0;
  }
  console.log(`✅ Seed complete. Inserted ${inserted}; ${SEED_RECIPES.length - inserted} already present.`);
  await pool.end();
}
main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
