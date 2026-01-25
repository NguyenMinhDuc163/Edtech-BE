export class ImportQuestionsResponseDto {
    success!: boolean;
    summary!: {
        totalRows: number;
        successCount: number;
        errorCount: number;
    };
    errors!: Array<{row: number; message: string}>;
    questions!: Array<{
        questionId: string;
        questionText: string;
        questionType: string | null;
        answers: Array<{
            answerId: string;
            content: string;
            isCorrect: boolean;
        }>;
    }>;
}
