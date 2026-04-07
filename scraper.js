const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const URLS = [
    'https://reussir-tcfcanada.com/avril-2026-expression-ecrite/',
    'https://prepmontcfca.com/expression-ecrite-avril-2026/',
    'https://formation-tcfcanada.com/expression-ecrite-sujets-dactualites/'
];

async function scrape() {
    let allSubjects = { 1: [], 2: [], 3: [] };

    for (const url of URLS) {
        console.log(`Scraping ${url}...`);
        try {
            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const $ = cheerio.load(data);

            // Extraction simplifiée basée sur les motifs courants
            // Note: Les sélecteurs peuvent nécessiter des ajustements selon l'évolution des sites
            $('p, li').each((i, el) => {
                const text = $(el).text().trim();
                if (text.length < 30) return;

                if (text.includes('60') && text.includes('120') && (text.includes('message') || text.includes('courriel'))) {
                    if (!allSubjects[1].includes(text)) allSubjects[1].push(text);
                } 
                else if (text.includes('120') && text.includes('150') && (text.includes('article') || text.includes('récit') || text.includes('avis'))) {
                    if (!allSubjects[2].includes(text)) allSubjects[2].push(text);
                }
            });

            // Tâche 3 (Analyse de documents) - Recherche de blocs Document 1/2
            let doc1 = '', doc2 = '';
            $('p, div, h3, h4').each((i, el) => {
                const text = $(el).text().trim();
                if (text.toLowerCase().includes('document 1')) {
                    doc1 = text.split(/document 1\s?:?/i)[1]?.trim();
                } else if (text.toLowerCase().includes('document 2')) {
                    doc2 = text.split(/document 2\s?:?/i)[1]?.trim();
                    if (doc1 && doc2) {
                        allSubjects[3].push({ doc1, doc2 });
                        doc1 = ''; doc2 = ''; // Reset for next pair
                    }
                }
            });

        } catch (err) {
            console.error(`Erreur sur ${url}: ${err.message}`);
        }
    }

    // Nettoyage et limitation
    Object.keys(allSubjects).forEach(task => {
        allSubjects[task] = [...new Set(allSubjects[task])].slice(0, 10);
    });

    // Écriture du fichier subjects-data.js
    const content = `// Données des sujets réels (généré automatiquement le ${new Date().toLocaleDateString()})
const REAL_SUBJECTS = ${JSON.stringify(allSubjects, null, 4)};`;

    fs.writeFileSync('subjects-data.js', content);
    console.log('Mise à jour de subjects-data.js terminée ✓');
}

scrape();
