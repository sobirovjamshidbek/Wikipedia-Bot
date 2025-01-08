const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const database = require('./database');
const services = require('./services');
const fs = require('fs').promises;
const path = require('path');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// Kerakli papkalarni yaratish
async function createRequiredDirectories() {
    const dirs = ['./temp', './data'];
    for (const dir of dirs) {
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir);
            console.log(`${dir} papkasi yaratildi`);
        }
    }
}

// Bot ishga tushishidan oldin papkalarni tekshirish
createRequiredDirectories().catch(console.error);

// Asosiy tugmalar
const mainKeyboard = {
    keyboard: [
        ['🔍 Qidirish'],
        ['��🇿 O\'zbek', '🇬🇧 English', '🇷🇺 Русский'],
        ['📊 Qidiruv tarixi', '📈 Top qidiruvlar'],
        ['ℹ️ Yordam']
    ],
    resize_keyboard: true
};

// Til o'zgartirish uchun handler
bot.onText(/🇺🇿 O'zbek|🇬🇧 English|🇷🇺 Русский/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    let lang;
    switch (msg.text) {
        case "🇺🇿 O'zbek":
            lang = 'uz';
            break;
        case "🇬🇧 English":
            lang = 'en';
            break;
        case "🇷🇺 Русский":
            lang = 'ru';
            break;
    }

    try {
        await database.query(db =>
            db.run('UPDATE users SET language = ? WHERE user_id = ?', [lang, userId])
        );

        const messages = {
            uz: "✅ Qidiruv tili o'zbek tiliga o'zgartirildi",
            en: "✅ Search language changed to English",
            ru: "✅ Язык поиска изменен на русский"
        };

        await bot.sendMessage(chatId, messages[lang], {
            reply_markup: mainKeyboard
        });
    } catch (error) {
        console.error('Til o\'zgartirish xatosi:', error);
        await bot.sendMessage(chatId, 'Xatolik yuz berdi. Qayta urinib ko\'ring.', {
            reply_markup: mainKeyboard
        });
    }
});

// /start komandasi yangilandi
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        await database.saveUser(msg.from);
        const userLang = await database.query(db =>
            db.get('SELECT language FROM users WHERE user_id = ?', [userId])
        );

        const welcomeMessages = {
            uz: 'Wikipedia qidiruv botiga xush kelibsiz!\n\n' +
                'Qidirishni boshlash uchun "🔍 Qidirish" tugmasini bosing yoki\n' +
                'to\'g\'ridan-to\'g\'ri so\'rovingizni yozing.\n\n' +
                'Qidiruv tilini o\'zgartirish uchun tegishli til tugmasini bosing.',
            en: 'Welcome to Wikipedia search bot!\n\n' +
                'Click "🔍 Qidirish" button to start searching or\n' +
                'just type your query directly.\n\n' +
                'Click language buttons to change search language.',
            ru: 'Добро пожаловать в бот поиска Wikipedia!\n\n' +
                'Нажмите кнопку "🔍 Qidirish" для начала поиска или\n' +
                'просто напишите ваш запрос.\n\n' +
                'Нажмите кнопки языков для изменения языка поиска.'
        };

        const message = welcomeMessages[userLang?.language || 'uz'];
        await bot.sendMessage(chatId, message, {
            reply_markup: mainKeyboard
        });
    } catch (error) {
        console.error('Start komandasi xatosi:', error);
        bot.sendMessage(chatId, 'Xatolik yuz berdi. Qayta urinib ko\'ring.', {
            reply_markup: mainKeyboard
        });
    }
});

// /help komandasi yangilandi
bot.onText(/\/help|ℹ️ Yordam/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        '📝 Bot imkoniyatlari:\n\n' +
        '1. 🔍 Qidirish - Wikipedia dan ma\'lumot qidirish\n' +
        '2. 🇺🇿🇬🇧🇷🇺 Til tugmalari - Qidiruv tilini o\'zgartirish\n' +
        '3. 📊 Qidiruv tarixi - Sizning oxirgi qidiruvlaringiz\n' +
        '4. 📈 Top qidiruvlar - Eng ko\'p qidirilgan mavzular\n\n' +
        '❗️ Shuningdek, istalgan vaqtda to\'g\'ridan-to\'g\'ri so\'rov yozib yuborishingiz mumkin.',
        {
            reply_markup: mainKeyboard
        }
    );
});

// Qidirish tugmasi bosilganda
bot.onText(/🔍 Qidirish/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        'Qidirmoqchi bo\'lgan mavzungizni kiriting:',
        {
            reply_markup: {
                force_reply: true
            }
        }
    );
});

// Qidiruv tarixi tugmasi
bot.onText(/📊 Qidiruv tarixi/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        const history = await database.getSearchHistory(userId);

        if (history.length === 0) {
            bot.sendMessage(chatId,
                'Sizda hali qidiruv tarixi mavjud emas.',
                { reply_markup: mainKeyboard }
            );
            return;
        }

        const historyText = history
            .map((item, index) =>
                `${index + 1}. ${item.query} (${new Date(item.created_at).toLocaleDateString()})`
            )
            .join('\n');

        bot.sendMessage(chatId,
            '📊 Sizning qidiruv tarixingiz:\n\n' + historyText,
            { reply_markup: mainKeyboard }
        );
    } catch (error) {
        console.error('Qidiruv tarixi xatosi:', error);
        bot.sendMessage(chatId,
            'Qidiruv tarixini olishda xatolik yuz berdi.',
            { reply_markup: mainKeyboard }
        );
    }
});

// Top qidiruvlar tugmasi
bot.onText(/📈 Top qidiruvlar/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const topSearches = await database.getTopSearches();

        if (topSearches.length === 0) {
            bot.sendMessage(chatId,
                'Hali qidiruvlar mavjud emas.',
                { reply_markup: mainKeyboard }
            );
            return;
        }

        const topText = topSearches
            .map((item, index) => `${index + 1}. ${item.query} - ${item.count} marta`)
            .join('\n');

        bot.sendMessage(chatId,
            '📈 Eng ko\'p qidirilgan mavzular:\n\n' + topText,
            { reply_markup: mainKeyboard }
        );
    } catch (error) {
        console.error('Top qidiruvlar xatosi:', error);
        bot.sendMessage(chatId,
            'Top qidiruvlarni olishda xatolik yuz berdi.',
            { reply_markup: mainKeyboard }
        );
    }
});

// Xabarlarni qayta ishlash
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/') ||
        ['🔍 Qidirish', '📊 Qidiruv tarixi', '📈 Top qidiruvlar', 'ℹ️ Yordam'].includes(msg.text)) {
        return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const query = msg.text.trim();

    if (!query) {
        bot.sendMessage(chatId, 'Iltimos, qidiruv uchun so\'z kiriting');
        return;
    }

    const loadingMessage = await bot.sendMessage(chatId, 'Qidirilmoqda... 🔍');

    try {
        const userLang = await database.query(db =>
            db.get('SELECT language FROM users WHERE user_id = ?', [userId])
        );
        const lang = userLang?.language || config.DEFAULT_LANGUAGE;

        const result = await services.wikipedia.search(query, lang);

        if (!result) {
            await bot.editMessageText('Ma\'lumot topilmadi', {
                chat_id: chatId,
                message_id: loadingMessage.message_id
            });
            return;
        }

        await database.saveSearch(userId, query);

        const messageText = [];

        // Agar bu taklif qilingan natija bo'lsa
        if (result.suggestedQuery) {
            messageText.push(
                `❗️ "${result.originalQuery}" bo'yicha natija topilmadi.`,
                `"${result.suggestedQuery}" bo'yicha natija ko'rsatilmoqda:`,
                ''
            );

            if (result.otherSuggestions?.length > 0) {
                messageText.push(
                    '📝 Boshqa o\'xshash maqolalar:',
                    ...result.otherSuggestions.map(title => `• ${title}`),
                    ''
                );
            }
        }

        messageText.push(
            `📚 ${result.title}`,
            '',
            result.extract,
            '',
            '🌐 Wikipedia havolalari:'
        );

        // Til havolalarini qo'shish
        if (result.langLinks) {
            if (result.langLinks.uz) {
                messageText.push(`🇺🇿 O'zbekcha: ${result.langLinks.uz}`);
            }
            if (result.langLinks.en) {
                messageText.push(`🇬🇧 English: ${result.langLinks.en}`);
            }
            if (result.langLinks.ru) {
                messageText.push(`🇷🇺 Русский: ${result.langLinks.ru}`);
            }
        }

        await bot.editMessageText(messageText.join('\n'), {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            disable_web_page_preview: true
        });

        // Qo'shimcha ma'lumotlarni yuborish
        const tasks = [];

        if (result.image) {
            tasks.push(bot.sendPhoto(chatId, result.image));
        }

        const audioFile = await services.tts.createAudio(result.extract, lang);
        if (audioFile) {
            tasks.push(
                bot.sendAudio(chatId, audioFile)
                    .finally(() => fs.unlink(audioFile).catch(console.error))
            );
        }

        const pdfFile = await services.pdf.createPDF(result);
        if (pdfFile) {
            tasks.push(
                bot.sendDocument(chatId, pdfFile)
                    .finally(() => fs.unlink(pdfFile).catch(console.error))
            );
        }

        await Promise.all(tasks);

    } catch (error) {
        console.error('Xatolik:', error);
        await bot.editMessageText('Qidirishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.', {
            chat_id: chatId,
            message_id: loadingMessage.message_id
        });
    }

    // Har bir xabardan keyin asosiy tugmalarni qaytarish
    await bot.sendMessage(chatId,
        'Yana qidirish uchun yangi so\'rov yozing yoki tugmalardan foydalaning:',
        { reply_markup: mainKeyboard }
    );
});

// Xatoliklarni qayta ishlash
process.on('unhandledRejection', (error) => {
    console.error('Kutilmagan xatolik:', error);
});

// Cache ni saqlash
setInterval(() => {
    database.saveCache().catch(console.error);
}, 5 * 60 * 1000); // Har 5 daqiqada

// Temporary fayllarni tozalash
setInterval(async () => {
    try {
        const files = await fs.readdir('./temp');
        for (const file of files) {
            await fs.unlink(`./temp/${file}`);
        }
    } catch (error) {
        console.error('Fayllarni tozalashda xatolik:', error);
    }
}, 60 * 60 * 1000); // Har soatda
