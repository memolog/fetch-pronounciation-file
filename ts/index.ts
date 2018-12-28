import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

const download = (url: string, name: string, ext: string, outDir?: string) => {
  return new Promise((resolve, reject) => {
    outDir = outDir || 'out/media';
    const file = fs.createWriteStream(`${outDir}/${name}${ext}`);

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

export const createImportFile = (content: string, outDir?: string) => {
  return new Promise((resolve, reject) => {
    const filePath = outDir || 'out';
    fs.writeFile(`${filePath}/import.txt`, content, {flag: 'w+'}, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
};

export const fetchResouces = async (
  word: string,
  translation: string,
  outDir?: string
) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  console.log(`---- ${word} ----`);
  let content = `${translation}<br>`;
  let thumbUrl, soundUrl, soundExt;

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
    thumbUrl = await page.evaluate((entry: Element) => {
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
      content += `<img src="${word}${imageExt}" width="320"><br>`;
      await download(`${dictHost}${thumbUrl}`, word, imageExt, outDir);
    }

    soundUrl = await page.evaluate((entry: Element) => {
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
      await download(`${dictHost}${soundUrl}`, word, soundExt, outDir);
    }

    entryHandle.dispose();
  } catch (error) {
    await page.screenshot({path: 'error_cambridge.png'});
    console.log(error);
  }

  try {
    if (!thumbUrl) {
      await page.goto(`https://unsplash.com/search/photos/${word}`);
      const imgHandle = await page.$('figure img');
      thumbUrl = await page.evaluate((img: Element) => {
        if (!img) {
          return;
        }
        return img.getAttribute('src');
      }, imgHandle);

      thumbUrl = thumbUrl.replace(/auto=format/, 'fm=jpg');
      content += `<img src="${word}.jpg" width="320"><br>`;
      await download(`${thumbUrl}`, word, '.jpg', outDir);

      imgHandle.dispose();
    }

    content += `;${word}<br>`;

    if (soundUrl && soundExt) {
      content += `[sound:${word}${soundExt}]`;
    }
  } catch (err) {
    await page.screenshot({path: 'error_unsplash.png'});
    console.log(err);
  }
  await browser.close();
  return content;
};
