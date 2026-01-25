import { AuthController } from "../controllers/auth.controller";
import { UsersController } from "./user.controller";
import { CourseController } from "./course.controller";
import { SectionController } from "./section.controller";
import { ContentController } from "./content.controller";
import { CourseReviewController } from "./course-review.controller";
import { QuizController } from "./quiz.controller";
import { StudentCourseController } from "./student/student-course.controller";
import { StudentRegistrationController } from "./student/student-registration.controller";
import { SearchController } from './search.controller';
import { CoursePreviewController } from './admin/course-preview.controller';
import { ChatController } from './chat.controller';
import { StudentQuizController } from './student/quiz.controller';
import { StorageController } from './storage.controller';
import { ApproveController } from "./admin/course-approve.controller";
import { PendingChangeController } from "./pending-change.controller";
import { QuizResultController } from "./admin/quiz-result.controller";
import { AdminCourseController } from "./admin/course.controller";
import { PaymentController } from "./payment.controller";
import { RecommendationController } from "./recommendation.controller";
import { TeacherStatisticsController } from "./teacher/teacher-statistics.controller";
import { LearningController } from "./learning.controller";
import { AdminDashboardController } from "./admin/admin-dashboard.controller";
import { RefundController } from "./refund.controller";
import { SystemParameterController } from "./admin/system-parameter.controller";
import { RagController } from "./rag.controller";
import { ContentMappingController } from "./content-mapping.controller";
 export const controllers = [
    AuthController,
    UsersController,
    CourseController,
    SectionController,
    ContentController,
    CourseReviewController,
    QuizController,
    StudentCourseController,
    StudentRegistrationController,
    SearchController,
    CoursePreviewController,
    ChatController,
    StudentQuizController,
    StorageController,
    ApproveController,
    PendingChangeController,
    QuizResultController,
    AdminCourseController,
    RecommendationController,
    TeacherStatisticsController,
    PaymentController,
    RefundController,
    LearningController,
    AdminDashboardController,
    SystemParameterController,
    RagController,
    ContentMappingController,
];