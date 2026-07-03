const { Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const { connection } = require('../config/queue');
const Notification = require('../models/Notification');
const NotificationDelivery = require('../models/NotificationDelivery');
const User = require('../models/User');
const emailTemplateService = require('../services/emailTemplateService');

const getTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER || 'dothethng@gmail.com',
      pass: process.env.SMTP_PASS || 'wteb xfrb axwh upkj'
    }
  });
};

const processEmailJob = async (deliveryId, notificationId) => {
  const delivery = await NotificationDelivery.findById(deliveryId);
  if (!delivery) {
    throw new Error(`Delivery record not found for ID: ${deliveryId}`);
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    delivery.status = 'FAILED';
    delivery.errorMessage = 'Notification record not found';
    await delivery.save();
    throw new Error(`Notification record not found for ID: ${notificationId}`);
  }

  const recipient = await User.findById(notification.userId);
  if (!recipient) {
    delivery.status = 'FAILED';
    delivery.errorMessage = 'Recipient user not found';
    await delivery.save();
    throw new Error(`Recipient user not found: ${notification.userId}`);
  }

  delivery.status = 'PROCESSING';
  delivery.attempts += 1;
  await delivery.save();

  let extraData = {
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    title: notification.title,
    message: notification.message,
    entityId: notification.entityId,
  };

  if (notification.entityType === 'TASK' && notification.entityId) {
    const Item = require('../models/Item');
    const task = await Item.findById(notification.entityId);
    if (task) {
      extraData.taskTitle = task.title;
      extraData.dueDate = task.dueDate;
      extraData.description = task.description;
    }
  }

  const { subject, html, text } = emailTemplateService.renderEmail(notification.type, extraData);

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"doTheThing Notification" <${process.env.SMTP_USER || 'dothethng@gmail.com'}>`,
      to: recipient.email,
      subject,
      text,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email successfully sent to ${recipient.email}: ${info.messageId}`);

    delivery.status = 'SENT';
    delivery.sentAt = new Date();
    delivery.errorMessage = null;
    await delivery.save();
  } catch (err) {
    console.error(`Email send attempt failed for ${recipient.email}:`, err.message);
    delivery.status = 'PENDING';
    delivery.errorMessage = err.message;
    await delivery.save();
    throw err;
  }
};

const emailWorker = new Worker('email-queue', async (job) => {
  const { deliveryId, notificationId } = job.data;
  console.log(`Processing email job ${job.id} for delivery ${deliveryId}`);
  await processEmailJob(deliveryId, notificationId);
}, { connection });

emailWorker.on('failed', async (job, err) => {
  console.error(`Email job ${job?.id} failed permanently:`, err.message);
  if (job) {
    const { deliveryId } = job.data;
    await NotificationDelivery.findByIdAndUpdate(deliveryId, {
      status: 'FAILED',
      errorMessage: `Failed after all retries: ${err.message}`
    });
  }
});

module.exports = {
  worker: emailWorker,
  processEmailJob
};
