import * as XLSX from 'xlsx';
import {BadRequestException} from '@nestjs/common';

export interface ParsedAnswer {
    content: string;
    is_correct: boolean;
}

export interface ParsedQuestion {
    rowNumber: number;
    question_text: string;
    time_limit_sec: number | null;
    answers: ParsedAnswer[];
}

export interface ParseResult {
    questions: ParsedQuestion[];
    errors: Array<{row: number; message: string}>;
}

export class ExcelQuestionParser {
    private static readonly MAX_ANSWERS = 4;

    private static readonly COLUMN_MAPPING: Record<string, string> = {
        'Cau hoi': 'question_text',
        'Thoi gian': 'time_limit_sec',
        'Dap an 1': 'answer_1',
        'Dap an 2': 'answer_2',
        'Dap an 3': 'answer_3',
        'Dap an 4': 'answer_4',
        'Dap an dung': 'correct_answer',
    };

    private static readonly REQUIRED_HEADERS = ['Cau hoi', 'Dap an dung'];

    static parseFile(buffer: Buffer): ParseResult {
        const questions: ParsedQuestion[] = [];
        const errors: Array<{row: number; message: string}> = [];

        try {
            const workbook = XLSX.read(buffer, {type: 'buffer'});
            const sheetName = workbook.SheetNames[0];

            if (!sheetName) {
                throw new BadRequestException('File Excel không có sheet nào');
            }

            const worksheet = workbook.Sheets[sheetName];

            if (!worksheet) {
                throw new BadRequestException('Không thể đọc sheet trong file Excel');
            }

            const data: any[] = XLSX.utils.sheet_to_json(worksheet, {defval: ''});

            if (data.length === 0) {
                throw new BadRequestException('File Excel không có dữ liệu');
            }

            this.validateHeaders(data[0]);

            data.forEach((row, index) => {
                const rowNumber = index + 2;

                try {
                    const mappedRow = this.mapVietnameseToEnglish(row);
                    const parsedQuestion = this.parseRow(mappedRow, rowNumber);
                    questions.push(parsedQuestion);
                } catch (error: any) {
                    errors.push({
                        row: rowNumber,
                        message: error.message || 'Lỗi không xác định'
                    });
                }
            });

            return {questions, errors};
        } catch (error: any) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Lỗi đọc file Excel: ${error.message}`);
        }
    }

    private static mapVietnameseToEnglish(row: any): any {
        const mappedRow: any = {};

        for (const [vietnameseKey, englishKey] of Object.entries(this.COLUMN_MAPPING)) {
            if (row.hasOwnProperty(vietnameseKey)) {
                mappedRow[englishKey] = row[vietnameseKey];
            }
        }

        return mappedRow;
    }

    private static validateHeaders(firstRow: any): void {
        const headers = Object.keys(firstRow);

        for (const requiredHeader of this.REQUIRED_HEADERS) {
            if (!headers.includes(requiredHeader)) {
                throw new BadRequestException(
                    `File Excel thiếu cột bắt buộc: "${requiredHeader}". ` +
                    `Vui lòng download template mẫu để có đúng định dạng.`
                );
            }
        }
    }

    private static parseRow(row: any, rowNumber: number): ParsedQuestion {
        const questionText = String(row.question_text || '').trim();

        if (!questionText) {
            throw new Error('Thiếu nội dung câu hỏi');
        }

        const timeLimitSec = row.time_limit_sec ? parseInt(String(row.time_limit_sec)) : null;

        const correctAnswerNum = parseInt(String(row.correct_answer || ''));

        if (!correctAnswerNum || correctAnswerNum < 1 || correctAnswerNum > this.MAX_ANSWERS) {
            throw new Error(`Cột "Dap an dung" phải là số từ 1 đến ${this.MAX_ANSWERS}`);
        }

        const answers: ParsedAnswer[] = [];
        for (let i = 1; i <= this.MAX_ANSWERS; i++) {
            const answerContent = String(row[`answer_${i}`] || '').trim();

            if (answerContent) {
                answers.push({
                    content: answerContent,
                    is_correct: i === correctAnswerNum
                });
            }
        }

        if (answers.length < 2) {
            throw new Error('Câu hỏi phải có ít nhất 2 đáp án');
        }

        const correctAnswerExists = answers.some(a => a.is_correct);
        if (!correctAnswerExists) {
            throw new Error(`Đáp án số ${correctAnswerNum} không tồn tại hoặc để trống`);
        }

        return {
            rowNumber,
            question_text: questionText,
            time_limit_sec: timeLimitSec,
            answers
        };
    }

    static generateTemplate(): Buffer {
        const wb = XLSX.utils.book_new();

        const sampleData = [
            {
                'Cau hoi': '2 + 2 = ?',
                'Thoi gian': 30,
                'Dap an 1': '3',
                'Dap an 2': '4',
                'Dap an 3': '5',
                'Dap an 4': '6',
                'Dap an dung': 2
            },
            {
                'Cau hoi': 'Thu do cua Viet Nam la?',
                'Thoi gian': 30,
                'Dap an 1': 'Ha Noi',
                'Dap an 2': 'TP.HCM',
                'Dap an 3': 'Da Nang',
                'Dap an 4': 'Hue',
                'Dap an dung': 1
            },
            {
                'Cau hoi': '10 / 2 = ?',
                'Thoi gian': '',
                'Dap an 1': '3',
                'Dap an 2': '4',
                'Dap an 3': '5',
                'Dap an 4': '6',
                'Dap an dung': 3
            }
        ];

        const ws = XLSX.utils.json_to_sheet(sampleData);

        ws['!cols'] = [
            {wch: 50},
            {wch: 12},
            {wch: 30},
            {wch: 30},
            {wch: 30},
            {wch: 30},
            {wch: 15}
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Questions');

        const buffer = XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
        return buffer;
    }
}
