import "reflect-metadata";
import { DataSource } from "typeorm";
import { dataSourceConfig } from "../config/typeorm.config";

export const AppDataSource = new DataSource(dataSourceConfig);
