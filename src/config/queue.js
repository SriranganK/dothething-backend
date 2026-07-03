const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

const connection = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    // Retry connection every 5 seconds, up to 10 attempts
    if (times > 10) {
      console.error(`Redis connection failed after ${times} attempts. Gracefully bypassing queue operations...`);
      return null; // Stop retrying
    }
    return 5000;
  }
});

connection.on('error', (err) => {
  console.warn('Redis Connection Warning/Error:', err.message);
});

// Helper to safely add to queue if Redis is running
const safeAddToQueue = async (queue, jobName, data, options = {}) => {
  if (connection.status !== 'ready') {
    console.warn(`Redis connection status is ${connection.status}. Skipping queueing job ${jobName} for background worker.`);
    // As a fallback, if Redis is down, we could invoke the worker logic synchronously,
    // but to avoid blocking Express requests we will log a warning.
    return null;
  }
  try {
    return await queue.add(jobName, data, options);
  } catch (err) {
    console.error(`Failed to add job ${jobName} to queue:`, err.message);
    return null;
  }
};

const emailQueue = new Queue('email-queue', { connection });
const notificationQueue = new Queue('notification-queue', { connection });
const pushQueue = new Queue('push-queue', { connection });
const reminderQueue = new Queue('reminder-queue', { connection });

module.exports = {
  connection,
  emailQueue,
  notificationQueue,
  pushQueue,
  reminderQueue,
  safeAddToQueue
};
