#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MimirTestStack } from '../lib/mimir-stack';

const app = new cdk.App();
new MimirTestStack(app, 'MimirTestStack', {
  env: {
    account: '000000000000',
    region: 'us-east-1',
  },
});
