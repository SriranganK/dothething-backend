const nodemailer = require('nodemailer');
const emailTemplateService = require('./emailTemplateService');

const getTransporter = () => {
  const smtpUser = process.env.SMTP_USER || 'dothethng@gmail.com';
  const smtpPass = process.env.SMTP_PASS || 'wteb xfrb axwh upkj';
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: smtpUser,
      pass: smtpPass,
    }
  });
};

const sendInviteEmail = async (toEmail, inviterName, workspaceName) => {
  const smtpUser = process.env.SMTP_USER || 'dothethng@gmail.com';
  const smtpPass = process.env.SMTP_PASS || 'wteb xfrb axwh upkj';
  
  if (!smtpUser || !smtpPass) {
    console.warn('SMTP credentials not fully configured (SMTP_USER/SMTP_PASS). Skipping sending invitation email to:', toEmail);
    return null;
  }

  const { subject, html, text } = emailTemplateService.renderEmail('INVITE', {
    inviterName,
    workspaceName,
    toEmail
  });

  const transporter = getTransporter();

  const mailOptions = {
    from: `"doTheThing Workspace" <${smtpUser}>`,
    to: toEmail,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email successfully sent to ${toEmail}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`Error sending email to ${toEmail}:`, error.message);
    throw error;
  }
};

const sendOTPEmail = async (toEmail, otpCode) => {
  const smtpUser = process.env.SMTP_USER || 'dothethng@gmail.com';
  
  const { subject, html, text } = emailTemplateService.renderEmail('OTP', {
    otpCode
  });

  const transporter = getTransporter();

  const mailOptions = {
    from: `"doTheThing Security" <${smtpUser}>`,
    to: toEmail,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Password reset OTP email successfully sent to ${toEmail}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`Error sending OTP email to ${toEmail}:`, error.message);
    throw error;
  }
};

module.exports = {
  sendInviteEmail,
  sendOTPEmail,
};

