# hereya/ec2-web-deploy

Deploy a Node.js web application to AWS EC2 with automatic load balancing, HTTPS, and auto-scaling.

## What it does

This package provisions a production-ready infrastructure stack for your Node.js app:

- **EC2 Auto Scaling Group** (1-2 instances) running Ubuntu 22.04 with Node.js 20
- **Application Load Balancer** with automatic HTTP to HTTPS redirect
- **ACM certificate** with DNS validation for your custom domain
- **Route 53 DNS record** pointing your domain to the load balancer
- **PM2 process manager** for automatic restarts and boot persistence

Your application code is packaged, uploaded to S3, and deployed to each instance automatically.

## Prerequisites

- A domain managed in an **AWS Route 53 hosted zone**
- AWS account configured via Hereya (`hereya init` and `hereya up`)

## Installation

```bash
hereya add hereya/ec2-web-deploy -p customDomain="app.example.com"
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `customDomain` | Yes | - | The domain for your app (e.g. `app.example.com`). Must be in a Route 53 hosted zone. |
| `instanceType` | No | `t3.nano` | EC2 instance type (e.g. `t3.micro`, `t3.small`). |
| `distFolder` | No | `dist` | Path to your build output folder relative to project root. |
| `vpcId` | No | Default VPC | ID of a specific VPC to deploy into. |
| `domainZone` | No | Auto-derived | Route 53 hosted zone name. Derived from `customDomain` if not set. |

## Deployment

```bash
hereya deploy -w <workspace>
```

## How your app runs

- Your app's `dist/` folder is zipped, uploaded to S3, and downloaded onto each EC2 instance
- Dependencies are installed with `npm install --omit=dev`
- The app is started via PM2 from `dist/index.js`
- The `PORT` environment variable is set to `3000` and `NODE_ENV` to `production`
- Any environment variables from your Hereya project are injected automatically
- PM2 is configured to restart your app on crash and on instance reboot

Your app must listen on the `PORT` environment variable (defaults to 3000).

## Infrastructure created

- EC2 Auto Scaling Group (min 1, max 2 instances)
- Application Load Balancer (public, internet-facing)
- ACM TLS certificate (DNS-validated)
- Route 53 A record (alias to ALB)
- Security group (SSH + ALB traffic)
- IAM role (S3 read access for code download)

## Outputs

| Output | Description |
|--------|-------------|
| `AlbDns` | DNS name of the load balancer |
| `ServiceUrl` | Full HTTPS URL of your deployed app |
