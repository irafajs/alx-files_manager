import Queue from 'bull';
import fs from 'fs';
import thumbnail from 'image-thumbnail';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue');

fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }
  if (!userId) {
    throw new Error('Missing userId');
  }

  const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId });
  if (!file) {
    throw new Error('File not found');
  }

  const imageSizes = [500, 250, 100];

  for (const size of imageSizes) {
    const thumbnailPath = `${file.localPath}_${size}`;

    try {
      await thumbnail(file.localPath, { width: size, responseType: 'buffer' })
      fs.writeFileSync(thumbnailPath);
    } catch (error) {
      console.error(`Error generating thumbnail for size ${size}:`, error);
    }
  }
});

export default fileQueue
