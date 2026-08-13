-- =============================================================
-- Tạo bảng course_sections cho hệ thống EdTech
-- =============================================================

-- Tạo bảng course_sections
CREATE TABLE course_sections (
    section_id   BIGSERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    description  TEXT NULL,
    order_index  INTEGER NOT NULL DEFAULT 1,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    is_preview   VARCHAR(1) NOT NULL DEFAULT 'N',
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    course_id    BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE
);

-- Tạo chỉ mục cho performance
CREATE INDEX idx_course_sections_course ON course_sections(course_id);
CREATE INDEX idx_course_sections_order ON course_sections(course_id, order_index);

-- Thêm cột section_id vào bảng course_contents (nullable để backward compatibility)
ALTER TABLE course_contents ADD COLUMN section_id BIGINT NULL;
ALTER TABLE course_contents ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE course_contents ADD CONSTRAINT fk_course_contents_section 
    FOREIGN KEY (section_id) REFERENCES course_sections(section_id) ON DELETE CASCADE;

-- Tạo chỉ mục cho course_contents.section_id
CREATE INDEX idx_course_contents_section ON course_contents(section_id);

-- Thêm comment cho các bảng
COMMENT ON TABLE course_sections IS 'Bảng chứa thông tin các section trong khóa học';
COMMENT ON COLUMN course_sections.section_id IS 'ID duy nhất của section';
COMMENT ON COLUMN course_sections.title IS 'Tiêu đề của section';
COMMENT ON COLUMN course_sections.description IS 'Mô tả chi tiết của section';
COMMENT ON COLUMN course_sections.order_index IS 'Thứ tự hiển thị của section trong khóa học';
COMMENT ON COLUMN course_sections.is_active IS 'Trạng thái hoạt động của section';
COMMENT ON COLUMN course_sections.is_preview IS 'Section có được xem thử khi chưa mua khóa học (Y/N)';
COMMENT ON COLUMN course_sections.course_id IS 'ID của khóa học chứa section này';

COMMENT ON COLUMN course_contents.section_id IS 'ID của section chứa nội dung này (nullable)';
