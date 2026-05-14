import 'dotenv/config'
import { PostgresDialect } from 'kysely'
import { defineConfig } from 'kysely-ctl'
import { Pool } from 'pg'
import { join } from 'path'

export default defineConfig({
	dialect: new PostgresDialect({
		pool: new Pool({
			host: process.env.DB_HOST,
			port: Number(process.env.DB_PORT),
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			database: process.env.DB_NAME,
		}),
	}),
	migrations: {
		migrationFolder: join(__dirname, '..', 'src', 'database', 'migrations'),
	},
	seeds: {
		seedFolder: join(__dirname, '..', 'src', 'database', 'seeds'),
	},
})
