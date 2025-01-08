module.exports = {
    // Bot sozlamalari
    BOT_TOKEN: '7824911554:AAE6oaxs3CZbGRt_EtAvR8cnpDB4uZCD4zk',
    ADMIN_IDS: ['ADMIN_TELEGRAM_ID'], // Admin IDlarini kiriting

    // Cache sozlamalari
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 soat

    // TTS (Text-to-Speech) sozlamalari
    TTS_ENABLED: true,
    MAX_TTS_LENGTH: 1000, // Maksimal belgilar soni

    // PDF sozlamalari
    MAX_PDF_SIZE: 10 * 1024 * 1024, // 10MB

    // Database sozlamalari
    DB_PATH: './data/database.sqlite',

    // Cache fayli
    CACHE_FILE: './data/cache.json',

    // Tillar
    AVAILABLE_LANGUAGES: ['uz', 'en', 'ru'],
    DEFAULT_LANGUAGE: 'uz'
}; 