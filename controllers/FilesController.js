import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const tmppath = '/tmp/files_manager';
if (!fs.existsSync(tmppath)) {
  fs.mkdirSync(tmppath);
}

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

const FilesController = {
  async postUpload(req, res) {
    try {
      const {
        name, type, parentId = '0', isPublic = false, data,
      } = req.body;

      const token = req.headers['x-token'];
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!name) {
        return res.status(400).json({ error: 'Missing name' });
      }
      if (!type || !['folder', 'file', 'image'].includes(type)) {
        return res.status(400).json({ error: 'Missing or invalid type' });
      }
      if (['file', 'image'].includes(type) && !data) {
        return res.status(400).json({ error: 'Missing data' });
      }

      if (parentId !== '0') {
        const parentFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
        if (!parentFile) {
          return res.status(400).json({ error: 'Parent not found' });
        }
        if (parentFile.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
      }

      let localPath = '';
      if (['file', 'image'].includes(type)) {
        const fileData = Buffer.from(data, 'base64');
        const fileId = uuidv4();
        localPath = `${FOLDER_PATH}/${fileId}`;
        fs.writeFileSync(localPath, fileData);
      }

      const objectIdUserId = ObjectId(userId);

      let parentIdObjectId = parentId;
      if (parentId !== '0') {
        parentIdObjectId = ObjectId(parentId);
      }

      const newFile = {
        userId: objectIdUserId,
        name,
        type,
        parentId: parentIdObjectId,
        isPublic,
        localPath: type === 'folder' ? null : localPath,
      };

      const result = await dbClient.db.collection('files').insertOne(newFile);
      newFile.id = result.insertedId;

      const { localPath: excludedLocalPath, _id: excludedId, ...response } = newFile;

      return res.status(201).json(response);
    } catch (error) {
      console.error('Error uploading file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  async getShow(req, res) {
    try {
      const token = req.headers['x-token'];
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const fileId = req.params.id;
      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.status(200).json(file);
    } catch (error) {
      console.error('Error retrieving file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  async getIndex(req, res) {
    try {
      const token = req.headers['x-token'];
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      console.log(userId);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parentId = req.query.parentId || '0';
      const page = parseInt(req.query.page, 10) || 0;
      const perPage = 20;
      const skip = page * perPage;

      const files = await dbClient.db.collection('files')
        .find({ parentId, userId })
        .skip(skip)
        .limit(perPage)
        .toArray();

      console.log(files);

      return res.status(200).json(files);
    } catch (error) {
      console.error('Error retrieving files:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },
};

export default FilesController;
