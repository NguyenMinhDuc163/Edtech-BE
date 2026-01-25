import { Injectable, BadRequestException, NotFoundException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import { User } from '../schema/entities/user.entity';
import { RegisterDto } from '../schema/dtos/register.dto';
import { Role, SystemRole } from '../schema/entities/role.entity';
import { UserRole } from '../schema/entities/user-role.entity';
import { UserCertificate } from '../schema/entities/user-certificate.entity';
import { RefreshToken } from '../schema/entities/refresh-token.entity';
import { instanceToPlain } from 'class-transformer';
import * as bcrypt from "bcrypt";
import { ChangePassDto } from 'src/schema/dtos/change-password.dto';
import { UpdateUserProfileDto } from 'src/schema/dtos/update-user-profile.dto';
import { StorageService } from './storage.service';
import { ApprovalStatus, CourseApproval } from 'src/schema/entities/course-approval.entity';
import { PendingChange } from 'src/schema/entities/pending-change.entity';

@Injectable()
export class UserService {
    findOne(userId: string) {
        throw new Error('Method not implemented.');
    }
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(UserRole)
        private userRoleRepository: Repository<UserRole>,
        @InjectRepository(UserCertificate)
        private userCertificateRepository: Repository<UserCertificate>,
        @InjectRepository(RefreshToken)
        private refreshTokenRepository: Repository<RefreshToken>,
        @InjectRepository(CourseApproval)
        private approvalRepo: Repository<CourseApproval>,
        @InjectRepository(PendingChange)
        private readonly pendingRepo: Repository<PendingChange>,        
        private dataSource: DataSource,
        private readonly storageService: StorageService,
    ) { }

    async findByUsername(username: string): Promise<User> {
        const user = await this.userRepository.findOne({
            where: { username },
            relations: ["roles", "roles.role"],
        });
        if (!user) {
            throw new Error('Không tìm thấy người dùng');
        }
        return user;
    }

    async findByEmail(email: string): Promise<User | null> {
        return await this.userRepository.findOne({
            where: { email },
            relations: ["roles", "roles.role"],
        });
    }

    async findById(id: string): Promise<User> {
        const user = await this.userRepository.findOne({
            where: { id },
            relations: ["roles", "roles.role"],
        });
        if (!user) {
            throw new Error('Không tìm thấy người dùng');
        }
        return user;
    }

    async create(registerDto: RegisterDto): Promise<any> {
        if (!registerDto?.username) throw new BadRequestException('Username là bắt buộc');
        if (!registerDto?.email) throw new BadRequestException('Email là bắt buộc');
        if (!registerDto?.password) throw new BadRequestException('Password là bắt buộc');

        let roleName: SystemRole = SystemRole.STUDENT;
        if (registerDto.role) {
            const allowedRoles = Object.values(SystemRole);
            if (!allowedRoles.includes(registerDto.role)) {
                throw new BadRequestException(`Role không hợp lệ`);
            }
            roleName = registerDto.role as SystemRole;
        }
        console.log('Role to be assigned:', roleName);

        const email = registerDto.email.trim();

        const existingUser = await this.userRepository.findOne({ where: { email } });
        if (existingUser) {
            throw new Error('Email đã được sử dụng');
        }

        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();

        try {
            const roleEntity = await qr.manager.findOne(Role, { where: { name: roleName } });
            if (!roleEntity) {
                throw new NotFoundException('Role không tồn tại trong hệ thống');
            }
            const hashedPassword = await bcrypt.hash(registerDto.password, 10);

            const user = this.userRepository.create({
                username: registerDto.username,
                email: email,
                password: hashedPassword,
            });
            const savedUser = await qr.manager.save(user);

            const userRole = this.userRoleRepository.create({
                user: savedUser,
                role: roleEntity,
                assigned_by: null,
            });
            await qr.manager.save(userRole);
            await qr.commitTransaction();
            return {
                message: 'User created successfully',
            };
        } catch (err: any) {
            await qr.rollbackTransaction();

            console.error('Lỗi khi tạo user:', err);

            if (err.code === '23505') {
                throw new ConflictException('Email đã được sử dụng');
            }

            if (
                err instanceof BadRequestException ||
                err instanceof ConflictException ||
                err instanceof NotFoundException
            ) {
                throw err;
            }

            throw new InternalServerErrorException('Đã xảy ra lỗi khi tạo người dùng');
        } finally {
            await qr.release();
        }
    }

    async getProfile(userId: string) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            relations: ['roles', 'roles.role'],
            select: ['id', 'email', 'username', 'is_active', 'created_at', 'full_name', 'avatar_url', 'phone', 'grade', 'subject_specialty'],
        });

        if (!user) throw new NotFoundException('Không tìm thấy người dùng');

        const roleNames = user.roles.map((ur) => ur.role.name);

        let avatarSasUrl: string | null = null;
        if (user.avatar_url) {
            try {
                avatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                    user.avatar_url,
                    'image',
                    87600
                );
            } catch (error) {
                console.error('Error generating SAS URL for avatar:', error);
            }
        }

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            is_active: user.is_active,
            created_at: user.created_at,
            full_name: user.full_name,
            avatar_url: avatarSasUrl,
            phone: user.phone,
            grade: user.grade,
            subject_specialty: user.subject_specialty,
            roles: roleNames,
        };
    }

    async getProfileWithCertificates(userId: string) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            relations: ['roles', 'roles.role'],
            select: ['id', 'email', 'username', 'is_active', 'created_at', 'full_name', 'avatar_url', 'phone', 'grade', 'subject_specialty'],
        });

        if (!user) throw new NotFoundException('Không tìm thấy người dùng');

        const certificates = await this.userCertificateRepository.find({
            where: { user: { id: userId } },
            order: { created_at: 'DESC' },
        });

        const roleNames = user.roles.map((ur) => ur.role.name);

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            is_active: user.is_active,
            created_at: user.created_at,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            phone: user.phone,
            grade: user.grade,
            subject_specialty: user.subject_specialty,
            roles: roleNames,
            certificates: certificates.map((cert) => ({
                id: cert.id,
                title: cert.title,
                description: cert.description,
                issued_by: cert.issued_by,
                issued_at: cert.issued_at,
                expires_at: cert.expires_at,
                file_url: cert.file_url,
                created_at: cert.created_at,
                updated_at: cert.updated_at,
            })),
        };
    }


    async changePassword(userId: string, changePassDto: ChangePassDto) {
        const { oldPassword, newPassword } = changePassDto;

        try {
            const user = await this.findById(userId);
            if (!user) {
                throw new NotFoundException('Người dùng không tồn tại');
            }

            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) {
                throw new BadRequestException('Mật khẩu cũ không chính xác');
            }

            const isSame = await bcrypt.compare(newPassword, user.password);
            if (isSame) {
                throw new BadRequestException('Mật khẩu mới không được trùng mật khẩu cũ');
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            user.password = hashedPassword;

            await this.userRepository.save(user);

            return { message: 'Đổi mật khẩu thành công' };
        } catch (error) {
            console.error('Lỗi khi đổi mật khẩu:', error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException('Không thể đổi mật khẩu, vui lòng thử lại sau');
        }
    }

    async updateProfile(
        userId: string,
        dto: UpdateUserProfileDto,
        avatarUrl?: string | null,
        certificates?: Array<{
            title?: string;
            description?: string;
            issued_by?: string;
            issued_at?: string;
            expires_at?: string;
            fileUrl?: string | null;
        }>,
    ) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('Không tìm thấy người dùng');
        }

        if (dto.email !== undefined && dto.email !== user.email) {
            const existingUser = await this.userRepository.findOne({ where: { email: dto.email } });
            if (existingUser) {
                throw new ConflictException('Email đã được sử dụng');
            }
            user.email = dto.email;
        }

        if (dto.full_name !== undefined) {
            user.full_name = dto.full_name;
        }
        if (dto.phone !== undefined) {
            user.phone = dto.phone;
        }
        if (dto.grade !== undefined) {
            user.grade = dto.grade;
        }
        if (dto.subject_specialty !== undefined) {
            user.subject_specialty = dto.subject_specialty;
        }
        if (avatarUrl !== undefined) {
            user.avatar_url = avatarUrl;
        }

        await this.userRepository.save(user);

        const createdCertificates: UserCertificate[] = [];
        if (certificates && certificates.length > 0) {
            for (const certificate of certificates) {
                if (certificate.title) {
                    const cert = this.userCertificateRepository.create({
                        user: user,
                        title: certificate.title,
                        description: certificate.description ?? null,
                        issued_by: certificate.issued_by ?? null,
                        issued_at: certificate.issued_at ? new Date(certificate.issued_at) : null,
                        expires_at: certificate.expires_at ? new Date(certificate.expires_at) : null,
                        file_url: certificate.fileUrl ?? null,
                    });
                    const savedCert = await this.userCertificateRepository.save(cert);
                    createdCertificates.push(savedCert);
                }
            }
        }

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            is_active: user.is_active,
            created_at: user.created_at,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            phone: user.phone,
            grade: user.grade,
            subject_specialty: user.subject_specialty,
            certificates: createdCertificates.map((cert) => ({
                id: cert.id,
                title: cert.title,
                description: cert.description,
                issued_by: cert.issued_by,
                issued_at: cert.issued_at,
                expires_at: cert.expires_at,
                file_url: cert.file_url,
            })),
        };
    }

    async updateCertificateFileUrl(certificateId: string, fileUrl: string) {
        const certificate = await this.userCertificateRepository.findOne({ where: { id: certificateId } });
        if (!certificate) {
            throw new NotFoundException('Không tìm thấy chứng chỉ');
        }
        certificate.file_url = fileUrl;
        await this.userCertificateRepository.save(certificate);
    }

    async getTeachers() {
        const teachers = await this.userRepository
            .createQueryBuilder('user')
            .innerJoin('user.roles', 'userRole')
            .innerJoin('userRole.role', 'role')
            .where('role.name = :roleName', { roleName: SystemRole.TEACHER })
            .select([
                'user.id',
                'user.username',
                'user.email',
                'user.full_name',
                'user.avatar_url',
                'user.phone',
                'user.subject_specialty',
                'user.is_active',
                'user.created_at'
            ])
            .getMany();

        return teachers;
    }

    async getActiveTeachersWithDetails() {
        const teachers = await this.userRepository
            .createQueryBuilder('user')
            .innerJoin('user.roles', 'userRole')
            .innerJoin('userRole.role', 'role')
            .where('role.name = :roleName', { roleName: SystemRole.TEACHER })
            .andWhere('user.is_active = :isActive', { isActive: true })
            .select([
                'user.id',
                'user.username',
                'user.email',
                'user.full_name',
                'user.avatar_url',
                'user.phone',
                'user.subject_specialty',
                'user.created_at'
            ])
            .getMany();

        const teachersWithCertificates = await Promise.all(
            teachers.map(async (teacher) => {
                const certificates = await this.userCertificateRepository.find({
                    where: { user: { id: teacher.id } },
                    order: { created_at: 'DESC' },
                });

                return {
                    id: teacher.id,
                    username: teacher.username,
                    email: teacher.email,
                    full_name: teacher.full_name,
                    avatar_url: teacher.avatar_url,
                    phone: teacher.phone,
                    subject_specialty: teacher.subject_specialty,
                    created_at: teacher.created_at,
                    certificates: certificates.map((cert) => ({
                        id: cert.id,
                        title: cert.title,
                        description: cert.description,
                        issued_by: cert.issued_by,
                        issued_at: cert.issued_at,
                        expires_at: cert.expires_at,
                        file_url: cert.file_url,
                        created_at: cert.created_at,
                        updated_at: cert.updated_at,
                    })),
                };
            })
        );

        return teachersWithCertificates;
    }

    async deleteUser(userId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('Không tìm thấy người dùng');
        }

        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();

        try {
            await qr.manager.delete(UserCertificate, { user: { id: userId } });
            await qr.manager.delete(RefreshToken, { userId: userId });
            await qr.manager.delete(User, { id: userId });

            await qr.commitTransaction();
            return { message: 'Xóa người dùng thành công' };
        } catch (error) {
            await qr.rollbackTransaction();
            console.error('Lỗi khi xóa người dùng:', error);
            throw new InternalServerErrorException('Không thể xóa người dùng');
        } finally {
            await qr.release();
        }
    }
    async countStudents(): Promise<{
        students: number;
    }> {
        const result = await this.userRepository
            .createQueryBuilder("u")
            .innerJoin("u.roles", "ur")
            .innerJoin("ur.role", "r")
            .select([
                "COUNT(DISTINCT CASE WHEN r.name = :student THEN u.id END) AS students",
            ])
            .setParameters({
                student: SystemRole.STUDENT,
            })
            .getRawOne();

        return {
            students: Number(result.students) || 0,
        };
    }
    async countTeachers(): Promise<{
        teachers: number;
    }> {
        const result = await this.userRepository
            .createQueryBuilder("u")
            .innerJoin("u.roles", "ur")
            .innerJoin("ur.role", "r")
            .select([
                "COUNT(DISTINCT CASE WHEN r.name = :teacher THEN u.id END) AS teachers",
            ])
            .setParameters({
                teacher: SystemRole.TEACHER,
            })
            .getRawOne();

        return {
            teachers: Number(result.teachers) || 0,
        };
    }
    async updateTrustScore(userId: string, delta: number): Promise<User> {
        const user = await this.findById(userId);

        const currentScore = user.trustScore ?? 50;
        let newScore = currentScore + delta;

        newScore = Math.max(0, Math.min(100, newScore));

        user.trustScore = newScore;
        return this.userRepository.save(user);
    }


    async decreaseTrustScore(userId: string, points: number = 5): Promise<User> {
        return this.updateTrustScore(userId, -points);
    }

    async increaseTrustScore(userId: string, points: number = 5): Promise<User> {
        return this.updateTrustScore(userId, points);
    }

    async getRecentViolationCount(userId: string): Promise<number> {
        // 1️⃣ Lấy 3 course approval gần nhất của teacher
        const recentApprovals = await this.approvalRepo.find({
        where: { course: { owner: { id: userId } } },
        order: { created_at: 'DESC' },
        take: 3,
        });

        const approvalViolations = recentApprovals.filter(a => a.status === ApprovalStatus.REJECTED).length;

        // 2️⃣ Lấy 7 pending change gần nhất của teacher
        const recentPending = await this.pendingRepo.find({
        where: { submittedBy: { id: userId } },
        order: { createdAt: 'DESC' },
        take: 7,
        });

        const pendingViolations = recentPending.filter(p => p.status === 'rejected').length;

        // Tổng vi phạm
        return approvalViolations + pendingViolations;
    }

}