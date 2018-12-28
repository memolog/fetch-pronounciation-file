"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer = require("puppeteer");
const fs = require("fs");
const https = require("https");
const path = require("path");
const download = (url, name, ext, outDir) => {
    return new Promise((resolve, reject) => {
        outDir = outDir || 'out/media';
        const file = fs.createWriteStream(`${outDir}/${name}${ext}`);
        console.log(url);
        https
            .get(url, (res) => {
            res.on('data', (d) => {
                file.write(d);
            });
            res.on('end', () => {
                resolve();
            });
        })
            .on('error', (e) => {
            console.error(e);
        });
    });
};
exports.createImportFile = (content, outDir) => {
    return new Promise((resolve, reject) => {
        const filePath = outDir || 'out';
        fs.writeFile(`${filePath}/import.txt`, content, { flag: 'w+' }, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
};
exports.fetchResouces = async (word, translation, outDir) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    console.log(`---- ${word} ----`);
    let content = `${translation}<br>`;
    let thumbUrl;
    let soundUrl;
    let soundName;
    let soundExt;
    try {
        const dictHost = 'https://dictionary.cambridge.org/';
        await page.goto(`${dictHost}dictionary/english`);
        await page.type('#cdo-search-input', word);
        const searchSubmitButton = await page.$('.cdo-search__button');
        await searchSubmitButton.click();
        searchSubmitButton.dispose();
        await page.waitForSelector('.entry', {
            timeout: 10000,
        });
        const entryHandle = await page.$('.entry');
        thumbUrl = await page.evaluate((entry) => {
            if (!entry) {
                return;
            }
            const elements = entry.getElementsByClassName('img-thumb');
            const div = elements && elements[0];
            if (!div) {
                return;
            }
            const image = div.getElementsByTagName('img')[0];
            return image.getAttribute('data-image');
        }, entryHandle);
        if (thumbUrl) {
            const imageExt = path.extname(thumbUrl.replace(/\?.+$/, '')) || '.jpg';
            const imageName = word.replace(/\s/, '_');
            content += `<img src="${imageName}${imageExt}" width="320"><br>`;
            await download(`${dictHost}${thumbUrl}`, imageName, imageExt, outDir);
        }
        soundUrl = await page.evaluate((entry) => {
            if (!entry) {
                return;
            }
            const span = entry.getElementsByClassName('us')[0];
            if (!span) {
                return;
            }
            const audioButton = span.getElementsByClassName('audio_play_button')[0];
            return audioButton.getAttribute('data-src-mp3');
        }, entryHandle);
        if (soundUrl) {
            soundExt = path.extname(soundUrl.replace(/\?.+$/, ''));
            soundName = word.replace(/\s/, '_');
            await download(`${dictHost}${soundUrl}`, soundName, soundExt, outDir);
        }
        entryHandle.dispose();
    }
    catch (error) {
        await page.screenshot({ path: 'error_cambridge.png' });
        console.log(error);
    }
    try {
        if (!thumbUrl) {
            await page.goto(`https://unsplash.com/search/photos/${word}`);
            const imgHandle = await page.$('figure img');
            thumbUrl = await page.evaluate((img) => {
                if (!img) {
                    return;
                }
                return img.getAttribute('src');
            }, imgHandle);
            thumbUrl = thumbUrl.replace(/auto=format/, 'fm=jpg');
            const imageName = word.replace(/\s/, '_');
            content += `<img src="${imageName}.jpg" width="320"><br>`;
            await download(`${thumbUrl}`, imageName, '.jpg', outDir);
            imgHandle.dispose();
        }
        if (!soundUrl) {
            const encodedWord = decodeURIComponent(word);
            soundName = word.replace(/\s/, '_');
            soundExt = '.mp3';
            await download(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encodedWord}&tl=en&total=1&idx=0&textlen=100`, soundName, soundExt, outDir);
        }
        content += `;${word}<br>`;
        if (soundName && soundExt) {
            content += `[sound:${soundName}${soundExt}]`;
        }
    }
    catch (err) {
        await page.screenshot({ path: 'error_unsplash.png' });
        console.log(err);
    }
    await browser.close();
    return content;
};
