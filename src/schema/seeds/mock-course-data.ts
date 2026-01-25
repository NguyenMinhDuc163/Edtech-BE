import {DataSource} from "typeorm";
import {AppDataSource} from "../datasource";
import {User} from "../entities/user.entity";
import {Role, SystemRole} from "../entities/role.entity";
import {UserRole} from "../entities/user-role.entity";
import {Course, CourseVisibility, CourseStatus, CourseCategory} from "../entities/course.entity";
import {CourseSection} from "../entities/course-section.entity";
import {CourseContent} from "../entities/course-content.entity";
import {ContentFile, FileType} from "../entities/content-file.entity";

async function seedMockCourseData() {
    await AppDataSource.initialize();

    try {

        const roleRepo = AppDataSource.getRepository(Role);
        const existingRoles = await roleRepo.find();

        if (existingRoles.length === 0) {
            const roles = [
                {name: SystemRole.STUDENT},
                {name: SystemRole.TEACHER},
                {name: SystemRole.ADMIN},
                {name: SystemRole.GUEST}
            ];

            for (const roleData of roles) {
                const role = roleRepo.create(roleData);
                await roleRepo.save(role);
                console.log(`Created role: ${roleData.name}`);
            }
        }


        const userRepo = AppDataSource.getRepository(User);
        const studentRole = await roleRepo.findOne({where: {name: SystemRole.STUDENT}});
        const teacherRole = await roleRepo.findOne({where: {name: SystemRole.TEACHER}});

        const users = [
            {
                username: "student",
                email: "student@example.com",
                password: "111111"
            },
            {
                username: "teacher",
                email: "teacher@example.com",
                password: "111111"
            }
        ];

        const createdUsers = [];
        for (const userData of users) {
            const existingUser = await userRepo.findOne({where: {email: userData.email}});
            if (!existingUser) {
                const user = userRepo.create(userData);
                await user.setPassword(userData.password);
                const savedUser = await userRepo.save(user);
                createdUsers.push(savedUser);
                console.log(`Created user: ${userData.username}`);
            } else {
                createdUsers.push(existingUser);
            }
        }


        const userRoleRepo = AppDataSource.getRepository(UserRole);


        const studentUser = createdUsers[0]!;
        const existingStudentRole = await userRoleRepo.findOne({
            where: {user: {id: studentUser.id}, role: {id: studentRole!.id}}
        });
        if (!existingStudentRole) {
            const userRole = userRoleRepo.create({
                user: studentUser,
                role: studentRole!
            });
            await userRoleRepo.save(userRole);
            console.log(`Assigned STUDENT role to: ${studentUser.username}`);
        }


        const teacherUser = createdUsers[1]!;
        const existingTeacherRole = await userRoleRepo.findOne({
            where: {user: {id: teacherUser.id}, role: {id: teacherRole!.id}}
        });
        if (!existingTeacherRole) {
            const userRole = userRoleRepo.create({
                user: teacherUser,
                role: teacherRole!
            });
            await userRoleRepo.save(userRole);
            console.log(`Assigned TEACHER role to: ${teacherUser.username}`);
        }


        const teacher1Id = teacherUser.id;
        const teacher2Id = teacherUser.id;

        const courseRepo = AppDataSource.getRepository(Course);
        const courses = [
            {
                title: "Lập trình JavaScript từ cơ bản đến nâng cao",
                description: "Khóa học toàn diện về JavaScript, từ cú pháp cơ bản đến các framework hiện đại",
                price: "299000",
                currency: "VND",
                visibility: CourseVisibility.PUBLIC,
                status: CourseStatus.APPROVED,
                is_paid: true,
                course_duration: "40 giờ",
                teacher: "Nguyễn Văn A",
                category: CourseCategory.PROGRAMMING_FOUNDATION,
                thumbnail_url: "https://im24x7.com/wp-content/uploads/2024/06/1_U62pEikCBvM1gjIDlAry7Q.png",
                course_description: "Khóa học JavaScript hoàn chỉnh cho người mới bắt đầu",
                user_id: teacher1Id
            },
            {
                title: "React.js - Xây dựng ứng dụng web hiện đại",
                description: "Học React.js từ cơ bản, xây dựng các ứng dụng web tương tác",
                price: "399000",
                currency: "VND",
                visibility: CourseVisibility.PUBLIC,
                status: CourseStatus.APPROVED,
                is_paid: true,
                course_duration: "35 giờ",
                teacher: "Trần Thị B",
                category: CourseCategory.WEB_DEVELOPMENT,
                course_description: "Khóa học React.js chuyên sâu với dự án thực tế",
                thumbnail_url: "https://im24x7.com/wp-content/uploads/2024/06/1_U62pEikCBvM1gjIDlAry7Q.png",
                user_id: teacher2Id
            },
            {
                title: "Python cho người mới bắt đầu",
                description: "Khóa học Python miễn phí, phù hợp cho người chưa biết lập trình",
                price: "0",
                currency: "VND",
                visibility: CourseVisibility.PUBLIC,
                status: CourseStatus.APPROVED,
                is_paid: false,
                course_duration: "25 giờ",
                teacher: "Lê Văn C",
                category: CourseCategory.PROGRAMMING_FOUNDATION,
                course_description: "Khóa học Python cơ bản hoàn toàn miễn phí",
                thumbnail_url: "https://im24x7.com/wp-content/uploads/2024/06/1_U62pEikCBvM1gjIDlAry7Q.png",
                user_id: teacher1Id
            }
        ];

        const createdCourses = [];
        for (const courseData of courses) {
            const course = courseRepo.create(courseData);
            const savedCourse = await courseRepo.save(course);
            createdCourses.push(savedCourse);
            console.log(`Created course: ${courseData.title}`);
        }


        const sectionRepo = AppDataSource.getRepository(CourseSection);


        const jsSections = [
            {
                title: "Giới thiệu JavaScript",
                description: "Tìm hiểu về JavaScript và môi trường phát triển",
                order_index: 1,
                is_preview: "Y",
                course_id: createdCourses[0]!.course_id
            },
            {
                title: "Biến và kiểu dữ liệu",
                description: "Học về khai báo biến và các kiểu dữ liệu trong JavaScript",
                order_index: 2,
                is_preview: "Y",
                course_id: createdCourses[0]!.course_id
            },
            {
                title: "Hàm và Scope",
                description: "Tìm hiểu về hàm, closure và phạm vi biến",
                order_index: 3,
                is_preview: "N",
                course_id: createdCourses[0]!.course_id
            },
            {
                title: "DOM Manipulation",
                description: "Thao tác với DOM và xử lý sự kiện",
                order_index: 4,
                is_preview: "N",
                course_id: createdCourses[0]!.course_id
            }
        ];


        const reactSections = [
            {
                title: "Giới thiệu React",
                description: "Tìm hiểu về React và JSX",
                order_index: 1,
                is_preview: "Y",
                course_id: createdCourses[1]!.course_id
            },
            {
                title: "Components và Props",
                description: "Học cách tạo và sử dụng components",
                order_index: 2,
                is_preview: "N",
                course_id: createdCourses[1]!.course_id
            },
            {
                title: "State và Lifecycle",
                description: "Quản lý state và lifecycle methods",
                order_index: 3,
                is_preview: "N",
                course_id: createdCourses[1]!.course_id
            }
        ];


        const pythonSections = [
            {
                title: "Cài đặt Python",
                description: "Hướng dẫn cài đặt Python và môi trường phát triển",
                order_index: 1,
                is_preview: "Y",
                course_id: createdCourses[2]!.course_id
            },
            {
                title: "Cú pháp cơ bản",
                description: "Học cú pháp cơ bản của Python",
                order_index: 2,
                is_preview: "N",
                course_id: createdCourses[2]!.course_id
            },
            {
                title: "Cấu trúc dữ liệu",
                description: "List, Dictionary, Tuple trong Python",
                order_index: 3,
                is_preview: "N",
                course_id: createdCourses[2]!.course_id
            }
        ];

        const allSections = [...jsSections, ...reactSections, ...pythonSections];
        const createdSections = [];

        for (const sectionData of allSections) {
            const section = sectionRepo.create(sectionData);
            const savedSection = await sectionRepo.save(section);
            createdSections.push(savedSection);
            console.log(`Created section: ${sectionData.title}`);
        }


        const contentRepo = AppDataSource.getRepository(CourseContent);


        const jsIntroContents = [
            {
                title: "JavaScript là gì?",
                description: "Tìm hiểu về JavaScript và vai trò của nó trong web development",
                is_preview: "Y",
                courses_id: createdCourses[0]!.course_id,
                section_id: createdSections[0]!.section_id
            },
            {
                title: "Môi trường phát triển",
                description: "Cài đặt và cấu hình môi trường phát triển JavaScript",
                is_preview: "Y",
                courses_id: createdCourses[0]!.course_id,
                section_id: createdSections[0]!.section_id
            }
        ];


        const jsVarContents = [
            {
                title: "Khai báo biến với var, let, const",
                description: "Học cách khai báo biến và sự khác biệt giữa var, let, const",
                is_preview: "Y",
                courses_id: createdCourses[0]!.course_id,
                section_id: createdSections[1]!.section_id
            },
            {
                title: "Các kiểu dữ liệu cơ bản",
                description: "String, Number, Boolean, Undefined, Null trong JavaScript",
                is_preview: "N",
                courses_id: createdCourses[0]!.course_id,
                section_id: createdSections[1]!.section_id
            }
        ];


        const jsFuncContents = [
            {
                title: "Tạo và gọi hàm",
                description: "Học cách tạo function và gọi hàm trong JavaScript",
                is_preview: "N",
                courses_id: createdCourses[0]!.course_id,
                section_id: createdSections[2]!.section_id
            },
            {
                title: "Arrow Functions",
                description: "Tìm hiểu về arrow functions và sự khác biệt với function thường",
                is_preview: "N",
                courses_id: createdCourses[0]!.course_id,
                section_id: createdSections[2]!.section_id
            }
        ];


        const reactIntroContents = [
            {
                title: "React là gì?",
                description: "Giới thiệu về React và tại sao nên sử dụng React",
                is_preview: "Y",
                courses_id: createdCourses[1]!.course_id,
                section_id: createdSections[4]!.section_id
            },
            {
                title: "JSX Syntax",
                description: "Học cú pháp JSX và cách viết component",
                is_preview: "Y",
                courses_id: createdCourses[1]!.course_id,
                section_id: createdSections[4]!.section_id
            }
        ];


        const pythonIntroContents = [
            {
                title: "Tải và cài đặt Python",
                description: "Hướng dẫn tải Python từ python.org và cài đặt",
                is_preview: "Y",
                courses_id: createdCourses[2]!.course_id,
                section_id: createdSections[7]!.section_id
            },
            {
                title: "IDE và Text Editor",
                description: "Giới thiệu các IDE và text editor phù hợp cho Python",
                is_preview: "Y",
                courses_id: createdCourses[2]!.course_id,
                section_id: createdSections[7]!.section_id
            }
        ];

        const allContents = [
            ...jsIntroContents,
            ...jsVarContents,
            ...jsFuncContents,
            ...reactIntroContents,
            ...pythonIntroContents
        ];

        const createdContents = [];
        for (const contentData of allContents) {
            const content = contentRepo.create(contentData);
            const savedContent = await contentRepo.save(content);
            createdContents.push(savedContent);
            console.log(`Created content: ${contentData.title}`);
        }


        if (createdCourses.length < 3) {
            throw new Error("Không đủ courses được tạo");
        }
        if (createdSections.length < 10) {
            throw new Error("Không đủ sections được tạo");
        }
        if (createdContents.length < 10) {
            throw new Error("Không đủ contents được tạo");
        }


        const fileRepo = AppDataSource.getRepository(ContentFile);

        const contentFiles = [

            {
                title: "Video giới thiệu JavaScript",
                filename: "js-intro-video.mp4",
                url: "https://www.youtube.com/watch?v=xvFZjo5PgG0&list=RDxvFZjo5PgG0&start_radio=1",
                file_type: FileType.VIDEO,
                file_size: 15728640,
                mime_type: "video/mp4",
                order_index: 1,
                is_preview: "Y",
                content_id: createdContents[0]!.content_id
            },
            {
                title: "Slide bài giảng",
                filename: "js-intro-slides.pdf",
                url: "https://example.com/slides/js-intro.pdf",
                file_type: FileType.PDF,
                file_size: 2097152,
                mime_type: "application/pdf",
                order_index: 2,
                is_preview: "Y",
                content_id: createdContents[0]!.content_id
            },

            {
                title: "Video hướng dẫn khai báo biến",
                filename: "js-variables-video.mp4",
                url: "https://www.youtube.com/watch?v=xvFZjo5PgG0&list=RDxvFZjo5PgG0&start_radio=1",
                file_type: FileType.VIDEO,
                file_size: 20971520,
                mime_type: "video/mp4",
                order_index: 1,
                is_preview: "Y",
                content_id: createdContents[2]!.content_id
            },
            {
                title: "Bài tập thực hành",
                filename: "js-variables-exercise.pdf",
                url: "https://thanhthuy.phutho.gov.vn/pic/filelibrary/02-giaotr_636416673491517447.pdf",
                file_type: FileType.PDF,
                file_size: 1048576,
                mime_type: "application/pdf",
                order_index: 2,
                is_preview: "N",
                content_id: createdContents[2]!.content_id
            },

            {
                title: "Video giới thiệu React",
                filename: "react-intro-video.mp4",
                url: "https://www.youtube.com/watch?v=xvFZjo5PgG0&list=RDxvFZjo5PgG0&start_radio=1",
                file_type: FileType.VIDEO,
                file_size: 25165824,
                mime_type: "video/mp4",
                order_index: 1,
                is_preview: "Y",
                content_id: createdContents[6]!.content_id
            },

            {
                title: "Video hướng dẫn cài đặt Python",
                filename: "python-install-video.mp4",
                url: "https://www.youtube.com/watch?v=xvFZjo5PgG0&list=RDxvFZjo5PgG0&start_radio=1",
                file_type: FileType.VIDEO,
                file_size: 31457280,
                mime_type: "video/mp4",
                order_index: 1,
                is_preview: "Y",
                content_id: createdContents[8]!.content_id
            },
            {
                title: "Tài liệu hướng dẫn",
                filename: "python-install-guide.pdf",
                url: "https://thanhthuy.phutho.gov.vn/pic/filelibrary/02-giaotr_636416673491517447.pdf",
                file_type: FileType.PDF,
                file_size: 524288,
                mime_type: "application/pdf",
                order_index: 2,
                is_preview: "Y",
                content_id: createdContents[8]!.content_id
            }
        ];

        for (const fileData of contentFiles) {
            const file = fileRepo.create(fileData);
            await fileRepo.save(file);
            console.log(`Created file: ${fileData.title}`);
        }

        console.log("\n=== MOCK DATA CREATED SUCCESSFULLY ===");
        console.log(`- ${createdUsers.length} users created`);
        console.log(`- ${createdCourses.length} courses created`);
        console.log(`- ${createdSections.length} sections created`);
        console.log(`- ${createdContents.length} contents created`);
        console.log(`- ${contentFiles.length} files created`);
        console.log("\n=== LOGIN CREDENTIALS ===");
        console.log("Student: student / 111111");
        console.log("Teacher: teacher / 111111");

    } catch (error) {
        console.error("Error creating mock data:", error);
    } finally {
        await AppDataSource.destroy();
    }
}

seedMockCourseData().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
