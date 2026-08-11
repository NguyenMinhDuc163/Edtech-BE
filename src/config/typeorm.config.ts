import {TypeOrmModuleOptions} from "@nestjs/typeorm";
import {PostgresConnectionOptions} from "typeorm/driver/postgres/PostgresConnectionOptions";
import * as dotenv from "dotenv";
import { join } from "path";
import {entities} from "../schema/entities";
import {SimpleSqlLogger} from "../common/logger/sql-logger";

dotenv.config();

const commonConfig = {
  type: "postgres" as const,
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "123456",
  database: process.env.DB_DATABASE || "edtechdb",
  entities: [...entities],
  logging: true, 
  
  logger: new SimpleSqlLogger(),
};

export const typeOrmConfig: TypeOrmModuleOptions = {
  ...commonConfig,
} as TypeOrmModuleOptions;

export const dataSourceConfig: PostgresConnectionOptions  = {
  ...commonConfig,
  migrations: [join(__dirname, "../schema/migrations/*.{ts,js}")],
  synchronize: false,
};
