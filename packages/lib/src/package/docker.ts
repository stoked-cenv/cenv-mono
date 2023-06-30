import { EnvironmentStatus, Package, PackageCmd } from './package';
import { IPackageModule, PackageModule, PackageModuleType } from './module';
import {
  createRepository,
  deleteRepository,
  describeRepositories,
  getRepository,
  hasTag,
  listImages,
  repositoryExists
} from '../aws/ecr';
import { ImageIdentifier, Repository } from '@aws-sdk/client-ecr';
import semver from 'semver';
import {CenvLog, colors} from '../log';
import {StackModule} from "./stack";
import {execCmd, sleep, spawnCmd} from "../utils";
import path from "path";
import {CenvFiles} from "../file";
import {getParams} from "../aws/parameterStore";

export class DockerModule extends PackageModule {
  digest?: string;
  images?: ImageIdentifier[];
  latestImage?: ImageIdentifier;
  tags?: string[];
  repoUri?: string;
  repo?: Repository;
  repoStatus = 'repo does not exist';
  containerStatus = 'container not deployed';
  repoContainsLatest = false;
  dockerName: string;
  envVars = { DOCKER_BUILDKIT: 1 }
  doNotPush: false;

  constructor(module: IPackageModule) {
    super(module, PackageModuleType.DOCKER);
    this.dockerName = Package.packageNameToDockerName(this.name);
  }

  public static get ecrUrl(): string {
    if (StackModule.localEnv) {
      return 'localhost:4510';
    } else {
      return `${process.env.CDK_DEFAULT_ACCOUNT}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com`;
    }
  }

  public static get digestRegex(): RegExp {
    return new RegExp(/^|latest|: digest: (sha256:[0-9a-f]*) size: [0-9]*$/, 'gim')
  }
  static build: { [key: string]: number } = {};
  static ecrAuthHelperInstalled = false;

  private async verifyDigest() {
    let digestFound = false;
    let attempts = 0;
    const maxAttempts = 5;
    const attemptWaitSeconds = 2;
    while (!digestFound) {
      attempts++;
      await sleep(attemptWaitSeconds);
      if (await hasTag(this.dockerName, this.pkg.rollupVersion, this.digest)) {
        digestFound = true;
        this.info(`digest (${this.digest}) push verified`);
      }
      if (!digestFound && attempts < maxAttempts) {
        throw new Error(`docker push - failed: the digest ${this.digest} could not be found for ${this.dockerName}:${this.pkg.rollupVersion} after ${maxAttempts * attemptWaitSeconds} seconds`)
      }
    }
  }

  async getDigest() {
    const repoDigest = await execCmd('./', `echo $(docker inspect ${this.dockerName}) | jq -r '.[].RepoDigests[]'`);
    return repoDigest.split('@')[1].trim();
  }

  async push(url: string) {

    const commandEvents = {
      postCommandFunc: async () => {

        // get the digest from the pushed container
        this.digest = await this.getDigest();

        // verify that the digest exists in the docker repo
        await this.verifyDigest();
      }
    }

    await this.pkg.pkgCmd(`docker push ${url}/${this.dockerName} --all-tags`, {}, commandEvents);
  }

  async build(args, cmdOptions: any = { build: true, push: true, dependencies: false}): Promise<number> {
    const { build, push, dependencies } = cmdOptions;

    if (dependencies) {
      if (this.pkg?.meta?.service) {
        await Promise.all(this.pkg?.meta?.service?.map(async (dep: Package) => {
          this.pkg.info('pkg: ' + this.pkg.packageName + ' => DockerBuild(' + dep.packageName + ')')
          await dep.docker.build(args, cmdOptions)
        }));
      }
    }

    const buildTitle = 'DockerBuild ' + this.pkg.packageName;
    if (!this.build[buildTitle]) {
      this.build[buildTitle] = 0;
    }
    this.build[buildTitle]++;

    const exists = await repositoryExists(this.dockerName);
    if (!exists) {
      await createRepository(this.dockerName);
    } else if (cmdOptions?.strictVersions && await hasTag(this.dockerName, this.pkg.rollupVersion)) {
      return;
    }

    if (build) {
      const force = cmdOptions.force ? ' --no-cache' : '';
      const buildCmd = `docker build -t ${this.dockerName}:latest -t ${this.dockerName}:${this.pkg.rollupVersion} -t ${DockerModule.ecrUrl}/${this.dockerName}:${this.pkg.rollupVersion} -t ${DockerModule.ecrUrl}/${this.dockerName}:latest .${force}`;
      const buildOptions = { redirectStdErrToStdOut: true, envVars: this.envVars, packageModule: this };
      await this.pkg.pkgCmd(buildCmd, buildOptions)
    }

    if (push) {
      if (process.env.CENV_MULTISTAGE) {
        if (this.pkg.meta?.dockerType !== 'base') {
          await this.push(DockerModule.ecrUrl);
        }
      } else {
        await this.push(DockerModule.ecrUrl);
      }
    }
  }

  async pushBaseImage(pull = true, push = true): Promise<number> {

    let repoName = this.pkg.meta.dockerBaseImage;
    const repoParts = repoName.split(':');
    let tag = 'latest';

    if (repoParts.length > 1) {
      repoName = repoParts[0];
      tag = repoParts[1];
    }

    if (!await repositoryExists(repoName)) {
      await createRepository(repoName);
    }

    const hasTagRes = await hasTag(repoName, tag);
    if (hasTagRes && tag !== 'latest') {
      return 0;
    }

    if (pull) {
      const pullCmd = `docker pull ${this.pkg.meta.dockerBaseImage}`;
      await spawnCmd(this.pkg.docker.path, pullCmd, pullCmd, { envVars: this.envVars }, this.pkg);
    }
    if (push) {

      let cmd = `docker tag ${this.pkg.meta.dockerBaseImage} ${DockerModule.ecrUrl}/${this.pkg.meta.dockerBaseImage}`;
      await spawnCmd(this.pkg.docker.path, cmd, cmd,{ returnOutput: true }, this.pkg);

      cmd = `docker push ${DockerModule.ecrUrl}/${this.pkg.meta.dockerBaseImage}`;
      await spawnCmd(this.pkg.docker.path, cmd, cmd,{ redirectStdErrToStdOut: true }, this.pkg);
    }
  }

  static async destroyAll() {
    const repositories = await describeRepositories();
    if (!repositories || !repositories?.length) {
      CenvLog.info(` - no ecr repos / images to destroy`);
      return;
    }

    await Promise.all(
      repositories.map(
        async (r) => await deleteRepository(r.repositoryName, true),
      ),
    );
  }

  async destroy() {
    const repositories = await describeRepositories();

    if (!repositories || !repositories?.length) {
      CenvLog.info(` - no ecr repos / images to destroy`);
      return;
    }

    if (repositories.map((r: Repository) => r.repositoryName)?.filter((r) => this.dockerName === r)?.length) {
      await deleteRepository(this.dockerName, true);
    }
  }

  async deploy(options: any) {

    if (!this.dockerName) {
      CenvLog.single.catchLog(['docker module without docker name', this.pkg.packageName].join(' '));
    }

    if (!DockerModule.ecrAuthHelperInstalled) {
      const dockerCredHelperRes = await execCmd('./', 'which docker-credential-ecr-login');
      if (!dockerCredHelperRes.length) {

        throw new Error(`docker deploy - failure: WAAA HAAAHHHHHAHHAHHAH`);
      }
    }

    if (this.pkg?.meta?.preBuildScripts) {
      for (let i = 0; i < this.pkg.meta.preBuildScripts.length; i++) {
        const script = this.pkg.meta.preBuildScripts[i];
        await spawnCmd(this.pkg.params.path, script, script,{ ...options,      redirectStdErrToStdOut: true }, this.pkg);

      }
    }
    if (this.pkg?.meta?.dockerBaseImage) {
      await this.pushBaseImage();
    }

    await this.build(options.cenvVars || {},{ build: true, push: true, dependencies: false, ...options });
    options.cenvVars = { CENV_PKG_DIGEST: this.digest || this.pkg.stack?.deployedDigest };
  }

  upToDate(): boolean {
    return this.imageUpToDate() && (!this.pkg.stack || this.pkg.stack.upToDate());
  }

  imageUpToDate(): boolean {
    return semver.parse(this.latestImage?.imageTag)?.toString() === this.pkg?.rollupVersion?.toString();
  }

  getDetails() {
    if (this.imageUpToDate()) {
      this.status.deployed.push(this.statusLine(
        'up to date',
        `latest image [${this.pkg.rollupVersion}] deployed`,
        false,
      ));
      return;
    }

    if (!this.repoUri) {
      this.status.incomplete.push( this.statusLine(
        "repo doesn't exist",
        `the repository [${this.dockerName}] doesn't exist`,
        true,
      ));
    } else if (!this.images?.length) {
      this.status.incomplete.push( this.statusLine(
        'repo empty',
        `the repo [${this.dockerName}] has no images`,
        true,
      ));
    } else {
      this.status.incomplete.push(this.versionMismatch(this.latestImage?.imageTag));
    }
  }

  get anythingDeployed(): boolean {
    return !!this.repoUri || !!this.latestImage || this.images?.length > 0;
  }

  reset() {
    this.repoUri = undefined;
    this.images = undefined;
    this.latestImage = undefined;
    this.tags = undefined;
    this.repoContainsLatest = false;
    this.checked = false;
    this.status = { needsFix: [], deployed: [], incomplete: [] };
  }

  statusIssues() {
    const deploy = this.pkg?.stack ? ` hasLatestDeployedVersion [${this.pkg?.stack?.hasLatestDeployedVersion}] hasLatestDeployedVersion: [${this.pkg?.stack.hasLatestDeployedDigest}]` : '';
    this.verbose(`imageUpToDate: [${this.imageUpToDate()}] latest tag: [${this.latestImage?.imageTag}] ${deploy}`, 'docker status debug');
  }

  printCheckStatusComplete(): void {
    if (this.repo) {
      this.info(JSON.stringify(this.repo, null, 2), 'repo')
    }
    if (this.latestImage) {
      this.info(JSON.stringify(this.latestImage, null, 2), 'latest image');
    }
    if(this.tags?.length) {
      this.info(this.tags?.join(', '), 'pushed tags');
    }
    this.checked = true;
    this.getDetails();
  }

  async checkStatus() {
    this.printCheckStatusStart();
    const repo = await getRepository(this.dockerName);

    if (!repo) {
      this.printCheckStatusComplete();
      return;
    }
    this.repo = repo;
    this.repoStatus = `${this.dockerName} repo found`;
    this.repoUri = repo.repositoryUri;
    const images = await listImages(repo.repositoryName);
    if (!images) {
      this.repoStatus = 'no images have been pushed';
      this.printCheckStatusComplete();
      return;
    }

    const sortedTags = images.filter(i => !!i.imageTag).sort((a, b) => {
      const aVers = a?.imageTag !== 'latest' ? a?.imageTag : false;
      const bVers = b?.imageTag !== 'latest' ? b?.imageTag : false;
      if (aVers && bVers) {
        const aSemver = semver.parse(aVers);
        const bSemver = semver.parse(bVers);
        const compare = aSemver.compare(bSemver);
        if (!compare) {
         return aSemver.comparePre(bSemver);
        }
        return compare;
      } else if (aVers) {
        return -1;
      } else {
        return 1;
      }
    });

    this.images = sortedTags;
    const AWS_REGION = process.env.AWS_REGION;

    const imagesWithMatchingTags = this.images.filter((i) => {
      return semver.parse(i.imageTag) === this.pkg.rollupVersion;
    });

    this.latestImage = imagesWithMatchingTags?.length ? imagesWithMatchingTags[0] : undefined;
    let latest: any = this.images.filter((i) => i.imageTag === 'latest');
    if (latest.length) {
      latest = latest[0];
      latest = this.images.filter(
        (i) =>
          i.imageDigest === latest.imageDigest && i.imageTag !== 'latest',
      );
      if (latest) {
        this.latestImage = latest[0];
      }
    }

    this.tags = images.map((i) => i.imageTag).filter((t) => !!t && t !== '');
    const status = this.upToDate();

    if (this.latestImage) {
      const latestImageUpToDate = this.imageUpToDate();
      this.repoStatus = latestImageUpToDate
        ? 'up to date'
        : `needs update: current version [${this.pkg.rollupVersion}] latest pushed version [${this.latestImage?.imageTag}]`;
      this.pkg.links.push(
        `ECR (latest image) https://${AWS_REGION}.console.aws.amazon.com/ecr/repositories/private/${process.env.CDK_DEFAULT_ACCOUNT}/${this.dockerName}e/_/image/${this.latestImage.imageDigest}/details?region=${AWS_REGION}`,
      );
    }

    this.pkg.links.push(
      `ECR (repo): https://${AWS_REGION}.console.aws.amazon.com/ecr/repositories/private/${process.env.CDK_DEFAULT_ACCOUNT}/${this.dockerName}?region=${process.env.AWS_REGION}`,
    );
    this.digest = this.pkg.stack?.deployedDigest ? this.pkg.stack.deployedDigest : undefined;
    this.printCheckStatusComplete();
  }

  static fromModule(module: PackageModule) {
    return new DockerModule(module);
  }

  get latestDigest(): string {
    return this.latestImage?.imageDigest
  }

  get latestDigestShort(): string | false{
    const digest = this.latestDigest;
    if (!digest) {
      return false;
    }
    return digest.substring(digest.length - 8);
  }

  get moduleStrings(): string[] {
    const items = super.moduleBaseStrings;
    if (this.latestImage?.imageTag) {
      items.push(`latest tag: ${this.latestImage?.imageTag}`);
    }
    if (this.latestImage?.imageDigest) {
      items.push(`latest digest: ${this.latestImage?.imageDigest}`);
    }
    if (this.images) {
      items.push(`pushed tags: ${this.images?.map(t => t.imageTag).join(", ")}`);
    }
    return items;
  }
}
