/**
 * Data Migration Utility
 * Run: node database/migrate.js
 * 
 * Supports importing from:
 * - CSV files (for historical data)
 * - JSON files
 * - Direct inserts for testing
 */

const { pool, initializeDatabase } = require('../config/database');
const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------------------
// Migration Functions
// ----------------------------------------------------------------------

async function importFromJSON(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`Importing ${data.length} predictions from JSON...`);
    
    for (const item of data) {
      await pool.execute(
        `INSERT INTO predictions 
         (id, timestamp, machine_type, air_temperature, process_temperature, rotational_speed, torque, tool_wear, status,
          failure_machine, failure_twf, failure_hdf, failure_pwf, failure_osf, failure_rnf)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id || Date.now().toString() + Math.random(),
          item.timestamp || new Date(),
          item.machine_type || item.type,
          item.air_temperature,
          item.process_temperature,
          item.rotational_speed,
          item.torque,
          item.tool_wear,
          item.status || 'NORMAL',
          item.failure_machine || false,
          item.failure_twf || false,
          item.failure_hdf || false,
          item.failure_pwf || false,
          item.failure_osf || false,
          item.failure_rnf || false
        ]
      );
    }
    
    console.log(`✅ Successfully imported ${data.length} predictions`);
  } catch (error) {
    console.error('❌ Import failed:', error.message);
  }
}

async function seedSampleData() {
  console.log('Seeding sample data for testing...');
  
  const samples = [
    {
      machine_type: 'L',
      air_temperature: 298.1,
      process_temperature: 308.6,
      rotational_speed: 1551,
      torque: 42.8,
      tool_wear: 0,
      status: 'NORMAL',
      failure_machine: false,
      failure_twf: false,
      failure_hdf: false,
      failure_pwf: false,
      failure_osf: false,
      failure_rnf: false
    },
    {
      machine_type: 'M',
      air_temperature: 298.2,
      process_temperature: 308.7,
      rotational_speed: 1408,
      torque: 46.3,
      tool_wear: 3,
      status: 'FAILURE',
      failure_machine: true,
      failure_twf: false,
      failure_hdf: true,
      failure_pwf: false,
      failure_osf: false,
      failure_rnf: false
    },
    {
      machine_type: 'H',
      air_temperature: 300.5,
      process_temperature: 310.2,
      rotational_speed: 1200,
      torque: 55.0,
      tool_wear: 150,
      status: 'FAILURE',
      failure_machine: true,
      failure_twf: true,
      failure_hdf: false,
      failure_pwf: true,
      failure_osf: false,
      failure_rnf: false
    }
  ];
  
  for (const item of samples) {
    await pool.execute(
      `INSERT INTO predictions 
       (id, timestamp, machine_type, air_temperature, process_temperature, rotational_speed, torque, tool_wear, status,
        failure_machine, failure_twf, failure_hdf, failure_pwf, failure_osf, failure_rnf)
       VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Date.now().toString() + Math.random().toString(36),
        item.machine_type,
        item.air_temperature,
        item.process_temperature,
        item.rotational_speed,
        item.torque,
        item.tool_wear,
        item.status,
        item.failure_machine,
        item.failure_twf,
        item.failure_hdf,
        item.failure_pwf,
        item.failure_osf,
        item.failure_rnf
      ]
    );
  }
  
  console.log(`✅ Seeded ${samples.length} sample predictions`);
}

async function clearAllData() {
  const [result] = await pool.execute('DELETE FROM predictions');
  console.log(`✅ Cleared ${result.affectedRows} predictions`);
}

async function showStats() {
  const [tables] = await pool.execute('SHOW TABLES');
  console.log('\n📊 Database Stats');
  console.log('=================');
  console.log('Tables:', tables.map(t => Object.values(t)[0]).join(', '));
  
  const [predictions] = await pool.execute('SELECT COUNT(*) as count FROM predictions');
  console.log('Total Predictions:', predictions[0].count);
  
  const [statuses] = await pool.execute(
    'SELECT status, COUNT(*) as count FROM predictions GROUP BY status'
  );
  console.log('\nStatus Distribution:');
  statuses.forEach(s => console.log(`  ${s.status}: ${s.count}`));
  
  const [failures] = await pool.execute(`
    SELECT 
      SUM(failure_machine) as machine,
      SUM(failure_twf) as twf,
      SUM(failure_hdf) as hdf,
      SUM(failure_pwf) as pwf,
      SUM(failure_osf) as osf,
      SUM(failure_rnf) as rnf
    FROM predictions
  `);
  console.log('\nFailure Types:');
  Object.entries(failures[0]).forEach(([type, count]) => {
    if (count > 0) console.log(`  ${type.toUpperCase()}: ${count}`);
  });
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

async function main() {
  const command = process.argv[2];
  
  try {
    await initializeDatabase();
    
    switch (command) {
      case 'seed':
        await seedSampleData();
        break;
      case 'clear':
        await clearAllData();
        break;
      case 'import':
        const filePath = process.argv[3];
        if (!filePath) {
          console.error('Usage: node migrate.js import <file.json>');
          process.exit(1);
        }
        await importFromJSON(filePath);
        break;
      case 'stats':
        await showStats();
        break;
      default:
        console.log('Usage: node migrate.js [command]');
        console.log('Commands:');
        console.log('  seed         - Add sample data for testing');
        console.log('  clear        - Delete all predictions');
        console.log('  stats        - Show database statistics');
        console.log('  import <file> - Import from JSON file');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
