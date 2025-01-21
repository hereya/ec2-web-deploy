import * as cdk from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import path = require("path");

export class HereyaEc2WebDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appEnv = JSON.parse(
      process.env["hereyaProjectEnv"] ?? ("{}" as string)
    );
    appEnv.NODE_ENV = "production";
    const appEnvString = JSON.stringify(appEnv);

    const vpcId: string | undefined = process.env["vpcId"];
    const distFolder: string = process.env["distFolder"] ?? "dist";
    const hereyaProjectRootDir: string = process.env[
      "hereyaProjectRootDir"
    ] as string;
    if (!hereyaProjectRootDir) {
      throw new Error("hereyaProjectRootDir context variable is required");
    }
    const appPort: string = process.env["appPort"] ?? "3000";

    const instanceType: string = process.env["instanceType"] ?? "t3.nano";

    // Look up the VPC using the parameter value
    const vpc = vpcId
      ? Vpc.fromLookup(this, "MyVpc", {
          vpcId,
        })
      : Vpc.fromLookup(this, "MyVpc", {
          isDefault: true,
        });

    const customDomain = process.env["customDomain"];
    if (!customDomain) {
      throw new Error("customDomain context variable is required");
    }
    let domainZone = process.env["domainZone"] as string;
    if (!domainZone) {
      domainZone = customDomain.split(".").slice(1).join(".");
    }

    // 2) Hosted Zone lookup
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: domainZone,
    });

    // 3) Request an ACM cert for subdomain
    const certificate = new acm.DnsValidatedCertificate(this, "Certificate", {
      domainName: customDomain,
      hostedZone,
    });

    const sg = new ec2.SecurityGroup(this, "ServerSG", {
      vpc,
      description: "Allow SSH (22) and HTTP (3000)",
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "SSH");

    // 2) An S3 Asset for your application code
    //    This should include your dist folder & package.json in a zip.
    const appAsset = new s3assets.Asset(this, "AppCodeAsset", {
      path: path.join(hereyaProjectRootDir, distFolder, "dist.zip"), // local path to your zipped code
    });

    const [instanceClass, instanceSize] = instanceType.split(".");

    // 3) Create an Auto Scaling Group
    const asg = new autoscaling.AutoScalingGroup(this, "MyAsg", {
      vpc,
      securityGroup: sg,
      instanceType: ec2.InstanceType.of(
        instanceClass as ec2.InstanceClass,
        instanceSize as ec2.InstanceSize
      ),
      machineImage: ec2.MachineImage.lookup({
        name: "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-*",
        owners: ["099720109477"], // Canonical's AWS account
      }),
      // e.g., 2 instances minimum
      minCapacity: 1,
      maxCapacity: 2,
      updatePolicy: autoscaling.UpdatePolicy.rollingUpdate(),
    });

    // The instances need permission to read from the S3 asset bucket:
    appAsset.grantRead(asg.role);

    // 4) Define User Data to install Node, PM2, and run the app
    //    We'll reference 'PORT=3000' internally, then ALB listens on 80 externally.
    asg.addUserData(
      // Update packages
      "sudo apt-get update -y",
      "sudo apt-get install -y gconf-service libasound2 libatk1.0-0 libatk-bridge2.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 fonts-liberation libappindicator1 lsb-release xdg-utils wget libgbm1",
      "sudo apt-get install -y python3 awscli curl gcc g++ make unzip",

      // Install Node.js 20.x
      "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -",
      "sudo apt-get install -y nodejs",

      // Install PM2 globally
      "sudo npm install -g pm2",

      // Download code from S3 to local folder
      `mkdir -p /home/ubuntu/app`,
      // The 'aws s3 cp' command is created automatically by addS3DownloadCommand if you prefer
      // Instead we can do a direct command below:
      // but we'll use the built-in method for convenience:
      `echo "App asset hash: ${appAsset.assetHash}" >> /home/ubuntu/app/asset-hash.log`
    );

    // Use built-in method to download the asset from S3 to the instance
    asg.userData.addS3DownloadCommand({
      bucket: appAsset.bucket,
      bucketKey: appAsset.s3ObjectKey,
      region: appAsset.bucket.env.region,
      localFile: "/home/ubuntu/app/dist.zip",
    });

    // Continue with user data
    asg.addUserData(
      "cd /home/ubuntu/app",
      "unzip dist.zip", // unzips into /home/ubuntu/app/dist (assuming structure)
      "chown -R ubuntu:ubuntu /home/ubuntu/app",
      "cd dist",
      "sudo -u ubuntu bash -c 'npm install --omit=dev'", // installs dependencies from package.json
      //"sudo -u ubuntu bash -c 'npx puppeteer browsers install chrome'",
      // Start the app with PM2 on port 3000

      // create ecosystem file for pm2 without watching the dist folder with env variables from appEnv
      `echo '{"apps":[{"name":"express-app","script":"/home/ubuntu/app/dist/index.js","cwd":"/home/ubuntu/app/dist","env":${appEnvString}}]}' > /home/ubuntu/app/ecosystem.json`,

      // start the app with pm2 and ecosystem file
      "sudo -u ubuntu bash -c 'pm2 start /home/ubuntu/app/ecosystem.json'",

      // PM2 auto-start on reboot
      "pm2 startup systemd -u ubuntu --hp /home/ubuntu",
      "sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu",
      "sudo -u ubuntu bash -c 'pm2 save'"
    );

    const alb = new elbv2.ApplicationLoadBalancer(this, "AppLoadBalancer", {
      vpc,
      internetFacing: true,
    });

    // Redirect HTTP -> HTTPS
    alb.addListener("HttpListener", {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
      }),
    });

    // Main HTTPS listener on port 443
    const httpsListener = alb.addListener("HttpsListener", {
      port: 443,
      open: true,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [
        elbv2.ListenerCertificate.fromCertificateManager(certificate),
      ],
    });
    // 8) Attach the ASG as a target, referencing port 3000 on the instances
    httpsListener.addTargets("AppFleet", {
      port: Number(appPort), // ALB side
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [asg],
      healthCheck: {
        port: appPort,
        path: "/", // or /health or something your app handles
        healthyHttpCodes: "200", // or something else if needed
      },
    });

    new route53.ARecord(this, "AliasRecord", {
      zone: hostedZone,
      recordName: customDomain,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(alb)
      ),
    });

    // 9) Output the ALB DNS so we can access the service
    new cdk.CfnOutput(this, "AlbDns", {
      value: alb.loadBalancerDnsName,
      description: "DNS of the ALB",
    });

    new cdk.CfnOutput(this, "ServiceUrl", {
      value: `https://${customDomain}`,
      description: "URL of the service",
    });
  }
}
