-- =============================================================
-- ED-TECH PostgreSQL DDL
-- Mục tiêu: tạo CSDL và tất cả bảng theo ERD đính kèm
-- Lưu ý: nếu chạy bằng psql, bạn có thể bật dòng \connect bên dưới
-- =============================================================

-- Tạo database (tuỳ chọn). Nếu đã có, hãy bỏ qua lệnh này.
-- CREATE DATABASE ed_tech;
-- \connect ed_tech

-- An toàn khi chạy lại file: xoá bảng theo thứ tự phụ thuộc
BEGIN;

DROP TABLE IF EXISTS quiz_results          CASCADE;
DROP TABLE IF EXISTS notifications         CASCADE;
DROP TABLE IF EXISTS learning_logs         CASCADE;
DROP TABLE IF EXISTS grades                CASCADE;
DROP TABLE IF EXISTS answers               CASCADE;
DROP TABLE IF EXISTS course_questions      CASCADE;
DROP TABLE IF EXISTS question_bank         CASCADE;
DROP TABLE IF EXISTS schedules             CASCADE;
DROP TABLE IF EXISTS course_contents       CASCADE;
DROP TABLE IF EXISTS course_registrations  CASCADE;
DROP TABLE IF EXISTS learning_path         CASCADE;
DROP TABLE IF EXISTS courses               CASCADE;
DROP TABLE IF EXISTS user_roles            CASCADE;
DROP TABLE IF EXISTS user_role             CASCADE;
DROP TABLE IF EXISTS roles                 CASCADE;
DROP TABLE IF EXISTS refresh_tokens        CASCADE;
DROP TABLE IF EXISTS users                 CASCADE;

-- Bật extension để sinh UUID
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- BẢNG NGƯỜI DÙNG VÀ VAI TRÒ
-- =========================

CREATE TABLE users (
                       id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                       username       VARCHAR(100) NOT NULL,
                       email          VARCHAR(255) NOT NULL UNIQUE,
                       password       VARCHAR(255) NOT NULL,
                       is_active      BOOLEAN NOT NULL DEFAULT TRUE,
                       created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                       updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'roles_name_enum') THEN
        CREATE TYPE roles_name_enum AS ENUM ('student','teacher','admin');
    END IF;
END $$;

CREATE TABLE roles (
                       id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                       name  roles_name_enum NOT NULL DEFAULT 'student',
                       CONSTRAINT uq_roles_name UNIQUE (name)
);

CREATE TABLE user_roles (
                            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            "userId"     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            "roleId"     UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
                            assigned_by  VARCHAR NULL,
                            assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            CONSTRAINT uq_user_roles_user_role UNIQUE ("userId", "roleId")
);
CREATE INDEX idx_user_roles_user ON user_roles("userId");
CREATE INDEX idx_user_roles_role ON user_roles("roleId");

-- Bảng refresh token phục vụ auth
CREATE TABLE refresh_tokens (
                                id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                "userId"      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                "tokenHash"   TEXT NOT NULL,
                                "deviceInfo"  TEXT NULL,
                                ip            TEXT NULL,
                                "expiresAt"   TIMESTAMP NOT NULL,
                                "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens("userId");

-- =========================
-- BẢNG KHOÁ HỌC VÀ ĐĂNG KÝ
-- =========================

CREATE TABLE courses (
                         course_id   BIGSERIAL PRIMARY KEY,
                         title       VARCHAR(255) NOT NULL,
                         category    VARCHAR(255),
                         price       NUMERIC(10,2) DEFAULT 0,
                         description TEXT,
                         created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                         user_id     UUID REFERENCES users(id) ON DELETE SET NULL -- chủ sở hữu/giảng viên
);

CREATE TABLE course_registrations (
                                      registration_id BIGSERIAL PRIMARY KEY,
                                      registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                                      progress        NUMERIC(5,2) NOT NULL DEFAULT 0, -- % hoàn thành 0..100
                                      user_id         UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
                                      course_id       BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
                                      CONSTRAINT uq_course_registration UNIQUE (user_id, course_id)
);

CREATE INDEX idx_course_reg_user ON course_registrations(user_id);
CREATE INDEX idx_course_reg_course ON course_registrations(course_id);

-- =========================
-- NỘI DUNG KHOÁ HỌC, LỊCH HỌC
-- =========================

CREATE TABLE course_contents (
                                 content_id   BIGSERIAL PRIMARY KEY,
                                 content_type VARCHAR(255) NOT NULL, -- video/pdf/quiz...
                                 title        VARCHAR(255) NOT NULL,
                                 url          VARCHAR(1024),
                                 created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                                 courses_id   BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE
);

CREATE INDEX idx_course_contents_course ON course_contents(courses_id);

CREATE TABLE schedules (
                           schedule_id BIGSERIAL PRIMARY KEY,
                           title       VARCHAR(255) NOT NULL,
                           description VARCHAR(255),
                           course_id   BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
                           start_time  TIMESTAMPTZ,
                           end_time    TIMESTAMPTZ,
                           video       VARCHAR(2000), -- tuỳ theo ERD: trường "video"/"vdo"
                           created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_course ON schedules(course_id);

-- =========================
-- LỘ TRÌNH HỌC, ĐIỂM, LOG HỌC
-- =========================

CREATE TABLE learning_path (
                               path_id      BIGSERIAL PRIMARY KEY,
                               student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                               course_id    BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
                               status       VARCHAR(255) NOT NULL DEFAULT 'in_progress',
                               unlocked_at  TIMESTAMPTZ,
                               completed_at TIMESTAMPTZ,
                               CONSTRAINT uq_learning_path UNIQUE (student_id, course_id)
);

CREATE INDEX idx_learning_path_student ON learning_path(student_id);
CREATE INDEX idx_learning_path_course  ON learning_path(course_id);

CREATE TABLE grades (
                        grade_id    BIGSERIAL PRIMARY KEY,
                        course_id   BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
                        student_id  UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
                        final_score NUMERIC(5,2) DEFAULT 0,
                        progress    NUMERIC(5,2) DEFAULT 0,
                        attempts    INTEGER      DEFAULT 0,
                        total_hours NUMERIC(8,2) DEFAULT 0,
                        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                        CONSTRAINT uq_grade_per_course UNIQUE (course_id, student_id)
);

CREATE INDEX idx_grades_student ON grades(student_id);

CREATE TABLE learning_logs (
                               log_id       BIGSERIAL PRIMARY KEY,
                               student_id   UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
                               course_id    BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
                               action       VARCHAR(255) NOT NULL, -- view_lesson, submit_quiz, ...
                               duration_sec INTEGER      DEFAULT 0,
                               created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_learning_logs_student ON learning_logs(student_id);
CREATE INDEX idx_learning_logs_course  ON learning_logs(course_id);

-- =========================
-- NGÂN HÀNG CÂU HỎI, CÂU HỎI, ĐÁP ÁN
-- =========================

CREATE TABLE question_bank (
                               question_bank_id BIGSERIAL PRIMARY KEY,
                               difficulty       VARCHAR(255),
                               question_text    TEXT NOT NULL,
                               tags             VARCHAR(255),
                               time_limit_sec   INTEGER,
                               course_content   BIGINT REFERENCES course_contents(content_id) ON DELETE SET NULL
);

CREATE INDEX idx_qb_content ON question_bank(course_content);

CREATE TABLE course_questions (
                                  question_id     BIGSERIAL PRIMARY KEY,
                                  question_text   TEXT NOT NULL,
                                  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                                  question_type   VARCHAR(255),
                                  question_bank_id BIGINT REFERENCES question_bank(question_bank_id) ON DELETE CASCADE
);

CREATE INDEX idx_course_questions_bank ON course_questions(question_bank_id);

CREATE TABLE answers (
                         answer_id   BIGSERIAL PRIMARY KEY,
                         question_id BIGINT NOT NULL REFERENCES course_questions(question_id) ON DELETE CASCADE,
                         content     VARCHAR(255) NOT NULL,
                         is_correct  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_answers_question ON answers(question_id);

-- =========================
-- KẾT QUẢ BÀI KIỂM TRA
-- =========================

CREATE TABLE quiz_results (
                              result_id        BIGSERIAL PRIMARY KEY,
                              attempts         INTEGER DEFAULT 1,
                              score            NUMERIC(5,2) DEFAULT 0,
                              completed_at     TIMESTAMPTZ,
                              question_bank_id BIGINT REFERENCES question_bank(question_bank_id) ON DELETE SET NULL,
                              student_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_quiz_results_student ON quiz_results(student_id);
CREATE INDEX idx_quiz_results_bank    ON quiz_results(question_bank_id);

COMMIT;

-- Hoàn tất: CSDL/tables, PK/FK, chỉ mục cơ bản đã được tạo.


