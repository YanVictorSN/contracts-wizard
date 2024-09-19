import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

import { generateERC20Options } from './erc20';
import { generateERC721Options } from './erc721';
import { generateERC1155Options } from './erc1155';
import { generateAccountOptions } from './account';
import { generateCustomOptions } from './custom';
import { buildGeneric, GenericOptions, KindedOptions } from '../build-generic';
import { printContract } from '../print';
import { OptionsError } from '../error';
import { findCover } from '../utils/find-cover';
import type { Contract } from '../contract';

type Subset = 'all' | 'minimal-cover';

type Kind = keyof KindedOptions;

export function* generateOptions(kind?: Kind): Generator<GenericOptions> {
  if (!kind || kind === 'ERC20') {
    for (const kindOpts of generateERC20Options()) {
      yield { kind: 'ERC20', ...kindOpts };
    }
  }

  if (!kind || kind === 'ERC721') {
    for (const kindOpts of generateERC721Options()) {
      yield { kind: 'ERC721', ...kindOpts };
    }
  }

  if (!kind || kind === 'ERC1155') {
    for (const kindOpts of generateERC1155Options()) {
      yield { kind: 'ERC1155', ...kindOpts };
    }
  }

  if (!kind || kind === 'Account') {
    for (const kindOpts of generateAccountOptions()) {
      yield { kind: 'Account', ...kindOpts };
    }
  }

  if (!kind || kind === 'Custom') {
    for (const kindOpts of generateCustomOptions()) {
      yield { kind: 'Custom', ...kindOpts };
    }
  }
}

interface GeneratedContract {
  id: string;
  options: GenericOptions;
  contract: Contract;
}

interface GeneratedSource extends GeneratedContract {
  source: string;
}

function generateContractSubset(subset: Subset, kind?: Kind): GeneratedContract[] {
  const contracts = [];

  for (const options of generateOptions(kind)) {
    const id = crypto
      .createHash('sha1')
      .update(JSON.stringify(options))
      .digest()
      .toString('hex');

    try {
      const contract = buildGeneric(options);
      contracts.push({ id, options, contract });
    } catch (e: unknown) {
      if (e instanceof OptionsError) {
        continue;
      } else {
        throw e;
      }
    }
  }

  if (subset === 'all') {
    return contracts;
  } else {
    const getParents = (c: GeneratedContract) => c.contract.components.map(p => p.path);
    return [
      ...findCover(contracts.filter(c => c.options.upgradeable), getParents),
      ...findCover(contracts.filter(c => !c.options.upgradeable), getParents),
    ];
  }
}

export function* generateSources(subset: Subset, uniqueName?: boolean, kind?: Kind): Generator<GeneratedSource> {
  let counter = 1;
  for (const c of generateContractSubset(subset, kind)) {
    if (uniqueName) {
      c.contract.name = `Contract${counter++}`;
    }
    const source = printContract(c.contract);
    yield { ...c, source };
  }
}

export async function writeGeneratedSources(dir: string, subset: Subset, uniqueName?: boolean, kind?: Kind): Promise<string[]> {
  await fs.mkdir(dir, { recursive: true });
  let contractNames = [];

  for (const { id, contract, source } of generateSources(subset, uniqueName, kind)) {
    const name = uniqueName ? contract.name : id;
    await fs.writeFile(path.format({ dir, name, ext: '.cairo' }), source);
    contractNames.push(name);
  }

  return contractNames;
}
