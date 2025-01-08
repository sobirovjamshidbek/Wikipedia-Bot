const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs').promises;
const config = require('./config');
const path = require('path');

class Database {
    constructor() {
        this.db = null;
        this.cache = new Map();
        this.ready = this.initDatabase();
    }

    async initDatabase() {
        try {
            // Ma'lumotlar bazasi papkasini yaratish
            const dbDir = path.dirname(config.DB_PATH);
            await fs.mkdir(dbDir, { recursive: true });

            this.db = await open({
                filename: config.DB_PATH,
                driver: sqlite3.Database
            });

            // Jadvallarni yaratish
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY,
                    username TEXT,
                    first_name TEXT,
                    language TEXT DEFAULT 'uz',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS search_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    query TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(user_id)
                );

                CREATE TABLE IF NOT EXISTS search_stats (
                    query TEXT PRIMARY KEY,
                    count INTEGER DEFAULT 1
                );
            `);

            await this.loadCache();
            console.log('Database muvaffaqiyatli ishga tushdi');
        } catch (error) {
            console.error('Database xatosi:', error);
            throw error;
        }
    }

    // Barcha database operatsiyalari uchun wrapper
    async query(callback) {
        await this.ready; // Database tayyor bo'lishini kutish
        try {
            return await callback(this.db);
        } catch (error) {
            console.error('Database so\'rovi xatosi:', error);
            throw error;
        }
    }

    async loadCache() {
        try {
            const data = await fs.readFile(config.CACHE_FILE);
            const cacheData = JSON.parse(data);
            Object.entries(cacheData).forEach(([key, value]) => {
                if (Date.now() - value.timestamp < config.CACHE_DURATION) {
                    this.cache.set(key, value);
                }
            });
        } catch (error) {
            console.log('Cache fayli topilmadi, yangi cache yaratiladi');
        }
    }

    async saveCache() {
        const cacheData = Object.fromEntries(this.cache);
        await fs.writeFile(config.CACHE_FILE, JSON.stringify(cacheData));
    }

    // Foydalanuvchini saqlash
    async saveUser(user) {
        return this.query(async (db) => {
            await db.run(`
                INSERT OR REPLACE INTO users (user_id, username, first_name)
                VALUES (?, ?, ?)
            `, [user.id, user.username, user.first_name]);
        });
    }

    // Qidiruv tarixini saqlash
    async saveSearch(userId, query) {
        await this.db.run(`
            INSERT INTO search_history (user_id, query)
            VALUES (?, ?)
        `, [userId, query]);

        await this.db.run(`
            INSERT INTO search_stats (query, count)
            VALUES (?, 1)
            ON CONFLICT(query) DO UPDATE SET count = count + 1
        `, [query]);
    }

    // Qidiruv tarixini olish
    async getSearchHistory(userId, limit = 10) {
        return await this.db.all(`
            SELECT query, created_at
            FROM search_history
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `, [userId, limit]);
    }

    // Top qidiruvlarni olish
    async getTopSearches(limit = 10) {
        return await this.db.all(`
            SELECT query, count
            FROM search_stats
            ORDER BY count DESC
            LIMIT ?
        `, [limit]);
    }
}

module.exports = new Database(); 