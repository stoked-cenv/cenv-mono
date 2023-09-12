import { PackageModule, PackageModuleType } from './module';
import { createRepository, deleteRepository, describeRepositories, getRepository, hasTag, listImages, repositoryExists } from '../aws/ecr';
import { ImageIdentifier, Repository } from '@aws-sdk/client-ecr';
import * as semver from 'semver';
import { CenvLog } from '../log';
import { isOsSupported, sleep } from '../utils';
import { execCmd, runScripts,spawnCmd } from '../proc'
import { Package, PackageCmd, TPackageMeta } from './package';
import { SemVer } from 'semver';

export class DockerModule extends PackageModule {
  static build: { [key: string]: number } = {};
  static ecrAuthHelperInstalled = false;
  digest?: string;
  images?: ImageIdentifier[];
  latestImage?: ImageIdentifier;
  currentVersionImage?: ImageIdentifier;
  deployedImage?: ImageIdentifier;
  tags?: string[];
  repoUri?: string;
  repo?: Repository;
  repoStatus = 'repo does not exist';
  containerStatus = 'container not deployed';
  repoContainsLatest = false;
  dockerName: string;
  envVars = { DOCKER_BUILDKIT: 1 };
  dockerBaseImage?: string;
  child?: DockerModule;

  constructor(pkg: Package, path: string, meta: TPackageMeta, childDockerModule?: DockerModule) {
    super(pkg, path, meta, PackageModuleType.DOCKER);
    this.dockerName = Package.packageNameToDockerName(this.name);
    this.child = childDockerModule;
  }

  static async checkDockerStatus() {
    const res = await execCmd('docker version -f json', { silent: true });
    if (res.toString().includes('Cannot connect')) {
      return { active: false };
    }
    const info = JSON.parse(res);
    return { active: info.Server !== null, info };
  }

  static async dockerPrefight(pkgs: Package[], silent = false) {
    // if deploying check to see if there are any docker packages if so verify docker is running
    if (isOsSupported() && pkgs.filter((p: Package) => p.docker).length) {
      //if (Cenv.dashboard) Cenv.dashboard.debug('docker status 1');
      let dockerStatus = await this.checkDockerStatus();
      //if (Cenv.dashboard) Cenv.dashboard.debug('docker status', JSON.stringify(dockerStatus, null, 2));
      if (!dockerStatus.active) {
        CenvLog.info('attempting to start docker', 'docker daemon not active');
        await execCmd('open -a Docker', { silent: true });
        for (const iter of ([...Array(6)])) {
          await sleep(5);

          dockerStatus = await this.checkDockerStatus();
          if (dockerStatus.active) {
            break;
          }
        }

        if (!dockerStatus.active) {
          CenvLog.err('docker daemon not active after 30 seconds:\n' + CenvLog.colors.info(JSON.stringify(dockerStatus.info, null, 2)), 'docker daemon not active');
          return;
        } else {
          CenvLog.info(JSON.stringify(dockerStatus.info, null, 2), 'docker daemon active');
        }
      } else {
        if (!silent) {
          CenvLog.single.infoLog('verified that docker is running');
        }
      }
    }
  }

  public static get ecrUrl(): string {
    return `${process.env.CDK_DEFAULT_ACCOUNT}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com`;
  }

  public static get digestRegex(): RegExp {
    return new RegExp(/^|latest|: digest: (sha256:[0-9a-f]*) size: [0-9]*$/, 'gim');
  }

  get anythingDeployed(): boolean {
    return !!this.repoUri || !!this.latestImage || (!!this.images && this.images?.length > 0);
  }

  get latestDigest(): string {
    return this.latestImage?.imageDigest ? this.latestImage.imageDigest : '';
  }

  get latestDigestShort(): string | false {
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
      items.push(`pushed tags: ${this.images?.map(t => t.imageTag).join(', ')}`);
    }
    return items;
  }

  static async destroyAll() {
    const repositories = await describeRepositories();
    if (!repositories || !repositories?.length) {
      CenvLog.info(` - no ecr repos / images to destroy`);
      return;
    }

    await Promise.all(repositories.map(async (r) => {
      if (r.repositoryName) {
        await deleteRepository(r.repositoryName, true);
      }
    }));
  }

  static fromModule(module: PackageModule) {
    return new DockerModule(module.pkg, module.path, module.meta);
  }

  async getDigest(pkgCmd: PackageCmd) {
    const previousCmdLines = pkgCmd.minOut.split('\n');
    for (let i = previousCmdLines.length - 1; i > 0; --i) {
      const ln = previousCmdLines[i];
      if (ln.startsWith('latest: digest: sha256')) {
        const startDigestIndex = ln.indexOf('sha256');
        const restOfLine = ln.substring(startDigestIndex);
        return restOfLine.substring(0, restOfLine.indexOf(' '));
      }
    }
    return false;
  }

  async push(url: string) {
      const commandEvents = {
        postCommandFunc: async (pkgCmd?: PackageCmd) => {
          if (!pkgCmd) {
            throw new Error('docker push failed: no digest found');
          }
          // get the digest from the pushed container
          const digestRes = await this.getDigest(pkgCmd);
          if (!digestRes) {
            throw new Error('docker push failed: no digest found');
          }

          // verify that the digest exists in the docker repo
          await this.verifyDigest(digestRes);
        },
      };

      await this.pkg.pkgCmd(`docker push ${url}/${this.dockerName} --all-tags`, {commandEvents});

  }

  async build(args: any, cmdOptions: any = { build: true, push: true, dependencies: false }) {
    const { build, push, dependencies } = cmdOptions;

    if (dependencies) {
      if (this.pkg?.meta?.data.deployDependencies) {
        await Promise.all(this.pkg?.meta?.data.deployDependencies?.map(async (dep: Package) => {
          if (dep.docker) {
            this.pkg.info('pkg: ' + this.pkg.packageName + ' => DockerBuild(' + dep.packageName + ')');
            await dep.docker.build(args, cmdOptions);
          }
        }));
      }
    }

    const exists = await repositoryExists(this.dockerName);
    if (!exists) {
      await createRepository(this.dockerName);
    } else if (cmdOptions?.strictVersions && await hasTag(this.dockerName, this.pkg.rollupVersion.toString())) {
      return;
    }

    if (build) {
      const force = cmdOptions.force ? ' --no-cache=true' : '';
      //const buildCmd = `docker build${force} -t ${this.dockerName}:latest -t ${this.dockerName}:${this.pkg.rollupVersion} -t ${DockerModule.ecrUrl}/${this.dockerName}:${this.pkg.rollupVersion} -t ${DockerModule.ecrUrl}/${this.dockerName}:latest .`;

      let context = '.';
      if (this.meta?.cenv?.docker?.context) {
        context = this.meta.cenv.docker.context;
      }

      let file = '';
      if (this.meta?.cenv?.docker?.file) {
        file = ' -f ' + this.meta.cenv.docker.file;
      }

      const buildCmd = `docker build${force} -t ${this.dockerName}:latest -t ${this.dockerName}:${this.pkg.rollupVersion} -t ${DockerModule.ecrUrl}/${this.dockerName}:${this.pkg.rollupVersion} -t ${DockerModule.ecrUrl}/${this.dockerName}:latest ${context}${file}`;
      const buildOptions = {
        redirectStdErrToStdOut: true, envVars: this.envVars, packageModule: this, failOnError: true,
      };
      await this.pkg.pkgCmd(buildCmd, buildOptions);
    }

    if (push) {
      await this.push(DockerModule.ecrUrl);
    }
  }

  async pushBaseImage(pull = true, push = true) {

    let repoName = this.dockerBaseImage;
    if (!repoName) {
      return;
    }
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
      const pullCmd = `docker pull ${this.dockerBaseImage}`;
      return await spawnCmd(this.path, pullCmd, pullCmd, { envVars: this.envVars }, this.pkg);
    }
    if (push) {

      let cmd = `docker tag ${this.dockerBaseImage} ${DockerModule.ecrUrl}/${this.dockerBaseImage}`;
      await spawnCmd(this.path, cmd, cmd, { returnOutput: true }, this.pkg);

      cmd = `docker push ${DockerModule.ecrUrl}/${this.dockerBaseImage}`;
      return await spawnCmd(this.path, cmd, cmd, { redirectStdErrToStdOut: true }, this.pkg);
    }
    return false;
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
    return;
  }

  async deploy(options: any) {

    if (!this.dockerName) {
      CenvLog.single.catchLog(['docker module without docker name', this.pkg.packageName].join(' '));
    }

    if (this.meta.cenv?.loadPackageVars) {
      const varPackage = Package.getPackages().filter((p: Package) => p.packageName === this.meta.cenv?.loadPackageVars);
      if (varPackage?.length) {
        await varPackage[0].params?.loadVars();
        const vars = varPackage[0].params?.materializedVars;
        options.cenvVars = { ...options.cenvVars, ...vars };
      }
    }

    if (!DockerModule.ecrAuthHelperInstalled) {
      const dockerCredHelperRes = await execCmd('which docker-credential-ecr-login');
      if (!dockerCredHelperRes.length) {

        throw new Error(`docker deploy - failure: WAAA HAAAHHHHHAHHAHHAH`);
      }
    }

    // run pre build scripts defined in meta

    await runScripts(this, this.meta?.preBuildScripts);

    if (this.dockerBaseImage) {
      await this.pushBaseImage();
    }

    await this.build(options.cenvVars || {}, { build: true, push: true, dependencies: false, ...options });
    //options.cenvVars = { CENV_PKG_DIGEST: this.digest || this.pkg.stack?.deployedDigest };

    // run post build scripts defined in meta
    await runScripts(this, this.pkg.meta?.data?.postBuildScripts);

    if (this.child) {
      await this.child.deploy(options);
    }
  }

  upToDate(): boolean {
    return this.imageUpToDate() && (!this.pkg.stack || this.pkg.stack.upToDate());
  }

  imageUpToDate(): boolean {
    return !!this.currentVersionImage && this.latestImage?.imageDigest === this.currentVersionImage?.imageDigest
  }

  getDetails() {
    if (this.imageUpToDate()) {
      this.status.deployed.push(this.statusLine('up to date', `latest image [${this.pkg.rollupVersion}] deployed`, false));
      return;
    }

    if (!this.repoUri) {
      this.status.incomplete.push(this.statusLine('repo doesn\'t exist', `the repository [${this.dockerName}] doesn't exist`, true));
    } else if (!this.images?.length) {
      this.status.incomplete.push(this.statusLine('repo empty', `the repo [${this.dockerName}] has no images`, true));
    } else {
      this.status.incomplete.push(this.versionMismatch(this.deployedImage?.imageTag as string));
    }
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

  printCheckStatusComplete(silent = false): void {
    if (!silent) {
      if (this.repo) {
        this.info(JSON.stringify(this.repo, null, 2), 'repo');
      }
      if (this.latestImage) {
        this.info(JSON.stringify(this.latestImage, null, 2), 'latest image');
      }
      if (this.tags?.length) {
        this.info(this.tags?.join(', '), 'pushed tags');
      }
    }
    this.checked = true;
    this.getDetails();
  }

  async checkStatus(silent = false) {
    this.reset();
    this.printCheckStatusStart();
    const repo = await getRepository(this.dockerName);

    if (!repo || !repo.repositoryName) {
      this.printCheckStatusComplete(silent);
      return;
    }
    this.repo = repo;
    this.repoStatus = `${this.dockerName} repo found`;
    this.repoUri = repo.repositoryUri;
    const images = await listImages(repo.repositoryName);
    if (!images) {
      this.repoStatus = 'no images have been pushed';
      this.printCheckStatusComplete(silent);
      return;
    }

    const sortedTags = images.filter(i => !!i.imageTag).sort((a, b) => {
      const aVers = a?.imageTag !== 'latest' ? a?.imageTag : false;
      const bVers = b?.imageTag !== 'latest' ? b?.imageTag : false;
      if (aVers && bVers) {
        const aSemver = semver.parse(aVers) || new semver.SemVer('0.0.0');
        const bSemver = semver.parse(bVers) || new semver.SemVer('0.0.0');
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

    this.currentVersionImage = this.images.find((i) => {
      return semver.parse(i.imageTag) == this.pkg.rollupVersion;
    });

    this.latestImage = this.images.find((i) => {
      return i.imageTag === 'latest';
    });

    this.digest = this.pkg.stack?.deployedDigest ? this.pkg.stack.deployedDigest : undefined;
    if (this.digest) {
      this.deployedImage = this.images.find((i) => {
        return i.imageDigest === this.digest;
      });
    }


    /*if (imagesWithMatchingTags?.length) {
      let latestImage: ImageIdentifier = imagesWithMatchingTags.shift();
      for (const image of imagesWithMatchingTags) {
        const current = image;
        const currentVersion = semver.parse(current.imageTag);
        if (!currentVersion || !latestImage || currentVersion < latestImage) {
          continue;
        }
        if (!this.latestImage || latest.compare(this.latestImage) === 1) {
          latest = current;
        }
      }
    }

     */

    this.tags = images.map((i) => i.imageTag as string).filter((t) => !!t && t !== '');
    const status = this.upToDate();

    if (this.latestImage) {
      const latestImageUpToDate = this.imageUpToDate();
      this.repoStatus = latestImageUpToDate ? 'up to date' : `needs update: current version [${this.pkg.rollupVersion}] latest pushed version [${this.latestImage?.imageTag}]`;
      this.pkg.links.push(`ECR (latest image) https://${AWS_REGION}.console.aws.amazon.com/ecr/repositories/private/${process.env.CDK_DEFAULT_ACCOUNT}/${this.dockerName}e/_/image/${this.latestImage.imageDigest}/details?region=${AWS_REGION}`);
    }

    this.pkg.links.push(`ECR (repo): https://${AWS_REGION}.console.aws.amazon.com/ecr/repositories/private/${process.env.CDK_DEFAULT_ACCOUNT}/${this.dockerName}?region=${process.env.AWS_REGION}`);

    this.printCheckStatusComplete(silent);
  }

  private async verifyDigest(pushDigest: string) {
    let digestFound = false;
    let attempts = 0;
    const lastCmdLines = this.pkg.cmds[this.pkg.cmds.length - 1].stdout?.split('\n');
    if (lastCmdLines) {
      for (let i = lastCmdLines.length - 1; i > 0; --i) {
        const ln = lastCmdLines[i];
        if (ln.indexOf('latest: digest: sha256') !== -1) {
          const startDigestIndex = ln.indexOf('sha256');
          const restOfLine = ln.substring(startDigestIndex);
          this.digest = restOfLine.substring(0, restOfLine.indexOf(' '));
          break;
        }
      }
    }
    const maxAttempts = 5;
    const attemptWaitSeconds = 2;
    while (!digestFound) {
      attempts++;
      await sleep(attemptWaitSeconds);
      if (await hasTag(this.dockerName, this.pkg.rollupVersion.toString(), this.digest)) {
        digestFound = true;
        this.info(`digest (${this.digest}) push verified`);
      }
      if (!digestFound && attempts < maxAttempts) {
        throw new Error(`docker push - failed: the digest ${this.digest} could not be found for ${this.dockerName}:${this.pkg.rollupVersion} after ${maxAttempts * attemptWaitSeconds} seconds`);
      }
    }
  }
}

