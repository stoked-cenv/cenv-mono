import { EnvironmentStatus, Package, PackageCmd } from './package';
import { IPackageModule, PackageModule, PackageModuleType } from './module';
import { getRepository, listImages } from '../aws/ecr';
import { ImageIdentifier, Repository } from '@aws-sdk/client-ecr';
import semver from 'semver';
import {CenvLog, colors} from '../log';

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

  constructor(module: IPackageModule) {
    super(module, PackageModuleType.DOCKER);
    this.dockerName = Package.packageNameToDockerName(this.name);
  }

  upToDate(): boolean {
    return this.imageUpToDate() && (!this.pkg.deploy || this.pkg.deploy.upToDate());
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
    const deploy = this.pkg?.deploy ? ` hasLatestDeployedVersion [${this.pkg?.deploy?.hasLatestDeployedVersion}] hasLatestDeployedVersion: [${this.pkg?.deploy.hasLatestDeployedDigest}]` : '';
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
    this.digest = this.pkg.deploy?.deployedDigest ? this.pkg.deploy.deployedDigest : undefined;
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
