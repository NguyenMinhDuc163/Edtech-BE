// src/constants/email/course-status.email.ts

// 1. YÊU CẦU THAY ĐỔI ĐƯỢC DUYỆT
export const pendingChangeApprovedTemplate = (courseTitle: string, adminComment: string = "Các thay đổi đã được áp dụng thành công!") => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; }
    .header { background: #4CAF50; color: white; padding: 15px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 10px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Thay đổi đã được DUYỆT</h2>
    </div>
    <div class="content">
      <p>Xin chào,</p>
      <p>Yêu cầu <strong>chỉnh sửa khóa học "${courseTitle}"</strong> của bạn đã được <strong>phê duyệt</strong>!</p>
      <p><strong>Ghi chú từ Admin:</strong> ${adminComment}</p>
      <p>Các thay đổi đã được áp dụng. Bạn có thể xem lại tại: 
        <a href="https://edtech.com/teacher/course/${courseTitle}">Dashboard</a>
      </p>
      <p>Cảm ơn bạn đã cải thiện nội dung!</p>
    </div>
    <div class="footer">
      EdTech Platform © 2025
    </div>
  </div>
</body>
</html>
`;

// 2. YÊU CẦU THAY ĐỔI BỊ TỪ CHỐI
export const pendingChangeRejectedTemplate = (courseTitle: string, reason: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; }
    .header { background: #f44336; color: white; padding: 15px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 10px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Thay đổi BỊ TỪ CHỐI</h2>
    </div>
    <div class="content">
      <p>Xin chào,</p>
      <p>Yêu cầu <strong>chỉnh sửa khóa học "${courseTitle}"</strong> của bạn <strong>chưa được duyệt</strong>.</p>
      <p><strong>Lý do:</strong> ${reason}</p>
      <p>Vui lòng chỉnh sửa theo phản hồi và gửi lại yêu cầu.</p>
      <p><a href="https://edtech.com/teacher/course/${courseTitle}">Vào Dashboard để sửa</a></p>
    </div>
    <div class="footer">
      EdTech Platform © 2025
    </div>
  </div>
</body>
</html>
`;

// 3. KHÓA HỌC ĐƯỢC DUYỆT (giữ nguyên)
export const courseApprovedTemplate = (courseTitle: string, adminComment: string = "Khóa học đã được phê duyệt thành công!") => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; }
    .header { background: #4CAF50; color: white; padding: 15px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 10px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Khóa học đã được DUYỆT</h2>
    </div>
    <div class="content">
      <p>Xin chào,</p>
      <p>Khóa học <strong>"${courseTitle}"</strong> của bạn đã được <strong>phê duyệt</strong> và chính thức lên sàn!</p>
      <p><strong>Ghi chú từ Admin:</strong> ${adminComment}</p>
      <p>Bạn có thể xem khóa học tại: <a href="https://edtech.com/course/${courseTitle}">edtech.com</a></p>
      <p>Cảm ơn bạn đã đóng góp nội dung chất lượng!</p>
    </div>
    <div class="footer">
      EdTech Platform © 2025
    </div>
  </div>
</body>
</html>
`;

// 4. KHÓA HỌC BỊ TỪ CHỐI (giữ nguyên)
export const courseRejectedTemplate = (courseTitle: string, reason: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; }
    .header { background: #f44336; color: white; padding: 15px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 10px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Khóa học BỊ TỪ CHỐI</h2>
    </div>
    <div class="content">
      <p>Xin chào,</p>
      <p>Khóa học <strong>"${courseTitle}"</strong> của bạn <strong>chưa được duyệt</strong>.</p>
      <p><strong>Lý do:</strong> ${reason}</p>
      <p>Vui lòng chỉnh sửa và gửi lại yêu cầu duyệt.</p>
      <p><a href="https://edtech.com/teacher/dashboard">Vào Dashboard để sửa</a></p>
    </div>
    <div class="footer">
      EdTech Platform © 2025
    </div>
  </div>
</body>
</html>
`;