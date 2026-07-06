import { Injectable } from '@nestjs/common';
import { DiagramNodeClassification, LlmClassifierClient } from './diagram-parser.types';

@Injectable()
export class StubLlmClassifierClient implements LlmClassifierClient {
  classify(): DiagramNodeClassification | undefined {
    return undefined;
  }
}
