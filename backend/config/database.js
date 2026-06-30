const mysql = require('mysql2/promise');
require('dotenv').config();

const mysqlPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'colab',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

let useMemoryStore = false;

const memoryStore = {
  predictions: [],
  energyPredictions: [],
  // machineReadings is keyed by machine_id since it's an upsert-by-PK table
  // (one current row per machine, overwritten as new live readings arrive).
  machineReadings: {},
  // energyReadings is append-only, mirroring the real table's auto-increment id.
  energyReadings: [],
  energyReadingAutoId: 1,
};

function normalizeQuery(query) {
  return query.replace(/\s+/g, ' ').trim();
}

function createMemoryPool() {
  return {
    async getConnection() {
      return {
        async execute() {
          return [[], []];
        },
        release() {},
      };
    },
    async execute(query, params = []) {
      const normalizedQuery = normalizeQuery(query);

      if (normalizedQuery.includes('INSERT INTO predictions')) {
        const [
          id,
          machineId,
          machineType,
          airTemperature,
          processTemperature,
          rotationalSpeed,
          torque,
          toolWear,
          status,
          failureMachine,
          failureProbability,
          failureTwf,
          failureHdf,
          failurePwf,
          failureOsf,
          failureRnf,
        ] = params;

        memoryStore.predictions.push({
          id,
          timestamp: new Date(),
          machine_id: machineId,
          machine_type: machineType,
          air_temperature: airTemperature,
          process_temperature: processTemperature,
          rotational_speed: rotationalSpeed,
          torque,
          tool_wear: toolWear,
          status,
          failure_machine: failureMachine,
          failure_probability: failureProbability,
          failure_twf: failureTwf,
          failure_hdf: failureHdf,
          failure_pwf: failurePwf,
          failure_osf: failureOsf,
          failure_rnf: failureRnf,
        });
        return [{ affectedRows: 1 }, undefined];
      }

      if (normalizedQuery.includes('FROM predictions WHERE machine_id') && normalizedQuery.includes('ORDER BY timestamp DESC LIMIT')) {
        const [machineId] = params;
        const match = [...memoryStore.predictions]
          .filter((p) => p.machine_id === machineId)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return [match.length ? [match[0]] : [], undefined];
      }

      if (normalizedQuery.includes('INSERT INTO energy_predictions')) {
        const [
          id,
          inputTimestamp,
          loadType,
          inputPayload,
          predictedUsageKwh,
          status,
          efficiencyScore,
          peakWindow,
          recommendationsJson,
        ] = params;

        memoryStore.energyPredictions.push({
          id,
          timestamp: new Date(),
          input_timestamp: inputTimestamp,
          load_type: loadType,
          input_payload: inputPayload,
          predicted_usage_kwh: predictedUsageKwh,
          status,
          efficiency_score: efficiencyScore,
          peak_window: peakWindow,
          recommendations_json: recommendationsJson,
        });
        return [{ affectedRows: 1 }, undefined];
      }

      if (normalizedQuery.includes("SELECT COUNT(*) as count FROM predictions WHERE status = 'NORMAL'")) {
        return [[{
          count: memoryStore.predictions.filter((prediction) => prediction.status === 'NORMAL').length,
        }], undefined];
      }

      if (normalizedQuery.includes("SELECT COUNT(*) as count FROM predictions WHERE status = 'FAILURE'")) {
        return [[{
          count: memoryStore.predictions.filter((prediction) => prediction.status === 'FAILURE').length,
        }], undefined];
      }

      if (normalizedQuery.includes('SELECT COUNT(*) as count FROM predictions WHERE failure_machine = TRUE')) {
        return [[{
          count: memoryStore.predictions.filter((prediction) => Boolean(prediction.failure_machine)).length,
        }], undefined];
      }

      if (normalizedQuery.includes('SELECT COUNT(*) as count FROM predictions')) {
        return [[{ count: memoryStore.predictions.length }], undefined];
      }

      if (normalizedQuery.includes('SUM(failure_machine) as machine')) {
        const totals = memoryStore.predictions.reduce(
          (acc, prediction) => {
            acc.machine += Number(Boolean(prediction.failure_machine));
            acc.twf += Number(Boolean(prediction.failure_twf));
            acc.hdf += Number(Boolean(prediction.failure_hdf));
            acc.pwf += Number(Boolean(prediction.failure_pwf));
            acc.osf += Number(Boolean(prediction.failure_osf));
            acc.rnf += Number(Boolean(prediction.failure_rnf));
            return acc;
          },
          { machine: 0, twf: 0, hdf: 0, pwf: 0, osf: 0, rnf: 0 }
        );
        return [[totals], undefined];
      }

      if (normalizedQuery.includes('FROM predictions ORDER BY timestamp DESC')) {
        const limit = Number(normalizedQuery.match(/LIMIT\s+(\d+)/i)?.[1] || memoryStore.predictions.length);
        const rows = [...memoryStore.predictions]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, limit)
          .map((prediction) => ({
            id: prediction.id,
            timestamp: prediction.timestamp,
            type: prediction.machine_type,
            air_temperature: prediction.air_temperature,
            process_temperature: prediction.process_temperature,
            rotational_speed: prediction.rotational_speed,
            torque: prediction.torque,
            tool_wear: prediction.tool_wear,
            status: prediction.status,
            machine: prediction.failure_machine,
            twf: prediction.failure_twf,
            hdf: prediction.failure_hdf,
            pwf: prediction.failure_pwf,
            osf: prediction.failure_osf,
            rnf: prediction.failure_rnf,
          }));
        return [rows, undefined];
      }

      if (normalizedQuery.includes('SELECT COUNT(*) as count FROM energy_predictions')) {
        return [[{ count: memoryStore.energyPredictions.length }], undefined];
      }

      if (normalizedQuery.includes('AVG(predicted_usage_kwh) as averageUsage')) {
        const total = memoryStore.energyPredictions.length;
        const averageUsage = total
          ? memoryStore.energyPredictions.reduce((sum, item) => sum + Number(item.predicted_usage_kwh), 0) / total
          : 0;
        const peakUsage = total
          ? Math.max(...memoryStore.energyPredictions.map((item) => Number(item.predicted_usage_kwh)))
          : 0;
        const averageEfficiency = total
          ? memoryStore.energyPredictions.reduce((sum, item) => sum + Number(item.efficiency_score), 0) / total
          : 0;
        return [[{
          averageUsage,
          peakUsage,
          averageEfficiency,
        }], undefined];
      }

      if (normalizedQuery.includes("SUM(CASE WHEN status = 'OPTIMAL' THEN 1 ELSE 0 END) as optimal")) {
        const totals = memoryStore.energyPredictions.reduce(
          (acc, item) => {
            if (item.status === 'OPTIMAL') acc.optimal += 1;
            if (item.status === 'MONITOR') acc.monitor += 1;
            if (item.status === 'CRITICAL') acc.critical += 1;
            return acc;
          },
          { optimal: 0, monitor: 0, critical: 0 }
        );
        return [[totals], undefined];
      }

      if (normalizedQuery.includes('SELECT predicted_usage_kwh FROM energy_predictions ORDER BY timestamp DESC')) {
        const sorted = [...memoryStore.energyPredictions].sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
        return [sorted.length ? [{ predicted_usage_kwh: sorted[0].predicted_usage_kwh }] : [], undefined];
      }

      if (normalizedQuery.includes('FROM energy_predictions ORDER BY timestamp DESC')) {
        const limit = Number(normalizedQuery.match(/LIMIT\s+(\d+)/i)?.[1] || memoryStore.energyPredictions.length);
        const rows = [...memoryStore.energyPredictions]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, limit)
          .map((prediction) => ({
            id: prediction.id,
            timestamp: prediction.timestamp,
            input_timestamp: prediction.input_timestamp,
            load_type: prediction.load_type,
            input_payload: prediction.input_payload,
            predicted_usage_kwh: prediction.predicted_usage_kwh,
            status: prediction.status,
            efficiency_score: prediction.efficiency_score,
            peak_window: prediction.peak_window,
            recommendations_json: prediction.recommendations_json,
          }));
        return [rows, undefined];
      }

      if (normalizedQuery.includes('INSERT INTO machine_readings')) {
        const [
          machineId,
          type,
          airTemperature,
          processTemperature,
          rotationalSpeed,
          torque,
          toolWear,
          maintDurationHrs,
          maintCostUsd,
          downtimeCostPerHr,
          energyCostUsd,
          deadlineHours,
          priority,
        ] = params;

        memoryStore.machineReadings[machineId] = {
          machine_id: machineId,
          type,
          air_temperature: airTemperature,
          process_temperature: processTemperature,
          rotational_speed: rotationalSpeed,
          torque,
          tool_wear: toolWear,
          maint_duration_hrs: maintDurationHrs,
          maint_cost_usd: maintCostUsd,
          downtime_cost_per_hr: downtimeCostPerHr,
          energy_cost_usd: energyCostUsd,
          deadline_hours: deadlineHours,
          priority,
          updated_at: new Date(),
        };
        return [{ affectedRows: 1 }, undefined];
      }

      if (normalizedQuery.includes('FROM machine_readings WHERE machine_id')) {
        const [machineId] = params;
        const row = memoryStore.machineReadings[machineId];
        return [row ? [row] : [], undefined];
      }

      if (normalizedQuery.includes('FROM machine_readings')) {
        const rows = Object.values(memoryStore.machineReadings).sort((a, b) =>
          a.machine_id.localeCompare(b.machine_id)
        );
        return [rows, undefined];
      }

      if (normalizedQuery.includes('INSERT INTO energy_readings')) {
        const [readingTimestamp, usageKwh, laggingReactiveKvarh, leadingReactiveKvarh, co2Tco2, loadType] =
          params;

        memoryStore.energyReadings.push({
          id: memoryStore.energyReadingAutoId++,
          reading_timestamp: readingTimestamp,
          usage_kwh: usageKwh,
          lagging_reactive_kvarh: laggingReactiveKvarh,
          leading_reactive_kvarh: leadingReactiveKvarh,
          co2_tco2: co2Tco2,
          load_type: loadType,
          created_at: new Date(),
        });
        return [{ affectedRows: 1 }, undefined];
      }

      if (normalizedQuery.includes('FROM energy_readings ORDER BY reading_timestamp DESC')) {
        const limit = Number(normalizedQuery.match(/LIMIT\s+(\d+)/i)?.[1] || memoryStore.energyReadings.length);
        const rows = [...memoryStore.energyReadings]
          .sort((a, b) => new Date(b.reading_timestamp) - new Date(a.reading_timestamp))
          .slice(0, limit);
        return [rows, undefined];
      }

      if (normalizedQuery.includes('SELECT 1')) {
        return [[{ 1: 1 }], undefined];
      }

      return [[], undefined];
    },
  };
}

let pool = mysqlPool;

async function initializeDatabase() {
  try {
    const connection = await mysqlPool.getConnection();

    console.log('Connected to MySQL database:', process.env.DB_NAME || 'colab');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS predictions (
        id VARCHAR(255) PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        machine_id VARCHAR(50) NULL,
        machine_type VARCHAR(10),
        air_temperature DECIMAL(10, 2),
        process_temperature DECIMAL(10, 2),
        rotational_speed INT,
        torque DECIMAL(10, 2),
        tool_wear INT,
        status VARCHAR(20),
        failure_machine BOOLEAN DEFAULT FALSE,
        failure_probability DECIMAL(5, 4) NULL,
        failure_twf BOOLEAN DEFAULT FALSE,
        failure_hdf BOOLEAN DEFAULT FALSE,
        failure_pwf BOOLEAN DEFAULT FALSE,
        failure_osf BOOLEAN DEFAULT FALSE,
        failure_rnf BOOLEAN DEFAULT FALSE,
        INDEX idx_timestamp (timestamp),
        INDEX idx_status (status),
        INDEX idx_machine_id (machine_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // CREATE TABLE IF NOT EXISTS only applies to brand-new databases — if
    // `predictions` already existed before this update, it won't have
    // machine_id/failure_probability yet. Add them here, tolerating the
    // "already exists" errors (1060 = duplicate column, 1061 = duplicate
    // key) so this is safe to run on every startup either way.
    const predictionsMigrations = [
      "ALTER TABLE predictions ADD COLUMN machine_id VARCHAR(50) NULL",
      "ALTER TABLE predictions ADD COLUMN failure_probability DECIMAL(5, 4) NULL",
      "ALTER TABLE predictions ADD INDEX idx_machine_id (machine_id)",
    ];
    for (const statement of predictionsMigrations) {
      try {
        await connection.execute(statement);
      } catch (migrationError) {
        if (migrationError.errno !== 1060 && migrationError.errno !== 1061) {
          throw migrationError;
        }
      }
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS energy_predictions (
        id VARCHAR(255) PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        input_timestamp DATETIME NULL,
        load_type VARCHAR(20),
        input_payload LONGTEXT,
        predicted_usage_kwh DECIMAL(10, 2),
        status VARCHAR(20),
        efficiency_score DECIMAL(10, 2),
        peak_window BOOLEAN DEFAULT FALSE,
        recommendations_json LONGTEXT,
        INDEX idx_energy_timestamp (timestamp),
        INDEX idx_energy_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS dashboard_stats (
        id INT PRIMARY KEY AUTO_INCREMENT,
        stat_name VARCHAR(50) UNIQUE,
        stat_value INT DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Live, current-state reading per machine. Used by:
    //  - PdM "from database" mode: pick a machine, predict from its latest reading.
    //  - Module 3 live schedule: fail_prob comes from these sensor fields run
    //    through the PdM model; the cost/priority/deadline fields are real
    //    business data this table is responsible for holding (the static-CSV
    //    schedule generated those randomly — a live schedule can't do that).
    // Expected to be kept up to date by an external process (PLC poller,
    // MES integration, etc.) calling POST /api/machine-readings.
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS machine_readings (
        machine_id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(10),
        air_temperature DECIMAL(10, 2),
        process_temperature DECIMAL(10, 2),
        rotational_speed INT,
        torque DECIMAL(10, 2),
        tool_wear INT,
        maint_duration_hrs DECIMAL(10, 2) DEFAULT 4,
        maint_cost_usd DECIMAL(10, 2) DEFAULT 500,
        downtime_cost_per_hr DECIMAL(10, 2) DEFAULT 1000,
        energy_cost_usd DECIMAL(10, 2) DEFAULT 20,
        deadline_hours INT DEFAULT 48,
        priority INT DEFAULT 2,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Live energy time series (15-minute interval readings expected).
    // Used by the Energy module's "from database" mode to auto-fill the last
    // 8 hours (32 points) instead of manual entry. Expected to be kept up to
    // date by an external process calling POST /api/energy-readings.
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS energy_readings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        reading_timestamp DATETIME NOT NULL,
        usage_kwh DECIMAL(10, 2),
        lagging_reactive_kvarh DECIMAL(10, 2),
        leading_reactive_kvarh DECIMAL(10, 2),
        co2_tco2 DECIMAL(10, 4),
        load_type VARCHAR(20) DEFAULT 'Light_Load',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reading_timestamp (reading_timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    connection.release();
    console.log('Database tables initialized successfully');
  } catch (error) {
    useMemoryStore = true;
    pool = createMemoryPool();
    console.warn('Database initialization error:', error.message);
    console.warn('Falling back to in-memory storage. Predictions will not persist after restart.');
  }
}

module.exports = {
  get pool() {
    return pool;
  },
  initializeDatabase,
  get useMemoryStore() {
    return useMemoryStore;
  },
  get memoryStore() {
    return memoryStore;
  },
};