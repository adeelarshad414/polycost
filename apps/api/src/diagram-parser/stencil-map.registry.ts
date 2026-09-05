import { Injectable } from '@nestjs/common';
import { AliasDictionary, AliasMatch } from './alias-dictionary.js';

@Injectable()
export class StencilMapRegistry {
  constructor(private readonly aliasDictionary: AliasDictionary = new AliasDictionary()) {}

  match(stencilId: string | undefined): AliasMatch | undefined {
    if (!stencilId) {
      return undefined;
    }

    const normalized = stencilId.replace(/[._-]+/g, ' ');

    return this.aliasDictionary.match(normalized);
  }
}
