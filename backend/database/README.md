# Factory Brain Database Setup

## Prerequisites

- MySQL Server installed (version 8.0 or higher recommended)
- MySQL service running

## Quick Setup

The database and tables will be **automatically created** when you start the backend server for the first time.

### Manual Setup (Optional)

If you prefer to create the database manually:

```bash
# Connect to MySQL as root
mysql -u root -p

# Run the schema script
source backend/database/schema.sql
```

## Configuration

Edit `backend/.env` with your MySQL credentials:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=colab
DB_PORT=3306
```

## Database Schema

### predictions
Stores all machine predictions from the ML service.

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(255) | Unique prediction ID |
| timestamp | DATETIME | When prediction was made |
| machine_type | VARCHAR(10) | Machine type (L, M, H) |
| air_temperature | DECIMAL(10,2) | Air temperature in Kelvin |
| process_temperature | DECIMAL(10,2) | Process temperature in Kelvin |
| rotational_speed | INT | RPM |
| torque | DECIMAL(10,2) | Torque in Nm |
| tool_wear | INT | Tool wear in minutes |
| status | VARCHAR(20) | NORMAL or FAILURE |
| failure_* | BOOLEAN | Various failure type flags |

### dashboard_stats
Cached statistics for dashboard performance.

## Testing Connection

```bash
cd backend
node -e "const { pool } = require('./config/database'); pool.execute('SELECT 1').then(() => console.log('Connected!'))"
```
