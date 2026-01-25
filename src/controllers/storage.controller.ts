import {
    Controller,
    Get,
    Param,
    Post,
    Query,
    UploadedFile,
    UploadedFiles,
    UseInterceptors,
    BadRequestException,
    HttpCode
} from '@nestjs/common';
import {FileInterceptor, FilesInterceptor} from '@nestjs/platform-express';
import {StorageService} from '../services/storage.service';

@Controller('storage')
export class StorageController {
    constructor(private readonly storageService: StorageService) {
    }


    @Post('upload')
    @HttpCode(201)
    @UseInterceptors(FilesInterceptor('files', 10))
    async upload(@UploadedFiles() files?: any[], @Query('container') container?: string) {

        if (!files || files.length === 0) {
            throw new BadRequestException('Vui lòng đính kèm file (field: files)');
        }


        const uploadPromises = files.map(file =>
            this.storageService.upload(file.buffer, file.originalname, file.mimetype, container)
        );

        const results = await Promise.all(uploadPromises);

        return {
            totalFiles: results.length,
            files: results
        };
    }


    @Get('files')
    @HttpCode(200)
    async info(@Query('blobName') blobName: string, @Query('container') container?: string) {
        if (!blobName) {
            throw new BadRequestException('Thiếu blobName trong query parameter');
        }
        const result = await this.storageService.getInfo(blobName, container);
        return result;
    }
}


