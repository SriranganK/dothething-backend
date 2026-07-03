const { Worker } = require('bullmq');
const { connection } = require('../config/queue');
const Notification = require('../models/Notification');
const NotificationDelivery = require('../models/NotificationDelivery');
const NotificationPreference = require('../models/NotificationPreference');
const SocketService = require('../services/SocketService');

const processNotificationJob = async (deliveryId, notificationId) => {
  const delivery = await NotificationDelivery.findById(deliveryId);
  if (!delivery) return;

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    delivery.status = 'FAILED';
    delivery.errorMessage = 'Notification record not found';
    await delivery.save();
    return;
  }

  delivery.status = 'PROCESSING';
  await delivery.save();

  try {
    // 1. Fetch unread count for user
    const unreadCount = await Notification.countDocuments({
      userId: notification.userId,
      isRead: false
    });

    // 2. Fetch user preferences (for sound alert decisions)
    let pref = await NotificationPreference.findOne({ userId: notification.userId });
    if (!pref) {
      pref = await NotificationPreference.create({ userId: notification.userId });
    }

    // 3. Emit real-time notification via Socket.IO
    const payload = {
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      unreadCount,
      soundEnabled: pref.soundEnabled
    };

    SocketService.sendToUser(notification.userId.toString(), 'notification:new', payload);

    // 4. Update delivery status
    delivery.status = 'SENT';
    delivery.sentAt = new Date();
    await delivery.save();
  } catch (err) {
    console.error('In-App delivery failed:', err.message);
    delivery.status = 'FAILED';
    delivery.errorMessage = err.message;
    await delivery.save();
  }
};

const notificationWorker = new Worker('notification-queue', async (job) => {
  const { deliveryId, notificationId } = job.data;
  console.log(`Processing in-app job ${job.id} for delivery ${deliveryId}`);
  await processNotificationJob(deliveryId, notificationId);
}, { connection });

module.exports = {
  worker: notificationWorker,
  processNotificationJob
};
