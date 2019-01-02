import * as puppeteer from 'puppeteer'; // eslint-disable-line
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as touch from 'touch';

interface dataCache {
  [key: string]: {
    ipa?: string;
    copyright?: string;
    unsplash?: string;
  };
}

const download = (
  url: string,
  name: string,
  ext: string,
  outDir: string,
  mediaDir: string
) => {
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

const checkIfFileExists = (
  name: string,
  ext: string,
  outDir: string,
  mediaDir: string
) => {
  return new Promise((resolve, reject) => {
    fs.access(`${outDir}/${mediaDir}/${name}${ext}`, (err) => {
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

export const createDataCacheFile = (content: string, outDir?: string) => {
  return new Promise((resolve, reject) => {
    const filePath = outDir || 'out';
    fs.writeFile(
      `${filePath}/data_cache.json`,
      content,
      {flag: 'w+'},
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
};

export const fetchResouces = async (
  page: puppeteer.Page,
  data: Array<string>,
  options: {
    output?: string;
    media?: string;
  } | null
): Promise<[string, dataCache]> => {
  options = options || {};
  const outDir = options.output
    ? path.resolve(process.cwd(), options.output)
    : 'out';

  const dataCacheFilePath = path.resolve(outDir, './data_cache.json');
  let dataCache: dataCache;

  try {
    dataCache = await new Promise<dataCache>((resolve, reject) => {
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
          } catch (err) {
            json = <dataCache>{};
          }
          resolve(json);
        });
      });
    });
  } catch (err) {
    console.log(err);
    return;
  }

  const [word, translation, imageOptions, soundOptions] = data;
  let [imageSupplyer, imageId, imageName] = imageOptions
    ? imageOptions.split(/:/)
    : [null, null, null, null, null];
  const [soundSupplyer] = soundOptions ? soundOptions.split(/:/) : [null];
  console.log(`---- ${word} ----`);
  const dictHost = 'https://dictionary.cambridge.org/';

  const fileName = word.replace(/\s/g, '_').toLocaleLowerCase();

  let thumbUrl: string;
  let soundUrl: string;
  imageName = imageName || fileName;
  const imageFileName = /^(local|direct)$/.test(imageSupplyer) ? imageId : null;
  const imageExt = imageFileName ? path.extname(imageFileName) : '.jpg';
  const soundName = fileName;
  const soundExt = '.mp3';
  const mediaDir = options.media ? options.media : 'media';

  let imageUrl: string;
  let imageCopyright = '';
  let soundCopyright = '';

  let soundIPA;

  if (
    !dataCache[word] ||
    (!(await checkIfFileExists(imageName, imageExt, outDir, mediaDir)) &&
      (imageSupplyer && imageSupplyer !== 'none')) ||
    !(await checkIfFileExists(soundName, soundExt, outDir, mediaDir))
  ) {
    dataCache[word] = dataCache[word] || {};

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
        const copyright = `<a href="${page.url()}">Cambridge Dictionary</a>`;

        thumbUrl = await page.evaluate((entry: Element) => {
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
          await download(
            `${dictHost}${thumbUrl}`,
            imageName,
            imageExt,
            outDir,
            mediaDir
          );
          imageCopyright = `Image from ${copyright}<br>`;
        }

        // Prefer to get campbridge dict's mp3 file only when the word is one word.
        [soundUrl, soundIPA] = await page.evaluate((entry: Element) => {
          if (!entry) {
            return [null, null];
          }
          const span = entry.getElementsByClassName('us')[0];
          if (!span) {
            return [null, null];
          }
          const audioButton = span.getElementsByClassName(
            'audio_play_button'
          )[0];
          if (!audioButton) {
            return [null, null];
          }

          const soundIPAEls = span.getElementsByClassName('ipa');
          const soundIPAEl = soundIPAEls && soundIPAEls[0];
          const soundIPA = soundIPAEl ? soundIPAEl.textContent : null;

          const soundUrl = audioButton.getAttribute('data-src-mp3');
          return [soundUrl, soundIPA];
        }, entryHandle);

        if (
          soundSupplyer === 'cambridge' ||
          (!soundSupplyer && word.split(/\s/).length === 1)
        ) {
          if (soundUrl) {
            await download(
              `${dictHost}${soundUrl}`,
              soundName,
              soundExt,
              outDir,
              mediaDir
            );
            soundCopyright = `Pronunciation from ${copyright}`;
            if (imageCopyright) {
              imageCopyright = 'Image and ';
            }
          }
        } else {
          soundUrl = null;
          soundIPA = null;
        }

        entryHandle.dispose();
      }
    } catch (error) {
      console.log(error);
    }

    try {
      if (!soundUrl && soundSupplyer === 'weblio') {
        const encodedWord = word.replace(/\s/g, '+');
        const weblioHost = 'https://ejje.weblio.jp';
        const url = `${weblioHost}/content/${encodedWord}`;

        await page.goto(url);

        let entryHandle;
        try {
          await page.waitForSelector('#summary', {
            timeout: 10000,
          });
          entryHandle = await page.$('#summary');
        } catch (err) {}

        if (entryHandle) {
          [soundUrl, soundIPA] = await page.evaluate((entry: Element) => {
            if (!entry) {
              return [null, null];
            }

            const audioButton = entry.querySelector('#audioDownloadPlayUrl');
            if (!audioButton) {
              return [null, null];
            }

            const soundIPAEls = entry.getElementsByClassName(
              'phoneticEjjeDesc'
            );
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
    } catch (error) {
      console.log(error);
    }
    try {
      if ((!thumbUrl && !imageSupplyer) || imageSupplyer === 'unsplash') {
        const unsplashHost = 'https://unsplash.com';
        let imgHandles: puppeteer.ElementHandle[] = [];
        let imgHandle;
        imageId = imageId || dataCache[word].unsplash;
        if (imageId) {
          await page.goto(`${unsplashHost}/photos/${imageId}`);
          imgHandles = await page.$$('[data-test="photos-route"] img');
          imgHandle = imgHandles[1];
        } else {
          await page.goto(`${unsplashHost}/search/photos/${word}`);
          const imgHandles = await page.$$('figure img');
          if (!imgHandles && !imgHandles.length) {
            return;
          }
          imgHandle = imgHandles[0];
        }
        if (imgHandle) {
          [thumbUrl, imageUrl] = await page.evaluate((img: Element) => {
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
              dataCache[word].unsplash = path.basename(imageUrl);
            }
            await download(
              `${thumbUrl}`,
              imageName,
              imageExt,
              outDir,
              mediaDir
            );
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
        } catch (err) {
          console.log(err);
        }
        imageCopyright = '';
      }

      if (imageSupplyer && imageSupplyer === 'direct') {
        try {
          await download(
            `https://${encodeURI(imageId)}`,
            imageName,
            imageExt,
            outDir,
            mediaDir
          );
        } catch (err) {
          console.log(err);
        }
        imageCopyright = '';
      }

      if (!soundUrl || soundSupplyer === 'google') {
        const encodedWord = decodeURIComponent(word);

        const url = `https://translate.google.com/#view=home&op=translate&sl=en&tl=ja&text=${encodedWord}`;
        const copyright = `<a href="${url}">Google Translate</a>`;
        soundCopyright = `Pronunciation from ${copyright}`;

        await download(
          `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encodedWord}&tl=en&total=1&idx=0&textlen=100`,
          soundName,
          soundExt,
          outDir,
          mediaDir
        );
      }
    } catch (err) {
      console.log(err);
    }
  }

  let content = `${translation};${word};`;

  if (await checkIfFileExists(imageName, imageExt, outDir, mediaDir)) {
    content += `<img src="${imageName}${imageExt}" />;`;
  } else {
    content += ';';
  }

  if (await checkIfFileExists(soundName, soundExt, outDir, mediaDir)) {
    content += `[sound:${soundName}${soundExt}];`;
  } else {
    content += ';';
  }

  if (soundIPA) {
    dataCache[word].ipa = soundIPA;
    content += `${soundIPA};`;
  } else if (dataCache[word].ipa) {
    content += `${dataCache[word].ipa};`;
  } else {
    content += ';';
  }

  if (soundCopyright || imageCopyright) {
    const copyright = `${imageCopyright}${soundCopyright}`;
    dataCache[word].copyright = copyright;
    content += copyright;
  } else if (dataCache[word].copyright) {
    content += dataCache[word].copyright;
  }

  return [content, dataCache];
};
