import pg from 'pg';

const TABLES_TO_COPY = [
  'users',
  'nodes', 
  'node_availability',
  'crates',
  'products',
  'product_templates',
  'listing_templates',
  'crate_items',
  'node_crate_assignments',
  'inventory',
  'orders',
  'order_items',
  'order_feedback',
  'promo_codes',
  'promo_code_usages',
  'categories',
  'site_settings',
  'admin_settings',
  'node_applications',
  'application_statuses',
  'screening_links',
  'screening_questions',
  'screening_responses',
  'agreements',
  'notifications',
  'email_subscribers',
  'surveys',
  'survey_options',
  'survey_responses',
  'bundles',
  'bundle_items',
  'node_bundles',
  'user_preferences',
  'user_addresses',
  'user_label_templates',
  'spreadsheet_sync',
  'duplicate_queue',
  'inventory_batches',
  'dropout_surveys',
];

async function main() {
  const devPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  console.log('Starting production to development database copy...');
  console.log('Note: This script reads production data via execute_sql_tool JSON exports');
  console.log('and inserts into development database via DATABASE_URL');
  
  const client = await devPool.connect();
  
  try {
    await client.query('BEGIN');
    
    const truncateOrder = [...TABLES_TO_COPY].reverse();
    for (const table of truncateOrder) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
        console.log(`Truncated ${table}`);
      } catch (e: any) {
        console.log(`Skip truncate ${table}: ${e.message}`);
      }
    }
    
    await client.query('COMMIT');
    console.log('All tables truncated. Ready for data import.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e);
  } finally {
    client.release();
    await devPool.end();
  }
}

main();
