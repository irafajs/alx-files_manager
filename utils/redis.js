import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();
    this.isClientConnected = true;

    this.client.on('error', (error) => {
      console.error('Redis Client Error:', error);
      this.isClientConnected = false;
    });

    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setexAsync = promisify(this.client.setex).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
  }

  isAlive() {
    return this.isClientConnected;
  }

  async get(key) {
    try {
      return await this.getAsync(key);
    }
    catch (error) {
      throw new Error('Error reading from redis:', error);
    }
  }

  async set(key, value, duration) {
    try {
      return await this.setexAsync(key, duration, value);
    } catch (error) {
      throw new Error('Error writting to redis:', error);
    }
  }

  async del(key) {
    try {
      return await this.delAsync(key);
    } catch (error) {
      throw new Error('Error deleting from Redis:', error);
    }
  }
}

const redisClient = new RedisClient();
export default redisClient;
