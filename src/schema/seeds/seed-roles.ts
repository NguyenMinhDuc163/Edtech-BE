import { DataSource } from "typeorm";
import { AppDataSource } from "../datasource";
import { Role, SystemRole } from "../entities/role.entity";

async function seedRoles() {
    await AppDataSource.initialize();

    for (const role of Object.values(SystemRole)) {
        const exists = await AppDataSource.getRepository(Role).findOne({ where: { name: role } });
        if (!exists) {
            await AppDataSource.getRepository(Role).save({ name: role });
            console.log(`Inserted role: ${role}`);
        }
    }

    await AppDataSource.destroy();
}

seedRoles().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
