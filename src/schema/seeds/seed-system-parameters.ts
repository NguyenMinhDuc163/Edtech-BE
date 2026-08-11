import { DataSource } from "typeorm";
import { AppDataSource } from "../datasource";
import { SystemParameter } from "../entities/system-parameter.entity";

async function seedSystemParameters() {
    await AppDataSource.initialize();

    const systemParameters = [
        // Access Levels
        {
            param_key: 'FREE',
            description: 'Mức độ truy cập miễn phí - chỉ xem được nội dung preview',
            function_name: 'ACCESS_LEVEL'
        },
        {
            param_key: 'FULL',
            description: 'Mức độ truy cập đầy đủ - xem được tất cả nội dung sau khi mua khóa học',
            function_name: 'ACCESS_LEVEL'
        },
        
        // Access Status
        {
            param_key: 'NONE',
            description: 'Chưa đăng ký khóa học',
            function_name: 'ACCESS_STATUS'
        },
        {
            param_key: 'PAID',
            description: 'Đã mua khóa học',
            function_name: 'ACCESS_STATUS'
        },
        
        // Payment Status
        {
            param_key: 'PAID',
            description: 'Đã thanh toán thành công',
            function_name: 'PAYMENT_STATUS'
        },
        {
            param_key: 'PEND',
            description: 'Đang chờ thanh toán',
            function_name: 'PAYMENT_STATUS'
        },
        {
            param_key: 'FAIL',
            description: 'Thanh toán thất bại',
            function_name: 'PAYMENT_STATUS'
        },
        {
            param_key: 'REFD',
            description: 'Đã hoàn tiền',
            function_name: 'PAYMENT_STATUS'
        },
        {
            param_key: 'MOBILE_IAP_ENABLED',
            param_value: 'N',
            description: 'Bật/tắt checkout IAP trên mobile; không thay đổi quyền học',
            function_name: 'PAYMENT_CONFIG'
        },
        {
            param_key: 'WEB_VNPAY_ENABLED',
            param_value: 'Y',
            description: 'Bật/tắt checkout VNPay trên web',
            function_name: 'PAYMENT_CONFIG'
        },
        
        // Preview Status
        {
            param_key: 'Y',
            description: 'Nội dung được xem trước miễn phí',
            function_name: 'PREVIEW_STATUS'
        },
        {
            param_key: 'N',
            description: 'Nội dung không được xem trước, cần mua khóa học',
            function_name: 'PREVIEW_STATUS'
        },
        
        // Course Status
        {
            param_key: 'DRAFT',
            description: 'Khóa học đang soạn thảo',
            function_name: 'COURSE_STATUS'
        },
        {
            param_key: 'APPROVED',
            description: 'Khóa học đã lưu',
            function_name: 'COURSE_STATUS'
        },
        
        // Quiz Status
        {
            param_key: 'DRAFT',
            description: 'Quiz đang soạn thảo',
            function_name: 'QUIZ_STATUS'
        },
        {
            param_key: 'PUBLISHED',
            description: 'Quiz đã xuất bản',
            function_name: 'QUIZ_STATUS'
        },
        {
            param_key: 'CLOSED',
            description: 'Quiz đã đóng',
            function_name: 'QUIZ_STATUS'
        },
        
        // Quiz Type
        {
            param_key: 'EXAM',
            description: 'Loại bài thi',
            function_name: 'QUIZ_TYPE'
        },
        {
            param_key: 'PRACTICE',
            description: 'Loại bài luyện tập',
            function_name: 'QUIZ_TYPE'
        },
        
        // Question Type
        {
            param_key: 'TN',
            description: 'Câu hỏi trắc nghiệm',
            function_name: 'QUESTION_TYPE'
        },
        {
            param_key: 'YN',
            description: 'Câu hỏi đúng/sai',
            function_name: 'QUESTION_TYPE'
        },
        {
            param_key: 'TL',
            description: 'Câu hỏi tự luận',
            function_name: 'QUESTION_TYPE'
        },
        {
            param_key: 'FILL',
            description: 'Câu hỏi điền từ',
            function_name: 'QUESTION_TYPE'
        },
        
        // Sort Order
        {
            param_key: 'ASC',
            description: 'Sắp xếp tăng dần',
            function_name: 'SORT_ORDER'
        },
        {
            param_key: 'DESC',
            description: 'Sắp xếp giảm dần',
            function_name: 'SORT_ORDER'
        },
        
        // JWT Expiration
        {
            param_key: '15m',
            description: 'Thời gian hết hạn access token (15 phút)',
            function_name: 'JWT_EXPIRATION'
        },
        {
            param_key: '7d',
            description: 'Thời gian hết hạn refresh token (7 ngày)',
            function_name: 'JWT_EXPIRATION'
        }
    ];

    for (const param of systemParameters) {
        const exists = await AppDataSource.getRepository(SystemParameter).findOne({ 
            where: { param_key: param.param_key } 
        });
        
        if (!exists) {
            await AppDataSource.getRepository(SystemParameter).save(param);
            console.log(`Inserted system parameter: ${param.param_key} - ${param.description}`);
        } else {
            console.log(`System parameter already exists: ${param.param_key}`);
        }
    }

    await AppDataSource.destroy();
}

seedSystemParameters().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
