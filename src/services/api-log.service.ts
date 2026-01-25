import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {ApiLog} from '../schema/entities/api-log.entity';

export interface ApiLogData {
    method: string;
    endpoint: string;
    user_id?: number | undefined;
    ip_address?: string | undefined;
    user_agent?: string | undefined;
    request_headers?: any;
    request_body?: any;
    query_params?: any;
    status_code: number;
    response_body?: any;
    response_time_ms: number;
    error_message?: string | undefined;
    error_code?: string | undefined;
}

@Injectable()
export class ApiLogService {
    constructor(
        @InjectRepository(ApiLog)
        private readonly apiLogRepository: Repository<ApiLog>,
    ) {
    }

    async logApiCall(logData: ApiLogData): Promise<void> {
        try {

            const apiLogData: Partial<ApiLog> = {
                method: logData.method,
                endpoint: logData.endpoint,
                status_code: logData.status_code,
                response_time_ms: logData.response_time_ms,
            };


            if (logData.user_id !== undefined) {
                apiLogData.user_id = logData.user_id;
            }
            if (logData.ip_address !== undefined) {
                apiLogData.ip_address = logData.ip_address;
            }
            if (logData.user_agent !== undefined) {
                apiLogData.user_agent = logData.user_agent;
            }
            if (logData.request_headers !== undefined) {
                apiLogData.request_headers = logData.request_headers;
            }
            if (logData.request_body !== undefined) {
                apiLogData.request_body = logData.request_body;
            }
            if (logData.query_params !== undefined) {
                apiLogData.query_params = logData.query_params;
            }
            if (logData.response_body !== undefined) {
                apiLogData.response_body = logData.response_body;
            }
            if (logData.error_message !== undefined) {
                apiLogData.error_message = logData.error_message;
            }
            if (logData.error_code !== undefined) {
                apiLogData.error_code = logData.error_code;
            }

            const apiLog = this.apiLogRepository.create(apiLogData);


            await this.apiLogRepository.save(apiLog);


            this.logToConsole(logData);

        } catch (error) {

            console.error('Failed to save API log:', error);
        }
    }

    private logToConsole(logData: ApiLogData): void {
        const status = logData.status_code >= 400 ? '❌' : '✅';
        const method = logData.method.padEnd(6);
        const endpoint = logData.endpoint.padEnd(30);
        const time = `${logData.response_time_ms}ms`.padStart(8);
        const user = logData.user_id ? `User:${logData.user_id}` : 'Anonymous';

        console.log(`${status} ${method} ${endpoint} ${time} ${user}`);

        if (logData.error_message) {
            console.log(`   Error: ${logData.error_message}`);
        }
    }


    async getLogsByUser(userId: number, limit: number = 100): Promise<ApiLog[]> {
        return this.apiLogRepository.find({
            where: {user_id: userId},
            order: {created_at: 'DESC'},
            take: limit,
        });
    }

    async getLogsByEndpoint(endpoint: string, limit: number = 100): Promise<ApiLog[]> {
        return this.apiLogRepository.find({
            where: {endpoint},
            order: {created_at: 'DESC'},
            take: limit,
        });
    }

    async getErrorLogs(limit: number = 100): Promise<ApiLog[]> {
        return this.apiLogRepository.find({
            where: {status_code: 500},
            order: {created_at: 'DESC'},
            take: limit,
        });
    }

    async getSlowQueries(minResponseTime: number = 1000, limit: number = 100): Promise<ApiLog[]> {
        return this.apiLogRepository
            .createQueryBuilder('log')
            .where('log.response_time_ms > :minTime', {minTime: minResponseTime})
            .orderBy('log.response_time_ms', 'DESC')
            .limit(limit)
            .getMany();
    }


    async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await this.apiLogRepository
            .createQueryBuilder()
            .delete()
            .where('created_at < :cutoffDate', {cutoffDate})
            .execute();

        return result.affected || 0;
    }
}
