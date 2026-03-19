const fs = require('fs');
const path = require('path');

const newKeys = {
    'fr.json': {
        'filterCategories': 'Filtrer les Catégories',
        'uncheckToHide': 'Décochez pour masquer du tableau de bord'
    },
    'en.json': {
        'filterCategories': 'Filter Categories',
        'uncheckToHide': 'Uncheck to hide from Dashboard'
    },
    'es.json': {
        'filterCategories': 'Filtrar Categorías',
        'uncheckToHide': 'Desmarque para ocultar del panel'
    },
    'de.json': {
        'filterCategories': 'Kategorien Filtern',
        'uncheckToHide': 'Deaktivieren, um im Dashboard auszublenden'
    },
    'zh.json': {
        'filterCategories': '筛选分类',
        'uncheckToHide': '取消选中以从仪表板隐藏'
    },
    'it.json': {
        'filterCategories': 'Filtra Categorie',
        'uncheckToHide': 'Deseleziona per nascondere dalla dashboard'
    },
    'nl.json': {
        'filterCategories': 'Categorieën Filteren',
        'uncheckToHide': 'Vink uit om te verbergen op het dashboard'
    },
    'pt.json': {
        'filterCategories': 'Filtrar Categorias',
        'uncheckToHide': 'Desmarque para ocultar do painel'
    },
    'ru.json': {
        'filterCategories': 'Фильтр Категорий',
        'uncheckToHide': 'Снимите флажок, чтобы скрыть с панели'
    },
    'ja.json': {
        'filterCategories': 'カテゴリのフィルタリング',
        'uncheckToHide': 'チェックを外すとダッシュボードから非表示になります'
    }
};

const messagesDir = path.join(__dirname, 'messages');

for (const [filename, newTranslations] of Object.entries(newKeys)) {
    const filePath = path.join(messagesDir, filename);
    if (fs.existsSync(filePath)) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (!data.dashboard) data.dashboard = {};
            
            // Inject new keys
            data.dashboard.filterCategories = newTranslations.filterCategories;
            data.dashboard.uncheckToHide = newTranslations.uncheckToHide;
            
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
            console.log(`Updated ${filename}`);
        } catch (e) {
            console.error(`Error processing ${filename}:`, e);
        }
    }
}
