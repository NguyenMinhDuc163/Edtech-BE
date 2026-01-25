import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import {Observable} from 'rxjs';
import {tap, catchError} from 'rxjs/operators';
import {Request, Response} from 'express';
import {ApiLogService} from 'src/services/api-log.service';

@Injectable()
export class ApiLogInterceptor implements NestInterceptor {
    constructor(private readonly apiLogService: ApiLogService) {
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest<Request>();
        const response = context.switchToHttp().getResponse<Response>();

        const startTime = Date.now();


        const requestData = {
            method: request.method,
            endpoint: request.originalUrl,
            ip_address: request.ip || request.connection.remoteAddress || undefined,
            user_agent: request.get('User-Agent') || undefined,
            request_headers: this.sanitizeHeaders(request.headers),
            request_body: this.sanitizeBody(request.body),
            query_params: request.query,
            user_id: (request as any).user?.id || undefined,
        };

        return next.handle().pipe(
            tap((responseData) => {

                const responseTime = Date.now() - startTime;

                this.apiLogService.logApiCall({
                    ...requestData,
                    status_code: response.statusCode,
                    response_body: this.sanitizeResponse(responseData),
                    response_time_ms: responseTime,
                    error_message: undefined,
                    error_code: undefined,
                });
            }),
            catchError((error) => {

                const responseTime = Date.now() - startTime;

                this.apiLogService.logApiCall({
                    ...requestData,
                    status_code: error.status || 500,
                    response_body: undefined,
                    response_time_ms: responseTime,
                    error_message: error.message,
                    error_code: error.code || 'INTERNAL_ERROR',
                });

                throw error;
            }),
        );
    }

    private sanitizeHeaders(headers: any): any {

        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
        const sanitized = {...headers};

        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    private sanitizeBody(body: any): any {
        if (!body) return null;


        const sensitiveFields = ['password', 'token', 'secret', 'key'];
        const sanitized = {...body};

        sensitiveFields.forEach(field => {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    private sanitizeResponse(response: any): any {
        if (!response) return null;


        const responseStr = JSON.stringify(response);
        if (responseStr.length > 10000) {
            return {
                message: 'Response too large, truncated',
                size: responseStr.length,
                preview: responseStr.substring(0, 1000) + '...'
            };
        }

        return response;
    }
}
