const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Attachment = require('../models/Attachment');
const Item = require('../models/Item');
const ActivityService = require('../services/ActivityService');

const isR2Configured = !!(
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
  process.env.CLOUDFLARE_R2_ENDPOINT &&
  process.env.CLOUDFLARE_R2_BUCKET_NAME
);

let s3Client = null;
if (isR2Configured) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });
}

// 1. Get presigned upload URL
const getPresignedUploadUrl = async (req, res) => {
  try {
    const { fileName, mimeType, itemId } = req.body;
    if (!fileName || !itemId) {
      return res.status(400).json({ message: 'fileName and itemId are required' });
    }

    const fileId = crypto.randomUUID();
    const storageKey = `attachments/${itemId}/${fileId}-${fileName}`;

    if (isR2Configured) {
      const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
        ContentType: mimeType,
      });

      // Sign URL for 1 hour (3600 seconds)
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      // Determine public download URL
      let publicUrl = '';
      if (process.env.CLOUDFLARE_R2_PUBLIC_URL) {
        publicUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${storageKey}`;
      } else {
        // e.g. https://<bucket-name>.<account-id>.r2.cloudflarestorage.com/<storageKey>
        publicUrl = `${process.env.CLOUDFLARE_R2_ENDPOINT}/${bucketName}/${storageKey}`;
      }

      return res.status(200).json({
        uploadUrl,
        storageKey,
        publicUrl,
      });
    } else {
      // Local Mock fallback
      const uploadUrl = `${req.protocol}://${req.get('host')}/api/attachments/upload-local?key=${encodeURIComponent(storageKey)}`;
      const publicUrl = `${req.protocol}://${req.get('host')}/uploads/${storageKey.replace(/\//g, '_')}`;

      return res.status(200).json({
        uploadUrl,
        storageKey,
        publicUrl,
      });
    }
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ message: error.message });
  }
};

// Local upload handler for mock mode (handles raw binary PUT request)
const uploadLocalFile = async (req, res) => {
  try {
    const storageKey = req.query.key;
    if (!storageKey) {
      return res.status(400).json({ message: 'key query parameter is required' });
    }

    // Save to local directory
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Replace slashes with underscores for flat local storage naming
    const safeFilename = storageKey.replace(/\//g, '_');
    const destPath = path.join(uploadsDir, safeFilename);

    const writeStream = fs.createWriteStream(destPath);
    req.pipe(writeStream);

    req.on('end', () => {
      res.status(200).json({ success: true, message: 'Local upload complete' });
    });

    req.on('error', (err) => {
      res.status(500).json({ message: err.message });
    });
  } catch (error) {
    console.error('Local mock upload error:', error);
    res.status(500).json({ message: error.message });
  }
};

// 2. Create Attachment Metadata in database
const createAttachment = async (req, res) => {
  try {
    const { issueId, type, fileName, originalName, mimeType, size, storageKey, publicUrl } = req.body;
    if (!issueId || !type || !fileName || !originalName) {
      return res.status(400).json({ message: 'issueId, type, fileName and originalName are required' });
    }

    const item = await Item.findById(issueId);
    if (!item) {
      return res.status(404).json({ message: 'Task/Item not found' });
    }

    const uploadedBy = req.user ? req.user.name || req.user.email : 'Unknown';

    const attachment = await Attachment.create({
      issueId,
      type,
      fileName,
      originalName,
      mimeType,
      size,
      storageKey,
      publicUrl,
      uploadedBy,
    });

    // Add to Item's attachments reference list
    item.attachments.push(attachment._id);
    await item.save();

    // Log Activity
    await ActivityService.log({
      actorId: req.user._id,
      taskId: item._id,
      actionType: 'ATTACHMENT_ADDED',
      newValue: originalName,
      metadata: {
        taskTitle: item.title,
        taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}`,
        attachmentId: attachment._id.toString(),
      }
    });

    // Broadcast board sync via WebSocket
    const SocketService = require('../services/SocketService');
    SocketService.broadcastToBoard(item.board.toString(), 'board:updated', {
      action: 'ITEM_UPDATED',
      boardId: item.board.toString(),
      itemId: item._id,
      senderId: req.user._id.toString()
    });

    res.status(201).json({ success: true, attachment });
  } catch (error) {
    console.error('Error creating attachment metadata:', error);
    res.status(400).json({ message: error.message });
  }
};

// 3. Delete Attachment (from DB and Cloudflare R2)
const deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query; // 'true' for permanent delete from R2, otherwise just remove ref from task

    const attachment = await Attachment.findById(id);
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    const item = await Item.findById(attachment.issueId);
    if (item) {
      // Remove reference from Item
      item.attachments = item.attachments.filter(attId => attId.toString() !== id);
      await item.save();
    }

    // Log Activity
    if (item) {
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'ATTACHMENT_REMOVED',
        oldValue: attachment.originalName,
        metadata: {
          taskTitle: item.title,
          taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}`,
        }
      });
    }

    // If permanent deletion from Cloud Storage is requested and it's a file
    if (permanent === 'true' && attachment.type === 'file') {
      if (isR2Configured && attachment.storageKey) {
        try {
          const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
          const deleteCommand = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: attachment.storageKey,
          });
          await s3Client.send(deleteCommand);
        } catch (s3Err) {
          console.error('Failed to delete file from Cloudflare R2:', s3Err);
        }
      } else if (attachment.storageKey) {
        // Local Mock File deletion
        try {
          const safeFilename = attachment.storageKey.replace(/\//g, '_');
          const localPath = path.join(__dirname, '../../uploads', safeFilename);
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
          }
        } catch (fsErr) {
          console.error('Failed to delete local mock file:', fsErr);
        }
      }
    }

    // Remove Attachment record from DB
    await attachment.deleteOne();

    // Broadcast board sync via WebSocket
    if (item) {
      const SocketService = require('../services/SocketService');
      SocketService.broadcastToBoard(item.board.toString(), 'board:updated', {
        action: 'ITEM_UPDATED',
        boardId: item.board.toString(),
        itemId: item._id,
        senderId: req.user._id.toString()
      });
    }

    res.status(200).json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ message: error.message });
  }
};

// 4. Update Attachment (e.g. rename file or edit link details)
const updateAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const { originalName, publicUrl } = req.body;

    const attachment = await Attachment.findById(id);
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    const fields = ['originalName', 'publicUrl', 'fileName', 'mimeType', 'size', 'storageKey'];
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        attachment[field] = req.body[field];
      }
    });

    await attachment.save();

    const item = await Item.findById(attachment.issueId);
    if (item) {
      // Log Activity
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'TASK_UPDATED',
        oldValue: 'Attachment edited',
        newValue: originalName || attachment.originalName,
        metadata: {
          field: 'attachment',
          taskTitle: item.title,
          taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}`,
        }
      });

      // Broadcast board sync via WebSocket
      const SocketService = require('../services/SocketService');
      SocketService.broadcastToBoard(item.board.toString(), 'board:updated', {
        action: 'ITEM_UPDATED',
        boardId: item.board.toString(),
        itemId: item._id,
        senderId: req.user._id.toString()
      });
    }

    res.status(200).json({ success: true, attachment });
  } catch (error) {
    console.error('Error updating attachment:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPresignedUploadUrl,
  uploadLocalFile,
  createAttachment,
  deleteAttachment,
  updateAttachment,
};
