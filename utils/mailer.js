const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail({ to, subject, html, text }) {
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
  return info;
}

async function sendInviteEmail({ to, role, schoolName, inviteUrl, inviterName }) {
  const subject = `You've been invited to join ${schoolName} on SchoolHub`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Welcome to SchoolHub</h2>
      <p>Hi there,</p>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${schoolName}</strong> as a <strong>${role}</strong>.</p>
      <p>Click the button below to accept the invitation and set up your account:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}" style="background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 16px;">
          Accept Invitation
        </a>
      </div>
      <p style="color: #6B7280; font-size: 14px;">This invitation expires in 48 hours. If you did not expect this invitation, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
      <p style="color: #9CA3AF; font-size: 12px;">SchoolHub — School Management System</p>
    </div>
  `;
  return sendMail({ to, subject, html });
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  const subject = 'Reset your SchoolHub password';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Password Reset</h2>
      <p>You requested a password reset for your SchoolHub account.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 16px;">
          Reset Password
        </a>
      </div>
      <p style="color: #6B7280; font-size: 14px;">This link expires in 1 hour. If you did not request a reset, please ignore this email.</p>
    </div>
  `;
  return sendMail({ to, subject, html });
}

async function sendNewMessageEmail({ to, senderName, messageSubject, appUrl }) {
  const subject = `New message from ${senderName} on SchoolHub`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">New Message</h2>
      <p>You have a new message from <strong>${senderName}</strong>.</p>
      <p><strong>Subject:</strong> ${messageSubject}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${appUrl}/messages" style="background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px;">
          View Message
        </a>
      </div>
    </div>
  `;
  return sendMail({ to, subject, html });
}

async function sendAssignmentNotificationEmail({ to, teacherName, assignmentTitle, className, dueDate, appUrl }) {
  const subject = `New assignment posted: ${assignmentTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #16A34A;">New Assignment</h2>
      <p><strong>${teacherName}</strong> posted a new assignment for <strong>${className}</strong>.</p>
      <p><strong>Title:</strong> ${assignmentTitle}</p>
      <p><strong>Due:</strong> ${dueDate}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${appUrl}/student/assignments" style="background-color: #16A34A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px;">
          View Assignment
        </a>
      </div>
    </div>
  `;
  return sendMail({ to, subject, html });
}

module.exports = {
  sendMail,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendNewMessageEmail,
  sendAssignmentNotificationEmail,
};
