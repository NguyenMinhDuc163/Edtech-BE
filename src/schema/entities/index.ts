import { User } from "./user.entity";
import { UserRole } from "./user-role.entity";
import { Role } from "./role.entity";
import { RefreshToken } from "./refresh-token.entity";
import { Course } from "./course.entity";
import { CourseSection } from "./course-section.entity";
import { CourseContent } from "./course-content.entity";
import { ContentFile } from "./content-file.entity";
import { CourseRegistration } from "./course-registration.entity";
import { Grade } from "./grade.entity";
import { LearningLog } from "./learning-log.entity";
import { QuestionBank } from "./question-bank.entity";
import { CourseQuestion } from "./course-question.entity";
import { Answer } from "./answer.entity";
import { QuizResult } from "./quiz-result.entity";
import { QuizAttempt } from "./quiz-attempt.entity";
import { QuizResponse } from "./quiz-response.entity";
import { PasswordResetToken } from "./password-reset-token.entity";
import { CourseReview } from "./course-review.entity";
import { SearchHistory } from './search-history.entity';
import { ApiLog } from './api-log.entity';
import { SystemParameter } from './system-parameter.entity';
import { CourseApproval } from "./course-approval.entity";
import { PendingChange } from "./pending-change.entity";
import { ContentRelationship } from "./content_relationships.entity";
import { UserContentMastery } from "./user-content-mastery.entity";
import { Payment } from "./payment.entity";
import { UserCertificate } from "./user-certificate.entity";
import { Refund } from "./refund.entity";
import { ChatSession } from "./chat-session.entity";
import { ChatMessage } from "./chat-message.entity";
import { TranscriptChunk } from "./transcript-chunk.entity";

export const entities = [
    User,
    UserRole,
    Role,
    RefreshToken,
    Course,
    CourseSection,
    CourseContent,
    ContentFile,
    CourseRegistration,
    Grade,
    LearningLog,
    QuestionBank,
    CourseQuestion,
    Answer,
    QuizResult,
    QuizAttempt,
    QuizResponse,
    PasswordResetToken,
    CourseReview,
    SearchHistory,
    ApiLog,
    SystemParameter,
    CourseApproval,
    PendingChange,
    ContentRelationship,
    UserContentMastery,
    PendingChange,
    Payment,
    Refund,
    UserCertificate,
    ChatSession,
    ChatMessage,
    TranscriptChunk
];