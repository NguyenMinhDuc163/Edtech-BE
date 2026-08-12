# EdTech Backend

Hệ thống học tập trực tuyến thông minh, được xây dựng dựa trên các công nghệ:

## Tech Stack
- **Framework:** NestJS  
- **Language:** TypeScript  
- **Database:** PostgreSQL (TypeORM)  
- **Local Environment:** Docker  

## Structure
 
```bash
src
│── common/                          # Dùng chung cho toàn project
│ ├── filters/                       # Exception filters
│ ├── guards/                        # Guards (Auth, Roles, Permissions)
│ ├── interceptors/                  # Interceptors (logging, transform, timeout)
│ └── middleware/                    # Middleware custom
│
│── config/                          # Config hệ thống 
|   ├── typeorm.config.ts            # Config TypeORM với Postgres
│
│── constants/                       # Các hằng số (roles, messages, status code...)
│
│── controllers/                     # Controllers (xử lý request/response)
│
│── schema/
│ ├── dtos/                          # Data Transfer Objects
│ ├── entities/                      # Entities cho TypeORM
│ └── migrations/                    # Database migrations
│
│── services/                        # Business logic
│
├── app.module.ts 
├── main.ts 

```
## Environment variables
```bash
cp .env.example .env
```
## Run Local with Docker

```bash
docker compose up --build
```

## Scripts dev

```bash
npm install
npm run start:dev
```

## Database Migrations

Migrations được lưu tại: src/schema/migrations

### New migration

```bash
npm run migration:generate --name=InitSchema
```
- --name=InitSchema là tên migration

### Run migration

```bash
npm run migration:run
```

### Revert migration

```bash
npm run migration:revert
```

### Clear database

```bash
ts-node src\schema\seeds\clear-database.ts
```

## Seed data

### Insert Role

```bash
npx ts-node src/schema/seeds/seed-roles.ts
```




### Insert System Parameters

```bash
npx ts-node src/schema/seeds/seed-system-parameters.ts
```

### Insert course/ user


```bash
 npx ts-node src/schema/seeds/mock-course-data.ts
```



#Deploy to production

## client
```bash
docker build -t nguyenduc1603/edtech-be:1.0.x .
docker push nguyenduc1603/edtech-be:1.0.x
```

### Sửa dòng image trong docker-compose.yml với tag vừa push

## server
```bash
docker-compose pullbanj
docker-compose up -d
```
# Edtech-BE
