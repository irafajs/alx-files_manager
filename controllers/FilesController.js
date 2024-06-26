import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import * as mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import Queue from 'bull';
import fileQueue from '../worker';

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
        fileQueue.add({ userId, fileId });
      }

      const objectIdUserId = ObjectId(userId);

      let parentIdObjectId = parentId;
      if (parentId !== '0') {
        parentIdObjectId = ObjectId(parentId);
      }

      let localPathToSave = null;

      if (type !== 'folder') {
        localPathToSave = localPath;
      }
      const newFile = {
        userId: objectIdUserId,
        name,
        type,
        parentId: parentIdObjectId,
        isPublic,
      };

      if (localPathToSave !== null) {
        newFile.localPath = localPathToSave;
      }

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
      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

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
      const userIdPlain = await redisClient.get(key);

      if (!userIdPlain) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parentId = req.query.parentId !== undefined && req.query.parentId !== '0' ? req.query.parentId : null;
      const page = parseInt(req.query.page, 10) || 0;
      const perPage = 20;
      const skip = page * perPage;
      const query = parentId
        ? { userId: ObjectId(userIdPlain), parentId: ObjectId(parentId) }
        : { userId: ObjectId(userIdPlain) };

      const files = await dbClient.db.collection('files')
        .find(query)
        .skip(skip)
        .limit(perPage)
        .toArray();

      return res.status(200).json(files);
    } catch (error) {
      console.error('Error retrieving files:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  async putPublish(req, res) {
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
      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      await dbClient.db.collection('files').updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: true } });
      file.isPublic = true;

      return res.status(200).json(file);
    } catch (error) {
      console.error('Error publishing file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  async putUnpublish(req, res) {
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
      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      await dbClient.db.collection('files').updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: false } });
      file.isPublic = false;

      return res.status(200).json(file);
    } catch (error) {
      console.error('Error unpublishing file:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  async getFile(req, res) {
    try {
      const token = req.headers['x-token'];

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      const fileId = req.params.id;
      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId) });
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (!file.isPublic && file.userId.toString() !== userId) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (file.type === 'folder') {
        return res.status(400).json({ error: 'A folder doesn\'t have content' });
      }

      if (!file.localPath || !fs.existsSync(file.localPath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(file.name);
      res.set('Content-Type', mimeType);
      const fileContent = fs.readFileSync(file.localPath);
      return res.send(fileContent);
    } catch (error) {
      console.error('Error retrieving file data:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },
};

export default FilesController;
