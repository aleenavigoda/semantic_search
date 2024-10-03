const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Jina.ai API setup
const JINA_API_ENDPOINT = 'https://api.jina.ai/v1/embeddings';
const API_KEY = 'jina_cad14f315e6d433cbebeb4bb3df5336a9inQstGrKoNHCAYYXxnPApSXgseZ';
const MAX_TOKENS = 2000;
const MIN_CHUNK_LENGTH = 300;

function extractMainContent(html) {
    const $ = cheerio.load(html);
    $('script, style, nav, header, footer').remove();
    return $('.post-content').text() || $('article').text() || $('body').text();
}

function estimateTokenCount(text) {
    return Math.ceil(text.split(/\s+/).length * 1.3);
}

function chunkText(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const chunks = [];
    let currentChunk = '';
    let currentTokenCount = 0;

    for (const sentence of sentences) {
        const sentenceTokens = estimateTokenCount(sentence);
        
        if (currentTokenCount + sentenceTokens > MAX_TOKENS) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
                currentTokenCount = 0;
            }
            
            if (sentenceTokens > MAX_TOKENS) {
                // Split long sentences
                const words = sentence.split(/\s+/);
                let subChunk = '';
                for (const word of words) {
                    if (estimateTokenCount(subChunk + ' ' + word) > MAX_TOKENS) {
                        chunks.push(subChunk.trim());
                        subChunk = word;
                    } else {
                        subChunk += (subChunk ? ' ' : '') + word;
                    }
                }
                if (subChunk) chunks.push(subChunk.trim());
            } else {
                currentChunk = sentence;
                currentTokenCount = sentenceTokens;
            }
        } else {
            currentChunk += ' ' + sentence;
            currentTokenCount += sentenceTokens;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

async function getColBERTEmbedding(text) {
    try {
        const response = await axios.post(JINA_API_ENDPOINT, {
            model: "jina-embeddings-v3",
            task: "text-matching",
            dimensions: 1024,
            late_chunking: false,
            embedding_type: "float",
            input: [text]
        }, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.data[0].embedding;
    } catch (error) {
        console.error("Error fetching embedding from Jina:", error.response ? error.response.data : error.message);
        return null;
    }
}

async function fetchContent(url) {
    try {
        const response = await axios.get(url);
        return extractMainContent(response.data);
    } catch (error) {
        console.error(`Error fetching content from ${url}:`, error.message);
        return null;
    }
}

async function processBlogFile(filePath) {
    const blogName = path.basename(filePath, '.txt');
    const urls = fs.readFileSync(filePath, 'utf8').split('\n').filter(url => url.trim());
    
    let outputContent = '';

    for (const url of urls) {
        console.log(`Processing ${url}`);
        const content = await fetchContent(url);
        if (content) {
            console.log(`Content length: ${content.length} characters`);
            const chunks = chunkText(content);
            console.log(`Split content into ${chunks.length} chunks`);
            for (let i = 0; i < chunks.length; i++) {
                console.log(`Processing chunk ${i + 1} (length: ${chunks[i].length} characters, estimated tokens: ${estimateTokenCount(chunks[i])})`);
                const embedding = await getColBERTEmbedding(chunks[i]);
                if (embedding) {
                    outputContent += `${url},${i + 1},${embedding.join(',')}\n`;
                    console.log(`Successfully processed chunk ${i + 1} for ${url}`);
                } else {
                    console.log(`Failed to get embedding for chunk ${i + 1} of ${url}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else {
            console.log(`Failed to fetch content for ${url}`);
        }
    }

    if (outputContent) {
        fs.writeFileSync(`${blogName}_embeddings.txt`, outputContent);
        console.log(`Embeddings saved for ${blogName}`);
    } else {
        console.log(`No embeddings generated for ${blogName}`);
    }
}

const filePath = '/Users/spleena/semantics/genre_blogs/asimov_press_substack_urls.txt';
processBlogFile(filePath);