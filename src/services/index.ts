import { AuthService } from "./auth.service";
import { UserService } from "./user.service";
import { RefreshTokenService } from "./refresh-token.service";
import { GoogleAuthService } from "./google-auth.service";
import { EmailService } from "./auth-email.service";
import { PasswordResetService } from "./password-reset.service";
import { CourseService } from "./course.service";
import { SectionService } from "./section.service";
import { ContentService } from "./content.service";
import { CourseReviewService } from "./course-review.service";
import { QuizService } from "./quiz.service";
import { SearchService } from './search.service';
import { ApiLogService } from './api-log.service';
import { ChatService } from './chat.service';
import { StorageService } from './storage.service';
import { ApproveService } from "./approve.service";
import { PendingChangeService } from "./pending-change.service";
import { QuizResultService } from "./quiz-result.service";
import { VnpayService } from "./vnpay.service";
import { RecommendationService } from "./recommendation.service";
import { TeacherStatisticsService } from "./teacher-statistics.service";
import { PaymentService } from "./payment.service";
import { SystemParameterService } from "./system-parameter.service";
import { LearningService } from "./learning.service";
import { MasteryService } from "./mastery.service";
import { AdminDashboardService } from "./admin-dashboard.service";
import { RefundService } from "./refund.service";
import { AICourseService } from "./ai-course.service";
import { RagService } from "./rag.service";
import { ContentMappingService } from "./content-mapping.service";

export const services = [
    AuthService,
    UserService,
    RefreshTokenService,
    GoogleAuthService,
    EmailService,
    PasswordResetService,
    CourseService,
    SectionService,
    ContentService,
    CourseReviewService,
    QuizService,
    SearchService,
    ApiLogService,
    ChatService,
    StorageService,
    ApproveService,
    PendingChangeService,
    QuizResultService,
    RecommendationService,
    TeacherStatisticsService,
    VnpayService,
    PaymentService,
    RefundService,
    SystemParameterService,
    LearningService,
    MasteryService,
    AdminDashboardService,
    AICourseService,
    RagService,
    ContentMappingService,
];