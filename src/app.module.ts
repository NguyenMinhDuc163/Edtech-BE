import { Module, MiddlewareConsumer, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { typeOrmConfig } from './config/typeorm.config';
import { controllers } from './controllers';
import { JwtModule } from '@nestjs/jwt';
import dotenv from 'dotenv';
import { services } from './services';
import { entities } from './schema/entities';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { JwtStrategy } from './common/guards/jwt.strategy';
import { ApiLogInterceptor } from './common/interceptors/api-log.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
dotenv.config();

@Module({
    imports: [
        TypeOrmModule.forRoot(typeOrmConfig),
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'default',
            signOptions: { expiresIn: '15m' },
        }),
        TypeOrmModule.forFeature([...entities]),
        ScheduleModule.forRoot(),
        HttpModule,
    ],
    providers: [
        ...services,
        JwtStrategy,
        JwtAuthGuard,
        {
            provide: APP_INTERCEPTOR,
            useClass: ApiLogInterceptor,
        },
    ],
    controllers: [
        ...controllers
    ],
    exports: [
        ...services,
        TypeOrmModule,
        JwtModule,
        JwtAuthGuard,
        HttpModule,
    ]
})
export class AppModule implements OnModuleInit {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(LoggerMiddleware).forRoutes('*');
    }

    constructor(private dataSource: DataSource) { }
    async onModuleInit() {
        try {
            if (this.dataSource.isInitialized) {
                console.log('Database connected successfully');
            }
        } catch (error) {
            console.error('Database connection failed', error);
        }
    }
}