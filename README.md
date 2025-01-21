# Hereya EC2 Web Deploy

A Hereya package for deploying a node js web application or service to EC2 (Auto Scaling Group).

This package requires a custom domain in a Route 53 zone to correctly configure HTTPS.
By default, your app is supposed to be running on port 3000. You can change it with the parameter `appPort`.

## Usage

```bash
hereya add hereya/ec2-web-deploy -p customDomain="my-domain.example.com" # replace by your custom domain
```

Then deploy when you are ready with:

```bash
hereya deploy -w <workspace>
```


The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
