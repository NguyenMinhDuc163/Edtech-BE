import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let errors: any = null;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res: any = exception.getResponse();

            if (typeof res === 'string') {
                message = res;
            } else if (typeof res === 'object') {
                message = res.message || message;
                errors = res.errors || res.message || null;
            }
        } else if (exception instanceof Error) {
            message = exception.message || message;
        }

        console.log('🔴 Exception Filter Caught:', {
            path: request.url,
            method: request.method,
            exceptionStatus: status,
            message
        });

        response.status(status).json({
            status,
            message,
            data: errors
        });
    }
}
