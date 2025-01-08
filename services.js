const axios = require('axios');
const gtts = require('node-gtts');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const config = require('./config');
const database = require('./database');
const path = require('path');

class WikipediaService {
    async search(query, lang = 'uz') {
        const cacheKey = `${lang}:${query}`;

        // Cache dan tekshirish
        if (database.cache.has(cacheKey)) {
            const cached = database.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < config.CACHE_DURATION) {
                return cached.data;
            }
        }

        // Avval to'g'ridan-to'g'ri qidirish
        let result = await this._searchWikipedia(query, lang);

        // Agar natija topilmasa, o'xshash maqolalarni qidirish
        if (!result || !result.extract) {
            const similarTitles = await this._findSimilarTitles(query, lang);
            if (similarTitles.length > 0) {
                // Birinchi o'xshash natijani olish
                result = await this._searchWikipedia(similarTitles[0], lang);
                if (result) {
                    result.originalQuery = query;
                    result.suggestedQuery = similarTitles[0];
                    result.otherSuggestions = similarTitles.slice(1);
                }
            }
        }

        // Cache ga saqlash
        if (result) {
            database.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
        }

        return result;
    }

    async _findSimilarTitles(query, lang) {
        try {
            const response = await axios.get(`https://${lang}.wikipedia.org/w/api.php`, {
                params: {
                    action: 'opensearch',
                    format: 'json',
                    search: query,
                    limit: 5, // Top 5 ta o'xshash natija
                    namespace: 0
                }
            });

            // Opensearch natijasi [query, titles, descriptions, urls] formatida keladi
            return response.data[1] || [];
        } catch (error) {
            console.error('O\'xshash maqolalarni qidirishda xatolik:', error);
            return [];
        }
    }

    async _searchWikipedia(query, lang) {
        try {
            const response = await axios.get(`https://${lang}.wikipedia.org/w/api.php`, {
                params: {
                    action: 'query',
                    format: 'json',
                    prop: 'extracts|pageimages|info',
                    exintro: true,
                    explaintext: true,
                    pithumbsize: 800,
                    titles: query,
                    inprop: 'url'
                }
            });

            const pages = response.data.query.pages;
            const pageId = Object.keys(pages)[0];
            const page = pages[pageId];

            if (pageId === '-1') {
                return null;
            }

            const langLinks = await this._getLanguageLinks(page.title, lang);

            return {
                title: page.title,
                extract: page.extract,
                image: page.thumbnail?.source,
                url: page.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
                langLinks
            };
        } catch (error) {
            console.error('Wikipedia qidiruv xatosi:', error);
            return null;
        }
    }

    // Boshqa tillardagi linklarni olish uchun yangi metod
    async _getLanguageLinks(title, sourceLang) {
        try {
            const response = await axios.get(`https://${sourceLang}.wikipedia.org/w/api.php`, {
                params: {
                    action: 'query',
                    format: 'json',
                    titles: title,
                    prop: 'langlinks',
                    lllimit: 500,
                    llprop: 'url|langname'
                }
            });

            const pages = response.data.query.pages;
            const page = pages[Object.keys(pages)[0]];
            const langlinks = page.langlinks || [];

            // Kerakli tillar uchun URLlar
            const urls = {
                uz: sourceLang === 'uz' ?
                    `https://uz.wikipedia.org/wiki/${encodeURIComponent(title)}` : null,
                en: sourceLang === 'en' ?
                    `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` : null,
                ru: sourceLang === 'ru' ?
                    `https://ru.wikipedia.org/wiki/${encodeURIComponent(title)}` : null
            };

            // Boshqa tillardagi URLlarni qo'shish
            langlinks.forEach(link => {
                if (['uz', 'en', 'ru'].includes(link.lang)) {
                    urls[link.lang] = link.url;
                }
            });

            return urls;
        } catch (error) {
            console.error('Til linklari olishda xatolik:', error);
            return {};
        }
    }
}

class TTSService {
    async createAudio(text, lang = 'uz') {
        if (!text || !config.TTS_ENABLED || text.length > config.MAX_TTS_LENGTH) {
            return null;
        }

        try {
            const filename = path.join('./temp', `tts_${Date.now()}.mp3`);
            await new Promise((resolve, reject) => {
                const tts = gtts(lang);
                tts.save(filename, text, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
            return filename;
        } catch (error) {
            console.error('TTS xatosi:', error);
            return null;
        }
    }
}

class PDFService {
    async createPDF(data) {
        if (!data || !data.title || !data.extract) {
            return null;
        }

        try {
            const filename = path.join('./temp', `wiki_${Date.now()}.pdf`);
            const doc = new PDFDocument();
            const stream = fs.createWriteStream(filename);

            await new Promise((resolve, reject) => {
                doc.pipe(stream);

                // UTF-8 ni to'g'ri ko'rsatish uchun font
                doc.font('Helvetica');

                // Sarlavha
                doc.fontSize(20).text(data.title, { align: 'center' });
                doc.moveDown();

                // Asosiy matn
                doc.fontSize(12).text(data.extract);

                // Bog'liq maqolalar
                if (data.links && data.links.length > 0) {
                    doc.moveDown()
                        .fontSize(14)
                        .text('Bog\'liq maqolalar:');

                    data.links.forEach(link => {
                        doc.fontSize(12).text(`• ${link}`);
                    });
                }

                doc.end();

                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            return filename;
        } catch (error) {
            console.error('PDF yaratish xatosi:', error);
            return null;
        }
    }
}

module.exports = {
    wikipedia: new WikipediaService(),
    tts: new TTSService(),
    pdf: new PDFService()
}; 