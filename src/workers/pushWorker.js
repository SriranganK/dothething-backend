const { Worker } = require('bullmq');
const { connection } = require('../config/queue');
const NotificationDelivery = require('../models/NotificationDelivery');

const pushWorker = new Worker('push-queue', async (job) => {
  const { deliveryId } = job.data;
  console.log(`Processing push notification job ${job.id} for delivery ${deliveryId}`);

  const delivery = await NotificationDelivery.findById(deliveryId);
  if (!delivery) return;

  delivery.status = 'PROCESSING';
  await delivery.save();

  try {
    // Placeholder logic for Web Push (Vapid), APNS (iOS), FCM (Android)
    console.log(`Web/Mobile push notifications are not fully configured yet. Bypassing delivery: ${deliveryId}`);
    
    delivery.status = 'SENT';
    delivery.sentAt = new Date();
    await delivery.save();
  } catch (err) {
    delivery.status = 'FAILED';
    delivery.errorMessage = err.message;
    await delivery.save();
  }
}, { connection });

module.exports = pushWorker;
