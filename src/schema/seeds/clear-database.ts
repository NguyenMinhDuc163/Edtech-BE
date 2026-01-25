import { AppDataSource } from "../datasource";

async function clearDatabase() {
  const ds = await AppDataSource.initialize();
  try {
    await ds.query(`TRUNCATE TABLE "user_roles", "users", "roles" RESTART IDENTITY CASCADE`);

    console.log("Database cleared!");
  } catch (err) {
    console.error("Error clearing database:", err);
  } finally {
    await ds.destroy();
  }
}

clearDatabase();
