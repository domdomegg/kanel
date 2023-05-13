import { promises as fs } from 'fs';
import os from 'os';
import { resolve } from 'path';
import { InstantiatedConfig, Output, PreRenderHook } from 'kanel';
import parse from '@kristiandupont/mdconf';
import preprocessData from './preprocessData';
import { RawSeedData } from './SeedData';

const makeGenerateSeeds =
  ({ srcPath, dstPath }: { srcPath: string; dstPath: string }): PreRenderHook =>
  async (
    outputAcc: Output,
    instantiatedConfig: InstantiatedConfig
  ): Promise<Output> => {
    // Use the built-in node module to find files in path with the .mdconf extension
    const allFiles = await fs.readdir(srcPath, { withFileTypes: true });
    const mdconfFiles = allFiles.filter((file) =>
      file.name.endsWith('.mdconf')
    );

    // For each file, parse the file and add it to the output
    for (const file of mdconfFiles) {
      const srcFilePath = resolve(srcPath, file.name);
      const contents = await fs.readFile(srcFilePath, 'utf-8');
      const parsed = parse(contents, {
        normalize: false,
      }) as Record<string, unknown>;

      const config = (parsed.config || parsed.Config || {}) as Record<
        string,
        string
      >;
      if (!config.schema) {
        if (Object.keys(instantiatedConfig.schemas).length === 1) {
          config.schema = Object.keys(instantiatedConfig.schemas)[0];
        } else {
          throw new Error(
            `No schema specified in ${srcFilePath} and no default schema found in config`
          );
        }
      }

      const inputData = (parsed.data || parsed.Data) as RawSeedData | undefined;
      if (!inputData) {
        throw new Error(`No data found in ${srcFilePath}`);
      }

      const data = preprocessData(
        inputData,
        instantiatedConfig.schemas[config.schema]
      );

      const dstFilePath = resolve(dstPath, file.name.replace('.mdconf', '.js'));

      const lines = [
        '// @generated',
        '// This file is automatically generated by Kanel. Do not modify manually.',
        '',
        'const { makeSeeder } = require("@kanel/knex-seeder");',
        '',
      ];

      // if (config) {
      //   lines.push(`const config = ${JSON.stringify(config, null, 2)};`, '');
      // }

      lines.push(
        `const data = ${JSON.stringify(data, null, 2)};`,
        '',
        'exports.seed = makeSeeder({ data });'
      );

      await fs.writeFile(dstFilePath, lines.join(os.EOL));
    }

    // Return unchanged as we wrote the file manually
    return outputAcc;
  };

export default makeGenerateSeeds;
