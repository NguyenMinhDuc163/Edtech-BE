// src/services/email.service.ts
import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import dotenv from "dotenv";
import { resetPasswordTemplate } from "../constants/email/reset-password.email";
import { courseApprovedTemplate, courseRejectedTemplate, pendingChangeApprovedTemplate, pendingChangeRejectedTemplate} from "../public/email/course-status.email";

dotenv.config();

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // === GỬI EMAIL RESET PASSWORD ===
  async sendPasswordResetEmail(email: string, resetLink: string) {
    const htmlContent = resetPasswordTemplate(resetLink);
    await this.sendMail(email, "Đổi mật khẩu EdTech", htmlContent);
  }

  // === GỬI EMAIL DUYỆT KHÓA HỌC ===
  async sendCourseApprovedEmail(email: string, courseTitle: string, adminComment: string = "Khóa học đã được phê duyệt thành công!") {
    const html = courseApprovedTemplate(courseTitle, adminComment);
    await this.sendMail(email, "Khóa học đã được duyệt!", html);
  }

  // === GỬI EMAIL TỪ CHỐI KHÓA HỌC ===
  async sendCourseRejectedEmail(email: string, courseTitle: string, reason: string) {
    const html = courseRejectedTemplate(courseTitle, reason);
    await this.sendMail(email, "Khóa học bị từ chối", html);
  }
  // === GỬI EMAIL DUYỆT THAY ĐỔI KHÓA HỌC PENDING CHANGE ===
  async sendPendingChangeApprovedEmail(email: string, courseTitle: string, adminComment?: string) {
    const html = pendingChangeApprovedTemplate(courseTitle, adminComment || "Các thay đổi đã được duyệt!");
    await this.sendMail(email, "Thay đổi khóa học đã được duyệt!", html);
  }
  // === GỬI EMAIL TỪ CHỐI THAY ĐỔI KHÓA HỌC PENDING CHANGE ===
  async sendPendingChangeRejectedEmail(email: string, courseTitle: string, reason: string) {
    const html = pendingChangeRejectedTemplate(courseTitle, reason);
    await this.sendMail(email, "Thay đổi khóa học bị từ chối", html);
  }
  // === HÀM GỬI EMAIL CHUNG ===
  private async sendMail(to: string, subject: string, html: string) {
    const mailOptions = {
      from: `"EdTech Support" <${process.env.EMAIL_SENDER}>`,
      to,
      subject,
      html,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Đã gửi email tới ${to}: ${subject}`);
    } catch (error) {
      this.logger.error("Gửi email thất bại:", error);
    }
  }
}