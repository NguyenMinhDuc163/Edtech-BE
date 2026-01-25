import { Controller, Get, UseGuards, Post, HttpCode, Req, Body, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { SystemRole } from '../schema/entities/role.entity';
import { Request } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../services/storage.service';
import { UserService } from '../services/user.service';
import { UpdateUserProfileDto } from '../schema/dtos/update-user-profile.dto';
import { STORAGE_CONTAINERS } from '../constants/storage';
import { Public } from "../common/decorators/public.decorator";
import * as path from 'path';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {

    constructor(
        private readonly userService: UserService,
        private readonly storageService: StorageService,
    ) {
    }

    @Get('teachers')
    @HttpCode(200)
    @Roles(SystemRole.ADMIN)
    async getTeachers() {
        const teachers = await this.userService.getTeachers();

        const teachersWithSas = await Promise.all(
            teachers.map(async (teacher) => {
                let avatarSasUrl: string | null = null;
                if (teacher.avatar_url) {
                    try {
                        avatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                            teacher.avatar_url,
                            'image',
                            87600
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL for avatar:', error);
                    }
                }
                return {
                    ...teacher,
                    avatar_url: avatarSasUrl,
                };
            })
        );

        return teachersWithSas;
    }

    @Get('list-teacher')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT)
    async getActiveTeachers() {
        const teachers = await this.userService.getActiveTeachersWithDetails();

        const teachersWithSas = await Promise.all(
            teachers.map(async (teacher) => {
                let avatarSasUrl: string | null = null;
                if (teacher.avatar_url) {
                    try {
                        avatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                            teacher.avatar_url,
                            'image',
                            87600
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL for avatar:', error);
                    }
                }

                const certificatesWithSas = await Promise.all(
                    teacher.certificates.map(async (cert) => {
                        let fileSasUrl: string | null = null;
                        if (cert.file_url) {
                            try {
                                fileSasUrl = await this.storageService.generateSasUrlFromUrl(
                                    cert.file_url,
                                    'document',
                                    87600
                                );
                            } catch (error) {
                                console.error('Error generating SAS URL for certificate file:', error);
                            }
                        }
                        return {
                            ...cert,
                            file_url: fileSasUrl,
                        };
                    })
                );

                return {
                    ...teacher,
                    avatar_url: avatarSasUrl,
                    certificates: certificatesWithSas,
                };
            })
        );

        return teachersWithSas;
    }

    @Post('delete')
    @HttpCode(200)
    @Roles(SystemRole.ADMIN)
    async deleteUser(@Body('userId') userId: string) {
        return await this.userService.deleteUser(userId);
    }

    @Get('me/profile')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER, SystemRole.ADMIN)
    async getProfile(@Req() req: Request) {
        const userId = (req as any).user?.id;
        const profile = await this.userService.getProfileWithCertificates(userId);
        
        let avatarSasUrl: string | null = null;
        if (profile.avatar_url) {
            try {
                avatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                    profile.avatar_url,
                    'image',
                    87600
                );
            } catch (error) {
                console.error('Error generating SAS URL for avatar:', error);
            }
        }

        const certificatesWithSas = await Promise.all(
            (profile.certificates || []).map(async (cert) => {
                let fileSasUrl: string | null = null;
                if (cert.file_url) {
                    try {
                        fileSasUrl = await this.storageService.generateSasUrlFromUrl(
                            cert.file_url,
                            'document',
                            87600
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL for certificate file:', error);
                    }
                }
                return {
                    ...cert,
                    file_url: fileSasUrl,
                };
            })
        );

        return {
            ...profile,
            avatar_url: avatarSasUrl,
            certificates: certificatesWithSas,
        };
    }

    @Post('me/profile')
    @HttpCode(200)
    @Roles(SystemRole.STUDENT, SystemRole.TEACHER, SystemRole.ADMIN)
    @UseInterceptors(
        FileFieldsInterceptor([
            { name: 'avatar', maxCount: 1 },
            { name: 'certificate_file', maxCount: 10 },
        ]),
    )
    async updateProfile(
        @Req() req: Request,
        @UploadedFiles()
        files: any,
    ) {
        const userId = (req as any).user?.id;
        const user = await this.userService.findById(userId);
        const username = user.username;
        const body = req.body || {};

        let avatarUrl: string | undefined;

        const avatar = files?.avatar && files.avatar[0];
        if (avatar) {
            const extension = path.extname(avatar.originalname);
            const newFilename = `${username}_${userId}${extension}`;
            const uploadResult = await this.storageService.upload(
                avatar.buffer,
                newFilename,
                avatar.mimetype,
                STORAGE_CONTAINERS.AVATARS,
            );
            avatarUrl = uploadResult.url;
        }

        const userProfileDto: UpdateUserProfileDto = {
            full_name: body.full_name,
            email: body.email,
            phone: body.phone,
            grade: body.grade,
            subject_specialty: body.subject_specialty,
        };

        const certificatePayloads: Array<{
            title?: string;
            description?: string;
            issued_by?: string;
            issued_at?: string;
            expires_at?: string;
            fileUrl?: string | null;
        }> = [];

        const titles = Array.isArray(body.certificate_title) ? body.certificate_title : (body.certificate_title ? [body.certificate_title] : []);
        const descriptions = Array.isArray(body.certificate_description) ? body.certificate_description : (body.certificate_description ? [body.certificate_description] : []);
        const issuedBys = Array.isArray(body.certificate_issued_by) ? body.certificate_issued_by : (body.certificate_issued_by ? [body.certificate_issued_by] : []);
        const issuedAts = Array.isArray(body.certificate_issued_at) ? body.certificate_issued_at : (body.certificate_issued_at ? [body.certificate_issued_at] : []);
        const expiresAts = Array.isArray(body.certificate_expires_at) ? body.certificate_expires_at : (body.certificate_expires_at ? [body.certificate_expires_at] : []);

        for (let i = 0; i < titles.length; i++) {
            if (titles[i]) {
                certificatePayloads.push({
                    title: titles[i],
                    description: descriptions[i] || null,
                    issued_by: issuedBys[i] || null,
                    issued_at: issuedAts[i] || null,
                    expires_at: expiresAts[i] || null,
                    fileUrl: null,
                });
            }
        }

        const updated = await this.userService.updateProfile(userId, userProfileDto, avatarUrl, certificatePayloads);

        const certificateFiles = files?.certificate_file || [];
        for (let i = 0; i < certificateFiles.length && i < updated.certificates.length; i++) {
            const file = certificateFiles[i];
            const cert = updated.certificates[i];
            if (file && cert && cert.id) {
                const extension = path.extname(file.originalname);
                const newFilename = `${username}_cert_${cert.id}${extension}`;
                const uploadResult = await this.storageService.upload(
                    file.buffer,
                    newFilename,
                    file.mimetype,
                    STORAGE_CONTAINERS.CERTIFICATES,
                );
                await this.userService.updateCertificateFileUrl(cert.id, uploadResult.url);
                cert.file_url = uploadResult.url;
            }
        }

        let avatarSasUrl: string | null = null;
        if (updated.avatar_url) {
            try {
                avatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                    updated.avatar_url,
                    'image',
                    87600
                );
            } catch (error) {
                console.error('Error generating SAS URL for avatar:', error);
            }
        }

        const certificatesWithSas = await Promise.all(
            updated.certificates.map(async (cert) => {
                let fileSasUrl: string | null = null;
                if (cert.file_url) {
                    try {
                        fileSasUrl = await this.storageService.generateSasUrlFromUrl(
                            cert.file_url,
                            'document',
                            87600
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL for certificate file:', error);
                    }
                }
                return {
                    ...cert,
                    file_url: fileSasUrl,
                };
            })
        );

        return {
            ...updated,
            avatar_url: avatarSasUrl,
            certificates: certificatesWithSas,
        };
    }
    @Public()
    @Get("count/students")
    async countStudents() {
        return await this.userService.countStudents();
    }

    @Public()
    @Get("count/teachers")
    async countTeachers() {
        return await this.userService.countTeachers();
    }
}
