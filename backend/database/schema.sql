-- Factory Brain Database Schema
-- Run this SQL to manually create the database and tables

-- Create database
CREATE DATABASE IF NOT EXISTS colab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE colab;

-- Predictions table - stores all machine predictions
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dashboard stats table for caching
CREATE TABLE IF NOT EXISTS dashboard_stats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  stat_name VARCHAR(50) UNIQUE,
  stat_value INT DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default stats
INSERT INTO dashboard_stats (stat_name, stat_value) VALUES
('total_predictions', 0),
('healthy_machines', 0),
('failed_machines', 0),
('critical_machines', 0)
ON DUPLICATE KEY UPDATE stat_value = stat_value;
