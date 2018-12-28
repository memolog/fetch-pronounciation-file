#!/usr/bin/env node
'use strict;';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const program = require("commander");
const fs = require("fs");
const path = require("path");
const index_1 = require("./index");
const main = (args) => {
    program
        .version('1.0.0')
        .option('-i, --input <file')
        .option('-o, --output <file>')
        .parse(args);
    (async () => {
        const contents = [];
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
                    contents.push(await index_1.fetchResouces(d[0], d[1], outDir));
                }
                catch (err) {
                    console.log(err);
                    process.exit(1);
                    return;
                }
            }
            await index_1.createImportFile(contents.join('\n'), outDir);
            process.exit(0);
        });
    })();
};
if (require.main === module) {
    main(process.argv);
}
module.exports = main;
