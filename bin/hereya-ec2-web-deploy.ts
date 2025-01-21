#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HereyaEc2WebDeployStack } from '../lib/hereya-ec2-web-deploy-stack';

const app = new cdk.App();
new HereyaEc2WebDeployStack(app, process.env.STACK_NAME!, {
  env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
  }
});