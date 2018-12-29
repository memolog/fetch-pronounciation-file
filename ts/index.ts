import * as puppeteer from 'puppeteer'; // eslint-disable-line
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

const download = (url: string, name: string, ext: string, outDir?: string) => {
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

const checkIfFileExists = (name: string, ext: string, outDir?: string) => {
  return new Promise((resolve, reject) => {
    outDir = outDir || 'out/media';
    fs.access(`${outDir}/${name}${ext}`, (err) => {
      resolve(!err);
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
  page: puppeteer.Page,
  data: Array<string>,
  outDir?: string
) => {
  const [word, translation, imageSupplyer, imageOrder, imageSearchWord] = data;
  console.log(`---- ${word} ----`);
  const dictHost = 'https://dictionary.cambridge.org/';
  const fileName = word.replace(/\s/g, '_').toLocaleLowerCase();

  let thumbUrl;
  let soundUrl;
  const imageExt = '.jpg';
  const soundExt = '.mp3';

  if (
    !(await checkIfFileExists(fileName, imageExt, outDir)) ||
    !(await checkIfFileExists(fileName, soundExt, outDir))
  ) {
    try {
      await page.goto(`${dictHost}dictionary/english`);
      await page.type('#cdo-search-input', word);
      const searchSubmitButton = await page.$('.cdo-search__button');
      await searchSubmitButton.click();
      searchSubmitButton.dispose();

      let entryHandle;
      try {
        await page.waitForSelector('.entry', {
          timeout: 10000,
        });
        entryHandle = await page.$('.entry');
      } catch (err) {}

      if (entryHandle) {
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
          if (!image) {
            return;
          }
          return image.getAttribute('data-image');
        }, entryHandle);

        if (thumbUrl && imageSupplyer !== 'unsplash') {
          await download(`${dictHost}${thumbUrl}`, fileName, imageExt, outDir);
        }

        // Get campbridge dict's mp3 file only when the word is one word.
        if (word.split(/\s/).length === 1) {
          soundUrl = await page.evaluate((entry: Element) => {
            if (!entry) {
              return;
            }
            const span = entry.getElementsByClassName('us')[0];
            if (!span) {
              return;
            }
            const audioButton = span.getElementsByClassName(
              'audio_play_button'
            )[0];
            if (!audioButton) {
              return;
            }
            return audioButton.getAttribute('data-src-mp3');
          }, entryHandle);

          if (soundUrl) {
            await download(
              `${dictHost}${soundUrl}`,
              fileName,
              soundExt,
              outDir
            );
          }
        }

        entryHandle.dispose();
      }
    } catch (error) {
      console.log(error);
    }

    try {
      if (!thumbUrl || imageSupplyer === 'unsplash') {
        await page.goto(
          `https://unsplash.com/search/photos/${imageSearchWord || word}`
        );
        const imgHandles = await page.$$('figure img');
        if (!imgHandles && !imgHandles.length) {
          return;
        }
        const imageOrderNumber = Math.min(
          ((parseInt(imageOrder, 10) || 1) - 1) * 2,
          imgHandles.length - 1
        );
        const imgHandle = imgHandles[imageOrderNumber];
        if (imgHandle) {
          thumbUrl = await page.evaluate((img: Element) => {
            if (!img) {
              return;
            }
            return img.getAttribute('src');
          }, imgHandle);

          if (thumbUrl) {
            thumbUrl = thumbUrl.replace(/auto=format/, 'fm=jpg');
            await download(`${thumbUrl}`, fileName, imageExt, outDir);
          }
        }
        imgHandles.forEach((imgHandle) => imgHandle.dispose());
      }

      if (!soundUrl) {
        if (!(await checkIfFileExists(fileName, soundExt, outDir))) {
          const encodedWord = decodeURIComponent(word);
          await download(
            `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encodedWord}&tl=en&total=1&idx=0&textlen=100`,
            fileName,
            soundExt,
            outDir
          );
        } else {
          console.log('skip downloading the sound');
        }
      }
    } catch (err) {
      console.log(err);
    }
  }

  let content = `${translation}<br>`;

  if (await checkIfFileExists(fileName, imageExt, outDir)) {
    content += `<img src="${fileName}${imageExt}" width="320"><br>`;
  }

  content += `;${word}<br>`;

  if (await checkIfFileExists(fileName, soundExt, outDir)) {
    content += `[sound:${fileName}${soundExt}]`;
  }

  return content;
};
