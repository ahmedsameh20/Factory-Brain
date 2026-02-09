const mysql = require('mysql2/promise');
require('dotenv').config();

// ----------------------------------------------------------------------

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'colab',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ----------------------------------------------------------------------

// Initialize database tables
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    
    console.log('Connected to MySQL database:', process.env.DB_NAME || 'colab');
    
    // Create predictions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS predictions (
        id VARCHAR(255) PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        machine_type VARCHAR(10),
        air_temperature DECIMAL(10, 2),
        process_temperature DECIMAL(10, 2),
        rotational_speed INT,
        torque DECIMAL(10, 2),
        tool_wear INT,
        status VARCHAR(20),
        failure_machine BOOLEAN DEFAULT FALSE,
        failure_twf BOOLEAN DEFAULT FALSE,
        failure_hdf BOOLEAN DEFAULT FALSE,
        failure_pwf BOOLEAN DEFAULT FALSE,
        failure_osf BOOLEAN DEFAULT FALSE,
        failure_rnf BOOLEAN DEFAULT FALSE,
        INDEX idx_timestamp (timestamp),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Create dashboard_stats table for caching
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS dashboard_stats (
        id INT PRIMARY KEY AUTO_INCREMENT,
        stat_name VARCHAR(50) UNIQUE,
        stat_value INT DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    connection.release();
    console.log('Database tables initialized successfully');
    
  } catch (error) {
    console.error('Database initialization error:', error.message);
    throw error;
  }
}

// ----------------------------------------------------------------------

module.exports = {
  pool,
  initializeDatabase,
};
