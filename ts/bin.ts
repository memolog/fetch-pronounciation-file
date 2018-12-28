#!/usr/bin/env node

'use strict;';

import * as program from 'commander';
import * as fs from 'fs';
import * as path from 'path';

import {fetchResouces, createImportFile} from './index';

const main = (args: any) => {
  program
    .version('1.0.0')
    .option('-i, --input <file')
    .option('-o, --output <file>')
    .parse(args);

  (async () => {
    const contents: string[] = [];
    const filePath = program.input
      ? path.resolve(process.cwd(), program.input)
      : './default_data.csv';
    const outDir = program.output
      ? path.resolve(process.cwd(), program.output)
      : null;
    const stream = fs.createReadStream(filePath, 'utf8');
    stream.on('data', async (datas) => {
      const data = datas.split(/\n/);
      for (let d of data) {
        d = d.split(/,/);
        if (d.length < 2) {
          continue;
        }
        try {
          contents.push(await fetchResouces(d[0], d[1], outDir));
        } catch (err) {
          console.log(err);
          process.exit(1);
          return;
        }
      }
      await createImportFile(contents.join('\n'), outDir);
      process.exit(0);
    });
  })();
};

if (require.main === module) {
  main(process.argv);
}

module.exports = main;
