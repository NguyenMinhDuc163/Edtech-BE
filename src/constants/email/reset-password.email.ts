export const resetPasswordTemplate = (resetLink: string): string => `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Đặt lại mật khẩu</title>
  <style>
    body {
      background-color: #f4f7fa;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      background: #ffffff;
      margin: 40px auto;
      border-radius: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background-color: #49bbbd;
      color: white;
      text-align: center;
      padding: 20px;
    }
    .header img {
      width: 60px;
      margin-bottom: 8px;
    }
    .content {
      padding: 32px;
      line-height: 1.6;
    }
    .content h2 {
      color: #49bbbd;
    }
    .button {
      display: inline-block;
      background-color: #ffffff;
      color: #49bbbd;
      border: 2px solid #49bbbd;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
      transition: all 0.2s ease;
    }
    .button:hover {
      background-color: #49bbbd;
      color: #ffffff;
    }
    .footer {
      background-color: #f4f7fa;
      text-align: center;
      color: #777;
      font-size: 12px;
      padding: 15px;
    }
    .footer a {
      color: #49bbbd;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://i.ibb.co/Zx7Jw5d/edtech-logo.png" alt="EdTech Logo" />
      <h1>EdTech Platform</h1>
    </div>
    <div class="content">
      <h2>Xin chào,</h2>
      <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản EdTech của mình.</p>
      <p>Vui lòng nhấn vào nút bên dưới để đặt lại mật khẩu. Liên kết này sẽ hết hạn sau <strong>15 phút</strong>.</p>
      <p style="text-align:center;">
        <a href="${resetLink}" class="button">Đổi mật khẩu</a>
      </p>
      <p>Nếu bạn không yêu cầu thay đổi này, vui lòng bỏ qua email này.</p>
      <p>Trân trọng,<br/>Đội ngũ <strong>EdTech Support</strong></p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} EdTech Platform. All rights reserved.</p>
      <p><a href="mailto:support@edtech-platform.com">support@edtech-platform.com</a></p>
    </div>
  </div>
</body>
</html>
`;
