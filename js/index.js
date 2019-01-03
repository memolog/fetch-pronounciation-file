"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const https = require("https");
const path = require("path");
const mkdirp = require("mkdirp");
const touch = require("touch");
const download = (url, name, ext, outDir, mediaDir) => {
    return new Promise((resolve, reject) => {
        const dir = `${outDir}/${mediaDir}`;
        mkdirp(dir, (err) => {
            if (err) {
                reject(err);
                return;
            }
            const file = fs.createWriteStream(`${dir}/${name}${ext}`);
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
    });
};
const checkIfFileExists = (name, ext, outDir, mediaDir) => {
    return new Promise((resolve, reject) => {
        fs.access(`${outDir}/${mediaDir}/${name}${ext}`, (err) => {
            resolve(!err);
        });
    });
};
exports.createImportFile = (content, outDir, basename) => {
    return new Promise((resolve, reject) => {
        const filePath = outDir || 'out';
        basename = basename ? `${basename}_` : '';
        fs.writeFile(`${filePath}/${basename}import.txt`, content, { flag: 'w+' }, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
};
exports.createDataCacheFile = (content, outDir) => {
    return new Promise((resolve, reject) => {
        const filePath = outDir || 'out';
        fs.writeFile(`${filePath}/data_cache.json`, content, { flag: 'w+' }, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
};
exports.fetchResouces = async (page, data, options) => {
    options = options || {};
    const outDir = options.output
        ? path.resolve(process.cwd(), options.output)
        : 'out';
    const dataCacheFilePath = path.resolve(outDir, './data_cache.json');
    let dataCache;
    try {
        dataCache = await new Promise((resolve, reject) => {
            touch(dataCacheFilePath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                fs.readFile(dataCacheFilePath, 'utf8', (err, data) => {
                    if (err) {
                        reject(err);
                    }
                    let json;
                    try {
                        json = JSON.parse(data);
                    }
                    catch (err) {
                        json = {};
                    }
                    resolve(json);
                });
            });
        });
    }
    catch (err) {
        console.log(err);
        return;
    }
    let [english, questionData, imageOptions, soundOptions, appendixOptions,] = data;
    english = english.replace(/&#44;/g, ',');
    const [questionType, question, questionSupplyer, questionId,] = questionData.split(/:/);
    const word = questionType === 'question' ? question : questionType;
    let [imageSupplyer, imageId, imageName] = imageOptions
        ? imageOptions.split(/:/)
        : [null, null, null, null, null];
    const [soundSupplyer, soundId] = soundOptions
        ? soundOptions.split(/:/)
        : [null, null];
    const [appendix] = appendixOptions ? appendixOptions.split(/:/g) : [null];
    console.log(`---- ${english} ----`);
    const dictHost = 'https://dictionary.cambridge.org/';
    const fileName = english
        .replace(/\s/g, '_')
        .replace(/[^0-9a-zA-Z_]/g, '')
        .toLocaleLowerCase();
    let thumbUrl;
    let soundUrl;
    const imageFileName = /^(local|direct)$/.test(imageSupplyer) ? imageId : null;
    const imageExt = imageFileName ? path.extname(imageFileName) : '.jpg';
    imageName =
        imageName ||
            (imageFileName ? path.basename(imageFileName, imageExt) : null) ||
            fileName;
    const soundFileName = /^(local|direct)$/.test(soundSupplyer) ? soundId : null;
    const soundExt = soundFileName ? path.extname(soundFileName) : '.mp3';
    const soundName = (soundFileName ? path.basename(soundFileName, soundExt) : null) || fileName;
    const mediaDir = options.media ? options.media : 'media';
    let imageUrl;
    let imageCopyright = '';
    let soundCopyright = '';
    let soundIPA;
    if (!dataCache[english] ||
        (!(await checkIfFileExists(imageName, imageExt, outDir, mediaDir)) &&
            (imageSupplyer && !/^(none|media)$/.test(imageSupplyer))) ||
        (!(await checkIfFileExists(soundName, soundExt, outDir, mediaDir)) &&
            (soundSupplyer && soundSupplyer !== 'none'))) {
        dataCache[english] = dataCache[english] || {};
        try {
            await page.goto(`${dictHost}dictionary/english`);
            await page.type('#cdo-search-input', english);
            const searchSubmitButton = await page.$('.cdo-search__button');
            await searchSubmitButton.click();
            searchSubmitButton.dispose();
            let entryHandle;
            try {
                await page.waitForSelector('.entry', {
                    timeout: 10000,
                });
                entryHandle = await page.$('.entry');
            }
            catch (err) { }
            if (entryHandle) {
                const copyright = `<a href="${page.url()}">Cambridge Dictionary</a>`;
                thumbUrl = await page.evaluate((entry) => {
                    if (!entry) {
                        return;
                    }
                    const elements = entry.getElementsByClassName('img-thumb');
                    const div = elements && elements[0];
                    if (!div) {
                        return;
                    }
                    const images = div.getElementsByTagName('img');
                    const image = images && images[0];
                    if (!image) {
                        return;
                    }
                    return image.getAttribute('data-image');
                }, entryHandle);
                if (thumbUrl && (!imageSupplyer || imageSupplyer === 'cambridge')) {
                    await download(`${dictHost}${thumbUrl}`, imageName, imageExt, outDir, mediaDir);
                    imageCopyright = `Image from ${copyright}<br>`;
                }
                // Prefer to get campbridge dict's mp3 file only when the word is one word.
                [soundUrl, soundIPA] = await page.evaluate((entry) => {
                    if (!entry) {
                        return [null, null];
                    }
                    const span = entry.getElementsByClassName('us')[0];
                    if (!span) {
                        return [null, null];
                    }
                    const audioButton = span.getElementsByClassName('audio_play_button')[0];
                    if (!audioButton) {
                        return [null, null];
                    }
                    const soundIPAEls = span.getElementsByClassName('ipa');
                    const soundIPAEl = soundIPAEls && soundIPAEls[0];
                    const soundIPA = soundIPAEl ? soundIPAEl.textContent : null;
                    const soundUrl = audioButton.getAttribute('data-src-mp3');
                    return [soundUrl, soundIPA];
                }, entryHandle);
                if (soundSupplyer === 'cambridge' ||
                    (!soundSupplyer && english.split(/\s/).length === 1)) {
                    if (soundUrl) {
                        await download(`${dictHost}${soundUrl}`, soundName, soundExt, outDir, mediaDir);
                        soundCopyright = `Pronunciation from ${copyright}`;
                        if (imageCopyright) {
                            imageCopyright = 'Image and ';
                        }
                    }
                }
                else {
                    soundUrl = null;
                    soundIPA = null;
                }
                entryHandle.dispose();
            }
        }
        catch (error) {
            console.log(error);
        }
        try {
            if (!soundUrl && soundSupplyer === 'weblio') {
                const encodedWord = english.replace(/\s/g, '+');
                const weblioHost = 'https://ejje.weblio.jp';
                const url = `${weblioHost}/content/${encodedWord}`;
                await page.goto(url);
                let entryHandle;
                try {
                    await page.waitForSelector('#summary', {
                        timeout: 10000,
                    });
                    entryHandle = await page.$('#summary');
                }
                catch (err) { }
                if (entryHandle) {
                    [soundUrl, soundIPA] = await page.evaluate((entry) => {
                        if (!entry) {
                            return [null, null];
                        }
                        const audioButton = entry.querySelector('#audioDownloadPlayUrl');
                        if (!audioButton) {
                            return [null, null];
                        }
                        const soundIPAEls = entry.getElementsByClassName('phoneticEjjeDesc');
                        const soundIPAEl = soundIPAEls && soundIPAEls[0];
                        const soundIPA = soundIPAEl ? soundIPAEl.textContent : null;
                        const soundUrl = audioButton.getAttribute('href');
                        return [soundUrl, soundIPA];
                    }, entryHandle);
                    await download(soundUrl, soundName, soundExt, outDir, mediaDir);
                    const copyright = `<a href="${url}">Weblio</a>`;
                    soundCopyright = `Pronunciation from ${copyright}`;
                }
            }
        }
        catch (error) {
            console.log(error);
        }
        try {
            if ((!thumbUrl && !imageSupplyer) || imageSupplyer === 'unsplash') {
                const unsplashHost = 'https://unsplash.com';
                let imgHandles = [];
                let imgHandle;
                imageId = imageId || dataCache[english].unsplash;
                if (imageId) {
                    await page.goto(`${unsplashHost}/photos/${imageId}`);
                    imgHandles = await page.$$('[data-test="photos-route"] img');
                    imgHandle = imgHandles[1];
                }
                else {
                    await page.goto(`${unsplashHost}/search/photos/${english}`);
                    const imgHandles = await page.$$('figure img');
                    if (!imgHandles && !imgHandles.length) {
                        return;
                    }
                    imgHandle = imgHandles[0];
                }
                if (imgHandle) {
                    [thumbUrl, imageUrl] = await page.evaluate((img) => {
                        if (!img) {
                            return;
                        }
                        const src = img.getAttribute('src');
                        const url = img.parentElement.parentElement.getAttribute('href');
                        return [src, url];
                    }, imgHandle);
                    if (thumbUrl) {
                        thumbUrl = thumbUrl.replace(/auto=format/, 'fm=jpg');
                        imageUrl = imageUrl || page.url();
                        const copyright = `<a href="${unsplashHost}${imageUrl}">Unsplash</a>`;
                        imageCopyright = `Image from ${copyright}<br>`;
                        if (!imageId) {
                            dataCache[english].unsplash = path.basename(imageUrl);
                        }
                        await download(`${thumbUrl}`, imageName, imageExt, outDir, mediaDir);
                    }
                }
                imgHandles.forEach((imgHandle) => imgHandle.dispose());
            }
            if (imageSupplyer && imageSupplyer === 'local') {
                try {
                    await new Promise((resolve, reject) => {
                        const resoucePath = `${outDir}/local/${imageFileName}`;
                        const distPath = `${outDir}/${mediaDir}/${imageFileName}`;
                        fs.copyFile(resoucePath, distPath, (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            resolve();
                        });
                    });
                }
                catch (err) {
                    console.log(err);
                }
                imageCopyright = '';
            }
            if (imageSupplyer && imageSupplyer === 'direct') {
                try {
                    await download(`https://${encodeURI(imageId)}`, imageName, imageExt, outDir, mediaDir);
                }
                catch (err) {
                    console.log(err);
                }
                imageCopyright = '';
            }
            if ((!soundUrl && !soundSupplyer) || soundSupplyer === 'google') {
                const encodedWord = decodeURIComponent(english);
                const url = `https://translate.google.com/#view=home&op=translate&sl=en&tl=ja&text=${encodedWord}`;
                const copyright = `<a href="${url}">Google Translate</a>`;
                soundCopyright = `Pronunciation from ${copyright}`;
                await download(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encodedWord}&tl=en&total=1&idx=0&textlen=100`, soundName, soundExt, outDir, mediaDir);
            }
            if (soundSupplyer && soundSupplyer === 'local') {
                try {
                    await new Promise((resolve, reject) => {
                        const resoucePath = `${outDir}/local/${soundFileName}`;
                        const distPath = `${outDir}/${mediaDir}/${soundFileName}`;
                        fs.copyFile(resoucePath, distPath, (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            resolve();
                        });
                    });
                }
                catch (err) {
                    console.log(err);
                }
                soundCopyright = '';
            }
        }
        catch (err) {
            console.log(err);
        }
    }
    let content = `${english};`;
    if (questionType === 'question') {
        let questionSoundName;
        const questionSoundExt = '.mp3';
        if (questionSupplyer) {
            if (questionSupplyer === 'local') {
                try {
                    await new Promise((resolve, reject) => {
                        const resoucePath = `${outDir}/local/${questionId}`;
                        const distPath = `${outDir}/${mediaDir}/${questionId}`;
                        fs.copyFile(resoucePath, distPath, (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            resolve();
                        });
                    });
                }
                catch (err) {
                    console.log(err);
                }
            }
            content += `${question}[sound:${questionId}];`;
        }
        else {
            questionSoundName = question
                .replace(/\s/g, '_')
                .replace(/[^0-9a-zA-Z_]/g, '')
                .toLocaleLowerCase();
            const encodedWord = decodeURIComponent(question);
            if (!(await checkIfFileExists(questionSoundName, soundExt, outDir, mediaDir))) {
                await download(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encodedWord}&tl=en&total=1&idx=0&textlen=100`, questionSoundName, soundExt, outDir, mediaDir);
            }
            content += `[sound:${questionSoundName}${questionSoundExt}];`;
        }
    }
    else {
        content += `${word};`;
    }
    if (await checkIfFileExists(imageName, imageExt, outDir, mediaDir)) {
        content += `<img src="${imageName}${imageExt}" />;`;
    }
    else if (imageSupplyer && imageSupplyer === 'media') {
        // It assumes the image is already have in the collection.media directory
        content += `<img src="${imageId}${imageExt}" />;`;
    }
    else {
        content += ';';
    }
    if (await checkIfFileExists(soundName, soundExt, outDir, mediaDir)) {
        content += `[sound:${soundName}${soundExt}];`;
    }
    else {
        content += ';';
    }
    if (soundIPA) {
        dataCache[english].ipa = soundIPA;
        content += `${soundIPA};`;
    }
    else if (dataCache[english].ipa) {
        content += `${dataCache[english].ipa};`;
    }
    else {
        content += ';';
    }
    if (soundCopyright || imageCopyright) {
        const copyright = `${imageCopyright}${soundCopyright}`;
        dataCache[english].copyright = copyright;
        content += `${copyright};`;
    }
    else if (dataCache[english].copyright) {
        content += `${dataCache[english].copyright};`;
    }
    else {
        content += ';';
    }
    if (appendix) {
        content += appendix;
    }
    return [content, dataCache];
};
