import { register } from 'node:module';
       import { NodeSDK } from '@opentelemetry/sdk-node';
       import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
       register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
       new NodeSDK({ instrumentations: [new HttpInstrumentation()] }).start();
      